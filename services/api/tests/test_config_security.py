"""Tests for the boot-time refusal of shipped-default secrets.

The repository is public, so every default in `.env.example` / docker-compose is
world-readable — a default JWT_SECRET lets anyone mint an admin token. `Settings`
therefore defaults to the strict posture and only relaxes for an instance that is
provably local.

Covers:
  - ENVIRONMENT defaults to "production" (an unset variable is not a lax path).
  - Shipped-default JWT_SECRET / ROOT_PASSWORD / DB password are refused.
  - Refusal happens for an unset ENVIRONMENT, not just an explicit "production".
  - `is_local_dev` requires BOTH ENVIRONMENT=development and loopback origins, so
    a real domain still refuses even when someone left ENVIRONMENT=development.
  - Real secrets boot fine in every environment.
"""

from __future__ import annotations

import pytest

from api.config import Settings

DEFAULT_JWT = "CHANGE_ME_IN_PRODUCTION_at_least_32_chars_xx"
STRONG_JWT = "b7f3a1c9e2d84f60a5b3c7d9e1f2a4b6c8d0e2f4a6b8c1d3e5f7a9b0c2d4e6f8"
LOCAL_DB = "postgresql+asyncpg://harmaal_admin:supersecretpassword@localhost:5432/harmaal_erp"
SAFE_DB = "postgresql+asyncpg://harmaal_admin:Wq7%24tR2pLx9@db:5432/harmaal_erp"


def _settings(**overrides) -> Settings:
    """Build Settings from explicit values only, ignoring the developer's .env."""
    base = {
        "environment": "development",
        "jwt_secret": STRONG_JWT,
        "root_password": "N0t-A-Default!x",
        "database_url": SAFE_DB,
        "cors_origins": "http://localhost:5173",
        "frontend_url": "http://localhost:5173",
    }
    return Settings(**{**base, **overrides})


# ---------------------------------------------------------------------------
# The inverted default
# ---------------------------------------------------------------------------


def test_environment_defaults_to_production():
    """An unset ENVIRONMENT must inherit the strict posture, not the lax one."""
    assert Settings.model_fields["environment"].default == "production"


def test_unset_environment_refuses_default_secrets():
    """The old code only checked when ENVIRONMENT == 'production' explicitly."""
    with pytest.raises(ValueError, match="JWT_SECRET is still the shipped default"):
        _settings(environment="production", jwt_secret=DEFAULT_JWT)


# ---------------------------------------------------------------------------
# Refused defaults
# ---------------------------------------------------------------------------


def test_default_jwt_secret_refused():
    with pytest.raises(ValueError, match="JWT_SECRET is still the shipped default"):
        _settings(environment="staging", jwt_secret=DEFAULT_JWT)


def test_short_jwt_secret_refused():
    with pytest.raises(ValueError, match="at least 32 characters"):
        _settings(environment="staging", jwt_secret="too-short")


def test_default_root_password_refused():
    with pytest.raises(ValueError, match="ROOT_PASSWORD is still the shipped default"):
        _settings(environment="staging", root_password="changeme")


def test_default_database_password_refused():
    with pytest.raises(ValueError, match="database password is still the shipped default"):
        _settings(environment="staging", database_url=LOCAL_DB)


def test_error_lists_every_problem_at_once():
    with pytest.raises(ValueError, match="Refusing to start with insecure defaults") as exc:
        _settings(
            environment="production",
            jwt_secret=DEFAULT_JWT,
            root_password="changeme",
            database_url=LOCAL_DB,
        )
    message = str(exc.value)
    assert "JWT_SECRET" in message
    assert "ROOT_PASSWORD" in message
    assert "database password" in message


# ---------------------------------------------------------------------------
# The local-development escape hatch
# ---------------------------------------------------------------------------


def test_local_dev_tolerates_shipped_defaults():
    """`docker compose up` must still work out of the box for the demo."""
    settings = _settings(jwt_secret=DEFAULT_JWT, root_password="changeme", database_url=LOCAL_DB)
    assert settings.is_local_dev is True


def test_development_with_public_origin_still_refuses():
    """ENVIRONMENT=development is a claim; the origins are the evidence."""
    with pytest.raises(ValueError, match="JWT_SECRET is still the shipped default"):
        _settings(jwt_secret=DEFAULT_JWT, cors_origins="https://harmaal.example.com")


def test_development_with_public_frontend_url_still_refuses():
    with pytest.raises(ValueError, match="JWT_SECRET is still the shipped default"):
        _settings(jwt_secret=DEFAULT_JWT, frontend_url="https://harmaal.example.com")


def test_wildcard_cors_origin_is_not_local():
    with pytest.raises(ValueError, match="JWT_SECRET is still the shipped default"):
        _settings(jwt_secret=DEFAULT_JWT, cors_origins="*")


def test_non_development_environment_is_never_local():
    assert _settings(environment="production").is_local_dev is False
    assert _settings(environment="staging").is_local_dev is False


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]"])
def test_loopback_hosts_count_as_local(host):
    settings = _settings(cors_origins=f"http://{host}:5173", frontend_url=f"http://{host}:5173")
    assert settings.is_local_dev is True


def test_zero_host_is_not_loopback():
    """0.0.0.0 means "every interface" — the opposite of local-only."""
    assert _settings(cors_origins="http://0.0.0.0:5173").is_local_dev is False


# ---------------------------------------------------------------------------
# Real secrets always boot
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("environment", ["production", "staging", "development"])
def test_real_secrets_boot_anywhere(environment):
    settings = _settings(environment=environment, cors_origins="https://harmaal.example.com")
    assert settings.jwt_secret == STRONG_JWT
