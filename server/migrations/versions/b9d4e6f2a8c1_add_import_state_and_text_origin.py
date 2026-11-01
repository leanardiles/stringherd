"""add import state to project languages and origin to translations

Revision ID: b9d4e6f2a8c1
Revises: d3b8f2a6c1e4
Create Date: 2026-11-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9d4e6f2a8c1'
down_revision: Union[str, Sequence[str], None] = 'd3b8f2a6c1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Record what the admin chose for a language's existing translations, and where each
    translation's text came from (DeepL or the repository)."""
    op.add_column('project_locales', sa.Column('import_mode', sa.String(length=16), nullable=True))
    op.add_column('project_locales', sa.Column('import_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('project_locales', sa.Column('import_finished_at', sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        'ck_project_locales_import_mode',
        'project_locales',
        "import_mode IS NULL OR import_mode IN ('retranslate', 'review', 'reviewed')",
    )
    op.create_check_constraint(
        'ck_project_locales_import_order',
        'project_locales',
        'import_finished_at IS NULL OR import_started_at IS NOT NULL',
    )

    # Every translation so far came from DeepL, so existing rows get 'deepl' from the default.
    op.add_column(
        'translations',
        sa.Column('origin', sa.String(length=16), nullable=False, server_default='deepl'),
    )
    op.add_column('translations', sa.Column('imported_at', sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint('ck_translations_origin', 'translations', "origin IN ('deepl', 'repository')")


def downgrade() -> None:
    """Remove the import state and the origin."""
    op.drop_constraint('ck_translations_origin', 'translations', type_='check')
    op.drop_column('translations', 'imported_at')
    op.drop_column('translations', 'origin')
    op.drop_constraint('ck_project_locales_import_order', 'project_locales', type_='check')
    op.drop_constraint('ck_project_locales_import_mode', 'project_locales', type_='check')
    op.drop_column('project_locales', 'import_finished_at')
    op.drop_column('project_locales', 'import_started_at')
    op.drop_column('project_locales', 'import_mode')
