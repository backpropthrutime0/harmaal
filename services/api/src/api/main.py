"""Harmaal API — FastAPI application entrypoint.

Wires CORS, security headers, routers, and startup seeding. Schema is managed by
Alembic in production (``alembic upgrade head`` before boot); set
``AUTO_CREATE_TABLES=true`` for quick local/dev runs without migrations.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from api.config import settings
from api.db import AsyncSessionFactory, Base, engine
from api.mock_data import seed_demo_if_empty
from api.routers import (
    auth,
    dashboards,
    feed,
    finance,
    invoices,
    properties,
    rent,
    tenants,
    work_orders,
)
from api.seed import seed


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if settings.auto_create_tables:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionFactory() as session:
        await seed(session)
    # First-boot demo data so a fresh checkout has working staff/tenant logins,
    # not just the root admin. The demo passwords live in mock_data.py in a public
    # repo, so this is gated on `is_local_dev` (explicit ENVIRONMENT=development
    # *and* loopback-only origins) rather than merely "not production" — an unset
    # ENVIRONMENT must never seed publicly-known credentials. Also a no-op once
    # business data exists.
    if settings.seed_demo_data and settings.is_local_dev:
        await seed_demo_if_empty()
    yield


app = FastAPI(title="Harmaal API", lifespan=lifespan)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(properties.router)
app.include_router(tenants.router)
app.include_router(rent.router)
app.include_router(work_orders.router)
app.include_router(dashboards.router)
app.include_router(finance.router)
app.include_router(invoices.router)
# Hormaal Animal Feed — sibling Hormaal Group company (permission: manage_feed).
app.include_router(feed.router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Welcome to the Harmaal API"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
