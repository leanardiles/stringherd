"""add source_locale to projects and source_commit to translation_keys

Revision ID: c4d8e2f6a1b3
Revises: b7e3c9a1d2f4
Create Date: 2026-10-06 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d8e2f6a1b3'
down_revision: Union[str, Sequence[str], None] = 'b7e3c9a1d2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Record the project's source locale and the commit each source string came from."""
    op.add_column('projects', sa.Column('source_locale', sa.String(length=35), nullable=True))
    op.add_column('translation_keys', sa.Column('source_commit', sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Remove source_locale and source_commit."""
    op.drop_column('translation_keys', 'source_commit')
    op.drop_column('projects', 'source_locale')
