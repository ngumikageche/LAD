import argparse
import sys
from pathlib import Path

from werkzeug.security import generate_password_hash

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from app.extensions import db
from app.models.role_permission import RolePermission
from app.models.user import User


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a super admin user.")
    parser.add_argument("--name", default="Super Admin", help="Display name for the user.")
    parser.add_argument("--email", default="admin@lad.com", help="Email address for the user.")
    parser.add_argument("--password", required=True, help="Password for the user.")
    parser.add_argument("--phone", default=None, help="Optional phone number.")
    parser.add_argument(
        "--role-name",
        default="Super Admin",
        help="Role name to use or create for this user.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app = create_app()

    with app.app_context():
        role = (
            db.session.query(RolePermission)
            .filter(RolePermission.role_name == args.role_name)
            .first()
        )
        if not role:
            role = RolePermission(role_name=args.role_name, permissions={"*": True})
            db.session.add(role)
            db.session.commit()

        existing = (
            db.session.query(User)
            .filter(User.email == args.email.strip().lower())
            .first()
        )
        if existing:
            print(f"User already exists: {existing.email}")
            return

        user = User(
            name=args.name.strip(),
            email=args.email.strip().lower(),
            phone=args.phone.strip() if isinstance(args.phone, str) and args.phone.strip() else None,
            password_hash=generate_password_hash(args.password),
            role_id=role.id,
            institution_id=None,
        )

        db.session.add(user)
        db.session.commit()
        print(f"Created super admin: {user.email}")


if __name__ == "__main__":
    main()
