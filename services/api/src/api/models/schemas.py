"""Pydantic v2 request/response schemas.

All request models set ``extra="forbid"`` so unexpected fields are rejected at
the boundary (ported convention from avis_tools). Response models use
``from_attributes=True`` to read straight off ORM objects.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

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


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    display_name: str | None = None
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
    tenant_id: int


class RecordPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: str | None = "cash"
    paid_date: str | None = None  # defaults to today on the server


class ChargeRow(BaseModel):
    """A rent-roll row enriched with tenant/property context for staff views."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    tenant_name: str
    unit_label: str | None = None
    property_address: str | None = None
    amount: float
    period: str
    due_date: str
    paid_date: str | None = None
    status: str  # pending | paid | overdue (derived)
    method: str | None = None


# --- Tenants & properties ---


class TenantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    email: str
    rent_amount: float
    lease_start_date: str
    lease_end_date: str
    unit_label: str | None = None


class TenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
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
