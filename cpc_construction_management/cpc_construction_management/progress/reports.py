"""Step 12 - data builders for the three Script Reports (handoff Section 19).

Everything is derived from the same services the Task, screens and approvals use:
approved IRPO Progress records, quantity_revision.get_base_at, reporting windows,
Hold history and week_label. Historical cells use saved approved percentages;
the 'Live current' column re-expresses approved quantity on the CURRENT base.
"""
import re
from datetime import datetime, time

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate, nowdate

from .completion import get_reporting_windows
from .completion_calc import is_week_closed
from .hold_calc import is_fully_held, overlaps_hold
from .hold_controls import hold_intervals
from .quantity_revision import get_base_at
from .reporting_anchor import execution_week_number, get_reporting_anchor, resolve_week_for_date
from .reports_calc import cell_text, carry_forward, live_percent, member_in_week, parent_average
from .screens_calc import needs_action, week_label

PROGRESS = "IRPO Progress"


# ---------------------------------------------------------------- shared

def _weeks(filters, cap=26):
    today = getdate(nowdate())
    frm = getdate(filters.get("from_date") or add_days(today, -56))
    to = min(getdate(filters.get("to_date") or today), today)
    rows = frappe.get_all(
        "CPC Calendar Week", filters={"end_date": [">=", frm], "start_date": ["<=", to]},
        fields=["name", "week_year", "week_number", "start_date", "end_date"], order_by="start_date desc", limit=cap)
    rows.reverse()
    return rows


def _tasks(filters, include_cancelled=False):
    f = {"cpc_is_irpo": 1, "is_group": 0}
    if filters.get("project"):
        f["project"] = filters["project"]
    if filters.get("irpo_task"):
        f["name"] = filters["irpo_task"]
    if filters.get("boq_parent"):
        f["parent_task"] = filters["boq_parent"]
    if filters.get("task_status"):
        f["status"] = filters["task_status"]
    elif not include_cancelled:
        f["status"] = ["!=", "Cancelled"]
    return frappe.get_all("Task", filters=f, order_by="parent_task, name", limit=1000,
                          fields=["name", "subject", "parent_task", "status", "exp_start_date", "progress", "creation", "modified"])


def _anchor_week_start(task_name):
    try:
        anchor = get_reporting_anchor(frappe.get_doc("Task", task_name))
        week = resolve_week_for_date(anchor) if anchor else None
        return getdate(week["start_date"]) if week else None
    except Exception:
        return None


def _bounds(w):
    return datetime.combine(getdate(w.start_date), time.min), datetime.combine(getdate(w.end_date), time.max)


def _label(w, today, anchor, rec, iv, windows):
    ps, pe = _bounds(w)
    full = is_fully_held(ps, pe, iv)
    part = (not full) and overlaps_hold(ps, pe, iv)
    return week_label(w.start_date, w.end_date, today, anchor,
                      {"docstatus": rec.docstatus, "workflow_state": rec.workflow_state} if rec else None,
                      full, part, is_week_closed(w.start_date, windows))


def _records(task_names):
    if not task_names:
        return []
    return frappe.get_all(PROGRESS, filters={"irpo_task": ["in", task_names], "docstatus": ["<", 2]},
        fields=["name", "irpo_task", "calendar_week", "week_start_date", "measurement_cutoff_date", "docstatus",
                "workflow_state", "cum_percent", "cum_completed_qty"])


def _cancel_effective(tasks):
    reviews = {r.irpo_task: r.effective_date for r in frappe.get_all(
        "CPC IRPO Scope Review", filters={"status": "Finalized", "irpo_task": ["in", [t.name for t in tasks]]},
        fields=["irpo_task", "effective_date"])} if tasks else {}
    out = {}
    for t in tasks:
        if t.status == "Cancelled":
            out[t.name] = reviews.get(t.name) or getdate(t.modified)
    return out


# ---------------------------------------------------------------- 19.1 matrix

