"""Helpers to scope data to the current tenant user.

A tenant login maps to one or more Tenant records via ``user_id`` (preferred)
or a matching email (fallback for self-registered accounts not yet linked).
"""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.orm import Tenant


async def tenant_records_for_user(user_id: int, email: str, session: AsyncSession) -> list[Tenant]:
    rows = await session.execute(
        select(Tenant).where(or_(Tenant.user_id == user_id, Tenant.email == email.lower()))
    )
    return list(rows.scalars().all())


async def tenant_ids_for_user(user_id: int, email: str, session: AsyncSession) -> list[int]:
    return [t.id for t in await tenant_records_for_user(user_id, email, session)]
