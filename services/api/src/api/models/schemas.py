"""Pydantic v2 request/response schemas.

All request models set ``extra="forbid"`` so unexpected fields are rejected at
the boundary (ported convention from avis_tools). Response models use
``from_attributes=True`` to read straight off ORM objects.
"""

from __future__ import annotations

import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.internal import feed_inventory
from api.internal.password_validation import validate_password_strength

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str
    role: str = "tenant"
    display_name: str | None = None
    phone: str | None = None

    @field_validator("display_name", "phone")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        # Self-registration cannot create admins.
        if v not in {"tenant", "owner"}:
            raise ValueError("Role must be 'tenant' or 'owner'")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class VerifyMFARequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mfa_token: str
    code: str


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class ConfirmTotpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str


class DisableTotpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str


class SetupTotpResponse(BaseModel):
    secret: str
    qr_uri: str


class CreateUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    role: str = "owner"
    display_name: str | None = None
    phone: str | None = None

    @field_validator("display_name", "phone")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        allowed = {"admin", "manager", "maintenance", "owner", "tenant"}
        if v not in allowed:
            raise ValueError(f"Role must be one of {sorted(allowed)}")
        return v


class AdminResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None


class PermissionOut(BaseModel):
    """A fine-grained authorization that can be granted to a role."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None


class RoleDetail(BaseModel):
    """A role plus the permissions currently granted to it (admin RBAC screen)."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    is_system: bool = False
    permissions: list[str] = []
    user_count: int = 0


class UpdateRolePermissionsRequest(BaseModel):
    """Full replacement of a role's permission set — omitted names are revoked."""

    model_config = ConfigDict(extra="forbid")
    permissions: list[str]


class UpdateUserRolesRequest(BaseModel):
    """Full replacement of the roles assigned to a user."""

    model_config = ConfigDict(extra="forbid")
    roles: list[str]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    display_name: str | None = None
    phone: str | None = None
    is_active: bool
    is_system: bool
    totp_enabled: bool
    must_change_password: bool
    is_otp: bool
    created_at: datetime
    last_login_at: datetime | None = None
    roles: list[RoleOut] = []
    permissions: list[str] = []


class LoginResponse(BaseModel):
    status: str = "ok"  # "ok" | "mfa_required"
    access_token: str | None = None
    mfa_token: str | None = None
    token_type: str = "bearer"
    user: UserResponse | None = None
    must_change_password: bool = False


class CreateUserResponse(BaseModel):
    user: UserResponse
    generated_otp: str


# ---------------------------------------------------------------------------
# Business entities (ported from harmaal, Pydantic v2)
# ---------------------------------------------------------------------------


# --- Rent ledger ---


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    amount: float
    period: str
    due_date: str
    paid_date: str | None = None
    status: str
    method: str | None = None
    deposited: bool = False
    deposited_date: str | None = None
    tenant_id: int


class RecordPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: str | None = "cash"
    paid_date: str | None = None  # defaults to today on the server


class DepositRequest(BaseModel):
    """Toggle a paid cash charge between 'on hand' and 'deposited'."""

    model_config = ConfigDict(extra="forbid")
    deposited: bool
    deposited_date: str | None = None  # defaults to today when marking deposited


class ChargeRow(BaseModel):
    """A rent-roll row enriched with tenant/property context for staff views."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    tenant_name: str
    unit_label: str | None = None
    property_id: int | None = None
    property_address: str | None = None
    amount: float
    period: str
    due_date: str
    paid_date: str | None = None
    status: str  # pending | paid | overdue (derived)
    method: str | None = None
    deposited: bool = False
    deposited_date: str | None = None


# --- Expenses & cash reporting ---


class ExpenseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0)
    category: str = "general"
    period: str = Field(pattern=r"^\d{4}-\d{2}$")  # YYYY-MM
    spent_date: str | None = None  # defaults to today
    paid_in_cash: bool = True
    property_id: int | None = None


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    description: str
    amount: float
    category: str
    period: str
    spent_date: str
    paid_in_cash: bool
    property_id: int | None = None
    property_address: str | None = None


class MonthlyFinancials(BaseModel):
    """One month's rent + cash-drawer rollup for the manager view."""

    period: str  # YYYY-MM
    # Rent ledger
    due: float
    collected: float
    outstanding: float
    # Cash drawer (a three-way split of cash actually collected this period)
    cash_collected: float
    cash_deposited: float
    cash_spent_on_expenses: float
    cash_on_hand: float
    # Counts for context
    charge_count: int
    paid_count: int
    undeposited_count: int  # paid cash charges not yet checked off as deposited


# --- Tenants & properties ---


class TenantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    email: str
    phone: str | None = None
    rent_amount: float
    lease_start_date: str
    lease_end_date: str
    unit_label: str | None = None

    @field_validator("phone", "unit_label")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None


class TenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    phone: str | None = None
    rent_amount: float
    lease_start_date: str
    lease_end_date: str
    unit_label: str | None = None
    property_id: int
    user_id: int | None = None
    payments: list[PaymentResponse] = []


class PropertyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    address: str
    units: int
    description: str | None = None


class PropertyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    address: str
    units: int
    description: str | None = None
    owner_id: int
    tenants: list[TenantResponse] = []


# --- Work orders ---


class WorkOrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    property_id: int
    tenant_id: int | None = None
    unit_label: str | None = None
    title: str
    description: str
    category: str
    priority: str = "medium"


class WorkOrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str | None = None
    assigned_to: int | None = None
    priority: str | None = None
    cost: float | None = None
    paid_in_cash: bool | None = None
    scheduled_for: str | None = None


class StaffOut(BaseModel):
    id: int
    name: str
    email: str


class WorkOrderMessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: str


class WorkOrderMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    author_id: int | None = None
    author_name: str
    author_role: str
    body: str
    created_at: datetime


class WorkOrderResponse(BaseModel):
    id: int
    property_id: int
    property_address: str | None = None
    tenant_id: int | None = None
    tenant_name: str | None = None
    unit_label: str | None = None
    title: str
    description: str
    category: str
    priority: str
    status: str
    assigned_to: int | None = None
    assignee_name: str | None = None
    created_by: int | None = None
    cost: float | None = None
    paid_in_cash: bool = True
    scheduled_for: str | None = None
    completed_at: str | None = None
    created_at: datetime
    messages: list[WorkOrderMessageOut] = []


# --- Dashboards ---


class AdminDashboard(BaseModel):
    total_properties: int
    total_units: int
    occupied_units: int
    occupancy_rate: float
    total_tenants: int
    billed_this_month: float
    collected_this_month: float
    outstanding: float
    overdue_count: int
    open_work_orders: int
    maintenance_spend_ytd: float


class OverdueTenant(BaseModel):
    tenant_id: int
    name: str
    unit_label: str | None = None
    property_address: str | None = None
    amount: float
    months_overdue: int


class ManagerDashboard(BaseModel):
    due_this_month: float
    collected_this_month: float
    overdue_total: float
    overdue: list[OverdueTenant] = []
    work_orders_by_status: dict[str, int] = {}
    open_work_orders: int


class MaintenanceDashboard(BaseModel):
    by_status: dict[str, int] = {}
    open_count: int
    in_progress_count: int
    completed_count: int


class DetailResponse(BaseModel):
    detail: str


# ---------------------------------------------------------------------------
# Hormaal Animal Feed — inventory
# ---------------------------------------------------------------------------
# Every request model validates against the vocabularies in
# `internal.feed_inventory` so the catalogue can't drift from the domain logic.


def _one_of(value: str, allowed: tuple[str, ...], field: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(f"{field} must be one of: {', '.join(allowed)}")
    return normalized


def _iso_date(value: str | None) -> str | None:
    """Accept a blank/absent date, else require a real ``YYYY-MM-DD``."""
    if value is None or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError as exc:
        raise ValueError("Date must be in YYYY-MM-DD format") from exc


class FeedProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    species: str
    feed_type: str = "pellet"
    # Bounded to the column width: SQLite (tests) ignores VARCHAR lengths, so an
    # unbounded field here would only fail in production, as a 500 rather than a 422.
    brand: str | None = Field(default=None, max_length=80)
    unit_size: float = Field(gt=0, le=100_000)
    unit_of_measure: str = "kg"
    package_type: str = "bag"
    unit_cost: float = Field(ge=0, le=1_000_000)
    unit_price: float = Field(ge=0, le=1_000_000)
    shelf_life_days: int = Field(gt=0, le=3650)
    reorder_level: int = Field(default=0, ge=0, le=1_000_000)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("sku")
    @classmethod
    def sku_format(cls, v: str) -> str:
        # Uppercased and restricted so a SKU stays safe to print on a label and
        # to paste into a URL/CSV without quoting.
        normalized = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9._-]*", normalized):
            raise ValueError("SKU may only contain letters, digits, dot, dash and underscore")
        return normalized

    @field_validator("brand", "notes")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("species")
    @classmethod
    def species_valid(cls, v: str) -> str:
        return _one_of(v, feed_inventory.SPECIES, "species")

    @field_validator("feed_type")
    @classmethod
    def feed_type_valid(cls, v: str) -> str:
        return _one_of(v, feed_inventory.FEED_TYPES, "feed_type")

    @field_validator("unit_of_measure")
    @classmethod
    def uom_valid(cls, v: str) -> str:
        return _one_of(v, feed_inventory.UNITS_OF_MEASURE, "unit_of_measure")

    @field_validator("package_type")
    @classmethod
    def package_valid(cls, v: str) -> str:
        return _one_of(v, feed_inventory.PACKAGE_TYPES, "package_type")


