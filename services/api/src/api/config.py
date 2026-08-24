"""Application configuration via pydantic-settings.

All runtime config comes from environment variables / a local .env file —
no secrets are hardcoded (replaces harmaal's old hardcoded SECRET_KEY and
DATABASE_URL). See .env.example at the repo root for the full key list.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_DEFAULTS = frozenset({"changeme", "CHANGE_ME_IN_PRODUCTION", "harmaal-super-secret-master-key"})
# The database password shipped in .env.example / docker-compose defaults.
_WEAK_DB_PASSWORD = "supersecretpassword"  # a known-bad default we refuse, not a live credential
# Hosts that mean "this instance is only reachable from the developer's machine".
# 0.0.0.0 and wildcards are deliberately excluded: they are not local.
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _origin_host(origin: str) -> str:
    """Hostname of a CORS origin / URL, or "" when it cannot be parsed (e.g. "*")."""
    candidate = origin.strip()
    if not candidate:
        return ""
    parsed = urlsplit(candidate if "//" in candidate else f"//{candidate}")
    return (parsed.hostname or "").lower()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Database ---
    database_url: str = "postgresql+asyncpg://harmaal_admin:supersecretpassword@localhost:5432/harmaal_erp"
    sync_database_url: str = ""  # derived from database_url for Alembic

    # --- Runtime ---
    # Defaults to the STRICTEST posture: an unset ENVIRONMENT must never silently
    # unlock demo seeding and shipped-default secrets. Local development opts out
    # explicitly with ENVIRONMENT=development (see `is_local_dev`).
    environment: str = "production"
    log_level: str = "INFO"
    # Create tables on startup instead of relying on Alembic (handy for quick
    # local dev / tests). Production runs `alembic upgrade head` and leaves this off.
    auto_create_tables: bool = False
    # Populate the shared demo dataset (properties, tenants, staff logins, rent
    # ledger, work orders) on first boot when the DB is empty. On by default so a
    # fresh `docker compose up` gives every collaborator the same working demo
    # accounts; automatically skipped in production. Non-destructive: only runs
    # when there is no business data yet.
    seed_demo_data: bool = True
    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    # --- Auth / JWT ---
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION_at_least_32_chars_xx"
    jwt_expire_hours: int = 8
    mfa_token_expire_minutes: int = 5
    totp_issuer: str = "Harmaal"

    # --- Seed root admin (created on startup if absent) ---
    root_email: str = "admin@harmaal.local"
    root_password: str = "changeme"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_local_dev(self) -> bool:
        """True only for an instance that is explicitly development *and* serves
        nothing beyond the developer's own machine.

        Both halves matter. ``ENVIRONMENT`` alone is a promise the operator makes;
        the configured origins are evidence of who can actually reach the app. A
        container always binds 0.0.0.0 internally, so the bind address says nothing
        useful — the origins it is willing to serve do.
        """
        if self.environment != "development":
            return False
        hosts = [_origin_host(o) for o in self.cors_origins_list]
        hosts.append(_origin_host(self.frontend_url))
        return all(host in _LOOPBACK_HOSTS for host in hosts)

    @model_validator(mode="after")
    def _normalize_database_url(self) -> Settings:
        """Normalize the DB URL to the async driver and derive the sync URL for Alembic."""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        self.database_url = url
        if not self.sync_database_url:
            self.sync_database_url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        return self

    @model_validator(mode="after")
    def _refuse_shipped_default_secrets(self) -> Settings:
        """Refuse to boot on shipped-default credentials for any instance that is
        not provably local — regardless of ENVIRONMENT.

        This repository is public, so every default below is world-readable: a
        default JWT_SECRET lets anyone mint an admin token. Previously these checks
        ran only when ENVIRONMENT was explicitly "production", which meant a deploy
        that simply forgot the variable inherited the lax path. Now the burden is
        reversed — you opt *out* by proving the instance is local.
        """
        if self.is_local_dev:
            return self

        problems: list[str] = []
        if "CHANGE_ME" in self.jwt_secret or self.jwt_secret in _WEAK_DEFAULTS:
            problems.append("JWT_SECRET is still the shipped default")
        elif len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be at least 32 characters")
        if self.root_password in _WEAK_DEFAULTS:
            problems.append("ROOT_PASSWORD is still the shipped default")
        if _WEAK_DB_PASSWORD in self.database_url:
            problems.append("the database password is still the shipped default")

        if problems:
            raise ValueError(
                "Refusing to start with insecure defaults: "
                + "; ".join(problems)
                + ". Set real values, or — for local development only — set "
                "ENVIRONMENT=development with loopback CORS_ORIGINS/FRONTEND_URL."
            )
        return self


settings = Settings()