def matrix_report(filters):
    filters = frappe._dict(filters or {})
    if not filters.project:
        frappe.throw(_("Project is required."))
    today = getdate(nowdate())
    weeks = _weeks(filters)
    tasks = _tasks(filters, include_cancelled=True)
    cancel_on = _cancel_effective(tasks)
    recs = _records([t.name for t in tasks])
    by_task = {}
    for r in recs:
        by_task.setdefault(r.irpo_task, []).append(r)

    colname = lambda w: "w_" + re.sub(r"[^0-9a-zA-Z]", "_", w.name)
    columns = [
        {"label": _("Task"), "fieldname": "task", "fieldtype": "Link", "options": "Task", "width": 190},
        {"label": _("Level"), "fieldname": "level", "fieldtype": "Data", "width": 90},
    ] + [{"label": f"W{w.week_number} {w.week_year}", "fieldname": colname(w), "fieldtype": "Data", "width": 150} for w in weeks] + [
        {"label": _("Live current (current base)"), "fieldname": "live", "fieldtype": "Percent", "width": 130},
        {"label": _("Task % (stored)"), "fieldname": "stored", "fieldtype": "Percent", "width": 110},
    ]

    child = {}   # task -> per-week info, live%
    for t in tasks:
        mine = by_task.get(t.name, [])
        approved = [{"week_start": r.week_start_date, "cutoff": r.measurement_cutoff_date, "cum_percent": r.cum_percent,
                     "cum_qty": r.cum_completed_qty, "name": r.name} for r in mine if r.docstatus == 1 and r.week_start_date]
        by_week = {r.calendar_week: r for r in mine}
        anchor, iv, windows = _anchor_week_start(t.name), hold_intervals(t.name), get_reporting_windows(t.name)
        latest = carry_forward(approved, today)
        live = 0.0
        if latest and t.status != "Cancelled":
            try:
                live = live_percent(latest["cum_qty"], get_base_at(t.name, today))
            except Exception:
                frappe.clear_messages()
        child[t.name] = {"t": t, "approved": approved, "by_week": by_week, "anchor": anchor, "iv": iv, "windows": windows, "live": live}

    groups = {}
    for t in tasks:
        groups.setdefault(t.parent_task or "", []).append(t)

    data = []
    for parent, kids in groups.items():
        parent_row = None
        if parent:
            parent_row = {"task": parent, "level": _("BOQ parent"), "is_parent": 1}
            data.append(parent_row)
        sums_live = []
        for t in kids:
            c = child[t.name]
            row = {"task": t.name, "level": _("IRPO") + (" (cancelled)" if t.status == "Cancelled" else ""), "stored": t.progress,
                   "live": c["live"] if t.status != "Cancelled" else None}
            if t.status != "Cancelled":
                sums_live.append(c["live"])
            for w in weeks:
                rec = c["by_week"].get(w.name)
                label = _label(w, today, c["anchor"], rec, c["iv"], c["windows"])
                official = carry_forward(c["approved"], w.start_date)
                off_pct = official["cum_percent"] if official else None
                own = rec.cum_percent if rec else None
                fn = colname(w)
                row[fn] = cell_text(label, off_pct, own)
                if rec:
                    row["m_" + fn] = {"rec": rec.name}
                elif needs_action(label):
                    row["m_" + fn] = {"missing": 1, "task": t.name, "week": w.name, "project": filters.project}
            data.append(row)
        if parent_row is not None:
            for w in weeks:
                members = [child[t.name] for t in kids if member_in_week(t.creation, cancel_on.get(t.name), w.start_date, w.end_date)]
                vals = []
                for c in members:
                    o = carry_forward(c["approved"], w.start_date)
                    vals.append(o["cum_percent"] if o else 0)
                avg = parent_average(vals)
                parent_row[colname(w)] = f"{avg:g}% avg ({len(vals)})" if avg is not None else _("n/a")
            parent_row["live"] = parent_average(sums_live)
            parent_row["stored"] = frappe.db.get_value("Task", parent, "progress")
    message = _("Historical cells are saved approved percentages (carried forward when a week has no update); "
                "'Live current' re-expresses approved quantity on the current base. Pending values are shown separately from official progress.")
    return columns, data, message


# ---------------------------------------------------------------- 19.2 missing / pending

