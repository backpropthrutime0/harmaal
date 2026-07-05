"""Rent ledger endpoints — rent roll, overdue, recording payments, tenant ledger."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData, get_current_user
from api.internal.scoping import tenant_ids_for_user
from api.models.orm import Payment, Property, Tenant
from api.models.schemas import ChargeRow, DepositRequest, PaymentResponse, RecordPaymentRequest

router = APIRouter(tags=["rent"])

ManageTenants = Annotated[TokenData, Depends(RequirePermission("manage_tenants"))]


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


def _derive_status(payment: Payment, today: str) -> str:
    if payment.status == "paid":
        return "paid"
    if payment.due_date and payment.due_date < today:
        return "overdue"
    return "pending"


@router.get("/rent/charges", response_model=list[ChargeRow])
async def rent_roll(
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    period: str | None = None,
) -> list[ChargeRow]:
    today = _today()
    rows = (
        await session.execute(
            select(Payment, Tenant, Property)
            .join(Tenant, Payment.tenant_id == Tenant.id)
            .join(Property, Tenant.property_id == Property.id)
            .order_by(Payment.due_date.desc())
        )
    ).all()
    charges: list[ChargeRow] = []
    for payment, tenant, prop in rows:
        derived = _derive_status(payment, today)
        if status and derived != status:
            continue
        if period and payment.period != period:
            continue
        charges.append(
            ChargeRow(
                id=payment.id,
                tenant_id=tenant.id,
                tenant_name=tenant.name,
                unit_label=tenant.unit_label,
                property_id=prop.id,
                property_address=prop.address,
                amount=payment.amount,
                period=payment.period,
                due_date=payment.due_date,
                paid_date=payment.paid_date,
                status=derived,
                method=payment.method,
                deposited=payment.deposited,
                deposited_date=payment.deposited_date,
            )
        )
    return charges


@router.get("/rent/overdue", response_model=list[ChargeRow])
async def overdue_charges(
    current: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ChargeRow]:
    return [c for c in await rent_roll(current, session) if c.status == "overdue"]


@router.post("/charges/{charge_id}/pay", response_model=PaymentResponse)
async def record_payment(
    charge_id: int,
    body: RecordPaymentRequest,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Payment:
    payment = (await session.execute(select(Payment).where(Payment.id == charge_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Charge not found")
    if payment.status == "paid":
        raise HTTPException(status_code=409, detail="Charge already paid")
    payment.status = "paid"
    payment.paid_date = body.paid_date or _today()
    payment.method = body.method or "cash"
    await session.commit()
    await session.refresh(payment)
    return payment


@router.patch("/charges/{charge_id}/deposit", response_model=PaymentResponse)
async def set_deposited(
    charge_id: int,
    body: DepositRequest,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Payment:
    """Check a paid cash charge off as deposited (or undo it)."""
    payment = (await session.execute(select(Payment).where(Payment.id == charge_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Charge not found")
    if payment.status != "paid":
        raise HTTPException(status_code=409, detail="Only paid charges can be deposited")
    payment.deposited = body.deposited
    payment.deposited_date = (body.deposited_date or _today()) if body.deposited else None
    await session.commit()
    await session.refresh(payment)
    return payment


@router.get("/tenants/me/charges", response_model=list[PaymentResponse])
async def my_charges(
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Payment]:
    if current.role != "tenant":
        raise HTTPException(status_code=403, detail="Tenant access only.")
    ids = await tenant_ids_for_user(current.user_id, current.email, session)
    if not ids:
        return []
    today = _today()
    payments = (
        (
            await session.execute(
                select(Payment).where(Payment.tenant_id.in_(ids)).order_by(Payment.due_date.desc())
            )
        )
        .scalars()
        .all()
    )
    # reflect derived overdue status to the tenant
    for p in payments:
        p.status = _derive_status(p, today)
    return list(payments)
