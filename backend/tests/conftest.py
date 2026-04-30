import os
import sys
from pathlib import Path

import pytest
from sqlalchemy.exc import OperationalError


TEST_DATABASE_URL_DEFAULT = "postgresql+psycopg://dev:dev_pass@localhost:5432/tvet_test"


# Make sure `Backend/` is importable as the project root (so `import app` works).
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return os.getenv("TEST_DATABASE_URL", TEST_DATABASE_URL_DEFAULT)


@pytest.fixture()
def app(monkeypatch, test_database_url):
    # Force the app to use the test database.
    monkeypatch.setenv("DATABASE_URL", test_database_url)

    from app import create_app
    from app.extensions import db

    flask_app = create_app()
    flask_app.config.update(TESTING=True)

    with flask_app.app_context():
        # If Postgres isn't running / DB doesn't exist, skip cleanly.
        try:
            db.engine.connect().close()
        except OperationalError as exc:
            pytest.skip(f"Cannot connect to test database: {exc}")

        db.drop_all()
        db.create_all()

    yield flask_app

    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()