class FeedProductUpdate(BaseModel):
    """Partial update. Every field optional; ``sku`` is immutable once issued."""

    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=2, max_length=120)
    species: str | None = None
    feed_type: str | None = None
    brand: str | None = Field(default=None, max_length=80)
    unit_size: float | None = Field(default=None, gt=0, le=100_000)
    unit_of_measure: str | None = None
    package_type: str | None = None
    unit_cost: float | None = Field(default=None, ge=0, le=1_000_000)
    unit_price: float | None = Field(default=None, ge=0, le=1_000_000)
    shelf_life_days: int | None = Field(default=None, gt=0, le=3650)
    reorder_level: int | None = Field(default=None, ge=0, le=1_000_000)
    notes: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None

    @field_validator("species")
    @classmethod
    def species_valid(cls, v: str | None) -> str | None:
        return _one_of(v, feed_inventory.SPECIES, "species") if v is not None else None

    @field_validator("feed_type")
    @classmethod
    def feed_type_valid(cls, v: str | None) -> str | None:
        return _one_of(v, feed_inventory.FEED_TYPES, "feed_type") if v is not None else None

    @field_validator("unit_of_measure")
    @classmethod
    def uom_valid(cls, v: str | None) -> str | None:
        return _one_of(v, feed_inventory.UNITS_OF_MEASURE, "unit_of_measure") if v is not None else None

    @field_validator("package_type")
    @classmethod
    def package_valid(cls, v: str | None) -> str | None:
        return _one_of(v, feed_inventory.PACKAGE_TYPES, "package_type") if v is not None else None


class FeedProductResponse(BaseModel):
    """Catalogue row enriched with live stock figures derived from its lots."""

    id: int
    sku: str
    name: str
    species: str
    feed_type: str
    brand: str | None = None
    unit_size: float
    unit_of_measure: str
    package_type: str
    unit_label: str  # "50 kg bag"
    unit_cost: float
    unit_price: float
    shelf_life_days: int
    reorder_level: int
    is_active: bool
    notes: str | None = None
    # --- derived ---
    on_hand: int  # every unit physically on the shelf, expired included
    # What could actually be sold today (on_hand minus expired lots). This — not
    # on_hand — drives `stock_status`: a pallet of expired feed is not cover.
    sellable_units: int
    stock_status: str  # healthy | low | out_of_stock
    stock_value_cost: float
    stock_value_retail: float
    margin_per_unit: float
    margin_pct: float
    batch_count: int
    nearest_expiry: str | None = None
    days_to_nearest_expiry: int | None = None
    expiring_units: int  # units within the warning window
    expired_units: int


class FeedBatchCreate(BaseModel):
    """Receive a lot into stock. Also books the matching ``receipt`` movement."""

    model_config = ConfigDict(extra="forbid")
    product_id: int
    batch_code: str = Field(min_length=1, max_length=40)
    quantity: int = Field(gt=0, le=1_000_000)
    unit_cost: float = Field(ge=0, le=1_000_000)
    received_date: str | None = None
    manufactured_date: str | None = None
    # Omit to derive from the product's shelf life (manufactured date preferred).
    expiry_date: str | None = None
    supplier: str | None = Field(default=None, max_length=120)
    reference: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("batch_code")
    @classmethod
    def strip_code(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("received_date", "manufactured_date", "expiry_date")
    @classmethod
    def dates_valid(cls, v: str | None) -> str | None:
        return _iso_date(v)

    @field_validator("supplier", "reference", "notes")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None


class FeedBatchResponse(BaseModel):
    id: int
    product_id: int
    product_sku: str | None = None
    product_name: str | None = None
    batch_code: str
    quantity_received: int
    quantity_remaining: int
    unit_cost: float
    value_at_cost: float
    received_date: str
    manufactured_date: str | None = None
    expiry_date: str | None = None
    days_to_expiry: int | None = None
    expiry_status: str  # fresh | expiring_soon | expired
    supplier: str | None = None
    reference: str | None = None
    notes: str | None = None


class FeedMovementCreate(BaseModel):
    """Book a stock movement.

    ``quantity`` is a positive magnitude for every type except ``adjustment``,
    where the sign carries the direction of a stock-count correction. Outbound
    movements allocate across lots FEFO unless ``batch_id`` pins a specific lot.
    """

    model_config = ConfigDict(extra="forbid")
    product_id: int
    movement_type: str
    quantity: int
    batch_id: int | None = None
    unit_price: float | None = Field(default=None, ge=0, le=1_000_000)
    reference: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=200)
    occurred_on: str | None = None

    @field_validator("movement_type")
    @classmethod
    def type_valid(cls, v: str) -> str:
        return _one_of(v, feed_inventory.MOVEMENT_TYPES, "movement_type")

    @field_validator("quantity")
    @classmethod
    def quantity_sane(cls, v: int) -> int:
        if v == 0:
            raise ValueError("Quantity must not be zero")
        if abs(v) > 1_000_000:
            raise ValueError("Quantity is out of range")
        return v

    @field_validator("occurred_on")
    @classmethod
    def date_valid(cls, v: str | None) -> str | None:
        return _iso_date(v)

    @field_validator("reference", "note")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None

    @model_validator(mode="after")
    def receipts_use_batches(self) -> FeedMovementCreate:
        # A receipt creates a lot (cost, expiry, supplier), which this endpoint
        # cannot express — POST /feed/batches is the only way stock arrives.
        if self.movement_type == "receipt":
            raise ValueError("Use POST /feed/batches to receive stock")
        return self


