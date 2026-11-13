"""Read-only status map for the IRPO Planner.

Hold / Resume itself is NOT re-implemented here: the planner calls the existing
hold_controls.record_status_event, the same code the Task form button uses.
"""
import frappe
from frappe.utils import flt

from .completion import get_reporting_windows
from .hold_controls import _current_hold_state, status_events


@frappe.whitelist()
def get_planner_status_map(irpos):
    irpos = frappe.parse_json(irpos) or []
    out = {}
    for name in irpos:
        if not frappe.has_permission("Task", "read", name):
            continue
        state, since = _current_hold_state(name)
        windows = get_reporting_windows(name)
        closed = bool(windows and windows[-1][1] is None)
        progress, status = frappe.db.get_value("Task", name, ["progress", "status"])
        if closed:
            label = "Completed"
        elif state == "Hold":
            label = "On Hold"
        elif flt(progress) > 0 or status in ("Working", "Pending Review"):
            label = "In Progress"
        else:
            label = "Open"
        reason = None
        if label == "On Hold":
            ev = status_events(name, ("Hold",))
            reason = ev[-1].reason if ev else None
        out[name] = {"status": label, "held_since": str(since) if since else None, "reason": reason}
    return out


def _reporting_state(name):
    state, _since = _current_hold_state(name)
    windows = get_reporting_windows(name)
    if windows and windows[-1][1] is None:
        return "Completed"
    return "On Hold" if state == "Hold" else "Open"


def _progress_records(task_name):
    """IRPO Progress records for the viewer's Progress & History tab, newest week first."""
    dt = "IRPO Progress"
    meta = frappe.get_meta(dt)
    wanted = [
        "name", "docstatus", "workflow_state", "calendar_week", "execution_week",
        "week_start_date", "week_ending", "measurement_cutoff_date",
        "period_completed_qty_snapshot", "period_percent_same_base",
        "cum_completed_qty", "cum_percent", "base_qty_snapshot", "no_change",
        "entered_by", "entered_on", "approved_by", "approved_on",
        "partial_hold_exception", "hold_exception_reason", "requires_hold_review",
        # return reason: field name differs by build, take whichever exists
        "return_reason", "returned_reason", "return_remarks",
    ]
    fields = [f for f in wanted if f in ("name", "docstatus") or meta.has_field(f)]
    rows = frappe.get_all(
        dt, filters={"irpo_task": task_name}, fields=fields,
        order_by="week_start_date desc, creation desc",
    )
    for r in rows:
        r["return_reason"] = r.get("return_reason") or r.get("returned_reason") or r.get("return_remarks")
        for k in ("week_start_date", "week_ending", "measurement_cutoff_date", "entered_on", "approved_on"):
            if r.get(k):
                r[k] = str(r[k])

    approved = [r for r in rows if r.docstatus == 1 and r.get("workflow_state") == "Approved"]
    latest = approved[0] if approved else None  # rows are newest week first
    live = [r for r in rows if r.docstatus < 2]
    summary = {
        "cum_percent": latest.cum_percent if latest else None,
        "cum_completed_qty": latest.cum_completed_qty if latest else None,
        "base_qty": latest.base_qty_snapshot if latest else None,
        "calendar_week": latest.calendar_week if latest else None,
        "pending_count": sum(1 for r in live if r.get("workflow_state") == "Pending Approval"),
        "returned_count": sum(1 for r in live if r.get("workflow_state") == "Returned"),
    }
    return rows, summary


@frappe.whitelist()
def get_irpo_reporting_summary(task_name):
    """Read-only data for the 'Weekly Progress Reporting' and 'Official Progress'
    sections of the planner's IRPO viewer (same fields as the Task form)."""
    frappe.has_permission("Task", "read", task_name, throw=True)
    meta = frappe.get_meta("Task")

    def val(fieldname):
        return frappe.db.get_value("Task", task_name, fieldname) if meta.has_field(fieldname) else None

    records, summary = _progress_records(task_name)
    summary["reporting_state"] = _reporting_state(task_name)
    return {
        "progress_records": records,
        "progress_summary": summary,
        "reporting_anchor": val("custom_irpo_reporting_anchor"),
        "reporting_closed": 1 if val("custom_irpo_reporting_closed") else 0,
        "approved_qty": val("custom_irpo_approved_qty"),
        "progress_base": val("custom_irpo_progress_base"),
        "latest_approved_period": val("custom_irpo_latest_approved_period"),
        "history": [
            {k: (str(v) if k == "effective_date" and v else v)
             for k, v in row.items()
             if k in ("event_type", "effective_date", "reason", "recorded_by")}
            for row in status_events(task_name)
        ],
    }