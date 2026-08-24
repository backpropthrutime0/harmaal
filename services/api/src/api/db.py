"""Async SQLAlchemy engine/session setup.

Replaces harmaal's old sync ``database.py``. The connection URL comes from
``settings.database_url`` (asyncpg driver). ``get_session`` is the FastAPI
dependency that yields an ``AsyncSession`` per request.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from api.config import settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# pool_pre_ping replaces dead connections; pool_recycle avoids stale sockets on
# managed Postgres that silently drops idle connections. SQLite (used in tests)
# does not accept queue-pool sizing, so apply those only for real DB backends.
_engine_kwargs: dict = {"echo": False}
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs.update(pool_pre_ping=True, pool_size=5, max_overflow=5, pool_recycle=1800)

engine = create_async_engine(settings.database_url, **_engine_kwargs)
AsyncSessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        yield session
