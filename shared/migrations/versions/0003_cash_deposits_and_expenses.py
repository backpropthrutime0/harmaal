"""cash-drawer deposit tracking on payments + expenses table

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-01
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- payments: cash-drawer deposit tracking ---
    op.add_column(
        "payments",
        sa.Column("deposited", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("payments", sa.Column("deposited_date", sa.String(), nullable=True))

    # --- expenses ---
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False, server_default="general"),
        sa.Column("period", sa.String(length=7), nullable=False, server_default=""),
        sa.Column("spent_date", sa.String(), nullable=False, server_default=""),
        sa.Column("paid_in_cash", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("ix_expenses_period", "expenses", ["period"])


def downgrade() -> None:
    op.drop_index("ix_expenses_period", table_name="expenses")
    op.drop_table("expenses")
    op.drop_column("payments", "deposited_date")
    op.drop_column("payments", "deposited")