class FeedMovementResponse(BaseModel):
    id: int
    product_id: int
    product_sku: str | None = None
    product_name: str | None = None
    batch_id: int | None = None
    batch_code: str | None = None
    movement_type: str
    quantity: int  # signed
    unit_cost: float | None = None
    unit_price: float | None = None
    line_cost: float  # abs(quantity) * unit_cost
    line_revenue: float  # abs(quantity) * unit_price (sales only)
    reference: str | None = None
    note: str | None = None
    occurred_on: str
    created_at: datetime


class FeedMovementResult(BaseModel):
    """A movement request may fan out across several lots under FEFO."""

    movements: list[FeedMovementResponse]
    total_quantity: int  # signed total actually booked
    on_hand: int  # product stock after the movement


class FeedProductPeriod(BaseModel):
    """One month of activity for a product (or for the whole catalogue)."""

    period: str  # YYYY-MM
    units_in: int
    units_sold: int
    units_written_off: int
    # Signed net of stock-count corrections. Tracked apart from sold/written-off
    # so the series reconciles to the change in stock on hand.
    units_adjusted: int = 0
    revenue: float
    cogs: float
    margin: float


class FeedProductDetail(BaseModel):
    """Everything the product drill-down needs, in one round trip."""

    product: FeedProductResponse
    batches: list[FeedBatchResponse] = []
    movements: list[FeedMovementResponse] = []
    monthly: list[FeedProductPeriod] = []
    expiry_buckets: dict[str, dict[str, float]] = {}
    units_sold_90d: int
    revenue_90d: float
    cogs_90d: float
    margin_90d: float
    sell_through_pct: float
    days_of_cover: float | None = None


class FeedNamedTotal(BaseModel):
    """A labelled slice of a breakdown (species, status, product, …)."""

    name: str
    units: int
    value: float
    # Set only where the slice *is* a product (top sellers), so the dashboard can
    # drill into its ledger without parsing an id back out of the display label.
    product_id: int | None = None


class FeedAlert(BaseModel):
    """A product or lot needing attention, ranked most-urgent first."""

    product_id: int
    sku: str
    name: str
    species: str
    batch_id: int | None = None
    batch_code: str | None = None
    units: int
    value: float
    expiry_date: str | None = None
    days_to_expiry: int | None = None
    reorder_level: int | None = None


class FeedDashboard(BaseModel):
    """Inventory command centre — the feed admin's landing page."""

    # Catalogue & stock
    total_products: int
    active_products: int
    total_units: int
    stock_value_cost: float
    stock_value_retail: float
    potential_margin: float
    potential_margin_pct: float
    # Health counts
    low_stock_count: int
    out_of_stock_count: int
    expiring_soon_count: int  # products with stock inside the warning window
    expired_count: int
    expiring_units: int
    expiring_value: float
    expired_units: int
    expired_value: float
    expiring_value_pct: float  # share of stock value expiring soon
    expired_value_pct: float
    # This month
    period: str
    units_sold_mtd: int
    revenue_mtd: float
    cogs_mtd: float
    margin_mtd: float
    write_off_value_mtd: float
    # Breakdowns & series
    by_species: list[FeedNamedTotal] = []
    by_stock_status: list[FeedNamedTotal] = []
    expiry_buckets: dict[str, dict[str, float]] = {}
    monthly: list[FeedProductPeriod] = []
    top_sellers: list[FeedNamedTotal] = []
    low_stock: list[FeedAlert] = []
    expiring: list[FeedAlert] = []
    expired: list[FeedAlert] = []
