"""add source_file to translation_keys

Revision ID: b7e3c9a1d2f4
Revises: 04bc283dd5e6
Create Date: 2026-10-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e3c9a1d2f4'
down_revision: Union[str, Sequence[str], None] = '04bc283dd5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the optional catalog file path a source string came from."""
    op.add_column('translation_keys', sa.Column('source_file', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Remove the catalog file path column."""
    op.drop_column('translation_keys', 'source_file')
