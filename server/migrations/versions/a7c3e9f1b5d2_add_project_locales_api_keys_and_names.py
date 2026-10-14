"""add project names, target locales, project API keys and must_change_password

Revision ID: a7c3e9f1b5d2
Revises: f2a6c8d4e0b7
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3e9f1b5d2'
down_revision: Union[str, Sequence[str], None] = 'f2a6c8d4e0b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Projects become admin-managed: a display name, a list of target languages and their own keys."""
    # Existing projects were created by a push and have no name yet: use the slug.
    op.add_column('projects', sa.Column('name', sa.String(length=200), nullable=True))
    op.execute("UPDATE projects SET name = slug WHERE name IS NULL")
    op.alter_column('projects', 'name', nullable=False)

    op.create_table(
        'project_locales',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('locale', sa.String(length=35), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'locale'),
    )
    # Target languages of existing projects: every language they already have translations in.
    op.execute(
        """
        INSERT INTO project_locales (project_id, locale)
        SELECT DISTINCT k.project_id, t.locale
        FROM translations t JOIN translation_keys k ON k.id = t.key_id
        """
    )

    op.create_table(
        'project_api_keys',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('prefix', sa.String(length=16), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key_hash'),
    )

    op.add_column(
        'users',
        sa.Column('must_change_password', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )


def downgrade() -> None:
    """Remove names, target locales, project keys and must_change_password."""
    op.drop_column('users', 'must_change_password')
    op.drop_table('project_api_keys')
    op.drop_table('project_locales')
    op.drop_column('projects', 'name')
