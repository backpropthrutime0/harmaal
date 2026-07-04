"""Tenant invoice / receipt PDF endpoints.

Staff (``manage_tenants``) can generate an invoice for any charge to send to a
tenant; a tenant can download the invoice/receipt for their own charges.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData, get_current_user
from api.internal.invoices import InvoiceKind, build_invoice_pdf, invoice_filename, resolve_kind
from api.internal.scoping import tenant_ids_for_user
from api.models.orm import Payment, Property, Tenant

router = APIRouter(tags=["invoices"])

ManageTenants = Annotated[TokenData, Depends(RequirePermission("manage_tenants"))]


async def _load(charge_id: int, session: AsyncSession) -> tuple[Payment, Tenant, Property | None]:
    payment = (await session.execute(select(Payment).where(Payment.id == charge_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Charge not found")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == payment.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    prop = (
        await session.execute(select(Property).where(Property.id == tenant.property_id))
    ).scalar_one_or_none()
    return payment, tenant, prop


def _pdf_response(payment: Payment, tenant: Tenant, prop: Property | None, kind: InvoiceKind) -> Response:
    today = datetime.now(UTC).date().isoformat()
    resolved = resolve_kind(payment, kind, today)
    pdf = build_invoice_pdf(payment=payment, tenant=tenant, prop=prop, kind=kind)
    filename = invoice_filename(payment, resolved)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/charges/{charge_id}/invoice.pdf")
async def staff_invoice(
    charge_id: int,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
    kind: InvoiceKind = "auto",
) -> Response:
    payment, tenant, prop = await _load(charge_id, session)
    return _pdf_response(payment, tenant, prop, kind)


@router.get("/tenants/me/charges/{charge_id}/invoice.pdf")
async def my_invoice(
    charge_id: int,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    kind: InvoiceKind = "auto",
) -> Response:
    if current.role != "tenant":
        raise HTTPException(status_code=403, detail="Tenant access only.")
    payment, tenant, prop = await _load(charge_id, session)
    ids = await tenant_ids_for_user(current.user_id, current.email, session)
    if payment.tenant_id not in ids:
        # Same 404 as a missing charge so tenants can't enumerate valid IDs.
        raise HTTPException(status_code=404, detail="Charge not found")
    return _pdf_response(payment, tenant, prop, kind)
