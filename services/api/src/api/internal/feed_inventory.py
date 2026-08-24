"""Hormaal Animal Feed — inventory domain logic.

Pure functions only: no DB access, no I/O, no clock reads except through an
explicitly-passed ``today``. ``routers/feed.py`` owns the persistence; everything
that can be reasoned about (and unit-tested) without a session lives here.

Stock model
-----------
Three layers, mirroring how a real feed store actually works:

``FeedProduct``   the SKU/catalogue entry — what we sell and at what list price.
``FeedBatch``     a physical lot received from a supplier, with its own landed
                  cost and expiry date. Stock on hand is the sum of the lots'
                  ``quantity_remaining``; nothing is stored on the product.
``FeedStockMovement``  an append-only ledger row for every quantity change.

Because perishable feed must leave the store in expiry order, outbound movements
are allocated **FEFO** (first-expiry-first-out) across lots — see
:func:`allocate_fefo`. Quantities are whole packages (bags/sacks), never weights:
a "50 kg bag" is one unit.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Protocol

# ---------------------------------------------------------------------------
# Vocabularies — the single source of truth shared by the ORM, the Pydantic
# schemas, and the router. Extend here and everything downstream follows.
# ---------------------------------------------------------------------------

#: Livestock the feed is formulated for. The four launch lines; extendable.
SPECIES: tuple[str, ...] = ("camel", "cattle", "goat", "chicken")

#: Physical form of the feed.
FEED_TYPES: tuple[str, ...] = (
    "pellet",
    "mash",
    "crumble",
    "concentrate",
    "mineral",
    "forage",
    "other",
)

#: Unit the package size is expressed in ("50" + "kg" → a 50 kg bag).
UNITS_OF_MEASURE: tuple[str, ...] = ("kg", "g", "lb", "l", "ml", "tonne")

#: How the feed is packaged. One package == one sellable unit.
PACKAGE_TYPES: tuple[str, ...] = ("bag", "sack", "bale", "drum", "bucket", "box")

#: Ledger movement kinds.
MOVEMENT_TYPES: tuple[str, ...] = ("receipt", "sale", "adjustment", "write_off", "return")

#: Movements that add stock. ``return`` is a customer returning saleable goods.
INBOUND_TYPES: frozenset[str] = frozenset({"receipt", "return"})

#: Movements that remove stock.
OUTBOUND_TYPES: frozenset[str] = frozenset({"sale", "write_off"})

#: ``adjustment`` is the only signed kind — a stock count can go either way.
SIGNED_TYPES: frozenset[str] = frozenset({"adjustment"})

#: Stock levels.
STOCK_OK, STOCK_LOW, STOCK_OUT = "healthy", "low", "out_of_stock"

#: Lot freshness.
EXPIRY_FRESH, EXPIRY_SOON, EXPIRY_EXPIRED = "fresh", "expiring_soon", "expired"

#: A lot within this many days of its expiry date is flagged for action.
DEFAULT_EXPIRY_WARN_DAYS = 30

#: Aging buckets (upper bound in days, inclusive) used by the dashboard. The
#: ``expired`` bucket is handled separately because its bound is negative.
EXPIRY_BUCKETS: tuple[tuple[str, int | None], ...] = (
    ("0-30", 30),
    ("31-60", 60),
    ("61-90", 90),
    ("90+", None),
)


# ---------------------------------------------------------------------------
# Dates — stored as ISO ``YYYY-MM-DD`` strings, matching the rent/expense ledger
# ---------------------------------------------------------------------------


def today_iso() -> str:
    """Today in UTC as ``YYYY-MM-DD``."""
    return datetime.now(UTC).date().isoformat()


def parse_date(value: str | None) -> date | None:
    """``"2026-08-23"`` → ``date``; ``None``/blank/malformed → ``None``.

    Inventory dates arrive from the API boundary already validated, but batch
    rows can be years old and this must never raise mid-report.
    """
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except (ValueError, AttributeError):
        return None


def add_days(iso: str, days: int) -> str:
    """Shift an ISO date by ``days``. Returns ``iso`` unchanged if unparseable."""
    parsed = parse_date(iso)
    return (parsed + timedelta(days=days)).isoformat() if parsed else iso


def days_until(iso: str | None, today: str) -> int | None:
    """Whole days from ``today`` to ``iso`` — negative once the date has passed."""
    target, now = parse_date(iso), parse_date(today)
    if target is None or now is None:
        return None
    return (target - now).days


def period_of(iso: str | None) -> str:
    """``"2026-08-23"`` → ``"2026-08"``; ``""`` for anything unparseable."""
    parsed = parse_date(iso)
    return parsed.strftime("%Y-%m") if parsed else ""


def recent_periods(count: int, today: str | None = None) -> list[str]:
    """The last ``count`` ``YYYY-MM`` periods ending with the current one, oldest first."""
    anchor = parse_date(today) or datetime.now(UTC).date()
    year, month = anchor.year, anchor.month
    out: list[str] = []
    for _ in range(max(1, count)):
        out.append(f"{year}-{month:02d}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(out))


def derive_expiry_date(
    shelf_life_days: int,
    *,
    manufactured_date: str | None = None,
    received_date: str | None = None,
) -> str | None:
    """Expiry implied by shelf life, counted from manufacture (preferred) or receipt.

    Suppliers here rarely print an expiry date — they print a production date and
    the sack states a shelf life. Falling back to the receipt date is deliberately
    conservative-in-the-wrong-direction (it over-estimates remaining life), so the
    UI asks for a manufactured date whenever the operator has one.
    """
    anchor = manufactured_date or received_date
    if not anchor or shelf_life_days <= 0:
        return None
    parsed = parse_date(anchor)
    return (parsed + timedelta(days=shelf_life_days)).isoformat() if parsed else None


# ---------------------------------------------------------------------------
# Status derivation
# ---------------------------------------------------------------------------


def stock_status(on_hand: int, reorder_level: int) -> str:
    """``out_of_stock`` / ``low`` (at or under the reorder point) / ``healthy``."""
    if on_hand <= 0:
        return STOCK_OUT
    if reorder_level > 0 and on_hand <= reorder_level:
        return STOCK_LOW
    return STOCK_OK


def expiry_status(
    expiry_date: str | None,
    today: str,
    warn_days: int = DEFAULT_EXPIRY_WARN_DAYS,
) -> str:
    """``expired`` once the date has passed, ``expiring_soon`` inside the warning
    window, else ``fresh``. A lot with no expiry date is treated as ``fresh``."""
    remaining = days_until(expiry_date, today)
    if remaining is None:
        return EXPIRY_FRESH
    if remaining < 0:
        return EXPIRY_EXPIRED
    return EXPIRY_SOON if remaining <= warn_days else EXPIRY_FRESH


def expiry_bucket(expiry_date: str | None, today: str) -> str:
    """Aging bucket label for a lot: ``expired``, ``0-30``, ``31-60``, ``61-90``, ``90+``."""
    remaining = days_until(expiry_date, today)
    if remaining is None:
        return "90+"
    if remaining < 0:
        return "expired"
    for label, upper in EXPIRY_BUCKETS:
        if upper is not None and remaining <= upper:
            return label
    return "90+"


def margin_pct(unit_cost: float, unit_price: float) -> float:
    """Gross margin as a percentage of the selling price. 0.0 when price is 0."""
    if unit_price <= 0:
        return 0.0
    return round((unit_price - unit_cost) / unit_price * 100, 1)


def unit_label(unit_size: float, unit_of_measure: str, package_type: str) -> str:
    """``(50, "kg", "bag")`` → ``"50 kg bag"`` — the human name for one sellable unit."""
    size = f"{unit_size:g}"
    return f"{size} {unit_of_measure} {package_type}"


# ---------------------------------------------------------------------------
# Movement sign convention
# ---------------------------------------------------------------------------


class InsufficientStockError(Exception):
    """Raised when an outbound movement exceeds what is physically on hand."""

    def __init__(self, requested: int, available: int) -> None:
        self.requested = requested
        self.available = available
        super().__init__(f"Only {available} unit(s) available; {requested} requested")


def signed_quantity(movement_type: str, quantity: int) -> int:
    """Normalize a request quantity to the ledger's signed convention.

    The API takes a positive magnitude for the four unambiguous kinds and infers
    the direction from the type, so a client can never book a sale that *adds*
    stock by sending a negative number. ``adjustment`` is the exception: a stock
    count legitimately moves either way, so its sign is passed through.
    """
    if movement_type in SIGNED_TYPES:
        return quantity
    magnitude = abs(quantity)
    return -magnitude if movement_type in OUTBOUND_TYPES else magnitude


class Lot(Protocol):
    """Structural type for a stock lot — satisfied by the ``FeedBatch`` ORM row."""

    id: int
    expiry_date: str | None
    quantity_remaining: int
    unit_cost: float


@dataclass(frozen=True)
class Allocation:
    """One lot's share of an outbound movement."""

    batch_id: int
    quantity: int
    unit_cost: float


