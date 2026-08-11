"""
Guard against names a module never imported.

`NameError` from a missing import does not show up when the app boots, nor in a
test suite that skips without a database — the route imports fine and only
fails when someone opens it. This runs the same check as
`scripts/check_undefined_names.py` inside the suite, so it fails on the way in
rather than in production.
"""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_application_has_no_undefined_names():
    result = subprocess.run(
        [sys.executable, str(BACKEND / "scripts" / "check_undefined_names.py")],
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