def missing_report(filters):
    filters = frappe._dict(filters or {})
    today = getdate(nowdate())
    only = cint(filters.get("outstanding_only", 1))
    weeks = _weeks(filters, cap=52)
    columns = [
        {"label": _("IRPO"), "fieldname": "irpo_task", "fieldtype": "Link", "options": "Task", "width": 170},
        {"label": _("Subject"), "fieldname": "subject", "fieldtype": "Data", "width": 160},
        {"label": _("BOQ Parent"), "fieldname": "boq_parent", "fieldtype": "Link", "options": "Task", "width": 150},
        {"label": _("Reporting Anchor"), "fieldname": "anchor", "fieldtype": "Date", "width": 110},
        {"label": _("Week"), "fieldname": "week", "fieldtype": "Link", "options": "CPC Calendar Week", "width": 110},
        {"label": _("Week Start"), "fieldname": "week_start", "fieldtype": "Date", "width": 100},
        {"label": _("Week End"), "fieldname": "week_end", "fieldtype": "Date", "width": 100},
        {"label": _("Execution Week"), "fieldname": "execution_week", "fieldtype": "Int", "width": 90},
        {"label": _("Action Status"), "fieldname": "label", "fieldtype": "Data", "width": 200},
        {"label": _("Last Approved Week"), "fieldname": "last_week", "fieldtype": "Link", "options": "CPC Calendar Week", "width": 120},
        {"label": _("Last Approved %"), "fieldname": "last_percent", "fieldtype": "Percent", "width": 110},
        {"label": _("Record"), "fieldname": "record", "fieldtype": "Link", "options": PROGRESS, "width": 150},
    ]
    tasks = _tasks(filters)
    recs = _records([t.name for t in tasks])
    by_task = {}
    for r in recs:
        by_task.setdefault(r.irpo_task, {})[r.calendar_week] = r
    data = []
    for t in tasks:
        anchor = _anchor_week_start(t.name)
        if not anchor:
            continue
        mine = by_task.get(t.name, {})
        approved = [r for r in mine.values() if r.docstatus == 1 and r.week_start_date]
        last = max(approved, key=lambda r: getdate(r.week_start_date)) if approved else None
        iv, windows = hold_intervals(t.name), get_reporting_windows(t.name)
        for w in weeks:
            rec = mine.get(w.name)
            label = _label(w, today, anchor, rec, iv, windows)
            if label == "Not applicable" or (only and not needs_action(label) and label != "Pending approval"):
                continue
            data.append({
                "irpo_task": t.name, "subject": t.subject, "boq_parent": t.parent_task,
                "anchor": t.exp_start_date, "week": w.name, "week_start": w.start_date, "week_end": w.end_date,
                "execution_week": execution_week_number(anchor, w.start_date), "label": label,
                "last_week": last.calendar_week if last else None, "last_percent": last.cum_percent if last else None,
                "record": rec.name if rec else None,
            })
    return columns, data, _("Missing is not zero progress and not 'no change'. Fully held and reporting-closed weeks are excluded unless 'Outstanding only' is cleared.")


# ---------------------------------------------------------------- 19.3 audit / export