def fefo_order(lots: list[Lot]) -> list[Lot]:
    """Lots sorted first-expiry-first-out; undated lots sort last, then by id.

    Ties break on ``id`` so allocation is deterministic — two lots received the
    same day with the same expiry always drain in the same order, which keeps
    tests and the audit trail reproducible.
    """
    return sorted(
        lots,
        key=lambda lot: (
            lot.expiry_date is None,
            lot.expiry_date or "",
            lot.id,
        ),
    )


def allocate_fefo(lots: list[Lot], quantity: int) -> list[Allocation]:
    """Draw ``quantity`` units from ``lots``, nearest expiry first.

    Skips exhausted lots. Raises :class:`InsufficientStockError` — before mutating
    anything — when the lots cannot cover the request, so a caller can turn it
    into a 409 without having to roll back a partial allocation.
    """
    if quantity <= 0:
        return []
    available = sum(max(0, lot.quantity_remaining) for lot in lots)
    if available < quantity:
        raise InsufficientStockError(quantity, available)

    out: list[Allocation] = []
    outstanding = quantity
    for lot in fefo_order(lots):
        if outstanding <= 0:
            break
        take = min(outstanding, max(0, lot.quantity_remaining))
        if take <= 0:
            continue
        out.append(Allocation(batch_id=lot.id, quantity=take, unit_cost=lot.unit_cost))
        outstanding -= take
    return out


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------


