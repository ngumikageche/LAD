"""
The terms screen is permission-gated, and those keys must be grantable.

`/terms` exists so a trainer told "no marks were recorded for this term" can
find out which term does hold their marks. That only works if a role can
actually be given `terms.read` from the Roles editor.
"""

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROLES_PAGE = BACKEND.parent / "dashboard" / "src" / "pages" / "RolesPage.tsx"
TERMS_ROUTE = BACKEND / "app" / "routes" / "terms.py"


def _grantable_keys() -> set[str]:
    return {m.group(1) for m in re.finditer(r"\{ key: '([^']+)'", ROLES_PAGE.read_text())}


def test_terms_endpoints_are_permission_gated():
    source = TERMS_ROUTE.read_text()
    enforced = set(re.findall(r'require_permission\("([^"]+)"\)', source))
    assert enforced == {"terms.read", "terms.create", "terms.update", "terms.delete"}, enforced


def test_terms_keys_can_be_granted_from_the_roles_screen():
    if not ROLES_PAGE.exists():
        return  # backend checked out without the dashboard
    grantable = _grantable_keys()
    missing = [
        key for key in ("terms.read", "terms.create", "terms.update", "terms.delete")
        if key not in grantable
    ]
    assert not missing, f"Enforced but not grantable: {missing}"


def test_terms_uses_the_existing_table_only():
    # The brief was explicit: no new tables. Terms already existed; this route
    # only reads and writes that model.
    source = TERMS_ROUTE.read_text()
    assert "__tablename__" not in source
    assert "class Term(" not in source
    assert "from ..models.term import Term" in source
