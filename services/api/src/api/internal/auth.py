"""Authentication primitives: password hashing, JWT, request guards, TOTP.

Ported from avis_tools' ``internal/admin_auth.py`` and adapted for harmaal's
unified ``users`` table: a single JWT secret, tokens carry both the coarse
``role`` and the fine-grained ``permissions`` list, and TOTP helpers live here
(secrets stored plaintext in Core scope — no pgcrypto).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt as _bcrypt
import jwt as _jwt
import pyotp
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import settings

bearer_scheme = HTTPBearer(auto_error=True)

# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


# A constant dummy hash so that login attempts against a non-existent user take
# the same time as a real verify — defeats user-enumeration via timing.
_DUMMY_HASH = hash_password("dummy-password-for-timing-defense")


def dummy_verify() -> None:
    verify_password("nope", _DUMMY_HASH)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


def create_access_token(
    user_id: int,
    email: str,
    role: str,
    permissions: list[str],
    *,
    must_change_password: bool = False,
) -> str:
    expire = datetime.now(UTC) + timedelta(hours=settings.jwt_expire_hours)
    payload: dict = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "permissions": permissions,
        "must_change_password": must_change_password,
        "exp": expire,
    }
    return _jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_mfa_token(user_id: int, email: str) -> str:
    """Short-lived token carrying identity through the 2FA challenge."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.mfa_token_expire_minutes)
    return _jwt.encode(
        {"sub": str(user_id), "email": email, "type": "mfa", "exp": expire},
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    return _jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


# ---------------------------------------------------------------------------
# Request context
# ---------------------------------------------------------------------------


class TokenData:
    def __init__(
        self,
        sub: str,
        email: str,
        role: str,
        permissions: list[str],
        must_change_password: bool = False,
    ) -> None:
        self.user_id = int(sub)
        self.email = email
        self.role = role
        self.permissions = permissions
        self.must_change_password = must_change_password

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> TokenData:
    """Validate a full access token. Rejects MFA-stage tokens."""
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") == "mfa":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return TokenData(
            sub=payload["sub"],
            email=payload["email"],
            role=payload.get("role", "tenant"),
            permissions=payload.get("permissions", []),
            must_change_password=payload.get("must_change_password", False),
        )
    except (_jwt.PyJWTError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_setup_or_current(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> TokenData:
    """Accept either a full token OR an MFA-stage token — used by TOTP setup so a
    user can configure 2FA while only holding the short-lived challenge token."""
    try:
        payload = decode_token(credentials.credentials)
        return TokenData(
            sub=payload["sub"],
            email=payload["email"],
            role=payload.get("role", "tenant"),
            permissions=payload.get("permissions", []),
            must_change_password=payload.get("must_change_password", False),
        )
    except (_jwt.PyJWTError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


class RequirePermission:
    """Class-based dependency that asserts a fine-grained permission."""

    def __init__(self, permission: str) -> None:
        self.permission = permission

    async def __call__(self, user: Annotated[TokenData, Depends(get_current_user)]) -> TokenData:
        if not user.has_permission(self.permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {self.permission}",
            )
        return user


class RequireAnyPermission:
    """Dependency that passes if the user holds ANY of the given permissions.

    Used where multiple roles legitimately reach an endpoint (e.g. both full
    IAM admins and staff managers manage users). Also smooths permission
    additions: a newly-seeded permission need not be present in already-issued
    JWTs as long as the caller still carries one of the accepted alternatives.
    """

    def __init__(self, *permissions: str) -> None:
        self.permissions = permissions

    async def __call__(self, user: Annotated[TokenData, Depends(get_current_user)]) -> TokenData:
        if not any(user.has_permission(p) for p in self.permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: one of {', '.join(self.permissions)}",
            )
        return user


class RequireRole:
    """Class-based dependency that asserts the coarse role."""

    def __init__(self, role: str) -> None:
        self.role = role

    async def __call__(self, user: Annotated[TokenData, Depends(get_current_user)]) -> TokenData:
        if user.role != self.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role required: {self.role}",
            )
        return user


# ---------------------------------------------------------------------------
# TOTP helpers
# ---------------------------------------------------------------------------


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account_name: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=settings.totp_issuer)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
