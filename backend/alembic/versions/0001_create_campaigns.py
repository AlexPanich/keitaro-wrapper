"""начальная схема: журнал кампаний, известные офферы потоков и черновики

Revision ID: 0001
Revises:
Create Date: 2026-11-13
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("keitaro_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("alias", sa.String(255), nullable=True),
        sa.Column("geo", postgresql.ARRAY(sa.String(2)), nullable=False),
        sa.Column("initial_offer_id", sa.Integer(), nullable=False),
        sa.Column("domain_id", sa.Integer(), nullable=True),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("traffic_source_id", sa.Integer(), nullable=True),
        sa.Column("geo_stream_id", sa.Integer(), nullable=False),
        sa.Column("offer_stream_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campaigns_keitaro_id", "campaigns", ["keitaro_id"], unique=True)

    # Таблицы редактора без FK на campaigns: редактор работает с любой кампанией Keitaro.
    op.create_table(
        "stream_offers",
        sa.Column("stream_id", sa.Integer(), nullable=False, autoincrement=False),
        sa.Column("offer_id", sa.Integer(), nullable=False, autoincrement=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("published", sa.Boolean(), server_default="false", nullable=False),
        sa.PrimaryKeyConstraint("stream_id", "offer_id"),
    )
    op.create_table(
        "stream_drafts",
        sa.Column("stream_id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("stream_name", sa.String(), server_default="", nullable=False),
        sa.Column("offers", sa.JSON(), nullable=False),
        sa.Column("base_offers", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("stream_drafts")
    op.drop_table("stream_offers")
    op.drop_index("ix_campaigns_keitaro_id", table_name="campaigns")
    op.drop_table("campaigns")
