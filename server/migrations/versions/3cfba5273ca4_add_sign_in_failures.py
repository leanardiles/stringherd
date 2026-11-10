"""add sign-in failures

Revision ID: 3cfba5273ca4
Revises: b9d4e6f2a8c1
Create Date: 2026-11-10 12:30:30.194355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3cfba5273ca4'
down_revision: Union[str, Sequence[str], None] = 'b9d4e6f2a8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Record failed password sign-ins, to limit how often passwords can be tried."""
    op.create_table(
        'sign_in_failures',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('address', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sign_in_failures_address'), 'sign_in_failures', ['address'], unique=False)
    op.create_index(op.f('ix_sign_in_failures_created_at'), 'sign_in_failures', ['created_at'], unique=False)
    op.create_index(op.f('ix_sign_in_failures_email'), 'sign_in_failures', ['email'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sign_in_failures_email'), table_name='sign_in_failures')
    op.drop_index(op.f('ix_sign_in_failures_created_at'), table_name='sign_in_failures')
    op.drop_index(op.f('ix_sign_in_failures_address'), table_name='sign_in_failures')
    op.drop_table('sign_in_failures')
