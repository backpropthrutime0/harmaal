"""restrict view_business to the admin role

Revokes the ``view_business`` permission from the ``manager`` and ``owner`` roles
so analytics and financial data are admin-only. Seeding no longer re-applies role
permission defaults to existing roles (admins own them via /people), so this data
migration is what moves already-provisioned databases.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REVOKED_FROM = ("manager", "owner")
_PERMISSION = "view_business"


def _statement(verb: str) -> sa.TextClause:
    """DELETE/INSERT the role_permissions rows joining the roles to the permission."""
    if verb == "delete":
        return sa.text(
            """
            DELETE FROM role_permissions
            WHERE role_id IN (SELECT id FROM roles WHERE name = ANY(:roles))
              AND permission_id IN (SELECT id FROM permissions WHERE name = :perm)
            """
        )
    return sa.text(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
        WHERE r.name = ANY(:roles) AND p.name = :perm
        ON CONFLICT DO NOTHING
        """
    )


def upgrade() -> None:
    op.get_bind().execute(_statement("delete"), {"roles": list(_REVOKED_FROM), "perm": _PERMISSION})


def downgrade() -> None:
    op.get_bind().execute(_statement("insert"), {"roles": list(_REVOKED_FROM), "perm": _PERMISSION})
