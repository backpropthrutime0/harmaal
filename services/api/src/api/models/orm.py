"""SQLAlchemy ORM models.

The ``User`` table is the single, unified identity store (admins, owners, and
tenants all live here, distinguished by ``role`` plus fine-grained RBAC via
``roles``/``permissions``). It carries the auth/2FA/lockout columns ported from
avis_tools' ``admin_users``, trimmed to the Core scope (no email-2FA / reset /
expiry columns). Property/Tenant/Payment are the original harmaal business
entities, now async.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db import Base

# --- RBAC association tables ---
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, lazy="selectin")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    # Coarse role for routing/seeding: admin | owner | tenant
    role: Mapped[str] = mapped_column(String(20), default="tenant")
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    # Password policy
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    is_otp: Mapped[bool] = mapped_column(Boolean, default=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # TOTP 2FA (Core scope: secret stored plaintext; harden with pgcrypto later)
    totp_secret: Mapped[str | None] = mapped_column(String, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Brute-force lockout (DB-backed; no Redis in Core scope)
    login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    login_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    roles: Mapped[list[Role]] = relationship(secondary=user_roles, lazy="selectin")
    properties: Mapped[list[Property]] = relationship(back_populates="owner", cascade="all, delete-orphan")

    @property
    def permission_names(self) -> list[str]:
        seen: set[str] = set()
        for role in self.roles:
            for perm in role.permissions:
                seen.add(perm.name)
        return sorted(seen)


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    address: Mapped[str] = mapped_column(String, index=True)
    units: Mapped[int] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    owner: Mapped[User] = relationship(back_populates="properties")
    tenants: Mapped[list[Tenant]] = relationship(
        back_populates="property", cascade="all, delete-orphan", lazy="selectin"
    )


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    email: Mapped[str] = mapped_column(String)
    rent_amount: Mapped[float] = mapped_column(Float)
    lease_start_date: Mapped[str] = mapped_column(String)
    lease_end_date: Mapped[str] = mapped_column(String)
    unit_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"))
    # Links the tenant record to its portal login (nullable until claimed).
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    property: Mapped[Property] = relationship(back_populates="tenants")
    payments: Mapped[list[Payment]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan", lazy="selectin"
    )


class Payment(Base):
    """A monthly rent ledger entry — one row per tenant per period.

    Starts ``pending`` (the bill); a manager marks it ``paid`` (the receipt).
    ``overdue`` is derived in queries when ``due_date`` has passed while pending.
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    amount: Mapped[float] = mapped_column(Float)
    period: Mapped[str] = mapped_column(String(7), default="")  # YYYY-MM
    due_date: Mapped[str] = mapped_column(String, default="")  # YYYY-MM-DD
    paid_date: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending|paid
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Cash-drawer tracking: a paid cash charge sits "on hand" until a manager
    # checks it off as deposited to the bank.
    deposited: Mapped[bool] = mapped_column(Boolean, default=False)
    deposited_date: Mapped[str | None] = mapped_column(String, nullable=True)  # YYYY-MM-DD
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))

    tenant: Mapped[Tenant] = relationship(back_populates="payments")


class Expense(Base):
    """A property operating expense logged by management.

    ``paid_in_cash`` marks expenses drawn from collected cash (they reduce
    cash-on-hand). Non-cash expenses (bank/card) are recorded for the books but
    don't touch the cash drawer. Maintenance work-order costs are tracked
    separately on ``WorkOrder.cost`` and folded into cash-spent reporting.
    """

    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(30), default="general")
    period: Mapped[str] = mapped_column(String(7), default="", index=True)  # YYYY-MM
    spent_date: Mapped[str] = mapped_column(String, default="")  # YYYY-MM-DD
    paid_in_cash: Mapped[bool] = mapped_column(Boolean, default=True)
    property_id: Mapped[int | None] = mapped_column(ForeignKey("properties.id"), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    property: Mapped[Property | None] = relationship(lazy="selectin")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"))
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    unit_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String(20))  # plumbing|electrical|hvac|appliance|structural|general
    priority: Mapped[str] = mapped_column(String(10), default="medium")  # low|medium|high|emergency
    status: Mapped[str] = mapped_column(
        String(15), default="open"
    )  # open|assigned|in_progress|completed|cancelled
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Whether the repair was settled from the cash drawer (only cash-paid costs
    # reduce cash-on-hand in the finance rollup). Defaults True to match the
    # pre-existing behaviour where every work-order cost counted as cash.
    paid_in_cash: Mapped[bool] = mapped_column(Boolean, default=True)
    scheduled_for: Mapped[str | None] = mapped_column(String, nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    property: Mapped[Property] = relationship()
    messages: Mapped[list[WorkOrderMessage]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan", lazy="selectin"
    )


class WorkOrderMessage(Base):
    __tablename__ = "work_order_messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"))
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    author_name: Mapped[str] = mapped_column(String(120), default="")
    author_role: Mapped[str] = mapped_column(String(20), default="")
    body: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    work_order: Mapped[WorkOrder] = relationship(back_populates="messages")
