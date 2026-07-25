from __future__ import annotations

from ..extensions import db


def generate_code(prefix: str, model_class, width: int = 3) -> str:
    """Generate a human-readable code like STU001, TRN042, etc.

    Numbering continues from the highest existing code rather than the row
    count, so deleting a record never causes the next insert to reuse a code
    that is already taken (codes carry a unique constraint).
    """
    taken = {
        code
        for (code,) in db.session.query(model_class.code).filter(model_class.code.isnot(None))
        if code
    }
    # Codes generated earlier in this session may not be flushed yet; SQLAlchemy
    # fires before_insert for every object before emitting the INSERTs.
    reserved = db.session.info.setdefault("_generated_codes", set())
    taken |= reserved

    highest = 0
    for code in taken:
        if not code.startswith(prefix):
            continue
        suffix = code[len(prefix):]
        if suffix.isdigit():
            highest = max(highest, int(suffix))

    number = highest + 1
    code = f"{prefix}{number:0{width}d}"
    while code in taken:
        number += 1
        code = f"{prefix}{number:0{width}d}"

    reserved.add(code)
    return code
