"""Tests for employee (staff) creation RBAC, tenant phone field, and seeding.

Covers:
  - Tenant phone persisted / returned / null when omitted.
  - Admin can create any role; manager (manage_staff, no admin) can only
    create manager/maintenance — 403 on admin/owner/tenant (privilege-escalation
    guard).
  - GET /auth/users: admin sees all roles; manager sees only STAFF_ASSIGNABLE_ROLES.
  - admin_reset_password is admin-only (manage_staff is insufficient).
  - CreateUserRequest accepts optional phone and it's stored.
  - Seed: manage_staff permission exists and is attached to admin + manager roles.
"""

from __future__ import annotations

GOOD_PW = "Zephyr9!Kview"
# Seeded root admin — matches config.root_email / root_password defaults
ADMIN_EMAIL = "admin@harmaal.local"
ADMIN_PW = "changeme"


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


async def _admin_token(client) -> str:
    r = await client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


async def _create_staff(client, token: str, email: str, role: str, **extra) -> object:
    """POST /auth/users with the given token; returns the raw response."""
    return await client.post(
        "/auth/users",
        json={"email": email, "role": role, **extra},
        headers={"Authorization": f"Bearer {token}"},
    )


async def _manager_token(client, admin_token: str, email: str = "mgr@harmaal.io") -> str:
    """Create a manager account via admin, log in with the generated OTP, return token."""
    r = await _create_staff(client, admin_token, email, "manager")
    assert r.status_code == 201, f"Manager creation failed: {r.text}"
    otp = r.json()["generated_otp"]
    r2 = await client.post("/auth/login", json={"email": email, "password": otp})
    assert r2.status_code == 200, f"Manager login failed: {r2.text}"
    return r2.json()["access_token"]


async def _create_property(client, token: str) -> int:
    r = await client.post(
        "/properties/",
        json={"address": "99 Test St", "units": 4},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, f"Property creation failed: {r.text}"
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Seed: manage_staff permission and role assignments
# ---------------------------------------------------------------------------


async def test_seed_manage_staff_permission_on_admin(client):
    """Root admin should have manage_staff in their permissions (from the admin role)."""
    admin_token = await _admin_token(client)
    r = await client.get("/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    root = next((u for u in r.json() if u["email"] == ADMIN_EMAIL), None)
    assert root is not None, "Root admin not found in user list"
    assert "manage_staff" in root["permissions"]
    assert "admin" in root["permissions"]


async def test_seed_manager_role_has_manage_staff_but_not_admin(client):
    """A freshly-seeded manager inherits manage_staff but not admin from their role."""
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "seed_mgr@harmaal.io", "manager")
    assert r.status_code == 201
    perms = r.json()["user"]["permissions"]
    assert "manage_staff" in perms, "manager role must have manage_staff"
    assert "admin" not in perms, "manager role must NOT have admin"


# ---------------------------------------------------------------------------
# Admin can create any role
# ---------------------------------------------------------------------------


async def test_admin_creates_manager(client):
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "m1@harmaal.io", "manager")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "manager"
    assert r.json()["generated_otp"]


async def test_admin_creates_maintenance(client):
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "mx1@harmaal.io", "maintenance")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "maintenance"


async def test_admin_creates_owner(client):
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "own1@harmaal.io", "owner")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "owner"


async def test_admin_creates_admin(client):
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "adm2@harmaal.io", "admin")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "admin"


async def test_admin_creates_tenant(client):
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "tnt1@harmaal.io", "tenant")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "tenant"


# ---------------------------------------------------------------------------
# Manager (manage_staff, no admin) — allowed roles
# ---------------------------------------------------------------------------


async def test_manager_cannot_create_manager(client):
    """A non-admin manager must NOT mint privileged manager peers — only admins
    create managers. Guards against self-replication of manage_staff."""
    admin_token = await _admin_token(client)
    mgr_token = await _manager_token(client, admin_token)
    r = await _create_staff(client, mgr_token, "mgr2@harmaal.io", "manager")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


