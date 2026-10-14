"""add delivered status, delivered snapshot on translations, and deliveries

Revision ID: d3b8f2a6c1e4
Revises: a7c3e9f1b5d2
Create Date: 2026-10-14 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3b8f2a6c1e4'
down_revision: Union[str, Sequence[str], None] = 'a7c3e9f1b5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Pull exports only delivered strings. Strings approved before this change count as delivered,
    so the next `deepl sync pull` returns the same as the last one."""
    op.add_column('translations', sa.Column('delivered_value', sa.Text(), nullable=True))
    op.add_column('translations', sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'translations',
        sa.Column(
            'delivered_by_id',
            sa.Integer(),
            sa.ForeignKey('users.id', name='translations_delivered_by_id_fkey', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.drop_constraint('ck_translations_status', 'translations', type_='check')
    op.create_check_constraint(
        'ck_translations_status', 'translations', "status IN ('machine_translated', 'approved', 'delivered')"
    )
    op.execute(
        "UPDATE translations SET status = 'delivered', delivered_value = value, "
        "delivered_at = COALESCE(approved_at, updated_at), delivered_by_id = approved_by_id "
        "WHERE status = 'approved'"
    )

    op.create_table(
        'deliveries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('locale', sa.String(length=35), nullable=False),
        sa.Column('delivered_by_id', sa.Integer(), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('strings', sa.Integer(), nullable=False),
        sa.Column('not_approved', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['delivered_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Delivered strings become approved again (the old meaning of pullable); the snapshot is dropped."""
    op.drop_table('deliveries')
    op.execute("UPDATE translations SET status = 'approved' WHERE status = 'delivered'")
    op.drop_constraint('ck_translations_status', 'translations', type_='check')
    op.create_check_constraint('ck_translations_status', 'translations', "status IN ('machine_translated', 'approved')")
    op.drop_constraint('translations_delivered_by_id_fkey', 'translations', type_='foreignkey')
    op.drop_column('translations', 'delivered_by_id')
    op.drop_column('translations', 'delivered_at')
    op.drop_column('translations', 'delivered_value')
