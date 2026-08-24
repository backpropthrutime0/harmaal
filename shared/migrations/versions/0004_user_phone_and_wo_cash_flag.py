"""user phone + work-order paid-in-cash flag

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-03
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=30), nullable=True))
    op.add_column(
        "work_orders",
        sa.Column("paid_in_cash", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("work_orders", "paid_in_cash")
    op.drop_column("users", "phone")
