"""Hormaal Animal Feed — inventory management API.

A second Hormaal Group company sharing this identity store. Every route is
guarded by the fine-grained ``manage_feed`` permission, which is seeded onto the
``admin`` role only — the feed console is an admin surface, matching its
admin-only sign-in page.

Layering: this module owns persistence and HTTP; all date/expiry/valuation/FEFO
reasoning lives in :mod:`api.internal.feed_inventory` as pure, unit-tested
functions.

Stock invariants enforced here
-----------------------------
* Stock on hand is **always** ``sum(batch.quantity_remaining)`` — never a column.
* Outbound movements draw first-expiry-first-out across lots.
* **Expired lots cannot be sold.** A sale skips them, so the only way expired
  feed leaves the building is an explicit ``write_off`` — which is exactly the
  audit trail a feed business needs.
* Inbound corrections (``return``, positive ``adjustment``) must name the lot
  they land in, and can never push a lot above the quantity it received.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload

from api.db import get_session
from api.internal import feed_inventory as inv
from api.internal.auth import RequirePermission, TokenData
from api.models.orm import FeedBatch, FeedProduct, FeedStockMovement
from api.models.schemas import (
    DetailResponse,
    FeedAlert,
    FeedBatchCreate,
    FeedBatchResponse,
    FeedDashboard,
    FeedMovementCreate,
    FeedMovementResponse,
    FeedMovementResult,
    FeedNamedTotal,
    FeedProductCreate,
    FeedProductDetail,
    FeedProductPeriod,
    FeedProductResponse,
    FeedProductUpdate,
)

router = APIRouter(prefix="/feed", tags=["feed"])

# The whole module is admin-scoped. `manage_feed` is seeded onto the admin role
# (and reconciled there on every boot), so a grant to another role is a deliberate
# act by an admin in /people rather than something a restart can undo.
ManageFeed = Annotated[TokenData, Depends(RequirePermission("manage_feed"))]

#: Cap on list endpoints so a UI bug can never ask for the whole ledger at once.
_MAX_PAGE = 500
#: Alert lists are ranked; only the most urgent are worth putting on a dashboard.
_MAX_ALERTS = 20


def _escape_like(term: str) -> str:
    """Neutralize LIKE metacharacters so a search term matches literally."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _iso_or_400(value: str | None, field: str) -> str | None:
    """Validate a date filter as ``YYYY-MM-DD``.

    The ledger compares ISO date *strings* lexicographically, so a malformed
    bound (``"08/23/2026"``) would silently return the wrong window rather than
    an error — the worst outcome for a view people audit against.
    """
    if value is None or not value.strip():
        return None
    candidate = value.strip()
    try:
        date.fromisoformat(candidate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{field} must be in YYYY-MM-DD format") from exc
    return candidate


# ---------------------------------------------------------------------------
# Response builders
# ---------------------------------------------------------------------------


def _product_response(product: FeedProduct, today: str) -> FeedProductResponse:
    """Catalogue row plus the live stock figures derived from its lots."""
    lots = [b for b in product.batches if b.quantity_remaining > 0]
    on_hand = sum(b.quantity_remaining for b in lots)
    value_cost = sum(b.quantity_remaining * b.unit_cost for b in lots)

    dated = [b for b in lots if b.expiry_date]
    nearest = min((b.expiry_date for b in dated), default=None)
    expiring = sum(
        b.quantity_remaining for b in lots if inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_SOON
    )
    expired = sum(
        b.quantity_remaining for b in lots if inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_EXPIRED
    )

    # Expired feed still sits on the shelf (and still carries cost) but cannot be
    # sold, so it must not mask a reorder signal — see `sellable_units`.
    sellable = on_hand - expired

    return FeedProductResponse(
        id=product.id,
        sku=product.sku,
        name=product.name,
        species=product.species,
        feed_type=product.feed_type,
        brand=product.brand,
        unit_size=product.unit_size,
        unit_of_measure=product.unit_of_measure,
        package_type=product.package_type,
        unit_label=inv.unit_label(product.unit_size, product.unit_of_measure, product.package_type),
        unit_cost=product.unit_cost,
        unit_price=product.unit_price,
        shelf_life_days=product.shelf_life_days,
        reorder_level=product.reorder_level,
        is_active=product.is_active,
        notes=product.notes,
        on_hand=on_hand,
        sellable_units=sellable,
        stock_status=inv.stock_status(sellable, product.reorder_level),
        stock_value_cost=round(value_cost, 2),
        stock_value_retail=round(on_hand * product.unit_price, 2),
        margin_per_unit=round(product.unit_price - product.unit_cost, 2),
        margin_pct=inv.margin_pct(product.unit_cost, product.unit_price),
        batch_count=len(lots),
        nearest_expiry=nearest,
        days_to_nearest_expiry=inv.days_until(nearest, today),
        expiring_units=expiring,
        expired_units=expired,
    )


def _batch_response(batch: FeedBatch, today: str, product: FeedProduct | None = None) -> FeedBatchResponse:
    return FeedBatchResponse(
        id=batch.id,
        product_id=batch.product_id,
        product_sku=product.sku if product else None,
        product_name=product.name if product else None,
        batch_code=batch.batch_code,
        quantity_received=batch.quantity_received,
        quantity_remaining=batch.quantity_remaining,
        unit_cost=batch.unit_cost,
        value_at_cost=round(batch.quantity_remaining * batch.unit_cost, 2),
        received_date=batch.received_date,
        manufactured_date=batch.manufactured_date,
        expiry_date=batch.expiry_date,
        days_to_expiry=inv.days_until(batch.expiry_date, today),
        expiry_status=inv.expiry_status(batch.expiry_date, today),
        supplier=batch.supplier,
        reference=batch.reference,
        notes=batch.notes,
    )


def _movement_response(
    movement: FeedStockMovement,
    products: dict[int, FeedProduct],
    batches: dict[int, FeedBatch],
) -> FeedMovementResponse:
    product = products.get(movement.product_id)
    batch = batches.get(movement.batch_id) if movement.batch_id else None
    units = abs(movement.quantity)
    return FeedMovementResponse(
        id=movement.id,
        product_id=movement.product_id,
        product_sku=product.sku if product else None,
        product_name=product.name if product else None,
        batch_id=movement.batch_id,
        batch_code=batch.batch_code if batch else None,
        movement_type=movement.movement_type,
        quantity=movement.quantity,
        unit_cost=movement.unit_cost,
        unit_price=movement.unit_price,
        line_cost=round(units * (movement.unit_cost or 0.0), 2),
        line_revenue=round(units * (movement.unit_price or 0.0), 2),
        reference=movement.reference,
        note=movement.note,
        occurred_on=movement.occurred_on,
        created_at=movement.created_at,
    )


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


async def _load_product(session: AsyncSession, product_id: int) -> FeedProduct | None:
    """Fetch one product with its lots eagerly loaded (never lazy-load in async)."""
    return (
        await session.execute(
            select(FeedProduct).options(selectinload(FeedProduct.batches)).where(FeedProduct.id == product_id)
        )
    ).scalar_one_or_none()


async def _require_product(session: AsyncSession, product_id: int) -> FeedProduct:
    product = await _load_product(session, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def _expiry_predicate(status: str, today: str):
    """SQL equivalent of :func:`inv.expiry_status`, for filtering before a LIMIT.

    Dates are stored as ISO strings, so lexicographic comparison is chronological.
    An undated lot counts as ``fresh``, matching the Python classifier.
    """
    horizon = inv.add_days(today, inv.DEFAULT_EXPIRY_WARN_DAYS)
    if status == inv.EXPIRY_EXPIRED:
        return FeedBatch.expiry_date.is_not(None) & (FeedBatch.expiry_date < today)
    if status == inv.EXPIRY_SOON:
        return (
            FeedBatch.expiry_date.is_not(None)
            & (FeedBatch.expiry_date >= today)
            & (FeedBatch.expiry_date <= horizon)
        )
    if status == inv.EXPIRY_FRESH:
        return FeedBatch.expiry_date.is_(None) | (FeedBatch.expiry_date > horizon)
    raise HTTPException(status_code=422, detail="Unknown expiry_status")


def _refuse_retire_with_stock(product: FeedProduct) -> None:
    """Block retiring a SKU that still holds stock.

    Retired products drop out of the catalogue and out of every dashboard total,
    so retiring one with stock on the shelf would quietly write that inventory
    out of the books. Shared by DELETE and by a PATCH that flips ``is_active``.
    """
    on_hand = sum(b.quantity_remaining for b in product.batches)
    if on_hand > 0:
        raise HTTPException(
            status_code=409,
            detail=f"{on_hand} unit(s) still in stock — sell or write off the remaining lots first",
        )


async def _movement_context(
    session: AsyncSession, movements: list[FeedStockMovement]
) -> tuple[dict[int, FeedProduct], dict[int, FeedBatch]]:
    """Bulk-load the products/lots a movement list refers to (avoids N+1)."""
    product_ids = {m.product_id for m in movements}
    batch_ids = {m.batch_id for m in movements if m.batch_id}
    products: dict[int, FeedProduct] = {}
    batches: dict[int, FeedBatch] = {}
    if product_ids:
        rows = (
            (
                await session.execute(
                    # noload: this context only labels rows with sku/name, and
                    # `lazy="selectin"` would otherwise fetch every lot as well.
                    select(FeedProduct)
                    .options(noload(FeedProduct.batches))
                    .where(FeedProduct.id.in_(product_ids))
                )
            )
            .scalars()
            .all()
        )
        products = {p.id: p for p in rows}
    if batch_ids:
        rows_b = (await session.execute(select(FeedBatch).where(FeedBatch.id.in_(batch_ids)))).scalars().all()
        batches = {b.id: b for b in rows_b}
    return products, batches


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


@router.get("/products", response_model=list[FeedProductResponse])
async def list_products(
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
    species: str | None = None,
    stock_status: Annotated[str | None, Query(max_length=60)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    include_inactive: bool = False,
) -> list[FeedProductResponse]:
    """The catalogue with live stock figures, filtered server-side."""
    stmt = select(FeedProduct).options(selectinload(FeedProduct.batches)).order_by(FeedProduct.name)
    if not include_inactive:
        stmt = stmt.where(FeedProduct.is_active.is_(True))
    if species:
        stmt = stmt.where(FeedProduct.species == species.strip().lower())
    if q:
        # Bound parameter, never interpolated — but `%`/`_` are still LIKE
        # metacharacters, so a search for "A_1" would quietly also match "AB1".
        # Escape them so the box behaves like the substring search it looks like.
        term = f"%{_escape_like(q.strip())}%"
        stmt = stmt.where(
            FeedProduct.name.ilike(term, escape="\\")
            | FeedProduct.sku.ilike(term, escape="\\")
            | FeedProduct.brand.ilike(term, escape="\\")
        )

    # Accepts a comma-separated set so one view can mean "needs reordering"
    # (low OR out_of_stock) rather than forcing the caller to make two requests.
    wanted: set[str] = set()
    if stock_status:
        wanted = {value.strip() for value in stock_status.split(",") if value.strip()}
        unknown = wanted - {inv.STOCK_OK, inv.STOCK_LOW, inv.STOCK_OUT}
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown stock_status: {', '.join(sorted(unknown))}")

    today = inv.today_iso()
    rows = [_product_response(p, today) for p in (await session.execute(stmt)).scalars().all()]
    # Stock status is derived from the lots, so it can only be filtered after the
    # fact — the catalogue is small enough that this stays cheap.
    if wanted:
        rows = [r for r in rows if r.stock_status in wanted]
    return rows


@router.post("/products", response_model=FeedProductResponse, status_code=201)
async def create_product(
    body: FeedProductCreate,
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeedProductResponse:
    clash = (
        await session.execute(select(FeedProduct.id).where(FeedProduct.sku == body.sku))
    ).scalar_one_or_none()
    if clash:
        raise HTTPException(status_code=409, detail=f"SKU {body.sku} already exists")

    product = FeedProduct(**body.model_dump())
    session.add(product)
    try:
        await session.commit()
    except IntegrityError as exc:
        # The pre-check above is a courtesy; the unique index is the guarantee.
        # A concurrent create would otherwise surface as a 500.
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"SKU {body.sku} already exists") from exc
    # Re-load so `batches` is populated (empty) rather than an unloaded attribute.
    return _product_response(await _require_product(session, product.id), inv.today_iso())


@router.get("/products/{product_id}", response_model=FeedProductDetail)
async def get_product(
    product_id: int,
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: Annotated[int, Query(ge=1, le=36)] = 12,
) -> FeedProductDetail:
    """Drill-down: the product, its lots, its ledger, and its own analytics."""
    product = await _require_product(session, product_id)
    today = inv.today_iso()
    periods = inv.recent_periods(months, today)

    # Bounded by DATE rather than row count: a row cap would silently truncate the
    # monthly series and the 90-day figures for a busy SKU, and a chart that
    # quietly drops data is worse than one that refuses to draw.
    window_start = inv.add_days(today, -90)
    since = min(f"{periods[0]}-01", window_start)
    movements = list(
        (
            await session.execute(
                select(FeedStockMovement)
                .where(
                    FeedStockMovement.product_id == product_id,
                    FeedStockMovement.occurred_on >= since,
                )
                .order_by(FeedStockMovement.occurred_on.desc(), FeedStockMovement.id.desc())
            )
        )
        .scalars()
        .all()
    )
    products_map, batches_map = await _movement_context(session, movements)

    sold_90d = cogs_90d = revenue_90d = 0.0
    for m in movements:
        if m.movement_type == "sale" and m.occurred_on >= window_start:
            units = abs(m.quantity)
            sold_90d += units
            revenue_90d += units * (m.unit_price or 0.0)
            cogs_90d += units * (m.unit_cost or 0.0)

    # Sell-through compares lifetime sold against lifetime received. Taking the
    # numerator from the 90-day window would make every established SKU read low.
    sold_lifetime = (
        await session.execute(
            select(func.coalesce(func.sum(-FeedStockMovement.quantity), 0)).where(
                FeedStockMovement.product_id == product_id,
                FeedStockMovement.movement_type == "sale",
            )
        )
    ).scalar_one()

    response = _product_response(product, today)
    return FeedProductDetail(
        product=response,
        batches=[_batch_response(b, today, product) for b in product.batches],
        # The ledger table shows a bounded page; the analytics above are computed
        # over the full date-bounded set.
        movements=[_movement_response(m, products_map, batches_map) for m in movements[:_MAX_PAGE]],
        monthly=_monthly_series(movements, periods),
        expiry_buckets=inv.bucket_lots(list(product.batches), today),
        units_sold_90d=int(sold_90d),
        revenue_90d=round(revenue_90d, 2),
        cogs_90d=round(cogs_90d, 2),
        margin_90d=round(revenue_90d - cogs_90d, 2),
        sell_through_pct=inv.sell_through_rate(
            int(sold_lifetime), sum(b.quantity_received for b in product.batches)
        ),
        # Sellable, not on_hand: expired feed is stock but it is not cover — the
        # same rule `stock_status` follows.
        days_of_cover=inv.days_of_cover(response.sellable_units, int(sold_90d), 90),
    )


@router.patch("/products/{product_id}", response_model=FeedProductResponse)
async def update_product(
    product_id: int,
    body: FeedProductUpdate,
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeedProductResponse:
    product = await _require_product(session, product_id)
    changes = body.model_dump(exclude_unset=True)  # never blank a field the client omitted
    # Retiring is retiring, whichever door it comes through: PATCH must not be a
    # way around the stock check that DELETE enforces.
    if changes.get("is_active") is False and product.is_active:
        _refuse_retire_with_stock(product)
    for key, value in changes.items():
        setattr(product, key, value)
    await session.commit()
    return _product_response(await _require_product(session, product_id), inv.today_iso())


@router.delete("/products/{product_id}", response_model=DetailResponse)
async def deactivate_product(
    product_id: int,
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DetailResponse:
    """Retire a SKU. Always a soft delete — the stock ledger is an audit record
    and must survive the catalogue entry that produced it."""
    product = await _require_product(session, product_id)
    _refuse_retire_with_stock(product)
    product.is_active = False
    await session.commit()
    return DetailResponse(detail=f"{product.sku} retired")


# ---------------------------------------------------------------------------
# Batches (goods receiving)
# ---------------------------------------------------------------------------


@router.get("/batches", response_model=list[FeedBatchResponse])
async def list_batches(
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
    product_id: int | None = None,
    expiry_status: str | None = None,
    in_stock_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=_MAX_PAGE)] = 200,
) -> list[FeedBatchResponse]:
    today = inv.today_iso()
    stmt = select(FeedBatch).order_by(FeedBatch.expiry_date.is_(None), FeedBatch.expiry_date)
    if product_id is not None:
        stmt = stmt.where(FeedBatch.product_id == product_id)
    if in_stock_only:
        stmt = stmt.where(FeedBatch.quantity_remaining > 0)
    if expiry_status:
        # Filtered in SQL, before the LIMIT. Filtering the page afterwards would
        # silently return a short page whenever the excluded lots sort first.
        stmt = stmt.where(_expiry_predicate(expiry_status, today))
    stmt = stmt.limit(limit)

    rows = list((await session.execute(stmt)).scalars().all())
    product_ids = {b.product_id for b in rows}
    products: dict[int, FeedProduct] = {}
    if product_ids:
        found = (
            (
                await session.execute(
                    # Only sku/name are needed here; without noload the relationship's
                    # `lazy="selectin"` would drag every lot of every matched product along.
                    select(FeedProduct)
                    .options(noload(FeedProduct.batches))
                    .where(FeedProduct.id.in_(product_ids))
                )
            )
            .scalars()
            .all()
        )
        products = {p.id: p for p in found}

    return [_batch_response(b, today, products.get(b.product_id)) for b in rows]


@router.post("/batches", response_model=FeedBatchResponse, status_code=201)
async def receive_batch(
    body: FeedBatchCreate,
    current: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeedBatchResponse:
    """Receive a lot into stock and book the matching ``receipt`` ledger row."""
    product = await _require_product(session, body.product_id)
    if not product.is_active:
        raise HTTPException(status_code=409, detail="Cannot receive stock for a retired product")
    if any(b.batch_code == body.batch_code for b in product.batches):
        raise HTTPException(
            status_code=409,
            detail=f"Batch {body.batch_code} already exists for {product.sku}",
        )

    received = body.received_date or inv.today_iso()
    expiry = body.expiry_date or inv.derive_expiry_date(
        product.shelf_life_days,
        manufactured_date=body.manufactured_date,
        received_date=received,
    )
    if expiry and body.manufactured_date and expiry < body.manufactured_date:
        raise HTTPException(status_code=422, detail="Expiry date cannot precede the manufactured date")

    batch = FeedBatch(
        product_id=product.id,
        batch_code=body.batch_code,
        quantity_received=body.quantity,
        quantity_remaining=body.quantity,
        unit_cost=body.unit_cost,
        received_date=received,
        manufactured_date=body.manufactured_date,
        expiry_date=expiry,
        supplier=body.supplier,
        reference=body.reference,
        notes=body.notes,
        created_by=current.user_id,
    )
    session.add(batch)
    await session.flush()  # assign batch.id for the ledger row

    session.add(
        FeedStockMovement(
            product_id=product.id,
            batch_id=batch.id,
            movement_type="receipt",
            quantity=body.quantity,
            unit_cost=body.unit_cost,
            reference=body.reference,
            note=body.notes,
            occurred_on=received,
            created_by=current.user_id,
        )
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        # uq_feed_batch_product_code — same race as the SKU check above.
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Batch {body.batch_code} already exists for {product.sku}",
        ) from exc
    return _batch_response(batch, inv.today_iso(), product)


# ---------------------------------------------------------------------------
# Stock movements
# ---------------------------------------------------------------------------


@router.get("/movements", response_model=list[FeedMovementResponse])
async def list_movements(
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
    product_id: int | None = None,
    movement_type: str | None = None,
    date_from: Annotated[str | None, Query(max_length=10)] = None,
    date_to: Annotated[str | None, Query(max_length=10)] = None,
    limit: Annotated[int, Query(ge=1, le=_MAX_PAGE)] = 100,
) -> list[FeedMovementResponse]:
    stmt = (
        select(FeedStockMovement)
        .order_by(FeedStockMovement.occurred_on.desc(), FeedStockMovement.id.desc())
        .limit(limit)
    )
    if product_id is not None:
        stmt = stmt.where(FeedStockMovement.product_id == product_id)
    if movement_type:
        if movement_type not in inv.MOVEMENT_TYPES:
            raise HTTPException(status_code=422, detail="Unknown movement_type")
        stmt = stmt.where(FeedStockMovement.movement_type == movement_type)
    # Dates are stored as ISO strings, so lexicographic comparison is chronological
    # — which is only true for well-formed dates, hence the validation.
    start, end = _iso_or_400(date_from, "date_from"), _iso_or_400(date_to, "date_to")
    if start:
        stmt = stmt.where(FeedStockMovement.occurred_on >= start)
    if end:
        stmt = stmt.where(FeedStockMovement.occurred_on <= end)

    rows = list((await session.execute(stmt)).scalars().all())
    products, batches = await _movement_context(session, rows)
    return [_movement_response(m, products, batches) for m in rows]


def _sellable_lots(lots: list[FeedBatch], movement_type: str, today: str) -> list[FeedBatch]:
    """Lots eligible for an outbound movement of this kind.

    Sales may not draw on expired stock — that feed has to be written off, not
    sold to a herder. Write-offs and negative adjustments see every lot.
    """
    available = [b for b in lots if b.quantity_remaining > 0]
    if movement_type == "sale":
        return [b for b in available if inv.expiry_status(b.expiry_date, today) != inv.EXPIRY_EXPIRED]
    return available


async def _lock_lots(session: AsyncSession, product_id: int) -> list[FeedBatch]:
    """Re-read a product's lots under a row lock, for the rest of the transaction.

    Allocating stock is read-check-write against ``quantity_remaining``, and the
    write is an absolute UPDATE. Without the lock two concurrent sales both pass
    the sufficiency check and the second overwrites the first — the lot is
    oversold and the append-only ledger stops reconciling with the shelf, which
    is precisely the guarantee this module exists to provide.

    ``populate_existing`` matters: the rows are already in the identity map from
    `_require_product`, and a lock that returns stale values buys nothing. SQLite
    (used by the tests) has no row locks and ignores FOR UPDATE — harmless, since
    its transactions serialize at the database level anyway.
    """
    return list(
        (
            await session.execute(
                select(FeedBatch)
                .where(FeedBatch.product_id == product_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )


@router.post("/movements", response_model=FeedMovementResult, status_code=201)
async def create_movement(
    body: FeedMovementCreate,
    current: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeedMovementResult:
    """Book a sale, write-off, return, or stock-count adjustment.

    Outbound quantities are spread across lots first-expiry-first-out, producing
    one ledger row per lot touched so COGS is always the lot's real cost.
    """
    product = await _require_product(session, body.product_id)
    today = inv.today_iso()
    occurred = body.occurred_on or today
    signed = inv.signed_quantity(body.movement_type, body.quantity)

    # Everything below reads and then writes lot quantities, so take the row locks
    # before the first read. `lots` supersedes `product.batches` for the rest of
    # this handler — they are the same identity-mapped rows, refreshed under lock.
    lots = await _lock_lots(session, product.id)
    lots_by_id = {b.id: b for b in lots}
    if body.batch_id is not None and body.batch_id not in lots_by_id:
        raise HTTPException(status_code=404, detail="Batch not found for this product")

    created: list[FeedStockMovement] = []

    if signed > 0:
        # Inbound corrections must name the lot they land in: cost and expiry are
        # lot properties, and guessing them would corrupt COGS and the alerts.
        if body.batch_id is None:
            raise HTTPException(
                status_code=422,
                detail="A batch_id is required when adding stock back — pick the lot it belongs to",
            )
        lot = lots_by_id[body.batch_id]
        if lot.quantity_remaining + signed > lot.quantity_received:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Batch {lot.batch_code} only received {lot.quantity_received} unit(s); "
                    f"cannot hold {lot.quantity_remaining + signed}"
                ),
            )
        lot.quantity_remaining += signed
        created.append(
            FeedStockMovement(
                product_id=product.id,
                batch_id=lot.id,
                movement_type=body.movement_type,
                quantity=signed,
                unit_cost=lot.unit_cost,
                unit_price=body.unit_price,
                reference=body.reference,
                note=body.note,
                occurred_on=occurred,
                created_by=current.user_id,
            )
        )
    else:
        wanted = abs(signed)
        candidates = (
            [lots_by_id[body.batch_id]]
            if body.batch_id is not None
            else _sellable_lots(lots, body.movement_type, today)
        )
        if (
            body.batch_id is not None
            and body.movement_type == "sale"
            and inv.expiry_status(candidates[0].expiry_date, today) == inv.EXPIRY_EXPIRED
        ):
            raise HTTPException(
                status_code=409,
                detail=(f"Batch {candidates[0].batch_code} has expired — write it off instead of selling it"),
            )
        try:
            allocations = inv.allocate_fefo(candidates, wanted)
        except inv.InsufficientStockError as exc:
            detail = f"Only {exc.available} unit(s) available; {exc.requested} requested"
            if body.movement_type == "sale" and any(
                inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_EXPIRED
                for b in lots
                if b.quantity_remaining > 0
            ):
                detail += " (expired lots are excluded from sales — write them off)"
            raise HTTPException(status_code=409, detail=detail) from exc

        # Sales default to the catalogue price so the ledger always carries revenue.
        price = body.unit_price
        if body.movement_type == "sale" and price is None:
            price = product.unit_price

        for allocation in allocations:
            lot = lots_by_id[allocation.batch_id]
            lot.quantity_remaining -= allocation.quantity
            created.append(
                FeedStockMovement(
                    product_id=product.id,
                    batch_id=lot.id,
                    movement_type=body.movement_type,
                    quantity=-allocation.quantity,
                    unit_cost=allocation.unit_cost,
                    unit_price=price if body.movement_type == "sale" else None,
                    reference=body.reference,
                    note=body.note,
                    occurred_on=occurred,
                    created_by=current.user_id,
                )
            )

    session.add_all(created)
    await session.commit()

    # `expire_on_commit=False`, so the locked rows still carry their post-commit
    # values — no need to re-read the product just to total them.
    products_map = {product.id: product}
    batches_map = {b.id: b for b in lots}
    return FeedMovementResult(
        movements=[_movement_response(m, products_map, batches_map) for m in created],
        total_quantity=sum(m.quantity for m in created),
        on_hand=sum(b.quantity_remaining for b in lots),
    )


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def _monthly_series(movements: list[FeedStockMovement], periods: list[str]) -> list[FeedProductPeriod]:
    """Fold a movement list into one row per period, zero-filled across the window."""
    buckets: dict[str, dict[str, float]] = {
        p: {
            "units_in": 0.0,
            "units_sold": 0.0,
            "units_written_off": 0.0,
            "units_adjusted": 0.0,
            "revenue": 0.0,
            "cogs": 0.0,
        }
        for p in periods
    }
    for m in movements:
        bucket = buckets.get(inv.period_of(m.occurred_on))
        if bucket is None:
            continue
        units = abs(m.quantity)
        if m.quantity > 0:
            bucket["units_in"] += units
        if m.movement_type == "adjustment":
            # Signed and tracked separately: a stock-count shortfall belongs in
            # neither "sold" nor "written off", and without it the series cannot
            # reconcile to the change in stock on hand.
            bucket["units_adjusted"] += m.quantity
        if m.movement_type == "sale":
            bucket["units_sold"] += units
            bucket["revenue"] += units * (m.unit_price or 0.0)
            bucket["cogs"] += units * (m.unit_cost or 0.0)
        elif m.movement_type == "write_off":
            bucket["units_written_off"] += units

    return [
        FeedProductPeriod(
            period=period,
            units_in=int(values["units_in"]),
            units_sold=int(values["units_sold"]),
            units_written_off=int(values["units_written_off"]),
            units_adjusted=int(values["units_adjusted"]),
            revenue=round(values["revenue"], 2),
            cogs=round(values["cogs"], 2),
            margin=round(values["revenue"] - values["cogs"], 2),
        )
        for period, values in ((p, buckets[p]) for p in periods)
    ]


@router.get("/dashboard", response_model=FeedDashboard)
async def dashboard(
    _: ManageFeed,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: Annotated[int, Query(ge=1, le=36)] = 12,
) -> FeedDashboard:
    """Inventory command centre: valuation, health, expiry exposure, and trend."""
    today = inv.today_iso()
    period = inv.period_of(today)
    periods = inv.recent_periods(months, today)

    products = list(
        (await session.execute(select(FeedProduct).options(selectinload(FeedProduct.batches))))
        .scalars()
        .all()
    )
    # Bound the ledger scan to the charted window — the series can't show more.
    since = f"{periods[0]}-01"
    movements = list(
        (await session.execute(select(FeedStockMovement).where(FeedStockMovement.occurred_on >= since)))
        .scalars()
        .all()
    )

    rows = [_product_response(p, today) for p in products]
    active = [r for r in rows if r.is_active]

    total_units = sum(r.on_hand for r in active)
    value_cost = sum(r.stock_value_cost for r in active)
    value_retail = sum(r.stock_value_retail for r in active)
    potential = value_retail - value_cost

    # Active products only — the same population as `total_units`/`value_cost`
    # above. Mixing the two makes `expiring_value_pct` a ratio of two different
    # sets, which can exceed 100%.
    active_ids = {r.id for r in active}
    all_lots = [b for p in products if p.id in active_ids for b in p.batches if b.quantity_remaining > 0]
    expiring_units = sum(
        b.quantity_remaining for b in all_lots if inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_SOON
    )
    expiring_value = sum(
        b.quantity_remaining * b.unit_cost
        for b in all_lots
        if inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_SOON
    )
    expired_units = sum(
        b.quantity_remaining
        for b in all_lots
        if inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_EXPIRED
    )
    expired_value = sum(
        b.quantity_remaining * b.unit_cost
        for b in all_lots
        if inv.expiry_status(b.expiry_date, today) == inv.EXPIRY_EXPIRED
    )

    # --- month to date ---
    mtd = [m for m in movements if inv.period_of(m.occurred_on) == period]
    units_sold_mtd = sum(abs(m.quantity) for m in mtd if m.movement_type == "sale")
    revenue_mtd = sum(abs(m.quantity) * (m.unit_price or 0.0) for m in mtd if m.movement_type == "sale")
    cogs_mtd = sum(abs(m.quantity) * (m.unit_cost or 0.0) for m in mtd if m.movement_type == "sale")
    write_off_mtd = sum(abs(m.quantity) * (m.unit_cost or 0.0) for m in mtd if m.movement_type == "write_off")

    # --- breakdowns ---
    by_species: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    by_status: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in active:
        by_species[r.species][0] += r.on_hand
        by_species[r.species][1] += r.stock_value_cost
        by_status[r.stock_status][0] += r.on_hand
        by_status[r.stock_status][1] += r.stock_value_cost

    sold_by_product: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for m in movements:
        if m.movement_type == "sale":
            sold_by_product[m.product_id][0] += abs(m.quantity)
            sold_by_product[m.product_id][1] += abs(m.quantity) * (m.unit_price or 0.0)
    names = {p.id: f"{p.sku} · {p.name}" for p in products}
    top_sellers = sorted(
        (
            FeedNamedTotal(name=names.get(pid, str(pid)), units=int(v[0]), value=round(v[1], 2))
            for pid, v in sold_by_product.items()
        ),
        key=lambda t: t.units,
        reverse=True,
    )[:10]

    # --- alerts, most urgent first ---
    by_id = {p.id: p for p in products}
    low_stock = sorted(
        (
            FeedAlert(
                product_id=r.id,
                sku=r.sku,
                name=r.name,
                species=r.species,
                units=r.sellable_units,
                value=r.stock_value_cost,
                reorder_level=r.reorder_level,
            )
            for r in active
            if r.stock_status in (inv.STOCK_LOW, inv.STOCK_OUT)
        ),
        key=lambda a: a.units,
    )[:_MAX_ALERTS]

    def _lot_alerts(status: str) -> list[FeedAlert]:
        out = [
            FeedAlert(
                product_id=b.product_id,
                sku=by_id[b.product_id].sku,
                name=by_id[b.product_id].name,
                species=by_id[b.product_id].species,
                batch_id=b.id,
                batch_code=b.batch_code,
                units=b.quantity_remaining,
                value=round(b.quantity_remaining * b.unit_cost, 2),
                expiry_date=b.expiry_date,
                days_to_expiry=inv.days_until(b.expiry_date, today),
            )
            for b in all_lots
            if inv.expiry_status(b.expiry_date, today) == status and b.product_id in by_id
        ]
        # Soonest first; undated lots (days_to_expiry None) sort last.
        out.sort(key=lambda a: (a.days_to_expiry is None, a.days_to_expiry or 0))
        return out[:_MAX_ALERTS]

    expiring_alerts = _lot_alerts(inv.EXPIRY_SOON)
    expired_alerts = _lot_alerts(inv.EXPIRY_EXPIRED)

    return FeedDashboard(
        total_products=len(rows),
        active_products=len(active),
        total_units=total_units,
        stock_value_cost=round(value_cost, 2),
        stock_value_retail=round(value_retail, 2),
        potential_margin=round(potential, 2),
        potential_margin_pct=round(potential / value_retail * 100, 1) if value_retail else 0.0,
        low_stock_count=sum(1 for r in active if r.stock_status == inv.STOCK_LOW),
        out_of_stock_count=sum(1 for r in active if r.stock_status == inv.STOCK_OUT),
        expiring_soon_count=sum(1 for r in active if r.expiring_units > 0),
        expired_count=sum(1 for r in active if r.expired_units > 0),
        expiring_units=int(expiring_units),
        expiring_value=round(expiring_value, 2),
        expired_units=int(expired_units),
        expired_value=round(expired_value, 2),
        expiring_value_pct=round(expiring_value / value_cost * 100, 1) if value_cost else 0.0,
        expired_value_pct=round(expired_value / value_cost * 100, 1) if value_cost else 0.0,
        period=period,
        units_sold_mtd=int(units_sold_mtd),
        revenue_mtd=round(revenue_mtd, 2),
        cogs_mtd=round(cogs_mtd, 2),
        margin_mtd=round(revenue_mtd - cogs_mtd, 2),
        write_off_value_mtd=round(write_off_mtd, 2),
        by_species=[
            FeedNamedTotal(name=k, units=int(v[0]), value=round(v[1], 2))
            for k, v in sorted(by_species.items(), key=lambda kv: kv[1][1], reverse=True)
        ],
        by_stock_status=[
            FeedNamedTotal(name=k, units=int(v[0]), value=round(v[1], 2)) for k, v in by_status.items()
        ],
        expiry_buckets=inv.bucket_lots(all_lots, today),
        monthly=_monthly_series(movements, periods),
        top_sellers=top_sellers,
        low_stock=low_stock,
        expiring=expiring_alerts,
        expired=expired_alerts,
    )
