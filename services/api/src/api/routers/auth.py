"""Authentication & user-management endpoints (prefix ``/auth``).

Ported from avis_tools' ``routers/admin_auth.py``, trimmed to harmaal's Core
scope: password login + TOTP (authenticator-app) 2FA + RBAC + DB-backed
brute-force lockout + strong password validation. No email features, no Redis.
"""

from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt as _jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.config import settings
from api.db import get_session
from api.internal.auth import (
    RequireAnyPermission,
    RequirePermission,
    TokenData,
    create_access_token,
    create_mfa_token,
    dummy_verify,
    generate_totp_secret,
    get_current_user,
    get_setup_or_current,
    hash_password,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)
from api.models.orm import Role, User
from api.models.schemas import (
    AdminResetPasswordRequest,
    ChangePasswordRequest,
    ConfirmTotpRequest,
    CreateUserRequest,
    CreateUserResponse,
    DisableTotpRequest,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    SetupTotpResponse,
    UserResponse,
    VerifyMFARequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_MAX_LOGIN_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15
_OTP_LENGTH = 14
_OTP_CHARS = string.ascii_uppercase + string.ascii_lowercase + string.digits + "!@#$%&*"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _with_roles(stmt):
    """Eager-load roles + their permissions (avoids async lazy-load errors) and
    force-refresh the identity-mapped instance so server-default columns load."""
    return stmt.options(selectinload(User.roles).selectinload(Role.permissions)).execution_options(
        populate_existing=True
    )


async def _load_user(user_id: int, session: AsyncSession) -> User:
    user = (await session.execute(_with_roles(select(User).where(User.id == user_id)))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _get_user_by_email(email: str, session: AsyncSession) -> User | None:
    return (
        await session.execute(_with_roles(select(User).where(User.email == email.strip().lower())))
    ).scalar_one_or_none()


async def _get_role(role_name: str, session: AsyncSession) -> Role | None:
    """Fetch the RBAC Role row matching the coarse role name (permissions eager-loaded)."""
    return (
        await session.execute(
            select(Role).options(selectinload(Role.permissions)).where(Role.name == role_name)
        )
    ).scalar_one_or_none()


def _generate_otp() -> str:
    """One-time password that satisfies the strength policy (>=1 of each class)."""
    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%&*"),
    ]
    remaining = [secrets.choice(_OTP_CHARS) for _ in range(_OTP_LENGTH - len(required))]
    chars = required + remaining
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


# Roles a non-admin staff manager (holds "manage_staff" but not "admin") may see
# in the roster. Excludes admin/owner/tenant so managers never view privileged
# or resident accounts.
STAFF_VISIBLE_ROLES = {"manager", "maintenance"}

# Roles a non-admin staff manager may CREATE. Deliberately narrower than what
# they can view: excludes "manager" so only full admins can mint privileged
# manager peers. This prevents a compromised manager from self-replicating its
# own permission set (manage_staff + business access) for persistence.
STAFF_ASSIGNABLE_ROLES = {"maintenance"}


def _user_out(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        display_name=user.display_name,
        phone=user.phone,
        is_active=user.is_active,
        is_system=user.is_system,
        totp_enabled=user.totp_enabled,
        must_change_password=user.must_change_password,
        is_otp=user.is_otp,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        roles=list(user.roles),
        permissions=user.permission_names,
    )


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    body: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    """Open self-registration for tenants/owners (admins are created via /auth/users)."""
    if await _get_user_by_email(body.email, session):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    role = await _get_role(body.role, session)
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        display_name=body.display_name,
        phone=body.phone,
        password_changed_at=datetime.now(UTC),
        roles=[role] if role else [],
    )
    session.add(user)
    await session.commit()
    return _user_out(await _load_user(user.id, session))


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LoginResponse:
    now = datetime.now(UTC)
    user = await _get_user_by_email(body.email, session)

    # Lockout check (before revealing whether the account exists).
    # Coerce to UTC-aware: Postgres returns tz-aware datetimes, SQLite naive.
    locked_until = user.login_locked_until if user else None
    if locked_until is not None and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=UTC)
    if locked_until is not None and locked_until > now:
        wait = int((locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked. Try again in {wait} minute(s).",
        )

    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        if not user:
            dummy_verify()  # constant-time defense against user enumeration
        else:
            user.login_attempts = (user.login_attempts or 0) + 1
            if user.login_attempts >= _MAX_LOGIN_ATTEMPTS:
                user.login_locked_until = now + timedelta(minutes=_LOCKOUT_MINUTES)
                user.login_attempts = 0
            await session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Success — clear lockout counters
    user.login_attempts = 0
    user.login_locked_until = None

    # 2FA (opt-in): if TOTP is enabled, issue a short-lived challenge token.
    if user.totp_enabled:
        await session.commit()
        return LoginResponse(status="mfa_required", mfa_token=create_mfa_token(user.id, user.email))

    user.last_login_at = now
    await session.commit()
    token = create_access_token(
        user.id,
        user.email,
        user.role,
        user.permission_names,
        must_change_password=user.must_change_password,
    )
    return LoginResponse(
        status="ok",
        access_token=token,
        user=_user_out(user),
        must_change_password=user.must_change_password,
    )


@router.post("/verify-2fa", response_model=LoginResponse)
async def verify_2fa(
    body: VerifyMFARequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LoginResponse:
    try:
        payload = _jwt.decode(body.mfa_token, settings.jwt_secret, algorithms=["HS256"])
        if payload.get("type") != "mfa":
            raise ValueError("wrong token type")
        user_id = int(payload["sub"])
    except (_jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA token") from exc

    user = await _load_user(user_id, session)
    if not user.totp_enabled or not user.totp_secret or not verify_totp(user.totp_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code",
        )

    user.last_login_at = datetime.now(UTC)
    await session.commit()
    token = create_access_token(
        user.id,
        user.email,
        user.role,
        user.permission_names,
        must_change_password=user.must_change_password,
    )
    return LoginResponse(
        status="ok",
        access_token=token,
        user=_user_out(user),
        must_change_password=user.must_change_password,
    )


# ---------------------------------------------------------------------------
# Authenticated: password & 2FA management
# ---------------------------------------------------------------------------


@router.post("/change-password", status_code=204)
async def change_password(
    body: ChangePasswordRequest,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _load_user(current.user_id, session)
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    user.is_otp = False
    user.password_changed_at = datetime.now(UTC)
    await session.commit()


@router.post("/setup-totp", response_model=SetupTotpResponse)
async def setup_totp(
    current: Annotated[TokenData, Depends(get_setup_or_current)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SetupTotpResponse:
    """Generate a TOTP secret + provisioning URI. Not active until confirmed."""
    user = await _load_user(current.user_id, session)
    secret = generate_totp_secret()
    user.totp_secret = secret
    await session.commit()
    return SetupTotpResponse(secret=secret, qr_uri=totp_provisioning_uri(secret, user.email))


@router.post("/confirm-totp", status_code=204)
async def confirm_totp(
    body: ConfirmTotpRequest,
    current: Annotated[TokenData, Depends(get_setup_or_current)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _load_user(current.user_id, session)
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="No TOTP setup in progress. Call /auth/setup-totp first.")
    if not verify_totp(user.totp_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid code. Make sure your authenticator app is synced.",
        )
    user.totp_enabled = True
    await session.commit()


@router.delete("/totp", status_code=204)
async def disable_totp(
    body: DisableTotpRequest,
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _load_user(current.user_id, session)
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    user.totp_enabled = False
    user.totp_secret = None
    await session.commit()


@router.get("/me", response_model=UserResponse)
async def me(
    current: Annotated[TokenData, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    return _user_out(await _load_user(current.user_id, session))


# ---------------------------------------------------------------------------
# User management (requires "admin" permission)
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    actor: Annotated[TokenData, Depends(RequireAnyPermission("admin", "manage_staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[UserResponse]:
    """List users. Full IAM admins see everyone; staff managers see only the
    non-admin employees they are allowed to manage."""
    users = (await session.execute(select(User).order_by(User.id))).scalars().all()
    if not actor.has_permission("admin"):
        users = [u for u in users if u.role in STAFF_VISIBLE_ROLES]
    return [_user_out(u) for u in users]


@router.post("/users", response_model=CreateUserResponse, status_code=201)
async def create_user(
    body: CreateUserRequest,
    actor: Annotated[TokenData, Depends(RequireAnyPermission("admin", "manage_staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreateUserResponse:
    """Create an account with a generated one-time password (must change on first login).

    Full IAM admins may create any role. Staff managers (``manage_staff`` without
    ``admin``) may only onboard non-privileged employees, guarding against a
    manager minting an admin/owner account and escalating their own access.
    """
    if not actor.has_permission("admin") and body.role not in STAFF_ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You may only create staff employees ({', '.join(sorted(STAFF_ASSIGNABLE_ROLES))})",
        )
    if await _get_user_by_email(body.email, session):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    otp = _generate_otp()
    role = await _get_role(body.role, session)
    user = User(
        email=body.email,
        hashed_password=hash_password(otp),
        role=body.role,
        display_name=body.display_name,
        phone=body.phone,
        must_change_password=True,
        is_otp=True,
        password_changed_at=datetime.now(UTC),
        roles=[role] if role else [],
    )
    session.add(user)
    await session.commit()
    return CreateUserResponse(user=_user_out(await _load_user(user.id, session)), generated_otp=otp)


@router.put("/users/{user_id}/password", status_code=204)
async def admin_reset_password(
    user_id: int,
    body: AdminResetPasswordRequest,
    _: Annotated[TokenData, Depends(RequirePermission("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _load_user(user_id, session)
    user.hashed_password = hash_password(body.password)
    user.must_change_password = True
    user.login_attempts = 0
    user.login_locked_until = None
    await session.commit()
