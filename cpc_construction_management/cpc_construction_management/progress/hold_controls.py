# """Step 9 - DB layer for Hold / partial-period rules.

# Reads Hold/Resume history from `CPC IRPO Reporting Status Event` and applies
# hold_calc rules to an IRPO Progress doc. Field names are probed from candidates
# so it works with the Step 3/4 doctypes as built; edit the tuples if yours differ.

# Also provides the only supported way to RECORD a Hold / Resume event on an IRPO
# Task (`record_status_event`), used by the Hold / Resume button on the Task form.
# """
# from datetime import datetime, time

# import frappe
# from frappe import _
# from frappe.utils import get_datetime, getdate, now_datetime

# from .hold_calc import (
#     build_hold_intervals, validate_hold_rules, period_status, is_fully_held,
# )

# EVENT_DT = "CPC IRPO Reporting Status Event"
# C_TASK = ("task", "irpo", "irpo_task")
# C_TYPE = ("event_type", "status", "event")
# C_WHEN = ("effective_datetime", "effective_date_time", "effective_on", "effective_date", "event_datetime")
# C_PS = ("week_start_date", "period_start", "week_start", "start_date", "from_date")
# C_PE = ("week_ending", "period_end", "week_end", "end_date", "to_date")
# C_CUTOFF = ("measurement_cutoff", "cutoff_datetime", "cutoff", "measurement_cutoff_date")
# C_EXC = ("partial_hold_exception", "hold_exception", "is_hold_exception")
# C_EXC_REASON = ("hold_exception_reason", "exception_reason")


# def _pick(names, fieldnames):
#     for n in names:
#         if n in fieldnames:
#             return n
#     return None


# def _first(doc, names):
#     for n in names:
#         if doc.get(n) not in (None, ""):
#             return doc.get(n)
#     return None


# def history_table_field():
#     """Fieldname of the child table on Task that stores the reporting status history."""
#     for f in frappe.get_meta("Task").fields:
#         if f.fieldtype == "Table" and f.options == EVENT_DT:
#             return f.fieldname
#     return None


# def status_events(task, types=None):
#     """Reporting status events of a Task (a child table: parent = Task name)."""
#     filters = {"parent": task, "parenttype": "Task"}
#     if types:
#         filters["event_type"] = ["in", list(types)]
#     return frappe.get_all(
#         EVENT_DT, filters=filters, order_by="effective_date asc, idx asc",
#         fields=["name", "idx", "event_type", "effective_date", "reason", "reference_doctype",
#                 "reference_name", "recorded_by", "recorded_on"],
#     )


# def load_hold_events(task):
#     return [
#         {"event_type": r.event_type, "effective_datetime": datetime.combine(getdate(r.effective_date), time.min)}
#         for r in status_events(task, ("Hold", "Resume")) if r.effective_date
#     ]


# def hold_intervals(task):
#     return build_hold_intervals(load_hold_events(task))


# def _period_bounds(doc):
#     ps, pe = _first(doc, C_PS), _first(doc, C_PE)
#     if not (ps and pe):
#         frappe.throw(_("Progress record has no period start/end."))
#     return (datetime.combine(get_datetime(ps).date(), time.min),
#             datetime.combine(get_datetime(pe).date(), time.max))


# def validate_hold_rules_for_progress(doc, method=None):
#     """Hook into IRPO Progress.validate (after Step 5 calculation)."""
#     task = _first(doc, C_TASK)
#     cutoff = _first(doc, C_CUTOFF)
#     if not task or not cutoff:
#         return
#     ps, pe = _period_bounds(doc)
#     raw = cutoff
#     cutoff = get_datetime(raw)
#     if not isinstance(raw, datetime) or (isinstance(raw, str) and len(raw) <= 10):
#         cutoff = datetime.combine(cutoff.date(), time.max)  # date-only cutoff = end of that day
#     now = now_datetime()
#     cutoff = min(cutoff, now)  # a cutoff dated today means "through now", never the rest of the day
#     inc = doc.get("increase_qty") or doc.get("increase_quantity") or 0
#     errors, needs_review = validate_hold_rules(
#         ps, pe, min(cutoff, pe), now, hold_intervals(task),
#         bool(_first(doc, C_EXC)), _first(doc, C_EXC_REASON), inc)
#     if errors:
#         frappe.throw("<br>".join(errors), title=_("Hold rules"))
#     if needs_review and doc.meta.has_field("requires_hold_review"):
#         doc.requires_hold_review = 1


# def week_hold_status(task, period_start, period_end, has_record):
#     """For screens/reports: 'Hold/carried' or None."""
#     return period_status(period_start, period_end, hold_intervals(task), has_record)


# def week_is_exempt(task, period_start, period_end):
#     """Missing-updates report must skip fully held weeks."""
#     return is_fully_held(period_start, period_end, hold_intervals(task))


# # ---------------------------------------------------------------- recording Hold / Resume

# def _current_hold_state(task):
#     """('Hold' | 'Active', date of the last Hold/Resume event or None)."""
#     events = status_events(task, ("Hold", "Resume"))
#     if not events:
#         return "Active", None
#     last = events[-1]
#     return ("Hold" if last.event_type == "Hold" else "Active"), getdate(last.effective_date)


# @frappe.whitelist()
# def get_current_state(task):
#     """'Hold' if the IRPO is currently on Hold, else 'Active'. Drives the Hold / Resume button."""
#     return _current_hold_state(task)[0]


