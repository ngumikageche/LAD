import argparse
import runpy
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
TARGET_SCRIPT = BACKEND_DIR / "scripts" / "seed_random_users.py"


def parse_args() -> tuple[argparse.Namespace, list[str]]:
    parser = argparse.ArgumentParser(
        description="Repo-root entrypoint for backend/scripts/seed_random_users.py."
    )
    parser.add_argument(
        "--email-domain",
        default="larim.co.ke",
        help="Email domain for generated accounts. Defaults to larim.co.ke.",
    )
    known_args, passthrough = parser.parse_known_args()
    return known_args, passthrough


def main() -> None:
    known_args, passthrough = parse_args()

    forwarded_args = list(passthrough)
    if not any(arg == "--email-domain" or arg.startswith("--email-domain=") for arg in forwarded_args):
        forwarded_args = ["--email-domain", known_args.email_domain, *forwarded_args]

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    sys.argv = [str(TARGET_SCRIPT), *forwarded_args]
    runpy.run_path(str(TARGET_SCRIPT), run_name="__main__")


if __name__ == "__main__":
    main()