def audit_report(filters):
    filters = frappe._dict(filters or {})
    f = {}
    for k_f, k_d in (("project", "project"), ("irpo_task", "irpo_task"), ("boq_parent", "parent_boq_task")):
        if filters.get(k_f):
            f[k_d] = filters[k_f]
    if filters.get("from_date"):
        f["week_start_date"] = [">=", getdate(filters["from_date"])]
    if filters.get("to_date"):
        f["week_ending"] = ["<=", getdate(filters["to_date"])]
    if not cint(filters.get("include_cancelled", 1)):
        f["docstatus"] = ["<", 2]
    if filters.get("state") == "Approved":
        f["docstatus"] = 1
    elif filters.get("state") == "Pending/Draft":
        f["docstatus"] = 0

    rows = frappe.get_all(PROGRESS, filters=f, order_by="irpo_task, week_start_date, creation", limit=5000, fields=[
        "name", "irpo_task", "parent_boq_task", "calendar_week", "week_start_date", "measurement_cutoff_date",
        "entered_by", "entered_on", "approved_by", "approved_on", "docstatus", "workflow_state",
        "base_qty_snapshot", "base_revision_reference", "cum_completed_qty", "prev_completed_qty_snapshot",
        "period_completed_qty_snapshot", "cum_percent", "remarks", "hold_exception_reason",
        "hold_exception_reviewed_by", "amended_from", "cancellation_reason", "return_reason"])

    # effective previous approved quantity (after late entries), per task, in period order
    approved = {}
    for r in frappe.get_all(PROGRESS, filters={"irpo_task": ["in", list({r.irpo_task for r in rows})], "docstatus": 1} if rows else {"name": ""},
                            fields=["name", "irpo_task", "week_start_date", "measurement_cutoff_date", "cum_completed_qty"],
                            order_by="week_start_date asc, measurement_cutoff_date asc, creation asc"):
        approved.setdefault(r.irpo_task, []).append(r)
    effective_prev = {}
    for task, lst in approved.items():
        prev = 0.0
        for r in lst:
            effective_prev[r.name] = prev
            prev = r.cum_completed_qty or 0

    skip = {"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "parent", "parenttype", "parentfield"}
    logs = {}
    if rows:
        for e in frappe.get_all("CPC IRPO Progress Recalc Event", filters={"parent": ["in", [r.name for r in rows]], "parenttype": PROGRESS}, fields=["*"], order_by="idx asc"):
            logs.setdefault(e.parent, []).append("; ".join(f"{k}: {v}" for k, v in e.items() if k not in skip and v not in (None, "")))

    state_of = {0: None, 1: _("Approved"), 2: _("Cancelled")}
    data = []
    for r in rows:
        eff_prev = effective_prev.get(r.name)
        data.append({
            **r,
            "state": state_of[r.docstatus] or r.workflow_state or _("Draft"),
            "effective_prev_qty": eff_prev,
            "effective_increment": (r.cum_completed_qty or 0) - eff_prev if eff_prev is not None else None,
            "recalc_log": " | ".join(logs.get(r.name, [])),
        })
    D = lambda label, fn, ft="Data", w=120, **kw: {"label": label, "fieldname": fn, "fieldtype": ft, "width": w, **kw}
    columns = [
        D(_("Record"), "name", "Link", 150, options=PROGRESS), D(_("IRPO"), "irpo_task", "Link", 150, options="Task"),
        D(_("BOQ Parent"), "parent_boq_task", "Link", 140, options="Task"),
        D(_("Week"), "calendar_week", "Link", 100, options="CPC Calendar Week"), D(_("Week Start"), "week_start_date", "Date", 95),
        D(_("Measured Through"), "measurement_cutoff_date", "Date", 110),
        D(_("Entered By"), "entered_by", "Link", 120, options="User"), D(_("Entered On"), "entered_on", "Datetime", 140),
        D(_("Approved By"), "approved_by", "Link", 120, options="User"), D(_("Approved On"), "approved_on", "Datetime", 140),
        D(_("State"), "state", "Data", 110),
        D(_("Base Qty (snapshot)"), "base_qty_snapshot", "Float", 110, precision=6),
        D(_("Base Revision Ref"), "base_revision_reference", "Link", 130, options="IRPO Quantity Ledger"),
        D(_("Cumulative Qty"), "cum_completed_qty", "Float", 110, precision=6),
        D(_("Original Previous Qty"), "prev_completed_qty_snapshot", "Float", 120, precision=6),
        D(_("Original Increment"), "period_completed_qty_snapshot", "Float", 110, precision=6),
        D(_("Effective Previous Qty"), "effective_prev_qty", "Float", 120, precision=6),
        D(_("Effective Increment"), "effective_increment", "Float", 120, precision=6),
        D(_("Saved %"), "cum_percent", "Percent", 90, precision=4),
        D(_("Remarks"), "remarks", "Data", 200), D(_("Hold Exception Reason"), "hold_exception_reason", "Data", 180),
        D(_("Hold Exception Reviewed By"), "hold_exception_reviewed_by", "Link", 140, options="User"),
        D(_("Amends"), "amended_from", "Link", 140, options=PROGRESS),
        D(_("Cancellation Reason"), "cancellation_reason", "Data", 180), D(_("Return Reason"), "return_reason", "Data", 180),
        D(_("Recalculation Cause / Log"), "recalc_log", "Data", 320),
    ]
    return columns, data, _("Original = values saved at approval. Effective = recomputed after later approved late entries; the original approval and recalculation trail is preserved.")