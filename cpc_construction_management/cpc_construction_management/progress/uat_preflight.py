"""US-11 preflight: read-only checks that the build is installed and wired correctly.

Run from the bench root:
bench --site cpc.emkan-dev.com execute cpc_construction_management.cpc_construction_management.progress.uat_preflight.run

Prints PASS / WARN / FAIL per check. Writes nothing to the database.
"""
import importlib
from datetime import date

import frappe

PKG = "cpc_construction_management.cpc_construction_management.progress."
MODULES = ["hold_calc", "hold_controls", "revision_calc", "completion_calc", "quantity_revision", "completion",
           "correction_calc", "corrections", "scope_review", "screens_calc", "screens", "reports_calc", "reports",
           "calc_core", "calculation", "approval_rules", "recalc_audit", "reporting_anchor", "task_sync"]
DOCTYPES = ["CPC Weekly Calendar", "CPC Calendar Week", "IRPO Progress", "CPC IRPO Reporting Status Event",
            "CPC IRPO Progress Recalc Event", "CPC IRPO Scope Review", "IRPO Quantity Ledger"]
REQUIRED_FIELDS = ["active_key", "workflow_state", "partial_hold_exception", "hold_exception_reason",
                   "requires_hold_review", "base_revision_reference", "recalculation_log", "week_start_date", "week_ending"]
REPORTS = ["Weekly Progress Matrix", "Missing Pending Updates", "IRPO Progress Audit"]


def _modules():
    bad = []
    for m in MODULES:
        try:
            importlib.import_module(PKG + m)
        except Exception as e:
            bad.append(f"{m}: {type(e).__name__}: {e}")
    return ("FAIL", "; ".join(bad)) if bad else ("PASS", f"{len(MODULES)} modules import")


def _doctypes():
    missing = [d for d in DOCTYPES if not frappe.db.exists("DocType", d)]
    return ("FAIL", "missing: " + ", ".join(missing)) if missing else ("PASS", "all present")


def _fields():
    have = {f.fieldname for f in frappe.get_meta("IRPO Progress").fields}
    missing = [f for f in REQUIRED_FIELDS if f not in have]
    return ("FAIL", "missing fields: " + ", ".join(missing)) if missing else ("PASS", "")


def _unique_index():
    rows = frappe.db.sql("show index from `tabIRPO Progress` where Column_name='active_key'", as_dict=True)
    return ("PASS", "unique index on active_key") if any(r.get("Non_unique") == 0 for r in rows) else ("FAIL", "no unique index on active_key")


def _approvers():
    wf = frappe.db.get_value("Workflow", {"document_type": "IRPO Progress", "is_active": 1}, "name")
    if not wf:
        return "FAIL", "no active workflow for IRPO Progress"
    states = {s.state: str(s.doc_status) for s in frappe.get_all("Workflow Document State", filters={"parent": wf}, fields=["state", "doc_status"])}
    roles = {t.allowed for t in frappe.get_all("Workflow Transition", filters={"parent": wf}, fields=["allowed", "next_state"])
             if states.get(t.next_state) == "1" and t.allowed}
    if not roles:
        return "FAIL", "no workflow transition to an approved state has an allowed role"
    holders = frappe.get_all("Has Role", filters={"role": ["in", list(roles)], "parenttype": "User"}, pluck="parent")
    enabled = [u for u in frappe.get_all("User", filters={"name": ["in", holders or ["-"]], "enabled": 1}, pluck="name") if u not in ("Administrator", "Guest")]
    if len(enabled) < 2:
        return "WARN", f"approval roles {sorted(roles)} have {len(enabled)} enabled user(s); independent approval needs at least 2"
    return "PASS", f"approval roles {sorted(roles)}, {len(enabled)} users"


def _workflow():
    wf = frappe.db.get_value("Workflow", {"document_type": "IRPO Progress", "is_active": 1}, "name")
    if not wf:
        return "FAIL", "no active workflow for IRPO Progress"
    states = {s.state: str(s.doc_status) for s in frappe.get_all("Workflow Document State", filters={"parent": wf}, fields=["state", "doc_status"])}
    nxt = {t.next_state for t in frappe.get_all("Workflow Transition", filters={"parent": wf}, fields=["next_state"])}
    ok = "Pending Approval" in nxt and any(states.get(n) == "1" for n in nxt)
    return ("PASS", wf) if ok else ("FAIL", "workflow lacks a transition to Pending Approval and/or to an approved (submitted) state")


