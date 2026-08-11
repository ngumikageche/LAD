import os
from pathlib import Path
from dotenv import load_dotenv


# Load /Backend/.env
BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]

    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/lad_db",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    CORS_ORIGINS = _parse_cors_origins(
        os.getenv(
            "CORS_ORIGINS",
            "https://larim.co.ke,https://www.larim.co.ke"
        )
    )
    MAX_CONTENT_LENGTH = int(
        os.getenv("MAX_CONTENT_LENGTH", str(25 * 1024 * 1024))
    )

    # Analytics results are memoized for a minute. The default in-process cache
    # is per-worker, so with N workers a given result is still recomputed up to
    # N times and every deploy starts cold. Point REDIS_URL at a Redis instance
    # to share one cache across workers; without it the behaviour is unchanged.
    CACHE_TYPE = os.getenv("CACHE_TYPE") or ("RedisCache" if os.getenv("REDIS_URL") else "SimpleCache")
    CACHE_REDIS_URL = os.getenv("REDIS_URL")
    CACHE_DEFAULT_TIMEOUT = int(os.getenv("CACHE_DEFAULT_TIMEOUT", "60"))
    # Bounds the in-process fallback so a long-running worker cannot grow
    # without limit.
    CACHE_THRESHOLD = int(os.getenv("CACHE_THRESHOLD", "1000"))
    CACHE_KEY_PREFIX = os.getenv("CACHE_KEY_PREFIX", "lad:")
    SMTP_HOST = os.getenv("SMTP_HOST")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
    SMTP_FROM = os.getenv("SMTP_FROM")
    SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() in {"1", "true", "yes"}
    SMS_WEBHOOK_URL = os.getenv("SMS_WEBHOOK_URL")
    SMS_API_KEY = os.getenv("SMS_API_KEY")
    SMS_SENDER_ID = os.getenv("SMS_SENDER_ID")