# @frappe.whitelist()
# def record_status_event(task, event, effective_date, reason):
#     """Record a Hold or Resume event on an IRPO Task.

#     Rules: IRPO leaf Tasks only; reason required; no future dates; Hold only when
#     active, Resume only when on Hold; the date must be after the last Hold/Resume
#     event; not allowed while reporting is closed after approved completion.
#     """
#     if event not in ("Hold", "Resume"):
#         frappe.throw(_("Only Hold and Resume can be recorded here."))
#     reason = (reason or "").strip()
#     if not reason:
#         frappe.throw(_("A reason is required."))

#     doc = frappe.get_doc("Task", task)
#     frappe.has_permission("Task", "write", doc=doc, throw=True)
#     if not doc.get("cpc_is_irpo") or doc.is_group:
#         frappe.throw(_("Hold/Resume applies only to IRPO tasks."))

#     from .completion import get_reporting_windows  # lazy import avoids circular imports

#     windows = get_reporting_windows(task)
#     if windows and windows[-1][1] is None:
#         frappe.throw(_("Reporting is closed after approved completion. Reopen it before changing Hold status."))

#     when = getdate(effective_date)
#     if when > getdate(now_datetime()):
#         frappe.throw(_("The effective date cannot be in the future."))

#     state, last_date = _current_hold_state(task)
#     if event == "Hold" and state == "Hold":
#         frappe.throw(_("This IRPO is already on Hold."))
#     if event == "Resume" and state != "Hold":
#         frappe.throw(_("This IRPO is not on Hold."))
#     if last_date and when <= last_date:
#         frappe.throw(_("The effective date must be after the last Hold/Resume event ({0}).").format(last_date))

#     table = history_table_field()
#     if not table:
#         frappe.throw(_("The Reporting Status History table was not found on Task."))

#     doc.append(table, {
#         "event_type": event,
#         "effective_date": when,
#         "reason": reason,
#         "recorded_by": frappe.session.user,
#         "recorded_on": now_datetime(),
#     })
#     doc.save()
#     return {"state": "Hold" if event == "Hold" else "Active"}


























"""Step 9 - DB layer for Hold / partial-period rules.

Reads Hold/Resume history from `CPC IRPO Reporting Status Event` and applies
hold_calc rules to an IRPO Progress doc. Field names are probed from candidates
so it works with the Step 3/4 doctypes as built; edit the tuples if yours differ.

Also provides the only supported way to RECORD a Hold / Resume event on an IRPO
Task (`record_status_event`), used by the Hold / Resume button on the Task form.
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


# ---------------------------------------------------------------- recording Hold / Resume

def _current_hold_state(task):
    """('Hold' | 'Active', date of the last Hold/Resume event or None)."""
    events = status_events(task, ("Hold", "Resume"))
    if not events:
        return "Active", None
    last = events[-1]
    return ("Hold" if last.event_type == "Hold" else "Active"), getdate(last.effective_date)


@frappe.whitelist()
def get_current_state(task):
    """'Hold' if the IRPO is currently on Hold, else 'Active'. Drives the Hold / Resume button."""
    return _current_hold_state(task)[0]


@frappe.whitelist()
def record_status_event(task, event, effective_date, reason):
    """Record a Hold or Resume event on an IRPO Task.

    Rules: IRPO leaf Tasks only; reason required; no future dates; Hold only when
    active, Resume only when on Hold; the date must be after the last Hold/Resume
    event; not allowed while reporting is closed after approved completion.
    """
    if event not in ("Hold", "Resume"):
        frappe.throw(_("Only Hold and Resume can be recorded here."))
    reason = (reason or "").strip()
    if not reason:
        frappe.throw(_("A reason is required."))

    doc = frappe.get_doc("Task", task)
    frappe.has_permission("Task", "write", doc=doc, throw=True)
    if not doc.get("cpc_is_irpo") or doc.is_group:
        frappe.throw(_("Hold/Resume applies only to IRPO tasks."))

    from .completion import get_reporting_windows  # lazy import avoids circular imports

    windows = get_reporting_windows(task)
    if windows and windows[-1][1] is None:
        frappe.throw(_("Reporting is closed after approved completion. Reopen it before changing Hold status."))

    when = getdate(effective_date)
    if when > getdate(now_datetime()):
        frappe.throw(_("The effective date cannot be in the future."))

    state, last_date = _current_hold_state(task)
    if event == "Hold" and state == "Hold":
        frappe.throw(_("This IRPO is already on Hold."))
    if event == "Resume" and state != "Hold":
        frappe.throw(_("This IRPO is not on Hold."))
    if last_date:
        # A Resume may be dated the same day as its Hold (cancels a Hold put on by mistake).
        # A Hold must be after the last event; nothing may be dated before it.
        if when < last_date or (event == "Hold" and when == last_date):
            frappe.throw(_("The effective date must be after the last Hold/Resume event ({0}).").format(last_date))

    table = history_table_field()
    if not table:
        frappe.throw(_("The Reporting Status History table was not found on Task."))

    doc.append(table, {
        "event_type": event,
        "effective_date": when,
        "reason": reason,
        "recorded_by": frappe.session.user,
        "recorded_on": now_datetime(),
    })
    doc.save()
    return {"state": "Hold" if event == "Hold" else "Active"}