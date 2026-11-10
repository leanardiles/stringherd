"""Demo data: a small fictional hiking app, Trailhead, translated into French and Latin American
Spanish, with strings in every state the review screen shows.

Used by `python -m app.cli seed-demo`, which the Docker setup runs on its first start. It only
fills an empty database, so demo accounts can never end up next to real ones. It goes through
the same functions as real data (projects, source upload, Deliver), so it follows the same rules.

The hosted demo (DEMO_MODE) also resets to this data on a schedule (`reset_demo`), and keeps its
two accounts out of reach of visitors (`is_demo_account`).
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import Base
from app.models import (
    Project,
    ReviewerAssignment,
    Translation,
    TranslationKey,
    TranslationStatus,
    User,
    UserRole,
)
from app.security import hash_password
from app.services.delivery import deliver
from app.services.projects import create_project
from app.services.source import store_source_strings

PROJECT_SLUG = "trailhead"
SOURCE_FILE = "src/locales/en/common.json"
# Reserved for documentation by RFC 2606: it can never belong to anyone, so a demo address
# never reaches a real inbox once Stringherd sends email.
ADMIN_EMAIL = "admin@trailhead.example"
REVIEWER_EMAIL = "reviewer@trailhead.example"
# Printed by seed-demo and documented. The Docker setup only listens on 127.0.0.1. The hosted
# demo signs visitors in with one click instead, so they never need it.
DEMO_PASSWORD = "trailhead-demo"
DEMO_ACCOUNTS = {"admin": ADMIN_EMAIL, "reviewer": REVIEWER_EMAIL}
# When the hosted demo resets, in UTC. vercel.json schedules the reset at these hours (a test
# keeps the two in step), and the banner tells visitors.
RESET_HOURS_UTC = (7, 19)

SOURCE = {
    "nav.home": "Home",
    "nav.trails": "Trails",
    "nav.saved": "Saved",
    "nav.settings": "Settings",
    "auth.signIn": "Sign in",
    "auth.welcome": "Welcome back, {{name}}!",
    "trails.title": "Trails near you",
    "trails.count_one": "{{count}} trail",
    "trails.count_other": "{{count}} trails",
    "trails.distance": "{{distance}} km",
    "trails.difficulty.easy": "Easy",
    "trails.difficulty.moderate": "Moderate",
    "trails.difficulty.hard": "Hard",
    "trails.empty": "No trails found. Try a wider search area.",
    "trail.start": "Start hike",
    "trail.save": "Save trail",
    "trail.share": "Join me on the {{trail}} trail this weekend?",
    "trail.elevation": "Elevation gain: {{meters}} m",
    "settings.units": "Distance units",
    "settings.save": "Save changes",
    "settings.saved": "Your changes have been saved.",
    "errors.network": "Can't connect. Check your internet connection and try again.",
}

# What DeepL delivered. Two French strings carry deliberate problems for the quality checks:
# auth.welcome drops {{name}} (an error: it cannot be approved) and settings.saved drops the
# final period (a warning).
MACHINE = {
    "fr": {
        "nav.home": "Accueil",
        "nav.trails": "Pistes",
        "nav.saved": "Enregistrés",
        "nav.settings": "Paramètres",
        "auth.signIn": "Se connecter",
        "auth.welcome": "Bon retour !",
        "trails.title": "Sentiers à proximité",
        "trails.count_one": "{{count}} sentier",
        "trails.count_other": "{{count}} sentiers",
        "trails.distance": "{{distance}} km",
        "trails.difficulty.easy": "Facile",
        "trails.difficulty.moderate": "Modéré",
        "trails.difficulty.hard": "Difficile",
        "trails.empty": "Aucun sentier trouvé. Essayez d'élargir la zone de recherche.",
        "trail.start": "Commencer la randonnée",
        "trail.save": "Enregistrer le sentier",
        "trail.share": "Tu viens avec moi sur le sentier {{trail}} ce week-end ?",
        "trail.elevation": "Dénivelé positif : {{meters}} m",
        "settings.units": "Unités de distance",
        "settings.save": "Enregistrer les modifications",
        "settings.saved": "Vos modifications ont été enregistrées",
        "errors.network": "Connexion impossible. Vérifiez votre connexion Internet et réessayez.",
    },
    "es-419": {
        "nav.home": "Inicio",
        "nav.trails": "Senderos",
        "nav.saved": "Guardados",
        "nav.settings": "Configuración",
        "auth.signIn": "Iniciar sesión",
        "auth.welcome": "¡Hola de nuevo, {{name}}!",
        "trails.title": "Senderos cerca de ti",
        "trails.count_one": "{{count}} sendero",
        "trails.count_other": "{{count}} senderos",
        "trails.distance": "{{distance}} km",
        "trails.difficulty.easy": "Fácil",
        "trails.difficulty.moderate": "Moderado",
        "trails.difficulty.hard": "Difícil",
        "trails.empty": "No se encontraron senderos. Prueba con un área de búsqueda más amplia.",
        "trail.start": "Comenzar caminata",
        "trail.save": "Guardar sendero",
        "trail.share": "¿Me acompañas al sendero {{trail}} este fin de semana?",
        "trail.elevation": "Desnivel positivo: {{meters}} m",
        "settings.units": "Unidades de distancia",
        "settings.save": "Guardar cambios",
        "settings.saved": "Se guardaron tus cambios.",
        "errors.network": "No se puede conectar. Revisa tu conexión a internet y vuelve a intentarlo.",
    },
}

# French has a review session behind it: these were approved and delivered...
FR_DELIVERED = ["nav.home", "nav.saved", "nav.settings", "auth.signIn"]
# ...and these are approved since, waiting for the next Deliver. nav.trails was edited by the
# reviewer, so the editor shows a word diff against DeepL's suggestion.
FR_APPROVED = ["nav.trails", "trails.count_one", "trails.count_other"]
FR_EDITS = {"nav.trails": "Sentiers"}
# Spanish has just arrived from DeepL: everything is still to review.


class DatabaseNotEmptyError(Exception):
    """seed-demo only fills an empty database."""


class NotDemoDatabaseError(Exception):
    """The reset only empties a database that holds the demo: its admin account must be there."""


@dataclass
class DemoSummary:
    strings: int
    languages: list[str]


def is_empty(db: Session) -> bool:
    return not db.scalar(select(func.count()).select_from(User)) and not db.scalar(
        select(func.count()).select_from(Project)
    )


def seed_demo(db: Session) -> DemoSummary:
    """Create the Trailhead project with its people and translations. Raises if any user or
    project exists already."""
    if not is_empty(db):
        raise DatabaseNotEmptyError()

    admin = User(
        email=ADMIN_EMAIL,
        name="Demo Admin",
        role=UserRole.ADMIN,
        password_hash=hash_password(DEMO_PASSWORD),
    )
    reviewer = User(
        email=REVIEWER_EMAIL,
        name="Demo Reviewer",
        role=UserRole.REVIEWER,
        password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add_all([admin, reviewer])

    languages = list(MACHINE)
    project = create_project(
        db,
        slug=PROJECT_SLUG,
        name="Trailhead",
        source_locale="en",
        target_locales=languages,
    )
    db.add_all([ReviewerAssignment(user=reviewer, project_id=project.id, locale=locale) for locale in languages])
    store_source_strings(db, project, "en", SOURCE, file=SOURCE_FILE)  # commits

    keys = {
        key.key_path: key for key in db.scalars(select(TranslationKey).where(TranslationKey.project_id == project.id))
    }
    translations: dict[tuple[str, str], Translation] = {}
    for locale, values in MACHINE.items():
        for key_path, value in values.items():
            translation = Translation(
                key_id=keys[key_path].id,
                locale=locale,
                value=value,
                pushed_value=value,
                status=TranslationStatus.MACHINE_TRANSLATED,
            )
            translations[(locale, key_path)] = translation
            db.add(translation)

    def approve(key_path: str) -> None:
        translation = translations[("fr", key_path)]
        translation.value = FR_EDITS.get(key_path, translation.value)
        translation.status = TranslationStatus.APPROVED
        translation.approved_at = datetime.now(UTC)
        translation.approved_by_id = reviewer.id

    db.flush()
    for key_path in FR_DELIVERED:
        approve(key_path)
    db.commit()
    deliver(db, project, "fr", reviewer)  # commits
    for key_path in FR_APPROVED:
        approve(key_path)
    db.commit()

    return DemoSummary(strings=len(SOURCE), languages=languages)


def is_demo_account(user: User) -> bool:
    """One of the two Trailhead accounts on the hosted demo, which visitors share and cannot change."""
    return get_settings().demo_mode and user.email in DEMO_ACCOUNTS.values()


def reset_demo(db: Session) -> DemoSummary:
    """Empty every Stringherd table and seed the demo again.

    Refuses unless the demo's admin account exists: a database with real data never has it, so
    it cannot be emptied even if DEMO_MODE were set on it by mistake. The migration record
    (alembic_version) is not a Stringherd table and stays.
    """
    if db.scalar(select(User.id).where(User.email == ADMIN_EMAIL)) is None:
        raise NotDemoDatabaseError()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    return seed_demo(db)
