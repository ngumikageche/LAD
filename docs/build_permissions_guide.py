#!/usr/bin/env python3
"""
Build the LAD permissions guide as a PDF.

The permission catalogue and the role baselines are parsed out of
`dashboard/src/pages/RolesPage.tsx` rather than retyped here, so the document
cannot drift from the keys the Roles screen actually renders. Add a key there
and rebuild — it appears in the reference automatically.

Styling is shared with the user guide through `guide_theme.py`; only the
components unique to this document live in `EXTRA_CSS` below.

Usage:
    python3 docs/build_permissions_guide.py

Requires Google Chrome (headless) for the HTML-to-PDF step.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from guide_theme import BASE_CSS, esc  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
ROLES_PAGE = REPO / "dashboard" / "src" / "pages" / "RolesPage.tsx"
OUT_HTML = REPO / "docs" / "permissions-guide.html"
OUT_PDF = REPO / "docs" / "LAD-Permissions-Guide.pdf"


# ── Parse the catalogue out of the source of truth ───────────────────────────

def parse_permission_tabs(source: str) -> list[tuple[str, list[tuple[str, str]]]]:
    start = source.index("const PERMISSION_TABS")
    end = source.index("\n];", start)
    block = source[start:end]
    tabs: list[tuple[str, list[tuple[str, str]]]] = []
    for match in re.finditer(r"label: '([^']+)',\s*\n\s*permissions: \[(.*?)\n\s*\],", block, re.S):
        perms = re.findall(r"\{ key: '([^']+)',\s*label: '([^']*)'", match.group(2))
        tabs.append((match.group(1), perms))
    return tabs


def parse_role_templates(source: str) -> list[tuple[str, str, list[str]]]:
    start = source.index("export const PREDEFINED_ROLES")
    end = source.index("\n];", start)
    block = source[start:end]
    roles: list[tuple[str, str, list[str]]] = []
    for match in re.finditer(
        r"role_name: '([^']+)',\s*\n\s*category: '([^']+)',\s*\n\s*permissions: \{(.*?)\n\s*\},",
        block,
        re.S,
    ):
        granted = [key for key, value in re.findall(r"'([^']+)': (true|false)", match.group(3)) if value == "true"]
        if "'*': true" in match.group(3):
            granted = ["*"]
        roles.append((match.group(1), match.group(2), granted))
    return roles


# ── Rendering helpers ────────────────────────────────────────────────────────

def permission_table(perms: list[tuple[str, str]]) -> str:
    rows = "\n".join(
        f"<tr><td><code>{esc(key)}</code></td><td>{esc(label)}</td></tr>"
        for key, label in perms
    )
    return (
        '<table class="perm">'
        "<thead><tr><th style=\"width:38%\">Key</th><th>What it grants</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )


EXTRA_CSS = """
  /* ── Permission tables ── */
  table.perm code { background: none; padding: 0; color: #14345f; font-weight: 600; }

  /* ── Role templates ── */
  .tmpl { border: 1px solid #dde3ec; border-radius: 7px; padding: 3.5mm 4mm; margin-bottom: 3.5mm; }
  .tmpl h3 { margin-top: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 1.4mm; }
  .chip {
    font-family: "SFMono-Regular", Consolas, monospace; font-size: 7.6pt;
    background: #eef1f7; color: #1b3a6b; padding: 0.7mm 1.8mm; border-radius: 3px;
  }
  .tmpl-note { font-size: 9.2pt; margin-bottom: 0; }
"""


def build_html(tabs, templates) -> str:
    total_keys = sum(len(p) for _, p in tabs)
    unique_keys = len({k for _, perms in tabs for k, _ in perms})
    today = date.today().strftime("%d %B %Y")

    reference_sections = []
    for label, perms in tabs:
        reference_sections.append(
            f'<h3 class="keep">{esc(label)} '
            f'<span class="count">{len(perms)} key{"s" if len(perms) != 1 else ""}</span></h3>'
            + permission_table(perms)
        )
    reference_html = "\n".join(reference_sections)

    template_sections = []
    for name, category, granted in templates:
        if granted == ["*"]:
            body = (
                '<p class="tmpl-note">Holds the wildcard <code>*</code> — every permission, '
                "present and future, plus master data access. Reserve it for genuine system "
                "administrators.</p>"
            )
        else:
            chips = "".join(f"<span class=\"chip\">{esc(key)}</span>" for key in granted)
            body = f'<div class="chips">{chips}</div>'
        template_sections.append(
            f'<div class="tmpl keep"><h3>{esc(name)} '
            f'<span class="count">{esc(category)} · '
            f'{"wildcard" if granted == ["*"] else f"{len(granted)} keys"}</span></h3>{body}</div>'
        )
    templates_html = "\n".join(template_sections)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LAD — Working With Permissions</title>
<style>{BASE_CSS}{EXTRA_CSS}</style>
</head>
<body>

<div class="cover">
  <div class="mark">LAD · Learning &amp; Academic Management</div>
  <h1>Working With<br>Permissions</h1>
  <div class="rule"></div>
  <div class="sub">How access is granted, how data is scoped to an institution,
  and how to give a role exactly what it needs — and nothing more.</div>
  <div class="stats">
    <div class="stat"><div class="n">{unique_keys}</div><div class="l">Permission keys</div></div>
    <div class="stat"><div class="n">{len(tabs)}</div><div class="l">Categories</div></div>
    <div class="stat"><div class="n">2</div><div class="l">Access layers</div></div>
  </div>
  <div class="meta">
    <strong>Administrator &amp; Developer Guide</strong><br>
    Generated {today} from the live permission catalogue
  </div>
</div>

<section class="first">
  <div class="eyebrow">Contents</div>
  <h2>What this covers</h2>
  <ol class="toc">
    <li>The two questions every request answers <span class="s">— the model everything else follows</span></li>
    <li>Data scope and the master control <span class="s">— <code>data.master</code>, <code>data.department</code></span></li>
    <li>How a request is decided <span class="s">— resolution order, front and back</span></li>
    <li>Granting permissions in the Roles screen <span class="s">— step by step</span></li>
    <li>Assigning a role to a person</li>
    <li>Common tasks <span class="s">— recipes for the requests you will actually get</span></li>
    <li>Troubleshooting <span class="s">— "why can't they see it?"</span></li>
    <li>Full permission reference <span class="s">— all {unique_keys} keys by category</span></li>
    <li>Role baselines</li>
    <li>For developers <span class="s">— adding a key, scoping a new endpoint</span></li>
  </ol>

  <div class="callout">
    <div class="t">Read this first</div>
    <p>Granting a permission does <strong>not</strong> decide which records someone sees.
    A trainer given <code>students.read</code> sees the learners in the subjects assigned
    to them — not every learner in the system. That second layer is described in
    section 2, and it is the part most often missed.</p>
  </div>
</section>

<section>
  <div class="eyebrow">Section 1</div>
  <h2>The two questions every request answers</h2>

  <p>Access in LAD is decided in two independent steps. Keeping them separate is what
  lets you hand a trainer an administrative screen without also handing them the whole
  country's data.</p>

  <div class="layers">
    <div class="layer">
      <div class="n">Layer 1 · Permission key</div>
      <div class="q">May you open this?</div>
      <p>A key such as <code>students.read</code> decides whether a screen, a route,
      and its API endpoint respond to you at all. Keys are granted per role on the
      Roles screen.</p>
      <p class="ex">Fails → <code>403 Permission denied</code></p>
    </div>
    <div class="layer two">
      <div class="n">Layer 2 · Data scope</div>
      <div class="q">Whose records do you see?</div>
      <p>Once inside, the rows returned are filtered to your institution, and — if
      you are a trainer — to the subjects assigned to you. Enforced in the database
      query, not in the page.</p>
      <p class="ex">Out of scope → the record is simply not there (<code>404</code>)</p>
    </div>
  </div>

  <h3>Why the second layer matters</h3>
  <p>Layer&nbsp;2 is applied as a filter on the SQL query. A record outside your scope
  is not fetched, so it cannot be leaked by a page that forgets to hide it, by a direct
  API call, or by guessing a record's ID in the URL. Both the list endpoints and the
  single-record endpoints apply it.</p>

  <table>
    <thead><tr><th style="width:22%">Who</th><th>Sees by default</th></tr></thead>
    <tbody>
      <tr><td><strong>Group super admin</strong></td><td>Everything. Recognised by having <em>no</em> institution on their account — that absence is what places them above the colleges rather than inside one.</td></tr>
      <tr><td><strong>College administrator</strong></td><td>Their own institution. The <code>*</code> wildcard carries master data access on the record screens, but the cross-cohort reports hold them to their college — see below.</td></tr>
      <tr><td><strong>Manager / custom staff role</strong></td><td>Every record belonging to their own institution.</td></tr>
      <tr><td><strong>Head of department</strong></td><td>Their own department, across every trainer in it. Granted by <code>data.department</code>, or implied by a role named <em>HOD</em> or <em>Head of Department</em>.</td></tr>
      <tr><td><strong>Trainer</strong></td><td>Their own institution, narrowed again to the subjects assigned to them — those subjects' modules, courses, learners, marks, and documents.</td></tr>
      <tr><td><strong>Student</strong></td><td>Themselves. A learner granted <code>students.read</code> still sees only their own record, and cannot enumerate classmates.</td></tr>
    </tbody>
  </table>

  <div class="callout warn">
    <div class="t">One place the wildcard does not widen you</div>
    <p>The cross-cohort reports — <strong>Enrolment &amp; Attendance</strong> and the
    <strong>Attendance Overview</strong> — resolve scope from the institution on the account
    rather than from the strength of the role, because a college administrator administers one
    college out of several and must not read the others. An explicitly granted
    <code>data.master</code> still lifts that; a bare <code>*</code> does not. These reports
    print the scope they are showing, so the narrowing is visible rather than silent.</p>
  </div>

  <div class="callout">
    <div class="t">The institution chain</div>
    <p>Scope is resolved by walking the academic structure:
    <code>Institution → Department → Course → Module → Subject</code>. People are
    matched on their <code>institution_id</code>, and learners additionally through the
    course they are enrolled on — so a learner whose account carries no institution is
    still correctly placed by their course.</p>
  </div>
</section>

<section>
  <div class="eyebrow">Section 2</div>
  <h2>Data scope and the master control</h2>

  <p>Two keys on the <strong>Data Scope</strong> tab move a role between the levels above.
  One lifts both confinements at once; the other sets the boundary at a department.</p>

  <h3><code>data.master</code> — View Master Data</h3>
  <p>Found on the <strong>Data Scope</strong> tab of the role editor, labelled
  <em>"View Master Data — all institutions, all trainers' subjects"</em>. A role holding
  it reads across every institution and across every trainer's teaching load, on every
  screen it can already open.</p>

  <table>
    <thead><tr><th style="width:34%">Without <code>data.master</code></th><th>With <code>data.master</code></th></tr></thead>
    <tbody>
      <tr><td>Institutions list shows only your own</td><td>Shows every institution</td></tr>
      <tr><td>A trainer sees their assigned subjects</td><td>Sees all subjects</td></tr>
      <tr><td>A trainer sees learners in those subjects</td><td>Sees all learners</td></tr>
      <tr><td>Reports and dashboards cover your institution</td><td>Cover the whole group</td></tr>
      <tr><td>Announcements reach your institution</td><td>Announcements are visible across institutions</td></tr>
    </tbody>
  </table>

  <div class="callout warn">
    <div class="t">Grant it deliberately</div>
    <p><code>data.master</code> is the only supported way to see beyond your own
    <em>institution</em>, and it is deliberately a single, visible switch rather than a side
    effect of any other key. Give it to group-level auditors, multi-campus registrars, and
    quality assurance staff. Do not give it to a role simply because a screen looks empty —
    an empty screen is usually a missing <em>assignment</em>, not a missing permission.
    See Troubleshooting.</p>
  </div>

  <h3><code>data.department</code> — Head of Department</h3>
  <p>The department counterpart, on the same tab. It widens a trainer from their own
  subjects to their whole department, and narrows a college-wide manager to the same — so
  it is a promotion for one role and a restriction for another. The department is read from
  the trainer profile attached to the account, so a head of department needs one, with a
  department set.</p>
  <p>A role named <em>HOD</em> or <em>Head of Department</em> is treated as holding it
  without the key being ticked. Grant the key explicitly when the role is named for the job
  in some other way — <em>Programme Lead</em>, <em>Section Head</em>.</p>
  <div class="callout">
    <div class="t">If there is no department to hold them to</div>
    <p>An account marked as a head of department but carrying no trainer profile, or one whose
    profile has no department, falls back to their college rather than to an empty scope.
    Showing them the college is wrong-but-visible; showing them nothing looks like a fault.</p>
  </div>

  <h3>The two alert keys</h3>
  <p>The same tab carries the alerting keys, because what they surface is scoped the
  same way.</p>
  <table>
    <thead><tr><th style="width:30%">Key</th><th>Effect</th></tr></thead>
    <tbody>
      <tr><td><code>alerts.read</code></td><td>See open performance and attendance alerts for learners in scope. A learner reaches their own alerts through <code>notifications.read</code> without needing this.</td></tr>
      <tr><td><code>alerts.manage</code></td><td>Re-run the evaluation and resolve alerts. <code>reports.student.write</code> also satisfies this.</td></tr>
    </tbody>
  </table>
  <p>Alerts open when a learner's average falls below <strong>50%</strong> or attendance
  falls below <strong>75%</strong> over the last 90 days, and resolve automatically on
  recovery. Raising one notifies the learner and the trainers who teach them.</p>
</section>

<section>
  <div class="eyebrow">Section 3</div>
  <h2>How a request is decided</h2>

  <h3>On the server</h3>
  <p>Every guarded endpoint runs the same check before it touches data:</p>
  <ol class="steps">
    <li><strong>Is there a valid token?</strong> No → <code>401</code>.</li>
    <li><strong>Does the role hold <code>*</code>?</strong> Yes → the key check passes.</li>
    <li><strong>Is the role named exactly <code>Admin</code>?</strong> Yes → the key check passes.</li>
    <li><strong>Is the key present and set to <code>true</code>?</strong> No → <code>403</code>.</li>
    <li><strong>Scope the query.</strong> Institution filter, then trainer-subject filter,
    then self-filter for learners — unless <code>data.master</code> lifts them.</li>
  </ol>

  <div class="callout">
    <div class="t">Only <code>true</code> counts</div>
    <p>A key must be exactly boolean <code>true</code>. A key set to <code>false</code>,
    or absent, or holding a string, denies. The role editor removes a key from the object
    entirely when you untick it, which is the same thing as denying it.</p>
  </div>

  <h3>Admin-flavoured endpoints</h3>
  <p>Some administrative endpoints accept a specific key as an alternative to being an
  administrator. That is what allows a trainer or manager to be handed one admin screen
  from the Roles page without being made an admin. An endpoint guarded with no key at all
  stays administrator-only.</p>

  <h3>In the dashboard</h3>
  <p>The sidebar, the routes, and the page bodies all check the same keys, so a screen a
  role cannot use is not offered. Two behaviours are worth knowing:</p>
  <ul>
    <li>A check for <code>reports.student.term</code> is also satisfied by
    <code>reports.student.term.view</code> or <code>…read</code>. That is why the reference
    lists both the parent key and its <code>.view</code> / <code>.print</code> /
    <code>.export</code> variants.</li>
    <li>Administrator status is decided by the wildcard or the role name — never by the
    account type. An account without a learner or trainer profile is reported as type
    <code>admin</code> by the API, and a Manager falls into that bucket; treating it as a
    wildcard would hand non-admin staff the whole dashboard.</li>
  </ul>

  <div class="callout warn">
    <div class="t">The interface is a convenience, not the boundary</div>
    <p>Hiding a button does not protect data. Every check above is enforced again on the
    server, and the data scope is applied in SQL. When you review access, review the role's
    keys — not what the screen happens to show.</p>
  </div>
</section>

<section>
  <div class="eyebrow">Section 4</div>
  <h2>Granting permissions in the Roles screen</h2>

  <p>Open <strong>People → Roles</strong>. You need <code>roles.read</code> to see the
  screen, <code>roles.create</code> to add a role, and <code>roles.update</code> to change one.</p>

  <ol class="steps">
    <li><strong>Add Role</strong>, or <strong>Edit</strong> beside an existing one.</li>
    <li><strong>Name the role</strong> for the job, not the person — <em>Head of Department</em>,
    <em>Exams Officer</em>, <em>Quality Assurance</em>. Roles are shared by everyone who holds them.</li>
    <li><strong>Leave "Full Access (Wildcard)" off</strong> unless this really is a system
    administrator. Ticking it replaces every other selection with <code>*</code>, which grants
    all present <em>and future</em> permissions plus master data access.</li>
    <li><strong>Work through the tabs.</strong> Each tab shows a badge with the number of keys
    granted in it, so you can see at a glance where access has been given. <em>Select all
    &lt;tab&gt;</em> ticks the whole category; press it again to clear it.</li>
    <li><strong>Start with the Admin Access tab</strong> if the role needs an administrative
    screen. Each key there opens one destination — its sidebar entry, its route, and its API
    together.</li>
    <li><strong>Decide the data scope last.</strong> On the <strong>Data Scope</strong> tab,
    grant <code>data.master</code> only if this role genuinely works across institutions.</li>
    <li><strong>Save.</strong> Changes apply the next time the affected users sign in, because
    permissions are read into the session at login.</li>
  </ol>

  <div class="callout good">
    <div class="t">A working habit</div>
    <p>Grant the narrowest set that lets someone finish their job, then widen on request.
    A permission that was never needed is far easier to add later than one that was granted
    broadly and quietly relied upon.</p>
  </div>

  <h3>Read, then write</h3>
  <p>Write and delete keys are not much use without their matching read key — someone who can
  update a course but not read one has nowhere to work from. Grant <code>…read</code> alongside
  <code>…create</code>, <code>…update</code>, or <code>…delete</code>.</p>
</section>

<section>
  <div class="eyebrow">Section 5</div>
  <h2>Assigning a role to a person</h2>

  <ol class="steps">
    <li>Open <strong>People → Users</strong>. This needs <code>users.read</code>.</li>
    <li>Create the user, or edit an existing one. Editing needs <code>users.update</code>.</li>
    <li>Pick the <strong>Role</strong> from the dropdown — it lists every role you can read.</li>
    <li>Set the user's <strong>Institution</strong>. This is what confines them under Layer&nbsp;2;
    without it they are not placed in any institution.</li>
    <li>Save. The person picks up the role's permissions at their next sign-in.</li>
  </ol>

  <div class="callout warn">
    <div class="t">One role per person</div>
    <p>A user holds exactly one role. There is no stacking — if someone needs the union of two
    jobs, create a role for that combined job rather than trying to grant both.</p>
  </div>

  <h3>Trainers need assignments as well as permissions</h3>
  <p>A trainer's visible data comes from their <strong>subject assignments</strong>, not from
  their permission keys. A newly created trainer with a full set of teaching permissions still
  sees nothing until units are assigned to them.</p>
  <ol class="steps">
    <li>Open <strong>People → Trainers</strong> and choose <strong>Assign Subjects</strong> for
    the trainer. This needs <code>trainers.update</code>.</li>
    <li>Pick a course, then a module, then one or more subjects, and assign.</li>
    <li>The <strong>Currently assigned units</strong> list below shows what they hold.
    <strong>Remove</strong> takes a unit back off them — and with it, the learners, marks, and
    documents that unit gave them sight of.</li>
  </ol>
</section>

<section>
  <div class="eyebrow">Section 6</div>
  <h2>Common tasks</h2>

  <h3 class="keep">Let a trainer message the learners in their subject</h3>
  <p>Grant <code>notifications.create</code> and <code>notifications.read</code>. On the
  Notifications screen they can then target <em>Students in course / module / subject</em> or
  <em>by enrolment year</em>. The school-wide and by-role targets are refused for a scoped
  trainer by the server, so this grant cannot become a broadcast.</p>

  <h3 class="keep">Give a manager oversight of one campus</h3>
  <p>Grant the read keys for the areas they oversee plus <code>admin.analytics.read</code>, and
  set their institution on the Users screen. Leave <code>data.master</code> off — that is what
  keeps them to their own campus.</p>

  <h3 class="keep">Give a group auditor read-only sight of every campus</h3>
  <p>Grant <code>data.master</code>, the read keys for what they must review, and no create,
  update, or delete keys at all. They will see every institution's data and be unable to change
  any of it.</p>

  <h3 class="keep">Open one admin screen to a trainer</h3>
  <p>Grant just that screen's key from the <strong>Admin Access</strong> tab — for example
  <code>attendance.report.view</code> for the school-wide attendance report. The sidebar entry,
  the route, and the API all unlock together, and the data stays scoped to their institution.</p>

  <h3 class="keep">Let someone upload marks but not alter existing ones</h3>
  <p>Grant <code>scores.create</code> and <code>scores.read</code>. Withhold
  <code>scores.update</code>, <code>admin.scores.update</code>, and
  <code>admin.scores.delete</code>.</p>

  <h3 class="keep">Take access away</h3>
  <p>Untick the keys on the role — which affects everyone holding it — or move the individual to
  a narrower role on the Users screen. To remove a trainer's sight of a class without touching
  their permissions, remove the unit assignment instead.</p>
</section>

<section>
  <div class="eyebrow">Section 7</div>
  <h2>Troubleshooting</h2>

  <table>
    <thead><tr><th style="width:34%">Symptom</th><th>Where to look</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>"You do not have permission to view this"</strong></td>
        <td>Layer 1. The role is missing that screen's key. Check the matching tab in the role editor.</td>
      </tr>
      <tr>
        <td><strong>The screen opens but the list is empty</strong></td>
        <td>Layer 2 — this is the common case. For a trainer, check their subject assignments first.
        For anyone else, check the institution set on their user record.</td>
      </tr>
      <tr>
        <td><strong>A trainer sees no learners, marks, or documents</strong></td>
        <td>They have no units assigned. Trainers → Assign Subjects. Permissions are not the problem.</td>
      </tr>
      <tr>
        <td><strong>A change to a role had no effect</strong></td>
        <td>Permissions load at sign-in. Have the person sign out and back in.</td>
      </tr>
      <tr>
        <td><strong>A staff member sees another campus's data</strong></td>
        <td>Either their role holds <code>data.master</code>, or it holds <code>*</code>, or their
        user record has no institution set.</td>
      </tr>
      <tr>
        <td><strong>The sidebar entry is missing</strong></td>
        <td>The nav entry carries the same key as the route and the API. Grant the key and it appears.</td>
      </tr>
      <tr>
        <td><strong>A learner can see more than their own record</strong></td>
        <td>Check whether their role was given <code>data.master</code>. Nothing else lifts the
        self-only scope for a learner.</td>
      </tr>
      <tr>
        <td><strong>An announcement did not reach anyone</strong></td>
        <td>Announcements deliver on publish. An unpublished one sits waiting; publish it to fan it out.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <div class="t">A diagnostic order that works</div>
    <p>Ask in this order: <strong>(1)</strong> Does the role hold the key?
    <strong>(2)</strong> Is the person's institution set? <strong>(3)</strong> If they are a
    trainer, do they hold the unit? <strong>(4)</strong> Have they signed in since the change?
    Nearly every access question resolves at one of those four.</p>
  </div>
</section>

<section>
  <div class="eyebrow">Section 8</div>
  <h2>Full permission reference</h2>
  <p>Every key the role editor renders, grouped as it appears on screen. A key shown in more
  than one category is the same key — ticking it anywhere grants it everywhere.</p>
  {reference_html}
</section>

<section>
  <div class="eyebrow">Section 9</div>
  <h2>Role baselines</h2>
  <p>The sets below are the intended starting point for each standard role, as defined in the
  dashboard source. Use them as a checklist when building a role by hand — the editor does not
  apply them for you.</p>
  {templates_html}
</section>

<section>
  <div class="eyebrow">Section 10</div>
  <h2>For developers</h2>

  <h3>Where the pieces live</h3>
  <table>
    <thead><tr><th style="width:44%">File</th><th>Responsibility</th></tr></thead>
    <tbody>
      <tr><td><code>backend/app/routes/permissions.py</code></td><td>Key checks and the route guards</td></tr>
      <tr><td><code>backend/app/services/scoping.py</code></td><td>Data scope — institution, trainer, and <code>data.master</code>; plus <code>oversight_scope</code> for the cross-cohort reports</td></tr>
      <tr><td><code>dashboard/src/auth/ProtectedRoute.tsx</code></td><td>Route guards and the shared <code>hasPermission</code> helper</td></tr>
      <tr><td><code>dashboard/src/pages/RolesPage.tsx</code></td><td>The permission catalogue rendered by the editor</td></tr>
      <tr><td><code>dashboard/src/components/layout/Sidebar.tsx</code></td><td>Nav entries and the key each carries</td></tr>
    </tbody>
  </table>

  <h3>Adding a permission key</h3>
  <ol class="steps">
    <li>Guard the endpoint with the new key.</li>
    <li>Add the key and a plain-language label to the right tab in <code>PERMISSION_TABS</code>.</li>
    <li>Guard the route, and the sidebar entry, with the same key so all three unlock together.</li>
    <li>Add it to the role baselines that should hold it.</li>
    <li>Rebuild this document — the reference is parsed from the catalogue, so the new key
    appears without being retyped.</li>
  </ol>

  <h3>Scoping a new endpoint</h3>
  <p>Apply the scope as a query filter, never as a post-filter on results. The helpers return a
  narrowed query, so a route that calls one cannot leak; a route that forgets will.</p>
  <pre><code>from ..services.scoping import scope_students, can_access_student

# Lists — scope the query before it runs
students = scope_students(db.session.query(Student), user).all()

# Single records — the same scope, or the caller gets a 404
if not student or not can_access_student(user, student.id):
    return {{"error": "Student not found"}}, 404</code></pre>
  <p>Return <code>404</code> rather than <code>403</code> for an out-of-scope record: a
  <code>403</code> confirms the record exists, which is itself a disclosure.</p>

  <div class="callout warn">
    <div class="t">One inconsistency to know about</div>
    <p>The key check treats the role name <code>Admin</code> as a wildcard, matched
    case-sensitively. The separate administrator test accepts <code>admin</code> or
    <code>super admin</code> in any case. A role named <em>Super Admin</em> therefore passes the
    administrator test but must rely on holding <code>*</code> to satisfy key checks — which the
    seeded super-admin role does. Prefer granting <code>*</code> explicitly over depending on a
    role's name.</p>
  </div>

  <h3>Marks arithmetic</h3>
  <p>Unrelated to permissions but frequently touched alongside them: a score becomes a percentage
  as <code>(x / y) * 100</code> when the assessment records a total, and <code>(x / 100) * 100</code>
  when it does not. Average over percentages, never over raw marks, so a paper out of 40 and one
  out of 100 stay comparable.</p>

  <h3>Rebuilding this document</h3>
  <pre><code>python3 docs/build_permissions_guide.py</code></pre>
</section>

</body>
</html>
"""


def main() -> int:
    source = ROLES_PAGE.read_text()
    tabs = parse_permission_tabs(source)
    templates = parse_role_templates(source)
    if not tabs:
        print("No permission tabs parsed — has RolesPage.tsx changed shape?", file=sys.stderr)
        return 1

    OUT_HTML.write_text(build_html(tabs, templates))
    print(f"HTML  → {OUT_HTML}  ({sum(len(p) for _, p in tabs)} keys, {len(tabs)} categories)")

    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        print("Chrome not found — HTML written, PDF skipped.", file=sys.stderr)
        return 1

    subprocess.run(
        [
            chrome, "--headless", "--disable-gpu", "--no-sandbox",
            "--no-pdf-header-footer",
            f"--print-to-pdf={OUT_PDF}",
            OUT_HTML.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    print(f"PDF   → {OUT_PDF}  ({OUT_PDF.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
