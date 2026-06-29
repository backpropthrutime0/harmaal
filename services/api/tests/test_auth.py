"""Auth/2FA/RBAC tests."""

from __future__ import annotations

import pyotp

GOOD_PW = "Zephyr9!Kview"  # passes the strength policy (no common roots)


async def _register(client, email="owner1@harmaal.io", password=GOOD_PW, role="owner"):
    return await client.post("/auth/register", json={"email": email, "password": password, "role": role})


async def _login(client, email="owner1@harmaal.io", password=GOOD_PW):
    return await client.post("/auth/login", json={"email": email, "password": password})


async def test_register_then_login(client):
    r = await _register(client)
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "owner1@harmaal.io"

    r = await _login(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["access_token"]
    assert body["user"]["role"] == "owner"


async def test_register_rejects_weak_password(client):
    r = await _register(client, password="short")
    assert r.status_code == 422


async def test_login_wrong_password(client):
    await _register(client)
    r = await _login(client, password="WrongPass!234")
    assert r.status_code == 401


async def test_lockout_after_five_failures(client):
    await _register(client)
    for _ in range(5):
        await _login(client, password="WrongPass!234")
    r = await _login(client, password="WrongPass!234")
    assert r.status_code == 423  # locked


async def test_totp_2fa_flow(client):
    await _register(client)
    token = (await _login(client)).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    setup = await client.post("/auth/setup-totp", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["qr_uri"].startswith("otpauth://")

    code = pyotp.TOTP(secret).now()
    confirm = await client.post("/auth/confirm-totp", json={"code": code}, headers=headers)
    assert confirm.status_code == 204, confirm.text

    # Next login now requires the second factor
    login = await _login(client)
    assert login.json()["status"] == "mfa_required"
    mfa_token = login.json()["mfa_token"]

    verify = await client.post(
        "/auth/verify-2fa",
        json={"mfa_token": mfa_token, "code": pyotp.TOTP(secret).now()},
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["access_token"]


async def test_rbac_admin_only_endpoint(client):
    # A tenant has no "admin" permission → 403 on user management
    await _register(client, email="t1@harmaal.io", role="tenant")
    tenant_token = (await _login(client, email="t1@harmaal.io")).json()["access_token"]
    r = await client.get("/auth/users", headers={"Authorization": f"Bearer {tenant_token}"})
    assert r.status_code == 403

    # The seeded root admin can list users
    root = await client.post("/auth/login", json={"email": "admin@harmaal.local", "password": "changeme"})
    admin_token = root.json()["access_token"]
    r = await client.get("/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
