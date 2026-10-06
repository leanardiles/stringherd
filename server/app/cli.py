"""Command-line administration.

    python -m app.cli create-admin --email you@example.com --name "Your Name"
    python -m app.cli set-password --email you@example.com

The password is read from standard input when piped (e.g. from 1Password with `op read`),
otherwise prompted for twice without echo.
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, UserRole
from app.schemas import MIN_PASSWORD_LENGTH
from app.security import end_all_sessions, hash_password


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
        end_all_sessions(db, user.id)
        db.commit()
    return f"Password updated for {email}; existing sessions signed out."


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Stringherd administration")
    commands = parser.add_subparsers(dest="command", required=True)

    admin = commands.add_parser("create-admin", help="Create the first (or another) admin user")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", required=True)

    reset = commands.add_parser("set-password", help="Set a user's password")
    reset.add_argument("--email", required=True)

    args = parser.parse_args(argv)
    password = _read_password()
    if args.command == "create-admin":
        print(create_admin(args.email, args.name, password))
    elif args.command == "set-password":
        print(set_password(args.email, password))


if __name__ == "__main__":
    main()
