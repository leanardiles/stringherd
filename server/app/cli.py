"""Command-line administration.

    python -m app.cli create-admin --email you@example.com --name "Your Name"
    python -m app.cli set-password --email you@example.com
    python -m app.cli seed-demo
    python -m app.cli reset-language --project fitjournal --locale fr [--dry-run]
    python -m app.cli remove-language --project fitjournal --locale nl [--dry-run]

The password is read from standard input when piped (e.g. from 1Password with `op read`),
otherwise prompted for twice without echo. seed-demo needs no password: it fills an empty
database with the Trailhead demo project and prints the demo sign-ins. reset-language puts one
language of a project back to DeepL's machine translation, every string to review; it shows what
will change and asks to type the language code before changing anything. remove-language
removes a language from a project with its translations, assignments and delivery history, after
the same kind of confirmation.
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app import demo
from app.db import SessionLocal
from app.models import User, UserRole
from app.schemas import MIN_PASSWORD_LENGTH
from app.security import end_all_sessions, hash_password
from app.services.delivery import reset_language as reset_language_service
from app.services.projects import get_project
from app.services.projects import remove_language as remove_language_service


def _read_password() -> str:
    if not sys.stdin.isatty():
        password = sys.stdin.readline().rstrip("\r\n")
    else:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Repeat password: ") != password:
            sys.exit("Passwords do not match.")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    return password


def create_admin(email: str, name: str, password: str) -> str:
    email = email.strip().lower()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)):
            return f"A user with email {email} already exists. Use set-password to change the password."
        db.add(User(email=email, name=name, role=UserRole.ADMIN, password_hash=hash_password(password), is_active=True))
        db.commit()
    return f"Admin {email} created."


def set_password(email: str, password: str) -> str:
    email = email.strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            return f"No user with email {email}."
        user.password_hash = hash_password(password)
        user.must_change_password = False  # set by the server operator, not temporary
        end_all_sessions(db, user.id)
        db.commit()
    return f"Password updated for {email}; existing sessions signed out."


def seed_demo() -> str:
    with SessionLocal() as db:
        try:
            summary = demo.seed_demo(db)
        except demo.DatabaseNotEmptyError:
            return "The database already has users or projects; seed-demo only fills an empty one. Nothing changed."
    languages = ", ".join(summary.languages)
    return (
        f"Demo project Trailhead created: {summary.strings} strings in {languages}.\n"
        f"Sign in as {demo.ADMIN_EMAIL} or {demo.REVIEWER_EMAIL}, password {demo.DEMO_PASSWORD}"
    )


def reset_language(
    slug: str, locale: str, *, dry_run: bool, confirm=input, session_factory=SessionLocal
) -> str:
    with session_factory() as db:
        project = get_project(db, slug)
        if project is None:
            return f"No project {slug}. Nothing changed."
        plan = reset_language_service(db, project, locale, apply=False)
        if plan.total == 0:
            return f"Project {slug} has no strings in {locale}. Nothing changed."
        lines = [
            f"Project {slug}, language {locale}: {plan.total} strings.",
            f"  {plan.delivered} delivered, {plan.approved} approved, {plan.edited} edited by a reviewer",
            f"  {plan.already_machine} already to review with DeepL's text",
        ]
        if plan.without_original:
            lines.append(
                f"  {len(plan.without_original)} without DeepL's text on record, left as they are: "
                + ", ".join(plan.without_original)
            )
        lines.append(
            f"Reset: {plan.changing} strings go back to {_arrived_with(plan)}, to review. Nothing is pullable "
            "until the next Deliver, so the repository keeps what it has."
        )
        print("\n".join(lines))
        if dry_run:
            return "Dry run: nothing changed."
        if plan.changing == 0:
            return "Nothing to change."
        if confirm(f"Type {locale} to reset: ").strip() != locale:
            return "Nothing changed."
        done = reset_language_service(db, project, locale, apply=True)
    return f"Done: {done.changing} strings of {locale} are back to {_arrived_with(done)}, to review."


def _arrived_with(plan) -> str:
    """DeepL's text, or for imported strings the repository's: the text each string arrived with."""
    if not plan.imported:
        return "DeepL's text"
    return f"the text they arrived with ({plan.imported} imported from the repository)"


def remove_language(slug: str, locale: str, *, dry_run: bool, confirm=input, session_factory=SessionLocal) -> str:
    with session_factory() as db:
        project = get_project(db, slug)
        if project is None:
            return f"No project {slug}. Nothing changed."
        plan = remove_language_service(db, project, locale, apply=False)
        if not plan.listed and not plan.strings:
            return f"Project {slug} has no language {locale}. Nothing changed."
        print(
            "\n".join(
                [
                    f"Project {slug}, language {locale}: {plan.strings} strings "
                    f"({plan.delivered} delivered, {plan.approved} approved, "
                    f"{plan.imported} imported from the repository).",
                    f"  {plan.assignments} reviewer assignments, {plan.deliveries} past deliveries.",
                    "Remove: the language and all of the above. The keys stay, since every language shares "
                    f"them; the repository is not touched (restore its {locale} files there with git if needed).",
                ]
            )
        )
        if dry_run:
            return "Dry run: nothing changed."
        if confirm(f"Type {locale} to remove: ").strip() != locale:
            return "Nothing changed."
        remove_language_service(db, project, locale, apply=True)
    return f"Done: {locale} is removed from {slug}."


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Stringherd administration")
    commands = parser.add_subparsers(dest="command", required=True)

    admin = commands.add_parser("create-admin", help="Create the first (or another) admin user")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", required=True)

    reset = commands.add_parser("set-password", help="Set a user's password")
    reset.add_argument("--email", required=True)

    commands.add_parser("seed-demo", help="Fill an empty database with the Trailhead demo project")

    language = commands.add_parser(
        "reset-language", help="Put a language back to DeepL's machine translation, every string to review"
    )
    language.add_argument("--project", required=True, help="The project id (tms.project_id)")
    language.add_argument("--locale", required=True, help="The language code, e.g. fr")
    language.add_argument("--dry-run", action="store_true", help="Show what would change, change nothing")

    removal = commands.add_parser(
        "remove-language", help="Remove a language from a project, with its translations and history"
    )
    removal.add_argument("--project", required=True, help="The project id (tms.project_id)")
    removal.add_argument("--locale", required=True, help="The language code, e.g. nl")
    removal.add_argument("--dry-run", action="store_true", help="Show what would be removed, change nothing")

    args = parser.parse_args(argv)
    if args.command == "seed-demo":
        print(seed_demo())
        return
    if args.command == "reset-language":
        print(reset_language(args.project, args.locale, dry_run=args.dry_run))
        return
    if args.command == "remove-language":
        print(remove_language(args.project, args.locale, dry_run=args.dry_run))
        return
    password = _read_password()
    if args.command == "create-admin":
        print(create_admin(args.email, args.name, password))
    elif args.command == "set-password":
        print(set_password(args.email, password))


if __name__ == "__main__":
    main()
