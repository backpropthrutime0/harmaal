"""Role dashboards — aggregate KPIs for admin/owner, manager, and maintenance."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData
from api.models.orm import Payment, Property, Tenant, WorkOrder
from api.models.schemas import AdminDashboard, MaintenanceDashboard, ManagerDashboard, OverdueTenant

router = APIRouter(prefix="/dashboard", tags=["dashboards"])

# Business intelligence (admin-only by default; grantable per-role from /people).
ViewBusiness = Annotated[TokenData, Depends(RequirePermission("view_business"))]
ManageMaintenance = Annotated[TokenData, Depends(RequirePermission("manage_maintenance"))]
# The manager dashboard is day-to-day operations (rent due, overdue tenants, work
# orders), not business intelligence — it stays on manage_tenants so managers keep
# their landing page after view_business became admin-only.
ManageTenants = Annotated[TokenData, Depends(RequirePermission("manage_tenants"))]

_OPEN_WO = ("open", "assigned", "in_progress")


def _now() -> datetime:
    return datetime.now(UTC)


def _is_overdue(p: Payment, today: str) -> bool:
    return p.status != "paid" and bool(p.due_date) and p.due_date < today


@router.get("/admin", response_model=AdminDashboard)
async def admin_dashboard(
    _: ViewBusiness,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminDashboard:
    now = _now()
    month = now.strftime("%Y-%m")
    year = now.strftime("%Y")
    today = now.date().isoformat()

    properties = (await session.execute(select(Property))).scalars().all()
    tenants = (await session.execute(select(Tenant))).scalars().all()
    payments = (await session.execute(select(Payment))).scalars().all()
    work_orders = (await session.execute(select(WorkOrder))).scalars().all()

    total_units = sum(p.units for p in properties)
    occupied = len(tenants)
    billed = sum(p.amount for p in payments if p.period == month)
    collected = sum(p.amount for p in payments if p.period == month and p.status == "paid")
    outstanding = sum(p.amount for p in payments if p.status != "paid")
    overdue_count = sum(1 for p in payments if _is_overdue(p, today))
    open_wos = sum(1 for w in work_orders if w.status in _OPEN_WO)
    spend_ytd = sum(
        (w.cost or 0) for w in work_orders if w.cost and w.completed_at and w.completed_at.startswith(year)
    )

    return AdminDashboard(
        total_properties=len(properties),
        total_units=total_units,
        occupied_units=occupied,
        occupancy_rate=round(occupied / total_units * 100, 1) if total_units else 0.0,
        total_tenants=len(tenants),
        billed_this_month=round(billed, 2),
        collected_this_month=round(collected, 2),
        outstanding=round(outstanding, 2),
        overdue_count=overdue_count,
        open_work_orders=open_wos,
        maintenance_spend_ytd=round(spend_ytd, 2),
    )


@router.get("/manager", response_model=ManagerDashboard)
async def manager_dashboard(
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ManagerDashboard:
    now = _now()
    month = now.strftime("%Y-%m")
    today = now.date().isoformat()

    rows = (
        await session.execute(
            select(Payment, Tenant, Property)
            .join(Tenant, Payment.tenant_id == Tenant.id)
            .join(Property, Tenant.property_id == Property.id)
        )
    ).all()
    work_orders = (await session.execute(select(WorkOrder))).scalars().all()

    due_this_month = sum(p.amount for p, _t, _pr in rows if p.period == month)
    collected_this_month = sum(p.amount for p, _t, _pr in rows if p.period == month and p.status == "paid")

    by_tenant: dict[int, dict] = defaultdict(
        lambda: {"amount": 0.0, "months": 0, "tenant": None, "prop": None}
    )
    for p, t, pr in rows:
        if _is_overdue(p, today):
            agg = by_tenant[t.id]
            agg["amount"] += p.amount
            agg["months"] += 1
            agg["tenant"] = t
            agg["prop"] = pr

    overdue = [
        OverdueTenant(
            tenant_id=tid,
            name=agg["tenant"].name,
            unit_label=agg["tenant"].unit_label,
            property_address=agg["prop"].address if agg["prop"] else None,
            amount=round(agg["amount"], 2),
            months_overdue=agg["months"],
        )
        for tid, agg in by_tenant.items()
    ]
    overdue.sort(key=lambda o: o.amount, reverse=True)

    wo_by_status: dict[str, int] = defaultdict(int)
    for w in work_orders:
        wo_by_status[w.status] += 1

    return ManagerDashboard(
        due_this_month=round(due_this_month, 2),
        collected_this_month=round(collected_this_month, 2),
        overdue_total=round(sum(o.amount for o in overdue), 2),
        overdue=overdue,
        work_orders_by_status=dict(wo_by_status),
        open_work_orders=sum(1 for w in work_orders if w.status in _OPEN_WO),
    )


@router.get("/maintenance", response_model=MaintenanceDashboard)
async def maintenance_dashboard(
    current: ManageMaintenance,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MaintenanceDashboard:
    work_orders = (
        (await session.execute(select(WorkOrder).where(WorkOrder.assigned_to == current.user_id)))
        .scalars()
        .all()
    )
    by_status: dict[str, int] = defaultdict(int)
    for w in work_orders:
        by_status[w.status] += 1
    return MaintenanceDashboard(
        by_status=dict(by_status),
        open_count=by_status.get("open", 0) + by_status.get("assigned", 0),
        in_progress_count=by_status.get("in_progress", 0),
        completed_count=by_status.get("completed", 0),
    )