async def test_manager_creates_maintenance(client):
    """A non-admin manager may onboard maintenance staff."""
    admin_token = await _admin_token(client)
    mgr_token = await _manager_token(client, admin_token)
    r = await _create_staff(client, mgr_token, "maint1@harmaal.io", "maintenance")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "maintenance"


# ---------------------------------------------------------------------------
# Manager — privilege-escalation guard (critical tests)
# ---------------------------------------------------------------------------


async def test_manager_cannot_escalate_to_admin(client):
    """CRITICAL: a manager with manage_staff must be rejected when trying to create admin."""
    admin_token = await _admin_token(client)
    mgr_token = await _manager_token(client, admin_token)
    r = await _create_staff(client, mgr_token, "evil_admin@harmaal.io", "admin")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


async def test_manager_cannot_create_owner(client):
    """CRITICAL: a manager must not mint an owner account (bypasses org scoping)."""
    admin_token = await _admin_token(client)
    mgr_token = await _manager_token(client, admin_token)
    r = await _create_staff(client, mgr_token, "evil_owner@harmaal.io", "owner")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


async def test_manager_cannot_create_tenant(client):
    """CRITICAL: a manager must not create tenant accounts via the staff endpoint."""
    admin_token = await _admin_token(client)
    mgr_token = await _manager_token(client, admin_token)
    r = await _create_staff(client, mgr_token, "evil_tenant@harmaal.io", "tenant")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# GET /auth/users — visibility filter
# ---------------------------------------------------------------------------


