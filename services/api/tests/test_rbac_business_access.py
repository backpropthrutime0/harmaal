"""Tests for admin-only business access and the RBAC administration endpoints.

Covers:
  - Seed: ``view_business`` is granted to the admin role only (not manager/owner).
  - Analytics/financial endpoints are admin-only; a manager gets 403.
  - Regression: ``/dashboard/manager`` stayed reachable for managers after
    ``view_business`` became admin-only (it now guards on ``manage_tenants``).
  - GET /auth/roles + /auth/permissions require the admin permission.
  - Granting ``view_business`` to a role opens the endpoints for its holders on
    their next sign-in; revoking closes them again.
  - Guard rails: the admin role keeps "admin", unknown names are rejected, and an
    admin cannot strip their own access.
  - PUT /auth/users/{id}/roles replaces roles and syncs the coarse ``users.role``.
"""

from __future__ import annotations

ADMIN_EMAIL = "admin@harmaal.local"
ADMIN_PW = "changeme"

# Endpoints that serve business intelligence / financial data.
BUSINESS_ENDPOINTS = ("/dashboard/admin", "/finance/monthly", "/finance/expenses")


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _admin_token(client) -> str:
    r = await client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


async def _manager_token(client, admin_token: str, email: str = "mgr@harmaal.io") -> str:
    """Create a manager via admin, sign in with the generated OTP, return the token."""
    r = await client.post("/auth/users", json={"email": email, "role": "manager"}, headers=_auth(admin_token))
    assert r.status_code == 201, f"Manager creation failed: {r.text}"
    r2 = await client.post("/auth/login", json={"email": email, "password": r.json()["generated_otp"]})
    assert r2.status_code == 200, f"Manager login failed: {r2.text}"
    return r2.json()["access_token"]


