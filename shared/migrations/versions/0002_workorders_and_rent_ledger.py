"""work orders, rent ledger fields, tenant unit/user link

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- tenants: unit + portal-user link ---
    op.add_column("tenants", sa.Column("unit_label", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_tenants_user_id", "tenants", "users", ["user_id"], ["id"])

    # --- payments: monthly rent ledger ---
    op.add_column("payments", sa.Column("period", sa.String(length=7), nullable=False, server_default=""))
    op.add_column("payments", sa.Column("due_date", sa.String(), nullable=False, server_default=""))
    op.add_column("payments", sa.Column("paid_date", sa.String(), nullable=True))
    op.add_column("payments", sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"))
    op.add_column("payments", sa.Column("method", sa.String(length=20), nullable=True))
    # legacy `date` column from 0001 is no longer used; keep it nullable to avoid data loss
    op.alter_column("payments", "date", existing_type=sa.String(), nullable=True)

    # --- work_orders ---
    op.create_table(
        "work_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("unit_label", sa.String(length=20), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("priority", sa.String(length=10), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=15), nullable=False, server_default="open"),
        sa.Column("assigned_to", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("cost", sa.Float(), nullable=True),
        sa.Column("scheduled_for", sa.String(), nullable=True),
        sa.Column("completed_at", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("ix_work_orders_status", "work_orders", ["status"])
    op.create_index("ix_work_orders_assigned_to", "work_orders", ["assigned_to"])

    # --- work_order_messages ---
    op.create_table(
        "work_order_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("author_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("author_role", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
    )
    op.create_index("ix_work_order_messages_work_order_id", "work_order_messages", ["work_order_id"])


def downgrade() -> None:
    op.drop_index("ix_work_order_messages_work_order_id", table_name="work_order_messages")
    op.drop_table("work_order_messages")
    op.drop_index("ix_work_orders_assigned_to", table_name="work_orders")
    op.drop_index("ix_work_orders_status", table_name="work_orders")
    op.drop_table("work_orders")
    op.alter_column("payments", "date", existing_type=sa.String(), nullable=False)
    op.drop_column("payments", "method")
    op.drop_column("payments", "status")
    op.drop_column("payments", "paid_date")
    op.drop_column("payments", "due_date")
    op.drop_column("payments", "period")
    op.drop_constraint("fk_tenants_user_id", "tenants", type_="foreignkey")
    op.drop_column("tenants", "user_id")
    op.drop_column("tenants", "unit_label")