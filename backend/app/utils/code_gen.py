from __future__ import annotations

from ..extensions import db


def generate_code(prefix: str, model_class) -> str:
    """Generate a human-readable code like STU001, TRN042, etc."""
    count = db.session.query(model_class).count()
    return f"{prefix}{count + 1:03d}"
