"""add users, reviewer assignments, sessions and approved_by

Revision ID: f2a6c8d4e0b7
Revises: e5f1a7b3c9d2
Create Date: 2026-10-06 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a6c8d4e0b7'
down_revision: Union[str, Sequence[str], None] = 'e5f1a7b3c9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """People who sign in, what they may review, their sessions, and who approved each translation."""
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('role', sa.Enum('admin', 'reviewer', name='userrole', native_enum=False, length=16), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('admin', 'reviewer')", name='ck_users_role'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_table(
        'reviewer_assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('locale', sa.String(length=35), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'project_id', 'locale'),
    )
    op.create_table(
        'user_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.add_column('translations', sa.Column('approved_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'translations_approved_by_id_fkey', 'translations', 'users', ['approved_by_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    """Remove people, assignments, sessions and approved_by."""
    op.drop_constraint('translations_approved_by_id_fkey', 'translations', type_='foreignkey')
    op.drop_column('translations', 'approved_by_id')
    op.drop_table('user_sessions')
    op.drop_table('reviewer_assignments')
    op.drop_table('users')
