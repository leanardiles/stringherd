"""add pushed_value to translations

Revision ID: e5f1a7b3c9d2
Revises: c4d8e2f6a1b3
Create Date: 2026-10-06 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f1a7b3c9d2'
down_revision: Union[str, Sequence[str], None] = 'c4d8e2f6a1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Record the last value DeepL Sync delivered, separately from the current (possibly edited) value."""
    op.add_column('translations', sa.Column('pushed_value', sa.Text(), nullable=True))
    # Existing rows came straight from DeepL Sync push and have not been edited in Stringherd,
    # so their current value is what DeepL last delivered.
    op.execute("UPDATE translations SET pushed_value = value WHERE pushed_value IS NULL")


def downgrade() -> None:
    """Remove pushed_value."""
    op.drop_column('translations', 'pushed_value')