async def _role(client, admin_token: str, name: str) -> dict:
    r = await client.get("/auth/roles", headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    return next(role for role in r.json() if role["name"] == name)


# ---------------------------------------------------------------------------
# Seeded defaults
# ---------------------------------------------------------------------------


async def test_seed_grants_view_business_to_admin_only(client):
    admin = await _admin_token(client)
    listing = (await client.get("/auth/roles", headers=_auth(admin))).json()
    roles = {r["name"]: r["permissions"] for r in listing}
    assert "view_business" in roles["admin"]
    assert "view_business" not in roles["manager"]
    assert "view_business" not in roles["owner"]
    assert "view_business" not in roles["maintenance"]


async def test_manager_keeps_operational_permissions(client):
    """Revoking business access must not disturb day-to-day manager permissions."""
    admin = await _admin_token(client)
    manager = await _role(client, admin, "manager")
    assert set(manager["permissions"]) == {
        "manage_maintenance",
        "manage_properties",
        "manage_staff",
        "manage_tenants",
    }


# ---------------------------------------------------------------------------
# Enforcement
# ---------------------------------------------------------------------------


async def test_manager_denied_business_endpoints(client):
    admin = await _admin_token(client)
    manager = await _manager_token(client, admin)
    for path in BUSINESS_ENDPOINTS:
        r = await client.get(path, headers=_auth(manager))
        assert r.status_code == 403, f"{path} should be admin-only, got {r.status_code}"


async def test_admin_allowed_business_endpoints(client):
    admin = await _admin_token(client)
    for path in BUSINESS_ENDPOINTS:
        r = await client.get(path, headers=_auth(admin))
        assert r.status_code == 200, f"{path} failed for admin: {r.text}"


async def test_manager_dashboard_still_reachable_for_managers(client):
    """Regression: the manager landing page must not require view_business."""
    admin = await _admin_token(client)
    manager = await _manager_token(client, admin)
    r = await client.get("/dashboard/manager", headers=_auth(manager))
    assert r.status_code == 200, r.text


async def test_manager_cannot_write_expenses(client):
    """Reads and writes share a guard, so a manager can't log unseeable expenses."""
    admin = await _admin_token(client)
    manager = await _manager_token(client, admin)
    r = await client.post(
        "/finance/expenses",
        json={"description": "x", "amount": 5.0, "category": "other", "period": "2026-08"},
        headers=_auth(manager),
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# RBAC administration endpoints
# ---------------------------------------------------------------------------


async def test_rbac_endpoints_require_admin(client):
    admin = await _admin_token(client)
    manager = await _manager_token(client, admin)
    for path in ("/auth/roles", "/auth/permissions"):
        assert (await client.get(path, headers=_auth(manager))).status_code == 403
        assert (await client.get(path, headers=_auth(admin))).status_code == 200


async def test_grant_then_revoke_view_business(client):
    admin = await _admin_token(client)
    await _manager_token(client, admin)  # a manager account exists
    role = await _role(client, admin, "manager")

    # Grant.
    r = await client.put(
        f"/auth/roles/{role['id']}/permissions",
        json={"permissions": [*role["permissions"], "view_business"]},
        headers=_auth(admin),
    )
    assert r.status_code == 200, r.text
    assert "view_business" in r.json()["permissions"]

    # Permissions ride in the JWT, so the holder picks them up on next sign-in.
    regrant = await _manager_token(client, admin, email="mgr2@harmaal.io")
    assert (await client.get("/finance/monthly", headers=_auth(regrant))).status_code == 200

    # Revoke.
    r = await client.put(
        f"/auth/roles/{role['id']}/permissions",
        json={"permissions": role["permissions"]},
        headers=_auth(admin),
    )
    assert r.status_code == 200, r.text
    assert "view_business" not in r.json()["permissions"]

    after = await _manager_token(client, admin, email="mgr3@harmaal.io")
    assert (await client.get("/finance/monthly", headers=_auth(after))).status_code == 403


async def test_admin_role_must_keep_admin_permission(client):
    admin = await _admin_token(client)
    role = await _role(client, admin, "admin")
    r = await client.put(
        f"/auth/roles/{role['id']}/permissions",
        json={"permissions": ["manage_tenants"]},
        headers=_auth(admin),
    )
    assert r.status_code == 400
    assert "admin" in r.json()["detail"]


async def test_unknown_permission_rejected(client):
    admin = await _admin_token(client)
    role = await _role(client, admin, "manager")
    r = await client.put(
        f"/auth/roles/{role['id']}/permissions",
        json={"permissions": ["not_a_real_permission"]},
        headers=_auth(admin),
    )
    assert r.status_code == 400
    assert "not_a_real_permission" in r.json()["detail"]


async def test_role_permissions_forbids_extra_fields(client):
    admin = await _admin_token(client)
    role = await _role(client, admin, "manager")
    r = await client.put(
        f"/auth/roles/{role['id']}/permissions",
        json={"permissions": [], "sneaky": True},
        headers=_auth(admin),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# User ↔ role assignment
# ---------------------------------------------------------------------------


async def test_assign_roles_syncs_coarse_role(client):
    admin = await _admin_token(client)
    r = await client.post(
        "/auth/users", json={"email": "staff@harmaal.io", "role": "maintenance"}, headers=_auth(admin)
    )
    user_id = r.json()["user"]["id"]

    r = await client.put(f"/auth/users/{user_id}/roles", json={"roles": ["manager"]}, headers=_auth(admin))
    assert r.status_code == 200, r.text
    body = r.json()
    assert [role["name"] for role in body["roles"]] == ["manager"]
    assert body["role"] == "manager"  # coarse role follows the assignment
    assert "view_business" not in body["permissions"]


async def test_assign_multiple_roles_takes_most_privileged(client):
    admin = await _admin_token(client)
    r = await client.post(
        "/auth/users", json={"email": "dual@harmaal.io", "role": "maintenance"}, headers=_auth(admin)
    )
    user_id = r.json()["user"]["id"]

    r = await client.put(
        f"/auth/users/{user_id}/roles", json={"roles": ["manager", "admin"]}, headers=_auth(admin)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "admin"
    assert "view_business" in body["permissions"]


async def test_admin_cannot_remove_own_admin_access(client):
    admin = await _admin_token(client)
    me = (await client.get("/auth/me", headers=_auth(admin))).json()
    r = await client.put(f"/auth/users/{me['id']}/roles", json={"roles": ["manager"]}, headers=_auth(admin))
    assert r.status_code == 400
    assert "own admin access" in r.json()["detail"]


async def test_unknown_role_rejected(client):
    admin = await _admin_token(client)
    me = (await client.get("/auth/me", headers=_auth(admin))).json()
    r = await client.put(f"/auth/users/{me['id']}/roles", json={"roles": ["wizard"]}, headers=_auth(admin))
    assert r.status_code == 400
    assert "wizard" in r.json()["detail"]
