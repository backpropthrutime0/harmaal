"""Work-order endpoints with a shared communication thread.

Access model:
- admin / manager (manage_maintenance + staff role): see and act on all work orders.
- maintenance: see and update work orders assigned to them.
- tenant: see and message work orders for their own tenancy, and create new ones.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData, get_current_user
from api.internal.scoping import tenant_ids_for_user
from api.models.orm import Property, Tenant, User, WorkOrder, WorkOrderMessage
from api.models.schemas import (
    StaffOut,
    WorkOrderCreate,
    WorkOrderMessageCreate,
    WorkOrderMessageOut,
    WorkOrderResponse,
    WorkOrderUpdate,
)

router = APIRouter(prefix="/work-orders", tags=["work-orders"])

_CATEGORIES = {"plumbing", "electrical", "hvac", "appliance", "structural", "general"}
_PRIORITIES = {"low", "medium", "high", "emergency"}
_STATUSES = {"open", "assigned", "in_progress", "completed", "cancelled"}


def _is_staff(current: TokenData) -> bool:
    return current.role in {"admin", "manager"}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def _enrich(work_orders: list[WorkOrder], session: AsyncSession) -> list[WorkOrderResponse]:
    prop_ids = {w.property_id for w in work_orders}
    tenant_ids = {w.tenant_id for w in work_orders if w.tenant_id}
    user_ids = {w.assigned_to for w in work_orders if w.assigned_to}
    props = (
        {
            p.id: p
            for p in (await session.execute(select(Property).where(Property.id.in_(prop_ids)))).scalars()
        }
        if prop_ids
        else {}
    )
    tenants = (
        {t.id: t for t in (await session.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars()}
        if tenant_ids
        else {}
    )
    users = (
        {u.id: u for u in (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars()}
        if user_ids
        else {}
    )
    out: list[WorkOrderResponse] = []
    for w in work_orders:
        prop = props.get(w.property_id)
        tenant = tenants.get(w.tenant_id) if w.tenant_id else None
        assignee = users.get(w.assigned_to) if w.assigned_to else None
        out.append(
            WorkOrderResponse(
                id=w.id,
                property_id=w.property_id,
                property_address=prop.address if prop else None,
                tenant_id=w.tenant_id,
                tenant_name=tenant.name if tenant else None,
                unit_label=w.unit_label,
                title=w.title,
                description=w.description,
                category=w.category,
                priority=w.priority,
                status=w.status,
                assigned_to=w.assigned_to,
                assignee_name=(assignee.display_name or assignee.email) if assignee else None,
                created_by=w.created_by,
                cost=w.cost,
                scheduled_for=w.scheduled_for,
                completed_at=w.completed_at,
                created_at=w.created_at,
                messages=[
                    WorkOrderMessageOut.model_validate(m) for m in sorted(w.messages, key=lambda m: m.id)
                ],
            )
        )
    return out


async def _load(work_order_id: int, session: AsyncSession) -> WorkOrder:
    wo = (await session.execute(select(WorkOrder).where(WorkOrder.id == work_order_id))).scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


async def _assert_access(wo: WorkOrder, current: TokenData, session: AsyncSession) -> None:
    if _is_staff(current):
        return
    if current.role == "maintenance" and wo.assigned_to == current.user_id:
        return
    if current.role == "tenant":
        ids = await tenant_ids_for_user(current.user_id, current.email, session)
        if wo.tenant_id in ids:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this work order")


@router.get("/staff/maintenance", response_model=list[StaffOut])
async def maintenance_staff(
    _: Annotated[TokenData, Depends(RequirePermission("manage_maintenance"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[StaffOut]:
    """Maintenance users for assignment dropdowns (manager-accessible, unlike /auth/users)."""
    users = (
        await session.execute(select(User).where(User.role == "maintenance").order_by(User.display_name))
    ).scalars().all()
    return [StaffOut(id=u.id, name=u.display_name or u.email, email=u.email) for u in users]


@router.get("", response_model=list[WorkOrderResponse])
async def list_work_orders(
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status_filter: str | None = None,
) -> list[WorkOrderResponse]:
    stmt = select(WorkOrder).order_by(WorkOrder.created_at.desc())
    if _is_staff(current):
        pass
    elif current.role == "maintenance":
        stmt = stmt.where(WorkOrder.assigned_to == current.user_id)
    elif current.role == "tenant":
        ids = await tenant_ids_for_user(current.user_id, current.email, session)
        if not ids:
            return []
        stmt = stmt.where(WorkOrder.tenant_id.in_(ids))
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    if status_filter:
        stmt = stmt.where(WorkOrder.status == status_filter)
    work_orders = list((await session.execute(stmt)).scalars().all())
    return await _enrich(work_orders, session)


@router.post("", response_model=WorkOrderResponse, status_code=201)
async def create_work_order(
    body: WorkOrderCreate,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> WorkOrderResponse:
    if body.category not in _CATEGORIES:
        raise HTTPException(status_code=422, detail=f"category must be one of {sorted(_CATEGORIES)}")
    if body.priority not in _PRIORITIES:
        raise HTTPException(status_code=422, detail=f"priority must be one of {sorted(_PRIORITIES)}")

    tenant_id = body.tenant_id
    property_id = body.property_id
    unit_label = body.unit_label

    if current.role == "tenant":
        ids = await tenant_ids_for_user(current.user_id, current.email, session)
        if not ids:
            raise HTTPException(status_code=403, detail="No tenancy on file")
        # Tenants can only file against their own tenancy; derive property/unit.
        tenant = (await session.execute(select(Tenant).where(Tenant.id == ids[0]))).scalar_one()
        tenant_id = tenant.id
        property_id = tenant.property_id
        unit_label = tenant.unit_label
    elif not (_is_staff(current) and current.has_permission("manage_maintenance")):
        raise HTTPException(status_code=403, detail="Not authorized to create work orders")

    wo = WorkOrder(
        property_id=property_id,
        tenant_id=tenant_id,
        unit_label=unit_label,
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        status="open",
        created_by=current.user_id,
    )
    session.add(wo)
    await session.commit()
    await session.refresh(wo)
    return (await _enrich([wo], session))[0]


@router.get("/{work_order_id}", response_model=WorkOrderResponse)
async def get_work_order(
    work_order_id: int,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> WorkOrderResponse:
    wo = await _load(work_order_id, session)
    await _assert_access(wo, current, session)
    return (await _enrich([wo], session))[0]


@router.patch("/{work_order_id}", response_model=WorkOrderResponse)
async def update_work_order(
    work_order_id: int,
    body: WorkOrderUpdate,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> WorkOrderResponse:
    # Only staff and assigned maintenance can mutate.
    if not (_is_staff(current) or current.role == "maintenance"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if not current.has_permission("manage_maintenance"):
        raise HTTPException(status_code=403, detail="manage_maintenance required")
    wo = await _load(work_order_id, session)
    if current.role == "maintenance" and wo.assigned_to != current.user_id:
        raise HTTPException(status_code=403, detail="Not your work order")

    if body.status is not None:
        if body.status not in _STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {sorted(_STATUSES)}")
        wo.status = body.status
        if body.status == "completed" and not wo.completed_at:
            wo.completed_at = _now_iso()
    if body.assigned_to is not None:
        wo.assigned_to = body.assigned_to
        if wo.status == "open":
            wo.status = "assigned"
    if body.priority is not None:
        if body.priority not in _PRIORITIES:
            raise HTTPException(status_code=422, detail=f"priority must be one of {sorted(_PRIORITIES)}")
        wo.priority = body.priority
    if body.cost is not None:
        wo.cost = body.cost
    if body.scheduled_for is not None:
        wo.scheduled_for = body.scheduled_for

    await session.commit()
    await session.refresh(wo)
    return (await _enrich([wo], session))[0]


@router.get("/{work_order_id}/messages", response_model=list[WorkOrderMessageOut])
async def list_messages(
    work_order_id: int,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[WorkOrderMessage]:
    wo = await _load(work_order_id, session)
    await _assert_access(wo, current, session)
    return sorted(wo.messages, key=lambda m: m.id)


@router.post("/{work_order_id}/messages", response_model=WorkOrderMessageOut, status_code=201)
async def add_message(
    work_order_id: int,
    body: WorkOrderMessageCreate,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> WorkOrderMessage:
    wo = await _load(work_order_id, session)
    await _assert_access(wo, current, session)
    author = (await session.execute(select(User).where(User.id == current.user_id))).scalar_one_or_none()
    msg = WorkOrderMessage(
        work_order_id=wo.id,
        author_id=current.user_id,
        author_name=(author.display_name or author.email) if author else current.email,
        author_role=current.role,
        body=body.body,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg
