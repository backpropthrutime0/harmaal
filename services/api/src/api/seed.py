"""Idempotent seeding of RBAC roles/permissions and the root admin user.

Runs on app startup. Safe to call repeatedly — it only creates what's missing.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.config import settings
from api.internal.auth import hash_password
from api.models.orm import Permission, Role, User

# permission name -> description
PERMISSIONS: dict[str, str] = {
    "admin": "Full IAM / user management",
    "manage_staff": "Create and manage staff employees (non-admin roles)",
    "manage_properties": "Create, update, and delete properties",
    "manage_tenants": "Manage tenants and collect rent",
    "view_business": "View business intelligence summary",
    "manage_maintenance": "View and update maintenance work orders",
    "manage_feed": "Manage Hormaal Animal Feed inventory",
}

# role name -> permission names
# Staff access portal roles: admin, manager (management employees), maintenance.
# owner/tenant remain for self-registration and the tenant portal.
# manage_staff lets managers onboard employees; admins keep full IAM via "admin".
#
# "view_business" (analytics + financial data) is deliberately ADMIN-ONLY: managers
# and owners run day-to-day operations via manage_properties/manage_tenants, but
# business intelligence is restricted. Admins can grant it to another role at
# runtime from /people — see the seeding note below.
#
# "manage_feed" gates the Hormaal Animal Feed console (a sibling Hormaal Group
# company sharing this identity store). It is likewise admin-only by default,
# matching that product's admin-only sign-in page; an admin can grant it to a
# dedicated feed-operator role from /people without a code change.
ROLES: dict[str, list[str]] = {
    "admin": [
        "admin",
        "manage_staff",
        "manage_properties",
        "manage_tenants",
        "view_business",
        "manage_maintenance",
        "manage_feed",
    ],
    "manager": [
        "manage_staff",
        "manage_properties",
        "manage_tenants",
        "manage_maintenance",
    ],
    "maintenance": ["manage_maintenance"],
    "owner": ["manage_properties", "manage_tenants"],
    "tenant": [],
}

# The ROLES map above is a *bootstrap default*, not a source of truth. Once a role
# row exists, its permissions are owned by the admin UI (PUT /auth/roles/{id}/permissions)
# and seeding leaves them alone — otherwise every restart would silently undo an
# admin's grants/revocations. The sole exception is the "admin" role, which is always
# reconciled to hold every permission so a new permission can never lock admins out.
_ALWAYS_FULL_ACCESS_ROLE = "admin"


async def seed(session: AsyncSession) -> None:
    # Permissions
    perms: dict[str, Permission] = {}
    for name, desc in PERMISSIONS.items():
        perm = (await session.execute(select(Permission).where(Permission.name == name))).scalar_one_or_none()
        if not perm:
            perm = Permission(name=name, description=desc)
            session.add(perm)
        perms[name] = perm
    await session.flush()

    # Roles (eager-load permissions so reassignment doesn't trigger async lazy IO)
    for name, perm_names in ROLES.items():
        role = (
            await session.execute(
                select(Role).options(selectinload(Role.permissions)).where(Role.name == name)
            )
        ).scalar_one_or_none()
        if not role:
            role = Role(name=name, description=f"{name} role", is_system=True)
            session.add(role)
            role.permissions = [perms[p] for p in perm_names]
        elif name == _ALWAYS_FULL_ACCESS_ROLE:
            # Never let an admin lock themselves out of a newly added permission.
            role.permissions = list(perms.values())
        # Any other existing role keeps whatever an admin configured in the UI.
    await session.flush()

    # Root admin
    root = (
        await session.execute(select(User).where(User.email == settings.root_email.lower()))
    ).scalar_one_or_none()
    if not root:
        admin_role = (await session.execute(select(Role).where(Role.name == "admin"))).scalar_one()
        root = User(
            email=settings.root_email.lower(),
            hashed_password=hash_password(settings.root_password),
            role="admin",
            display_name="Root Admin",
            is_system=True,
            must_change_password=(settings.root_password == "changeme"),
            password_changed_at=datetime.now(UTC),
        )
        root.roles = [admin_role]
        session.add(root)

    await session.commit()