async def test_list_users_admin_sees_all_roles(client):
    """Admin gets a full roster including admin, manager, owner."""
    admin_token = await _admin_token(client)
    await _create_staff(client, admin_token, "list_mgr@harmaal.io", "manager")
    await _create_staff(client, admin_token, "list_own@harmaal.io", "owner")

    r = await client.get("/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()}
    assert "admin" in roles  # root admin always present
    assert "manager" in roles
    assert "owner" in roles


async def test_list_users_manager_sees_only_staff_roles(client):
    """Non-admin manager must only see manager/maintenance — no admin/owner/tenant."""
    admin_token = await _admin_token(client)
    mgr_token = await _manager_token(client, admin_token)

    # Create a variety so there's something to filter
    await _create_staff(client, admin_token, "filter_own@harmaal.io", "owner")
    await _create_staff(client, admin_token, "filter_maint@harmaal.io", "maintenance")

    r = await client.get("/auth/users", headers={"Authorization": f"Bearer {mgr_token}"})
    assert r.status_code == 200
    visible_roles = {u["role"] for u in r.json()}
    forbidden = visible_roles - {"manager", "maintenance"}
    assert not forbidden, f"Manager should not see roles: {forbidden}"


async def test_list_users_requires_manage_staff_permission(client):
    """A plain tenant (no manage_staff) must receive 403 on GET /auth/users."""
    r_reg = await client.post(
        "/auth/register", json={"email": "plain_t@harmaal.io", "password": GOOD_PW, "role": "tenant"}
    )
    assert r_reg.status_code == 201
    token = (
        await client.post("/auth/login", json={"email": "plain_t@harmaal.io", "password": GOOD_PW})
    ).json()["access_token"]
    r = await client.get("/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# admin_reset_password is admin-only, not just manage_staff
# ---------------------------------------------------------------------------


async def test_admin_reset_password_success(client):
    """Admin can reset another user's password (returns 204)."""
    admin_token = await _admin_token(client)
    target = await _create_staff(client, admin_token, "reset_tgt@harmaal.io", "maintenance")
    target_id = target.json()["user"]["id"]

    r = await client.put(
        f"/auth/users/{target_id}/password",
        json={"password": GOOD_PW},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 204


async def test_admin_reset_password_blocked_for_manager(client):
    """A manager with manage_staff but not admin must be rejected from reset-password."""
    admin_token = await _admin_token(client)
    target = await _create_staff(client, admin_token, "reset_tgt2@harmaal.io", "maintenance")
    target_id = target.json()["user"]["id"]

    mgr_token = await _manager_token(client, admin_token, email="mgrpw@harmaal.io")
    r = await client.put(
        f"/auth/users/{target_id}/password",
        json={"password": GOOD_PW},
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# CreateUserRequest phone field
# ---------------------------------------------------------------------------


async def test_create_user_phone_stored_and_returned(client):
    """phone in CreateUserRequest is persisted and reflected in UserResponse."""
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "wphone@harmaal.io", "manager", phone="+252631234567")
    assert r.status_code == 201
    assert r.json()["user"]["phone"] == "+252631234567"


async def test_create_user_without_phone_returns_null(client):
    """Omitting phone from CreateUserRequest leaves UserResponse.phone null."""
    admin_token = await _admin_token(client)
    r = await _create_staff(client, admin_token, "nophone@harmaal.io", "manager")
    assert r.status_code == 201
    assert r.json()["user"]["phone"] is None


# ---------------------------------------------------------------------------
# Tenant phone: POST /properties/{id}/tenants/
# ---------------------------------------------------------------------------


async def test_tenant_phone_accepted_and_returned(client):
    """TenantCreate accepts phone; TenantResponse echoes it back."""
    admin_token = await _admin_token(client)
    prop_id = await _create_property(client, admin_token)

    r = await client.post(
        f"/properties/{prop_id}/tenants/",
        json={
            "name": "Amina Hassan",
            "email": "amina@harmaal.io",
            "phone": "+252636001122",
            "rent_amount": 500.0,
            "lease_start_date": "2026-01-01",
            "lease_end_date": "2026-12-31",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["phone"] == "+252636001122"
    assert body["name"] == "Amina Hassan"
    assert body["property_id"] == prop_id


async def test_tenant_phone_omitted_returns_null(client):
    """Omitting phone in TenantCreate → TenantResponse.phone is null."""
    admin_token = await _admin_token(client)
    prop_id = await _create_property(client, admin_token)

    r = await client.post(
        f"/properties/{prop_id}/tenants/",
        json={
            "name": "Bilal Omar",
            "email": "bilal@harmaal.io",
            "rent_amount": 400.0,
            "lease_start_date": "2026-01-01",
            "lease_end_date": "2026-12-31",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["phone"] is None


async def test_tenant_phone_explicit_null_returns_null(client):
    """Explicitly passing phone=null in TenantCreate → TenantResponse.phone is null."""
    admin_token = await _admin_token(client)
    prop_id = await _create_property(client, admin_token)

    r = await client.post(
        f"/properties/{prop_id}/tenants/",
        json={
            "name": "Carwo Idle",
            "email": "carwo@harmaal.io",
            "phone": None,
            "rent_amount": 450.0,
            "lease_start_date": "2026-02-01",
            "lease_end_date": "2026-12-31",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["phone"] is None


async def test_tenant_property_not_found_returns_404(client):
    """Adding a tenant to a non-existent property returns 404."""
    admin_token = await _admin_token(client)
    r = await client.post(
        "/properties/99999/tenants/",
        json={
            "name": "Ghost",
            "email": "ghost@harmaal.io",
            "rent_amount": 100.0,
            "lease_start_date": "2026-01-01",
            "lease_end_date": "2026-12-31",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_tenant_add_requires_manage_tenants_permission(client):
    """A tenant user (no manage_tenants) must receive 403 when adding a tenant."""
    # Create an owner property first
    admin_token = await _admin_token(client)
    prop_id = await _create_property(client, admin_token)

    # Register as plain tenant and get token
    await client.post(
        "/auth/register", json={"email": "portal_t@harmaal.io", "password": GOOD_PW, "role": "tenant"}
    )
    token = (
        await client.post("/auth/login", json={"email": "portal_t@harmaal.io", "password": GOOD_PW})
    ).json()["access_token"]

    r = await client.post(
        f"/properties/{prop_id}/tenants/",
        json={
            "name": "Sneak",
            "email": "sneak@harmaal.io",
            "rent_amount": 100.0,
            "lease_start_date": "2026-01-01",
            "lease_end_date": "2026-12-31",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
