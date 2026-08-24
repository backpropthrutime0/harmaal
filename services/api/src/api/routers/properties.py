"""Property endpoints — org-wide (any staff with manage_properties sees all)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData
from api.models.orm import Property
from api.models.schemas import PropertyCreate, PropertyResponse

router = APIRouter(prefix="/properties", tags=["properties"])

ManageProperties = Annotated[TokenData, Depends(RequirePermission("manage_properties"))]
Admin = Annotated[TokenData, Depends(RequirePermission("admin"))]


@router.get("/", response_model=list[PropertyResponse])
async def list_properties(
    _: ManageProperties,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Property]:
    return list((await session.execute(select(Property).order_by(Property.id))).scalars().all())


@router.post("/", response_model=PropertyResponse, status_code=201)
async def create_property(
    body: PropertyCreate,
    current: ManageProperties,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Property:
    new_property = Property(**body.model_dump(), owner_id=current.user_id)
    session.add(new_property)
    await session.commit()
    await session.refresh(new_property)
    return new_property


@router.get("/{property_id}", response_model=PropertyResponse)
async def get_property(
    property_id: int,
    _: ManageProperties,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Property:
    prop = (await session.execute(select(Property).where(Property.id == property_id))).scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.put("/{property_id}", response_model=PropertyResponse)
async def update_property(
    property_id: int,
    body: PropertyCreate,
    _: ManageProperties,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Property:
    prop = (await session.execute(select(Property).where(Property.id == property_id))).scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for key, value in body.model_dump().items():
        setattr(prop, key, value)
    await session.commit()
    await session.refresh(prop)
    return prop


@router.delete("/{property_id}")
async def delete_property(
    property_id: int,
    _: Admin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    prop = (await session.execute(select(Property).where(Property.id == property_id))).scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    await session.delete(prop)
    await session.commit()
    return {"message": "Property deleted"}
