"""hormaal animal feed inventory

Adds the Hormaal Animal Feed schema — a catalogue of feed SKUs (``feed_products``),
the physical lots received against them (``feed_batches``, each carrying its own
landed cost and expiry date), and the append-only quantity ledger
(``feed_stock_movements``).

Also seeds the ``manage_feed`` permission and grants it to the ``admin`` role.
Seeding only reconciles the admin role's permissions on boot, so already-provisioned
databases need this data step (same pattern as 0006).

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PERMISSION = "manage_feed"
_DESCRIPTION = "Manage Hormaal Animal Feed inventory"
_GRANTED_TO = ("admin",)


def upgrade() -> None:
    op.create_table(
        "feed_products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("species", sa.String(length=20), nullable=False),
        sa.Column("feed_type", sa.String(length=30), nullable=False, server_default="pellet"),
        sa.Column("brand", sa.String(length=80), nullable=True),
        sa.Column("unit_size", sa.Float(), nullable=False, server_default="50"),
        sa.Column("unit_of_measure", sa.String(length=10), nullable=False, server_default="kg"),
        sa.Column("package_type", sa.String(length=20), nullable=False, server_default="bag"),
        sa.Column("unit_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("shelf_life_days", sa.Integer(), nullable=False, server_default="180"),
        sa.Column("reorder_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_feed_products_id"), "feed_products", ["id"])
    op.create_index(op.f("ix_feed_products_sku"), "feed_products", ["sku"], unique=True)
    op.create_index(op.f("ix_feed_products_name"), "feed_products", ["name"])
    op.create_index(op.f("ix_feed_products_species"), "feed_products", ["species"])

    op.create_table(
        "feed_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("batch_code", sa.String(length=40), nullable=False),
        sa.Column("quantity_received", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quantity_remaining", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("received_date", sa.String(length=10), nullable=False, server_default=""),
        sa.Column("manufactured_date", sa.String(length=10), nullable=True),
        sa.Column("expiry_date", sa.String(length=10), nullable=True),
        sa.Column("supplier", sa.String(length=120), nullable=True),
        sa.Column("reference", sa.String(length=60), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["feed_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "batch_code", name="uq_feed_batch_product_code"),
        # Database-level backstop on the lot balance. The router enforces both
        # rules, but this is the number the books are built on: a CHECK turns any
        # future bug (or a manual SQL fix-up) into a failed transaction rather
        # than silently wrong inventory.
        sa.CheckConstraint("quantity_remaining >= 0", name="ck_feed_batch_remaining_non_negative"),
        sa.CheckConstraint(
            "quantity_remaining <= quantity_received",
            name="ck_feed_batch_remaining_within_received",
        ),
    )
    op.create_index(op.f("ix_feed_batches_id"), "feed_batches", ["id"])
    op.create_index(op.f("ix_feed_batches_product_id"), "feed_batches", ["product_id"])
    op.create_index(op.f("ix_feed_batches_expiry_date"), "feed_batches", ["expiry_date"])

    op.create_table(
        "feed_stock_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=True),
        sa.Column("movement_type", sa.String(length=20), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("reference", sa.String(length=60), nullable=True),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("occurred_on", sa.String(length=10), nullable=False, server_default=""),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["feed_products.id"], ondelete="CASCADE"),
        # SET NULL, not CASCADE: purging a lot must not erase its sales history.
        sa.ForeignKeyConstraint(["batch_id"], ["feed_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_feed_stock_movements_id"), "feed_stock_movements", ["id"])
    op.create_index(op.f("ix_feed_stock_movements_product_id"), "feed_stock_movements", ["product_id"])
    op.create_index(
        op.f("ix_feed_stock_movements_movement_type"), "feed_stock_movements", ["movement_type"]
    )
    op.create_index(op.f("ix_feed_stock_movements_occurred_on"), "feed_stock_movements", ["occurred_on"])

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO permissions (name, description) VALUES (:name, :description) "
            "ON CONFLICT (name) DO NOTHING"
        ),
        {"name": _PERMISSION, "description": _DESCRIPTION},
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r CROSS JOIN permissions p
            WHERE r.name = ANY(:roles) AND p.name = :perm
            ON CONFLICT DO NOTHING
            """
        ),
        {"roles": list(_GRANTED_TO), "perm": _PERMISSION},
    )


def downgrade() -> None:
    bind = op.get_bind()
    # Drop the grants before the permission row (FK order), then the tables in
    # reverse dependency order.
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE name = :perm)"
        ),
        {"perm": _PERMISSION},
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE name = :perm"), {"perm": _PERMISSION})

    op.drop_index(op.f("ix_feed_stock_movements_occurred_on"), table_name="feed_stock_movements")
    op.drop_index(op.f("ix_feed_stock_movements_movement_type"), table_name="feed_stock_movements")
    op.drop_index(op.f("ix_feed_stock_movements_product_id"), table_name="feed_stock_movements")
    op.drop_index(op.f("ix_feed_stock_movements_id"), table_name="feed_stock_movements")
    op.drop_table("feed_stock_movements")

    op.drop_index(op.f("ix_feed_batches_expiry_date"), table_name="feed_batches")
    op.drop_index(op.f("ix_feed_batches_product_id"), table_name="feed_batches")
    op.drop_index(op.f("ix_feed_batches_id"), table_name="feed_batches")
    op.drop_table("feed_batches")

    op.drop_index(op.f("ix_feed_products_species"), table_name="feed_products")
    op.drop_index(op.f("ix_feed_products_name"), table_name="feed_products")
    op.drop_index(op.f("ix_feed_products_sku"), table_name="feed_products")
    op.drop_index(op.f("ix_feed_products_id"), table_name="feed_products")
    op.drop_table("feed_products")
