"""Tests for the Hormaal Animal Feed inventory module.

Two layers, matching the code's own split:

  * pure domain logic in ``api.internal.feed_inventory`` (FEFO allocation,
    expiry classification, shelf-life derivation, valuation helpers) — tested
    directly, no DB, no clock;
  * the ``/feed`` API — RBAC, the product/batch/movement lifecycle, and the
    invariants the router is responsible for (expired stock cannot be sold,
    inbound corrections must name a lot, a lot never exceeds what it received).
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from api.internal import feed_inventory as inv

ADMIN_EMAIL = "admin@harmaal.local"
ADMIN_PW = "changeme"

TODAY = "2026-08-23"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@dataclass
class Lot:
    """Minimal stand-in for a ``FeedBatch`` row (structural match on `inv.Lot`)."""

    id: int
    expiry_date: str | None
    quantity_remaining: int
    unit_cost: float


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _admin_token(client) -> str:
    r = await client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


async def _manager_token(client, admin_token: str, email: str = "feedmgr@harmaal.io") -> str:
    r = await client.post("/auth/users", json={"email": email, "role": "manager"}, headers=_auth(admin_token))
    assert r.status_code == 201, r.text
    r2 = await client.post("/auth/login", json={"email": email, "password": r.json()["generated_otp"]})
    assert r2.status_code == 200, r2.text
    return r2.json()["access_token"]


async def _product(client, token: str, **overrides) -> dict:
    body = {
        "sku": "CML-TEST-50",
        "name": "Camel Test Pellets",
        "species": "camel",
        "unit_size": 50,
        "unit_cost": 20.0,
        "unit_price": 30.0,
        "shelf_life_days": 180,
        "reorder_level": 10,
    }
    body.update(overrides)
    r = await client.post("/feed/products", json=body, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _batch(client, token: str, product_id: int, **overrides) -> dict:
    body = {
        "product_id": product_id,
        "batch_code": "LOT-1",
        "quantity": 100,
        "unit_cost": 19.0,
        "received_date": "2026-06-01",
        "expiry_date": "2027-01-01",
    }
    body.update(overrides)
    r = await client.post("/feed/batches", json=body, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


# ===========================================================================
# Domain logic — pure functions
# ===========================================================================


class TestDates:
    def test_parse_date_tolerates_junk(self):
        assert inv.parse_date("2026-08-23").isoformat() == "2026-08-23"
        assert inv.parse_date("") is None
        assert inv.parse_date(None) is None
        assert inv.parse_date("not-a-date") is None

    def test_days_until_is_negative_once_past(self):
        assert inv.days_until("2026-08-30", TODAY) == 7
        assert inv.days_until(TODAY, TODAY) == 0
        assert inv.days_until("2026-08-01", TODAY) == -22
        assert inv.days_until(None, TODAY) is None

    def test_period_of(self):
        assert inv.period_of("2026-08-23") == "2026-08"
        assert inv.period_of("") == ""

    def test_recent_periods_is_oldest_first_and_crosses_years(self):
        assert inv.recent_periods(3, "2026-01-15") == ["2025-11", "2025-12", "2026-01"]
        assert inv.recent_periods(1, "2026-08-23") == ["2026-08"]

    def test_expiry_derives_from_manufacture_in_preference_to_receipt(self):
        # Manufactured earlier than received: the shorter (correct) life wins.
        assert (
            inv.derive_expiry_date(100, manufactured_date="2026-01-01", received_date="2026-03-01")
            == "2026-04-11"
        )

    def test_expiry_falls_back_to_receipt_when_manufacture_unknown(self):
        assert inv.derive_expiry_date(30, received_date="2026-08-01") == "2026-08-31"

    def test_expiry_is_unknown_without_an_anchor_or_shelf_life(self):
        assert inv.derive_expiry_date(180) is None
        assert inv.derive_expiry_date(0, manufactured_date="2026-01-01") is None


class TestStatus:
    def test_stock_status_boundaries(self):
        assert inv.stock_status(0, 10) == inv.STOCK_OUT
        assert inv.stock_status(-5, 10) == inv.STOCK_OUT
        assert inv.stock_status(10, 10) == inv.STOCK_LOW  # at the reorder point
        assert inv.stock_status(11, 10) == inv.STOCK_OK

    def test_reorder_level_zero_disables_the_low_alert(self):
        assert inv.stock_status(1, 0) == inv.STOCK_OK

    def test_expiry_status_boundaries(self):
        assert inv.expiry_status("2026-08-22", TODAY) == inv.EXPIRY_EXPIRED
        assert inv.expiry_status(TODAY, TODAY) == inv.EXPIRY_SOON  # today is not yet past
        assert inv.expiry_status("2026-09-22", TODAY) == inv.EXPIRY_SOON  # exactly 30 days
        assert inv.expiry_status("2026-09-23", TODAY) == inv.EXPIRY_FRESH

    def test_undated_lots_are_treated_as_fresh(self):
        assert inv.expiry_status(None, TODAY) == inv.EXPIRY_FRESH

    def test_expiry_buckets(self):
        assert inv.expiry_bucket("2026-08-01", TODAY) == "expired"
        assert inv.expiry_bucket("2026-09-01", TODAY) == "0-30"
        assert inv.expiry_bucket("2026-10-10", TODAY) == "31-60"
        assert inv.expiry_bucket("2026-11-10", TODAY) == "61-90"
        assert inv.expiry_bucket("2027-06-01", TODAY) == "90+"

    def test_margin_pct_handles_a_zero_price(self):
        assert inv.margin_pct(20, 25) == 20.0
        assert inv.margin_pct(20, 0) == 0.0

    def test_unit_label_drops_trailing_zeros(self):
        assert inv.unit_label(50.0, "kg", "bag") == "50 kg bag"
        assert inv.unit_label(2.5, "l", "drum") == "2.5 l drum"


class TestSignedQuantity:
    @pytest.mark.parametrize(
        ("movement_type", "given", "expected"),
        [
            ("sale", 10, -10),
            ("sale", -10, -10),  # magnitude only: a client cannot invert a sale
            ("write_off", 4, -4),
            ("return", 3, 3),
            ("receipt", 7, 7),
            ("adjustment", -6, -6),  # signed kind passes through
            ("adjustment", 6, 6),
        ],
    )
    def test_direction_is_derived_from_the_type(self, movement_type, given, expected):
        assert inv.signed_quantity(movement_type, given) == expected


class TestFefo:
    def test_allocates_nearest_expiry_first(self):
        lots = [Lot(1, "2026-12-01", 10, 5.0), Lot(2, "2026-09-01", 4, 6.0)]
        assert inv.allocate_fefo(lots, 8) == [
            inv.Allocation(batch_id=2, quantity=4, unit_cost=6.0),
            inv.Allocation(batch_id=1, quantity=4, unit_cost=5.0),
        ]

    def test_undated_lots_sort_last(self):
        lots = [Lot(1, None, 10, 5.0), Lot(2, "2027-01-01", 3, 6.0)]
        assert [a.batch_id for a in inv.allocate_fefo(lots, 5)] == [2, 1]

    def test_ties_break_on_id_for_determinism(self):
        lots = [Lot(9, "2026-09-01", 2, 5.0), Lot(3, "2026-09-01", 2, 5.0)]
        assert [a.batch_id for a in inv.allocate_fefo(lots, 4)] == [3, 9]

    def test_skips_exhausted_lots(self):
        lots = [Lot(1, "2026-09-01", 0, 5.0), Lot(2, "2026-10-01", 5, 6.0)]
        assert [a.batch_id for a in inv.allocate_fefo(lots, 5)] == [2]

    def test_raises_before_mutating_when_short(self):
        lots = [Lot(1, "2026-09-01", 3, 5.0)]
        with pytest.raises(inv.InsufficientStockError) as exc:
            inv.allocate_fefo(lots, 10)
        assert exc.value.available == 3
        assert exc.value.requested == 10
        # The caller can retry: nothing was consumed.
        assert lots[0].quantity_remaining == 3

    def test_zero_or_negative_is_a_no_op(self):
        assert inv.allocate_fefo([Lot(1, None, 5, 1.0)], 0) == []
        assert inv.allocate_fefo([Lot(1, None, 5, 1.0)], -3) == []


class TestAggregation:
    def test_bucket_lots_keeps_every_bucket_present(self):
        buckets = inv.bucket_lots([Lot(1, "2026-09-01", 5, 10.0)], TODAY)
        assert set(buckets) == {"expired", "0-30", "31-60", "61-90", "90+"}
        assert buckets["0-30"] == {"units": 5, "value": 50.0}
        assert buckets["expired"] == {"units": 0, "value": 0.0}

    def test_bucket_lots_ignores_empty_lots(self):
        assert inv.bucket_lots([Lot(1, "2026-09-01", 0, 10.0)], TODAY)["0-30"]["units"] == 0

    def test_sell_through_rate_is_capped_and_safe(self):
        assert inv.sell_through_rate(50, 200) == 25.0
        assert inv.sell_through_rate(0, 0) == 0.0
        assert inv.sell_through_rate(300, 200) == 100.0

    def test_days_of_cover_is_unknown_without_sales(self):
        assert inv.days_of_cover(90, 90, 90) == 90.0
        # No sales in the window is an unknown burn rate, not infinite cover.
        assert inv.days_of_cover(90, 0, 90) is None


# ===========================================================================
# API — access control
# ===========================================================================


FEED_ENDPOINTS = ("/feed/dashboard", "/feed/products", "/feed/batches", "/feed/movements")


async def test_feed_requires_authentication(client):
    # HTTPBearer(auto_error=True) rejects a missing Authorization header as 401.
    for endpoint in FEED_ENDPOINTS:
        assert (await client.get(endpoint)).status_code == 401, endpoint


async def test_manage_feed_is_seeded_to_the_admin_role_only(client):
    token = await _admin_token(client)
    roles = (await client.get("/auth/roles", headers=_auth(token))).json()
    holders = {r["name"] for r in roles if "manage_feed" in r["permissions"]}
    assert holders == {"admin"}


async def test_manager_cannot_reach_the_feed_console(client):
    admin = await _admin_token(client)
    manager = await _manager_token(client, admin)
    for endpoint in FEED_ENDPOINTS:
        r = await client.get(endpoint, headers=_auth(manager))
        assert r.status_code == 403, endpoint
        assert "manage_feed" in r.json()["detail"]


async def test_manager_cannot_write_feed_data(client):
    admin = await _admin_token(client)
    manager = await _manager_token(client, admin)
    r = await client.post(
        "/feed/products",
        json={
            "sku": "X-1",
            "name": "Sneaky",
            "species": "goat",
            "unit_size": 1,
            "unit_cost": 1,
            "unit_price": 2,
            "shelf_life_days": 30,
        },
        headers=_auth(manager),
    )
    assert r.status_code == 403


async def test_admin_reaches_the_feed_console(client):
    token = await _admin_token(client)
    for endpoint in FEED_ENDPOINTS:
        assert (await client.get(endpoint, headers=_auth(token))).status_code == 200, endpoint


# ===========================================================================
# API — products
# ===========================================================================


async def test_create_product_normalizes_and_derives(client):
    token = await _admin_token(client)
    product = await _product(client, token, sku="cml-pel-50", species="Camel")
    assert product["sku"] == "CML-PEL-50"  # uppercased
    assert product["species"] == "camel"  # lowercased
    assert product["unit_label"] == "50 kg bag"
    assert product["margin_per_unit"] == 10.0
    assert product["margin_pct"] == 33.3
    # A brand-new product has no stock and therefore no lots.
    assert product["on_hand"] == 0
    assert product["stock_status"] == "out_of_stock"
    assert product["batch_count"] == 0


async def test_duplicate_sku_is_rejected(client):
    token = await _admin_token(client)
    await _product(client, token)
    r = await client.post(
        "/feed/products",
        json={
            "sku": "cml-test-50",
            "name": "Another",
            "species": "goat",
            "unit_size": 25,
            "unit_cost": 1,
            "unit_price": 2,
            "shelf_life_days": 30,
        },
        headers=_auth(token),
    )
    assert r.status_code == 409


@pytest.mark.parametrize(
    "bad",
    [
        {"sku": "HAS SPACE"},
        {"species": "llama"},
        {"feed_type": "soup"},
        {"unit_of_measure": "furlong"},
        {"package_type": "envelope"},
        {"unit_size": 0},
        {"unit_cost": -1},
        {"shelf_life_days": 0},
    ],
)
async def test_invalid_product_fields_are_rejected(client, bad):
    token = await _admin_token(client)
    body = {
        "sku": "OK-1",
        "name": "Valid Name",
        "species": "goat",
        "unit_size": 25,
        "unit_cost": 1,
        "unit_price": 2,
        "shelf_life_days": 30,
    }
    body.update(bad)
    r = await client.post("/feed/products", json=body, headers=_auth(token))
    assert r.status_code == 422


async def test_unknown_fields_are_forbidden_at_the_boundary(client):
    token = await _admin_token(client)
    r = await client.post(
        "/feed/products",
        json={
            "sku": "OK-2",
            "name": "Valid Name",
            "species": "goat",
            "unit_size": 25,
            "unit_cost": 1,
            "unit_price": 2,
            "shelf_life_days": 30,
            "is_active": True,
        },
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_patch_updates_only_what_was_sent(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    r = await client.patch(f"/feed/products/{product['id']}", json={"unit_price": 45.0}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["unit_price"] == 45.0
    assert r.json()["name"] == product["name"]  # untouched
    assert r.json()["reorder_level"] == product["reorder_level"]


async def test_retire_is_blocked_while_stock_remains(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=5)
    r = await client.delete(f"/feed/products/{product['id']}", headers=_auth(token))
    assert r.status_code == 409
    assert "still in stock" in r.json()["detail"]


async def test_retire_soft_deletes_and_hides_from_the_catalogue(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    assert (await client.delete(f"/feed/products/{product['id']}", headers=_auth(token))).status_code == 200

    listed = (await client.get("/feed/products", headers=_auth(token))).json()
    assert product["id"] not in [p["id"] for p in listed]

    with_inactive = (await client.get("/feed/products?include_inactive=true", headers=_auth(token))).json()
    assert product["id"] in [p["id"] for p in with_inactive]


async def test_product_filters(client):
    token = await _admin_token(client)
    await _product(client, token, sku="CAM-1", species="camel", name="Camel Pellets")
    await _product(client, token, sku="CHK-1", species="chicken", name="Layer Mash")

    by_species = (await client.get("/feed/products?species=camel", headers=_auth(token))).json()
    assert [p["sku"] for p in by_species] == ["CAM-1"]

    by_search = (await client.get("/feed/products?q=layer", headers=_auth(token))).json()
    assert [p["sku"] for p in by_search] == ["CHK-1"]

    # Both products are stockless, so both read as out_of_stock.
    by_status = (await client.get("/feed/products?stock_status=out_of_stock", headers=_auth(token))).json()
    assert len(by_status) == 2


async def test_missing_product_is_404(client):
    token = await _admin_token(client)
    assert (await client.get("/feed/products/9999", headers=_auth(token))).status_code == 404


# ===========================================================================
# API — receiving
# ===========================================================================


async def test_receiving_creates_a_lot_and_a_ledger_receipt(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    batch = await _batch(client, token, product["id"], quantity=40, unit_cost=18.0)

    assert batch["quantity_received"] == 40
    assert batch["quantity_remaining"] == 40
    assert batch["value_at_cost"] == 720.0

    refreshed = (await client.get(f"/feed/products/{product['id']}", headers=_auth(token))).json()
    assert refreshed["product"]["on_hand"] == 40
    assert refreshed["product"]["stock_value_cost"] == 720.0
    receipts = [m for m in refreshed["movements"] if m["movement_type"] == "receipt"]
    assert len(receipts) == 1
    assert receipts[0]["quantity"] == 40
    assert receipts[0]["unit_cost"] == 18.0


async def test_expiry_is_derived_from_shelf_life_when_omitted(client):
    token = await _admin_token(client)
    product = await _product(client, token, shelf_life_days=90)
    batch = await _batch(
        client,
        token,
        product["id"],
        expiry_date=None,
        manufactured_date="2026-01-01",
        received_date="2026-02-01",
    )
    assert batch["expiry_date"] == "2026-04-01"  # manufacture + 90 days


async def test_explicit_expiry_overrides_the_derived_one(client):
    token = await _admin_token(client)
    product = await _product(client, token, shelf_life_days=90)
    batch = await _batch(
        client, token, product["id"], manufactured_date="2026-01-01", expiry_date="2026-03-01"
    )
    assert batch["expiry_date"] == "2026-03-01"


async def test_expiry_before_manufacture_is_rejected(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    r = await client.post(
        "/feed/batches",
        json={
            "product_id": product["id"],
            "batch_code": "BAD",
            "quantity": 10,
            "unit_cost": 5,
            "manufactured_date": "2026-06-01",
            "expiry_date": "2026-01-01",
        },
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_duplicate_batch_code_per_product_is_rejected(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], batch_code="LOT-A")
    r = await client.post(
        "/feed/batches",
        json={"product_id": product["id"], "batch_code": "lot-a", "quantity": 1, "unit_cost": 1},
        headers=_auth(token),
    )
    assert r.status_code == 409


async def test_cannot_receive_against_a_retired_product(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await client.delete(f"/feed/products/{product['id']}", headers=_auth(token))
    r = await client.post(
        "/feed/batches",
        json={"product_id": product["id"], "batch_code": "L1", "quantity": 1, "unit_cost": 1},
        headers=_auth(token),
    )
    assert r.status_code == 409


async def test_receipt_cannot_be_booked_through_the_movements_endpoint(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "receipt", "quantity": 5},
        headers=_auth(token),
    )
    assert r.status_code == 422


# ===========================================================================
# API — movements
# ===========================================================================


async def test_sale_draws_fefo_across_lots_and_costs_each_at_its_own_rate(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(
        client,
        token,
        product["id"],
        batch_code="LATER",
        quantity=10,
        unit_cost=20.0,
        expiry_date="2027-06-01",
    )
    await _batch(
        client,
        token,
        product["id"],
        batch_code="SOONER",
        quantity=4,
        unit_cost=25.0,
        expiry_date="2027-01-01",
    )

    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 8},
        headers=_auth(token),
    )
    assert r.status_code == 201
    result = r.json()
    assert result["total_quantity"] == -8
    assert result["on_hand"] == 6

    # Nearest expiry drains first, and each line carries that lot's cost.
    lines = sorted(result["movements"], key=lambda m: m["batch_code"])
    assert [(m["batch_code"], m["quantity"], m["unit_cost"]) for m in lines] == [
        ("LATER", -4, 20.0),
        ("SOONER", -4, 25.0),
    ]


async def test_sale_defaults_to_the_catalogue_price(client):
    token = await _admin_token(client)
    product = await _product(client, token, unit_price=30.0)
    await _batch(client, token, product["id"], quantity=10)
    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 2},
        headers=_auth(token),
    )
    line = r.json()["movements"][0]
    assert line["unit_price"] == 30.0
    assert line["line_revenue"] == 60.0


async def test_overselling_is_refused_and_changes_nothing(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=5)
    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 50},
        headers=_auth(token),
    )
    assert r.status_code == 409
    assert "Only 5 unit(s) available" in r.json()["detail"]
    after = (await client.get(f"/feed/products/{product['id']}", headers=_auth(token))).json()
    assert after["product"]["on_hand"] == 5


async def test_expired_stock_cannot_be_sold_but_can_be_written_off(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    # A lot that expired well before any plausible "today".
    await _batch(
        client,
        token,
        product["id"],
        batch_code="OLD",
        quantity=6,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )

    sale = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 1},
        headers=_auth(token),
    )
    assert sale.status_code == 409
    assert "expired" in sale.json()["detail"]

    write_off = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "write_off", "quantity": 6},
        headers=_auth(token),
    )
    assert write_off.status_code == 201
    assert write_off.json()["on_hand"] == 0


async def test_sale_skips_an_expired_lot_and_draws_the_fresh_one(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(
        client,
        token,
        product["id"],
        batch_code="EXPIRED",
        quantity=5,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )
    await _batch(client, token, product["id"], batch_code="FRESH", quantity=5, expiry_date="2099-01-01")

    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 3},
        headers=_auth(token),
    )
    assert r.status_code == 201
    assert {m["batch_code"] for m in r.json()["movements"]} == {"FRESH"}
    # The expired lot is untouched and still on the shelf awaiting a write-off.
    assert r.json()["on_hand"] == 7


async def test_selling_a_named_expired_lot_is_refused(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    batch = await _batch(
        client,
        token,
        product["id"],
        batch_code="OLD",
        quantity=5,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )
    r = await client.post(
        "/feed/movements",
        json={
            "product_id": product["id"],
            "movement_type": "sale",
            "quantity": 1,
            "batch_id": batch["id"],
        },
        headers=_auth(token),
    )
    assert r.status_code == 409
    assert "write it off" in r.json()["detail"]


async def test_inbound_movement_requires_a_named_lot(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=10)
    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "return", "quantity": 2},
        headers=_auth(token),
    )
    assert r.status_code == 422
    assert "batch_id is required" in r.json()["detail"]


async def test_return_restores_stock_to_its_lot(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    batch = await _batch(client, token, product["id"], quantity=10)
    await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 4},
        headers=_auth(token),
    )
    r = await client.post(
        "/feed/movements",
        json={
            "product_id": product["id"],
            "movement_type": "return",
            "quantity": 3,
            "batch_id": batch["id"],
        },
        headers=_auth(token),
    )
    assert r.status_code == 201
    assert r.json()["on_hand"] == 9


async def test_a_lot_can_never_hold_more_than_it_received(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    batch = await _batch(client, token, product["id"], quantity=10)
    r = await client.post(
        "/feed/movements",
        json={
            "product_id": product["id"],
            "movement_type": "return",
            "quantity": 5,
            "batch_id": batch["id"],
        },
        headers=_auth(token),
    )
    assert r.status_code == 409
    assert "only received 10" in r.json()["detail"]


async def test_negative_adjustment_removes_stock_fefo(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=10)
    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "adjustment", "quantity": -3},
        headers=_auth(token),
    )
    assert r.status_code == 201
    assert r.json()["on_hand"] == 7


async def test_zero_quantity_is_rejected(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    r = await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 0},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_a_batch_from_another_product_is_rejected(client):
    token = await _admin_token(client)
    first = await _product(client, token, sku="A-1")
    second = await _product(client, token, sku="B-1")
    foreign = await _batch(client, token, second["id"], quantity=10)
    r = await client.post(
        "/feed/movements",
        json={
            "product_id": first["id"],
            "movement_type": "sale",
            "quantity": 1,
            "batch_id": foreign["id"],
        },
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_movement_filters(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=10, received_date="2026-06-01")
    await client.post(
        "/feed/movements",
        json={
            "product_id": product["id"],
            "movement_type": "sale",
            "quantity": 2,
            "occurred_on": "2026-07-15",
        },
        headers=_auth(token),
    )

    sales = (await client.get("/feed/movements?movement_type=sale", headers=_auth(token))).json()
    assert [m["movement_type"] for m in sales] == ["sale"]

    windowed = (
        await client.get("/feed/movements?date_from=2026-07-01&date_to=2026-07-31", headers=_auth(token))
    ).json()
    assert len(windowed) == 1
    assert windowed[0]["occurred_on"] == "2026-07-15"

    assert (
        await client.get("/feed/movements?movement_type=nonsense", headers=_auth(token))
    ).status_code == 422


# ===========================================================================
# API — derived reporting
# ===========================================================================


async def test_expired_units_do_not_count_as_cover_for_the_reorder_alert(client):
    """Regression: stock_status must be driven by *sellable* stock.

    A pallet of expired feed is still on the shelf and still carries cost, but it
    cannot be sold — counting it as cover would silently suppress the reorder
    signal for a product that has effectively run out.
    """
    token = await _admin_token(client)
    product = await _product(client, token, reorder_level=10)
    await _batch(
        client,
        token,
        product["id"],
        batch_code="OLD",
        quantity=50,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )
    await _batch(client, token, product["id"], batch_code="NEW", quantity=4, expiry_date="2099-01-01")

    rows = (await client.get("/feed/products", headers=_auth(token))).json()
    row = next(p for p in rows if p["id"] == product["id"])
    assert row["on_hand"] == 54  # physical stock, expired included
    assert row["sellable_units"] == 4
    assert row["expired_units"] == 50
    assert row["stock_status"] == "low"


async def test_dashboard_totals_reconcile_with_the_ledger(client):
    token = await _admin_token(client)
    product = await _product(client, token, unit_cost=20.0, unit_price=30.0, reorder_level=5)
    await _batch(client, token, product["id"], quantity=100, unit_cost=18.0, expiry_date="2099-01-01")
    await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 10},
        headers=_auth(token),
    )

    data = (await client.get("/feed/dashboard", headers=_auth(token))).json()
    assert data["total_products"] == 1
    assert data["total_units"] == 90
    assert data["stock_value_cost"] == 90 * 18.0
    assert data["stock_value_retail"] == 90 * 30.0
    assert data["units_sold_mtd"] == 10
    assert data["revenue_mtd"] == 300.0
    assert data["cogs_mtd"] == 180.0  # costed at the lot's 18.0, not the standard 20.0
    assert data["margin_mtd"] == 120.0
    assert data["low_stock_count"] == 0


async def test_dashboard_surfaces_expiry_exposure(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(
        client,
        token,
        product["id"],
        batch_code="OLD",
        quantity=10,
        unit_cost=10.0,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )

    data = (await client.get("/feed/dashboard", headers=_auth(token))).json()
    assert data["expired_units"] == 10
    assert data["expired_value"] == 100.0
    assert data["expired_value_pct"] == 100.0
    assert len(data["expired"]) == 1
    assert data["expired"][0]["batch_code"] == "OLD"
    assert data["expiry_buckets"]["expired"]["units"] == 10


async def test_dashboard_series_is_zero_filled_across_the_window(client):
    token = await _admin_token(client)
    data = (await client.get("/feed/dashboard?months=6", headers=_auth(token))).json()
    assert len(data["monthly"]) == 6
    # Oldest first, so a chart's x-axis reads left to right.
    assert data["monthly"] == sorted(data["monthly"], key=lambda row: row["period"])
    assert all(row["units_sold"] == 0 for row in data["monthly"])


async def test_dashboard_rejects_an_out_of_range_window(client):
    token = await _admin_token(client)
    assert (await client.get("/feed/dashboard?months=0", headers=_auth(token))).status_code == 422
    assert (await client.get("/feed/dashboard?months=99", headers=_auth(token))).status_code == 422


async def test_product_detail_reports_cover_and_sell_through(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=100, expiry_date="2099-01-01")
    await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 45},
        headers=_auth(token),
    )

    detail = (await client.get(f"/feed/products/{product['id']}", headers=_auth(token))).json()
    assert detail["units_sold_90d"] == 45
    assert detail["sell_through_pct"] == 45.0
    # 55 on hand at 0.5 units/day → 110 days of cover.
    assert detail["days_of_cover"] == 110.0
    assert detail["product"]["on_hand"] == 55


# ===========================================================================
# Regressions — each pins a defect found in review
# ===========================================================================


async def test_patch_cannot_retire_a_product_that_still_has_stock(client):
    """Regression: PATCH must not be a back door around the DELETE guard.

    Retired products drop out of the catalogue and out of every dashboard total,
    so retiring one with stock on the shelf writes that inventory out of the books.
    """
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=40)

    r = await client.patch(f"/feed/products/{product['id']}", json={"is_active": False}, headers=_auth(token))
    assert r.status_code == 409
    assert "still in stock" in r.json()["detail"]

    still_listed = (await client.get("/feed/products", headers=_auth(token))).json()
    assert product["id"] in [p["id"] for p in still_listed]


async def test_patch_can_still_retire_an_empty_product_and_reactivate_it(client):
    token = await _admin_token(client)
    product = await _product(client, token)
    assert (
        await client.patch(f"/feed/products/{product['id']}", json={"is_active": False}, headers=_auth(token))
    ).status_code == 200
    # Reactivating is always safe — it only ever adds a SKU back to the books.
    r = await client.patch(f"/feed/products/{product['id']}", json={"is_active": True}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["is_active"] is True


async def test_dashboard_ratios_only_count_active_products(client):
    """Regression: expiry figures and stock totals must span the same population.

    Mixing them (all products for the numerator, active for the denominator) let
    `expiring_value_pct` exceed 100%.
    """
    token = await _admin_token(client)
    live = await _product(client, token, sku="LIVE-1", unit_cost=1.0, unit_price=2.0)
    await _batch(
        client, token, live["id"], batch_code="L1", quantity=1, unit_cost=1.0, expiry_date="2099-01-01"
    )

    retired = await _product(client, token, sku="GONE-1")
    await _batch(
        client,
        token,
        retired["id"],
        batch_code="G1",
        quantity=100,
        unit_cost=10.0,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )
    # Clear its stock so it can be retired, then re-receive is impossible — instead
    # retire by writing the stock off first, which is the supported path.
    await client.post(
        "/feed/movements",
        json={"product_id": retired["id"], "movement_type": "write_off", "quantity": 100},
        headers=_auth(token),
    )
    assert (await client.delete(f"/feed/products/{retired['id']}", headers=_auth(token))).status_code == 200

    data = (await client.get("/feed/dashboard", headers=_auth(token))).json()
    assert data["active_products"] == 1
    assert data["total_units"] == 1
    assert data["expired_units"] == 0
    assert data["expiring_value_pct"] <= 100.0
    assert data["expired_value_pct"] <= 100.0
    # The bucket chart is drawn from the same population as the totals.
    assert sum(b["units"] for b in data["expiry_buckets"].values()) == data["total_units"]


async def test_days_of_cover_ignores_expired_stock(client):
    """Regression: cover is sellable stock over the sales rate — expired feed is
    not cover, the same rule `stock_status` follows."""
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(
        client,
        token,
        product["id"],
        batch_code="OLD",
        quantity=900,
        received_date="2020-01-01",
        expiry_date="2020-06-01",
    )
    await _batch(client, token, product["id"], batch_code="NEW", quantity=100, expiry_date="2099-01-01")
    await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "sale", "quantity": 10},
        headers=_auth(token),
    )

    detail = (await client.get(f"/feed/products/{product['id']}", headers=_auth(token))).json()
    assert detail["product"]["sellable_units"] == 90
    # 90 sellable at 10 units / 90 days → 810 days, not the 8100 that counting the
    # expired lot would produce.
    assert detail["days_of_cover"] == 810.0


async def test_sell_through_uses_a_lifetime_numerator(client):
    """Regression: 90-day sales over lifetime receipts made every mature SKU read low."""
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(
        client, token, product["id"], quantity=100, received_date="2024-01-01", expiry_date="2099-01-01"
    )
    # A sale well outside the 90-day window still counts toward sell-through.
    await client.post(
        "/feed/movements",
        json={
            "product_id": product["id"],
            "movement_type": "sale",
            "quantity": 60,
            "occurred_on": "2024-03-01",
        },
        headers=_auth(token),
    )
    detail = (await client.get(f"/feed/products/{product['id']}", headers=_auth(token))).json()
    assert detail["units_sold_90d"] == 0  # outside the window
    assert detail["sell_through_pct"] == 60.0  # but lifetime sell-through is 60/100


async def test_batch_expiry_filter_is_applied_before_the_limit(client):
    """Regression: filtering the page after LIMIT returned a silently short page."""
    token = await _admin_token(client)
    product = await _product(client, token)
    # Two expired lots sort first by expiry; the fresh one would fall outside a
    # limit-then-filter page.
    await _batch(
        client,
        token,
        product["id"],
        batch_code="E1",
        quantity=1,
        received_date="2020-01-01",
        expiry_date="2020-01-01",
    )
    await _batch(
        client,
        token,
        product["id"],
        batch_code="E2",
        quantity=1,
        received_date="2020-01-01",
        expiry_date="2020-02-01",
    )
    await _batch(client, token, product["id"], batch_code="F1", quantity=1, expiry_date="2099-01-01")

    fresh = (await client.get("/feed/batches?expiry_status=fresh&limit=1", headers=_auth(token))).json()
    assert [b["batch_code"] for b in fresh] == ["F1"]

    expired = (await client.get("/feed/batches?expiry_status=expired", headers=_auth(token))).json()
    assert {b["batch_code"] for b in expired} == {"E1", "E2"}

    assert (await client.get("/feed/batches?expiry_status=nonsense", headers=_auth(token))).status_code == 422


async def test_adjustments_appear_in_the_monthly_series(client):
    """Regression: a stock-count shortfall belonged to no series, so the monthly
    rows could not reconcile to the change in stock on hand."""
    token = await _admin_token(client)
    product = await _product(client, token)
    await _batch(client, token, product["id"], quantity=50, expiry_date="2099-01-01")
    await client.post(
        "/feed/movements",
        json={"product_id": product["id"], "movement_type": "adjustment", "quantity": -4},
        headers=_auth(token),
    )
    detail = (await client.get(f"/feed/products/{product['id']}", headers=_auth(token))).json()
    current = detail["monthly"][-1]
    assert current["units_adjusted"] == -4
    assert current["units_sold"] == 0
    assert current["units_written_off"] == 0


async def test_search_treats_like_wildcards_literally(client):
    """Regression: an unescaped `_`/`%` made the search box match more than it showed."""
    token = await _admin_token(client)
    await _product(client, token, sku="AB1", name="Alpha Bravo")
    await _product(client, token, sku="A-1", name="Underscore Target")

    # `_` is a LIKE single-character wildcard; escaped, it must match literally.
    assert (await client.get("/feed/products?q=A_1", headers=_auth(token))).json() == []
    # A lone `%` must not match everything.
    assert (await client.get("/feed/products?q=%25", headers=_auth(token))).json() == []
    assert len((await client.get("/feed/products?q=A-1", headers=_auth(token))).json()) == 1


async def test_malformed_date_filters_are_rejected(client):
    """Regression: the ledger compares ISO strings, so a malformed bound silently
    returned the wrong window instead of an error."""
    token = await _admin_token(client)
    for query in ("date_from=08/23/2026", "date_to=2026-13-99", "date_from=yesterday"):
        r = await client.get(f"/feed/movements?{query}", headers=_auth(token))
        assert r.status_code == 422, query


async def test_brand_is_bounded_to_the_column_width(client):
    """Regression: an unbounded field is a 500 on Postgres and invisible on SQLite."""
    token = await _admin_token(client)
    r = await client.post(
        "/feed/products",
        json={
            "sku": "BRAND-1",
            "name": "Long Brand",
            "species": "goat",
            "brand": "x" * 81,
            "unit_size": 25,
            "unit_cost": 1,
            "unit_price": 2,
            "shelf_life_days": 30,
        },
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_a_lot_cannot_be_driven_negative(client):
    """The CHECK constraints are the database-level backstop on the lot balance."""
    token = await _admin_token(client)
    product = await _product(client, token)
    batch = await _batch(client, token, product["id"], quantity=5, expiry_date="2099-01-01")
    # Two sales that individually fit but together exceed the lot.
    assert (
        await client.post(
            "/feed/movements",
            json={"product_id": product["id"], "movement_type": "sale", "quantity": 4},
            headers=_auth(token),
        )
    ).status_code == 201
    r = await client.post(
        "/feed/movements",
        json={
            "product_id": product["id"],
            "movement_type": "sale",
            "quantity": 4,
            "batch_id": batch["id"],
        },
        headers=_auth(token),
    )
    assert r.status_code == 409
    assert "Only 1 unit(s) available" in r.json()["detail"]