def bucket_lots(lots: list[Lot], today: str) -> dict[str, dict[str, float]]:
    """Group lots into aging buckets with ``units`` and ``value`` (at cost) each.

    Every bucket is present even when empty so the chart keeps a stable x-axis
    instead of dropping categories as stock rotates.
    """
    out: dict[str, dict[str, float]] = {
        label: {"units": 0.0, "value": 0.0} for label in ("expired", *(label for label, _ in EXPIRY_BUCKETS))
    }
    for lot in lots:
        remaining = max(0, lot.quantity_remaining)
        if remaining <= 0:
            continue
        entry = out[expiry_bucket(lot.expiry_date, today)]
        entry["units"] += remaining
        entry["value"] += remaining * lot.unit_cost
    return {k: {"units": int(v["units"]), "value": round(v["value"], 2)} for k, v in out.items()}


def sum_by(rows: list[tuple[str, float]]) -> dict[str, float]:
    """Fold ``(key, value)`` pairs into a summed dict, rounded to cents."""
    totals: dict[str, float] = defaultdict(float)
    for key, value in rows:
        totals[key] += value
    return {k: round(v, 2) for k, v in totals.items()}


def sell_through_rate(units_sold: int, units_received: int) -> float:
    """Percentage of received stock that has been sold. 0.0 when nothing arrived."""
    if units_received <= 0:
        return 0.0
    return round(min(units_sold / units_received, 1.0) * 100, 1)


def days_of_cover(on_hand: int, units_sold: int, window_days: int) -> float | None:
    """How many days the current stock lasts at the recent average sales rate.

    ``None`` when there were no sales in the window — an unknown burn rate is not
    the same as "infinite cover", and the UI shows "—" rather than a bogus number.
    """
    if units_sold <= 0 or window_days <= 0:
        return None
    per_day = units_sold / window_days
    return round(on_hand / per_day, 1) if per_day > 0 else None
