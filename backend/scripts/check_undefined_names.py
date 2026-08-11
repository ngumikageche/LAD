#!/usr/bin/env python3
"""
Fail on any undefined name in the application package.

A name a module never imported is invisible until the line runs — the app
imports cleanly, the test suite passes, and the route raises `NameError` in
production the first time someone opens it. That is exactly how a missing
`subject_statistics` import reached the trainer subjects endpoint.

Run before deploying:

    venv/bin/python scripts/check_undefined_names.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

# Endpoints that reference a helper which does not exist anywhere in the tree.
# They are broken independently of imports — they query `Assessment.student_id`
# and `Assessment.score`, neither of which the model has — and nothing in the
# dashboard calls them. Listed here so the check stays useful rather than
# permanently red; delete the entry when the endpoints are rewritten or removed.
KNOWN_BROKEN = {
    "app/routes/scores.py": {"_assessment_payload"},
}


def main() -> int:
    result = subprocess.run(
        [sys.executable, "-m", "pyflakes", "app"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )

    failures = []
    for line in result.stdout.splitlines():
        if "undefined name" not in line:
            continue
        location, _, message = line.partition(": ")
        path = location.split(":")[0]
        name = message.split("'")[1] if "'" in message else ""
        if name in KNOWN_BROKEN.get(path, set()):
            continue
        failures.append(line)

    if failures:
        print("Undefined names found — these raise NameError at runtime:\n")
        for line in failures:
            print(f"  {line}")
        return 1

    print("No undefined names.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
