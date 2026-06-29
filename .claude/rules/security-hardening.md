# Security hardening (Harmaal)

Stack-specific constraints for FastAPI + async SQLAlchemy + JWT/TOTP. Adapted from avis_tools (Gemini/SSN/Wi-Fi/Redis sections removed — not in Core scope).

## JWT
- Always decode with `algorithms=["HS256"]`; never allow `alg: none`.
- `get_current_user` must reject MFA-stage tokens (`type == "mfa"`).
- Short access-token TTL (`JWT_EXPIRE_HOURS`, default 8). Never log raw tokens.

## Passwords & 2FA
- bcrypt for hashing; constant-time `verify`; dummy-hash unknown users to avoid enumeration.
- Enforce `validate_password_strength` on register / change / admin-reset.
- DB-backed lockout: 5 failures → 15-minute lock.
- TOTP: `verify(..., valid_window=1)`; only return the secret during setup; enforce once `totp_enabled`.
- **Core-scope note**: TOTP secret is stored plaintext — encrypt with pgcrypto if you raise the bar later.

## Pydantic as the boundary
- Request models: `extra="forbid"`.
- Every endpoint declares `response_model`; never serialize `hashed_password` / `totp_secret` (use `UserResponse`).

## SQLAlchemy
- Parameterized queries only; no f-strings inside `text()`.
- Eager-load (`selectinload`) anything serialized to avoid `MissingGreenlet` and N+1.

## Secrets
- All config via `api.config.settings`; nothing hardcoded.
- `.env` is gitignored and never read/logged. Production validates `JWT_SECRET` is non-default and ≥32 chars.

## Transport / infra
- CORS limited to `settings.cors_origins`.
- `SecurityHeadersMiddleware` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Dockerfile: pinned base image, minimal packages.