def _hooks():
    h = frappe.get_hooks("doc_events") or {}
    v = (h.get("Task") or {}).get("validate") or []
    v = [v] if isinstance(v, str) else v
    has = any(x.endswith("scope_review.validate_irpo_task_cancellation") for x in v)
    return ("PASS", "Task validate hook registered") if has else ("FAIL", "scope_review hook missing from hooks.py doc_events Task.validate")


def _page_reports():
    miss = []
    if not frappe.db.exists("Page", "weekly-progress"):
        miss.append("page weekly-progress")
    miss += [f"report {r}" for r in REPORTS if not frappe.db.exists("Report", r)]
    return ("FAIL", "missing: " + ", ".join(miss) + " (run bench migrate)") if miss else ("PASS", "page and 3 reports present")


def _calendar():
    weeks = frappe.get_all("CPC Calendar Week", filters={"week_year": 2026}, fields=["week_number", "start_date", "end_date"])
    if not weeks:
        return "WARN", "no 2026 weeks generated (generate the calendar before UAT 1-4)"
    problems = []
    if len(weeks) != 53:
        problems.append(f"{len(weeks)} weeks, expected 53")
    if len({w.week_number for w in weeks}) != len(weeks):
        problems.append("duplicate week numbers")
    if any(frappe.utils.getdate(w.start_date).weekday() != 0 or frappe.utils.getdate(w.end_date).weekday() != 6 for w in weeks):
        problems.append("a week does not run Monday-Sunday")
    return ("FAIL", "; ".join(problems)) if problems else ("PASS", "53 Monday-Sunday weeks, no duplicates")


def _execution_weeks():
    from cpc_construction_management.cpc_construction_management.progress.reporting_anchor import execution_week_number
    a = execution_week_number(date(2026, 9, 7), date(2026, 9, 7))
    b = execution_week_number(date(2026, 12, 28), date(2027, 1, 4))
    return ("PASS", "W37 = week 1; 2027-W01 after 2026-W53 start = week 2") if (a, b) == (1, 2) else ("FAIL", f"got {a} and {b}, expected 1 and 2")


def _task_fields():
    from cpc_construction_management.cpc_construction_management.progress.task_sync import require_task_fields
    try:
        require_task_fields()
        return "PASS", "Task custom fields present"
    except Exception as e:
        frappe.clear_messages()
        return "FAIL", str(e)[:200]


def _history_table():
    from cpc_construction_management.cpc_construction_management.progress.hold_controls import history_table_field
    f = history_table_field()
    return ("PASS", f"Task.{f}") if f else ("FAIL", "no Task table field uses CPC IRPO Reporting Status Event")


def _ledger_option():
    f = frappe.get_meta("IRPO Quantity Ledger").get_field("event_type")
    return ("PASS", "") if f and "Budget Revision" in (f.options or "") else ("FAIL", "ledger event_type has no Budget Revision option")


def _commercial_role():
    role = frappe.conf.get("cpc_commercial_change_role")
    if not role:
        return "WARN", "cpc_commercial_change_role not set in site_config.json (cancellations needing a commercial change stay pending)"
    return ("PASS", role) if frappe.db.exists("Role", role) else ("FAIL", f"configured role '{role}' does not exist")


def _error_log():
    n = frappe.db.count("Error Log", {"method": ["like", "%US-11%"], "creation": [">", frappe.utils.add_days(frappe.utils.nowdate(), -7)]})
    return ("WARN", f"{n} US-11 entries in Error Log in the last 7 days (open Error Log and review)") if n else ("PASS", "none in last 7 days")


CHECKS = [
    ("1 Python modules import", _modules), ("2 DocTypes exist", _doctypes), ("3 IRPO Progress fields", _fields),
    ("4 Unique index on active_key", _unique_index), ("5 Approver role and holders", _approvers),
    ("6 Active approval workflow", _workflow), ("7 Task validate hook", _hooks), ("8 Page and reports", _page_reports),
    ("9 2026 calendar", _calendar), ("10 Execution-week arithmetic", _execution_weeks), ("11 Task custom fields", _task_fields),
    ("12 Status history table on Task", _history_table), ("13 Ledger Budget Revision option", _ledger_option),
    ("14 Commercial change role", _commercial_role), ("15 Recent US-11 errors", _error_log),
]


def run():
    counts = {"PASS": 0, "WARN": 0, "FAIL": 0}
    for name, fn in CHECKS:
        try:
            status, detail = fn()
        except Exception as e:
            frappe.clear_messages()
            status, detail = "FAIL", f"{type(e).__name__}: {e}"
        counts[status] += 1
        print(f"{status:5} {name}" + (f" - {detail}" if detail else ""))
    print(f"\n{counts['PASS']} pass, {counts['WARN']} warn, {counts['FAIL']} fail")