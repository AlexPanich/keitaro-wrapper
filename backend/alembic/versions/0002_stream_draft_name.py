"""имя потока в черновике — для сообщения о потоке, удалённом в Keitaro

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-16
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("stream_drafts", sa.Column("stream_name", sa.String(), server_default="", nullable=False))


def downgrade() -> None:
    op.drop_column("stream_drafts", "stream_name")
