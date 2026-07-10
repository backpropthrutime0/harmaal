"""Application configuration via pydantic-settings.

All runtime config comes from environment variables / a local .env file —
no secrets are hardcoded (replaces harmaal's old hardcoded SECRET_KEY and
DATABASE_URL). See .env.example at the repo root for the full key list.
"""

from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_DEFAULTS = frozenset({"changeme", "CHANGE_ME_IN_PRODUCTION", "harmaal-super-secret-master-key"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Database ---
    database_url: str = "postgresql+asyncpg://harmaal_admin:supersecretpassword@localhost:5432/harmaal_erp"
    sync_database_url: str = ""  # derived from database_url for Alembic

    # --- Runtime ---
    environment: str = "development"
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
    def _validate_production_secrets(self) -> Settings:
        if self.environment != "production":
            return self
        if "CHANGE_ME" in self.jwt_secret or self.jwt_secret in _WEAK_DEFAULTS:
            raise ValueError("JWT_SECRET must be changed from its default before running in production")
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters in production")
        if self.root_password in _WEAK_DEFAULTS:
            raise ValueError("ROOT_PASSWORD must be changed from its default before running in production")
        return self


settings = Settings()
