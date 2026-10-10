"""Step 9 - DB layer for Hold / partial-period rules.

Reads Hold/Resume history from `CPC IRPO Reporting Status Event` and applies
hold_calc rules to an IRPO Progress doc. Field names are probed from candidates
so it works with the Step 3/4 doctypes as built; edit the tuples if yours differ.
"""
from datetime import datetime, time

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, now_datetime

from .hold_calc import (
    build_hold_intervals, validate_hold_rules, period_status, is_fully_held,
)

EVENT_DT = "CPC IRPO Reporting Status Event"
C_TASK = ("task", "irpo", "irpo_task")
C_TYPE = ("event_type", "status", "event")
C_WHEN = ("effective_datetime", "effective_date_time", "effective_on", "effective_date", "event_datetime")
C_PS = ("week_start_date", "period_start", "week_start", "start_date", "from_date")
C_PE = ("week_ending", "period_end", "week_end", "end_date", "to_date")
C_CUTOFF = ("measurement_cutoff", "cutoff_datetime", "cutoff", "measurement_cutoff_date")
C_EXC = ("partial_hold_exception", "hold_exception", "is_hold_exception")
C_EXC_REASON = ("hold_exception_reason", "exception_reason")


def _pick(names, fieldnames):
    for n in names:
        if n in fieldnames:
            return n
    return None


def _first(doc, names):
    for n in names:
        if doc.get(n) not in (None, ""):
            return doc.get(n)
    return None


def history_table_field():
    """Fieldname of the child table on Task that stores the reporting status history."""
    for f in frappe.get_meta("Task").fields:
        if f.fieldtype == "Table" and f.options == EVENT_DT:
            return f.fieldname
    return None


def status_events(task, types=None):
    """Reporting status events of a Task (a child table: parent = Task name)."""
    filters = {"parent": task, "parenttype": "Task"}
    if types:
        filters["event_type"] = ["in", list(types)]
    return frappe.get_all(
        EVENT_DT, filters=filters, order_by="effective_date asc, idx asc",
        fields=["name", "idx", "event_type", "effective_date", "reason", "reference_doctype",
                "reference_name", "recorded_by", "recorded_on"],
    )


def load_hold_events(task):
    return [
        {"event_type": r.event_type, "effective_datetime": datetime.combine(getdate(r.effective_date), time.min)}
        for r in status_events(task, ("Hold", "Resume")) if r.effective_date
    ]


def hold_intervals(task):
    return build_hold_intervals(load_hold_events(task))


def _period_bounds(doc):
    ps, pe = _first(doc, C_PS), _first(doc, C_PE)
    if not (ps and pe):
        frappe.throw(_("Progress record has no period start/end."))
    return (datetime.combine(get_datetime(ps).date(), time.min),
            datetime.combine(get_datetime(pe).date(), time.max))


def validate_hold_rules_for_progress(doc, method=None):
    """Hook into IRPO Progress.validate (after Step 5 calculation)."""
    task = _first(doc, C_TASK)
    cutoff = _first(doc, C_CUTOFF)
    if not task or not cutoff:
        return
    ps, pe = _period_bounds(doc)
    raw = cutoff
    cutoff = get_datetime(raw)
    if not isinstance(raw, datetime) or (isinstance(raw, str) and len(raw) <= 10):
        cutoff = datetime.combine(cutoff.date(), time.max)  # date-only cutoff = end of that day
    now = now_datetime()
    cutoff = min(cutoff, now)  # a cutoff dated today means "through now", never the rest of the day
    inc = doc.get("increase_qty") or doc.get("increase_quantity") or 0
    errors, needs_review = validate_hold_rules(
        ps, pe, min(cutoff, pe), now, hold_intervals(task),
        bool(_first(doc, C_EXC)), _first(doc, C_EXC_REASON), inc)
    if errors:
        frappe.throw("<br>".join(errors), title=_("Hold rules"))
    if needs_review and doc.meta.has_field("requires_hold_review"):
        doc.requires_hold_review = 1


def week_hold_status(task, period_start, period_end, has_record):
    """For screens/reports: 'Hold/carried' or None."""
    return period_status(period_start, period_end, hold_intervals(task), has_record)


def week_is_exempt(task, period_start, period_end):
    """Missing-updates report must skip fully held weeks."""
    return is_fully_held(period_start, period_end, hold_intervals(task))