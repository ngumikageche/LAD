"""
Every report the backend gates must be grantable from the Roles screen.

A key the API enforces but the editor never renders is a permission nobody can
give: the screen returns 403 for every non-admin, and there is no checkbox to
tick that would fix it. That is how the fee reports ended up admin-only —
silently, and only discoverable by reading both sides at once.
"""

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROLES_PAGE = BACKEND.parent / "dashboard" / "src" / "pages" / "RolesPage.tsx"


def _grantable_keys() -> set[str]:
    source = ROLES_PAGE.read_text()
    return {match.group(1) for match in re.finditer(r"\{ key: '([^']+)'", source)}


def _report_permission_keys() -> dict[str, str]:
    source = (BACKEND / "app" / "services" / "report_permissions.py").read_text()
    block = source[source.index("REPORT_PERMISSION_KEYS"):source.index("STUDENT_REPORTS")]
    return dict(re.findall(r'"([^"]+)": "([^"]+)"', block))


def test_every_gated_report_can_be_granted_to_a_non_admin():
    if not ROLES_PAGE.exists():
        return  # backend checked out without the dashboard

    grantable = _grantable_keys()
    ungrantable = []
    for report, key in _report_permission_keys().items():
        # The gate accepts the bare key or any of its action variants.
        variants = (key, f"{key}.view", f"{key}.print", f"{key}.export")
        if not any(variant in grantable for variant in variants):
            ungrantable.append(f"{report} (needs {key})")

    assert not ungrantable, (
        "These reports are enforced by the API but cannot be granted from the "
        "Roles screen, so only an admin can ever open them: " + ", ".join(sorted(ungrantable))
    )
