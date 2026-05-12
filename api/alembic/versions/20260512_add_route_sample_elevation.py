"""Add elevation and grade to route samples.

Revision ID: 20260512_elevation_grade
Revises:
Create Date: 2026-05-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260512_elevation_grade"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("route_samples", sa.Column("elevation_m", sa.Float(), nullable=True))
    op.add_column("route_samples", sa.Column("grade_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("route_samples", "grade_pct")
    op.drop_column("route_samples", "elevation_m")
