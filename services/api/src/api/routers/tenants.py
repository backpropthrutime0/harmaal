"""Tenant endpoints — org-wide for staff; self-service for tenants."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData, get_current_user
from api.internal.scoping import tenant_records_for_user
from api.models.orm import Property, Tenant
from api.models.schemas import TenantCreate, TenantResponse

router = APIRouter(tags=["tenants"])

ManageTenants = Annotated[TokenData, Depends(RequirePermission("manage_tenants"))]


async def _get_tenant(tenant_id: int, session: AsyncSession) -> Tenant:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("/tenants/", response_model=list[TenantResponse])
async def list_tenants(
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Tenant]:
    return list((await session.execute(select(Tenant).order_by(Tenant.name))).scalars().all())


@router.post("/properties/{property_id}/tenants/", response_model=TenantResponse, status_code=201)
async def add_tenant(
    property_id: int,
    body: TenantCreate,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Tenant:
    prop = (await session.execute(select(Property).where(Property.id == property_id))).scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    tenant = Tenant(**body.model_dump(), property_id=property_id)
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@router.get("/properties/{property_id}/tenants/", response_model=list[TenantResponse])
async def list_property_tenants(
    property_id: int,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Tenant]:
    return list(
        (await session.execute(select(Tenant).where(Tenant.property_id == property_id))).scalars().all()
    )


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    body: TenantCreate,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Tenant:
    tenant = await _get_tenant(tenant_id, session)
    for key, value in body.model_dump().items():
        setattr(tenant, key, value)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: int,
    _: ManageTenants,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    tenant = await _get_tenant(tenant_id, session)
    await session.delete(tenant)
    await session.commit()
    return {"message": "Tenant lease terminated"}


@router.get("/tenants/me", response_model=TenantResponse)
async def my_lease(
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Tenant:
    if current.role != "tenant":
        raise HTTPException(status_code=403, detail="You do not have a tenant profile.")
    records = await tenant_records_for_user(current.user_id, current.email, session)
    if not records:
        raise HTTPException(status_code=404, detail="No active lease found. Contact management.")
    return records[0]
