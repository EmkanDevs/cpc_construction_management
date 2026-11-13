"""Step 11 - server API for the Weekly Progress page (handoff Sections 8, 11, 13, 15, 16).

Thin by design: every number shown is produced by the Step 5-10 services. Saving
creates independent IRPO Progress documents (one per IRPO and week), never
auto-submits untouched rows, and is idempotent on (IRPO, week).

Approval marker: when no Workflow is active for IRPO Progress, `sent_for_approval_on`
is the "sent" flag. Save Draft clears it, Send for Approval sets it, and the
Approvals tab lists only records where it is set.
"""
from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils import cint, flt, getdate, now_datetime, nowdate, strip_html

from .calculation import get_applicable_base
from .completion import get_reporting_windows
from .completion_calc import is_week_closed
from .hold_calc import is_fully_held, overlaps_hold
from .hold_controls import hold_intervals, status_events
from .quantity_revision import apply_revision_base, revision_rows
from .reporting_anchor import get_reporting_anchor, resolve_week_for_date
from .screens_calc import needs_action, week_label

PROGRESS = "IRPO Progress"
EDITABLE_STATES = (None, "", "Draft", "Returned")
RECORD_FIELDS = [
    "name", "irpo_task", "calendar_week", "docstatus", "workflow_state", "input_mode", "cum_completed_qty",
    "cum_percent", "measurement_cutoff_date", "no_change", "remarks", "return_reason", "base_qty_snapshot",
    "prev_completed_qty_snapshot", "period_completed_qty_snapshot", "remaining_qty",
    "partial_hold_exception", "hold_exception_reason", "requires_hold_review", "sent_for_approval_on",
]


# ---------------------------------------------------------------- helpers

def _week(name):
    week = frappe.db.get_value("CPC Calendar Week", name, ["name", "week_year", "week_number", "start_date", "end_date"], as_dict=True)
    if not week:
        frappe.throw(_("Calendar Week {0} does not exist.").format(name))
    return week


def _bounds(week):
    return datetime.combine(getdate(week.start_date), time.min), datetime.combine(getdate(week.end_date), time.max)


def _irpos(project=None, irpo_task=None, boq_parent=None, search=None, status=None, limit=500):
    filters = {"cpc_is_irpo": 1, "is_group": 0, "status": ["!=", "Cancelled"]}
    if project:
        filters["project"] = project
    if irpo_task:
        filters["name"] = irpo_task
    if boq_parent:
        filters["parent_task"] = boq_parent
    if status:
        filters["status"] = status
    or_filters = [["name", "like", f"%{search}%"], ["subject", "like", f"%{search}%"]] if search else None
    return frappe.get_list("Task", filters=filters, or_filters=or_filters, order_by="parent_task, name", limit=limit,
                          fields=["name", "subject", "parent_task", "status", "exp_start_date", "progress"])


def _anchor_week_start(task_name):
    try:
        anchor = get_reporting_anchor(frappe.get_doc("Task", task_name))
        week = resolve_week_for_date(anchor) if anchor else None
        return getdate(week["start_date"]) if week else None
    except Exception:
        return None


def _clean(e):
    frappe.clear_messages()
    return strip_html(str(e)).strip()


def _has_workflow():
    return bool(frappe.db.get_value("Workflow", {"document_type": PROGRESS, "is_active": 1}, "name"))


def _rec_state(rec, has_wf):
    """Record state as the week label logic should see it. Without a workflow,
    a draft that was sent for approval counts as Pending Approval."""
    if not rec:
        return None
    state = rec.workflow_state
    if not has_wf and rec.docstatus == 0 and rec.get("sent_for_approval_on"):
        state = "Pending Approval"
    return {"docstatus": rec.docstatus, "workflow_state": state}


def _pick_action(doc, predicate):
    states = {s.state: str(s.doc_status) for s in frappe.get_all(
        "Workflow Document State", filters={"parent": frappe.db.get_value("Workflow", {"document_type": PROGRESS, "is_active": 1}, "name")},
        fields=["state", "doc_status"])}
    for t in get_transitions(doc):
        if predicate(t.get("next_state"), states.get(t.get("next_state"))):
            return t.get("action")
    return None


def _default_cutoff(week_start, cutoff, intervals):
    """Default measurement cutoff for a partly held week.

    If a Hold starts inside the week and is still in force at the normal cutoff,
    the last active day is the day before the Hold starts, so the user does not
    default into the held days. Otherwise the normal cutoff is used.
    """
    ws = getdate(week_start)
    try:
        for iv in intervals:
            start, end = iv[0], iv[1]
            s_date = getdate(start)
            e_date = getdate(end) if end else None
            if ws < s_date <= cutoff and (e_date is None or e_date > cutoff):
                return s_date - timedelta(days=1)
    except Exception:
        pass  # unknown interval shape: fall back to the normal cutoff
    return cutoff


# ---------------------------------------------------------------- entry rows

@frappe.whitelist()
def get_entry_rows(project, calendar_week, boq_parent=None, search=None, status=None):
    frappe.has_permission(PROGRESS, "read", throw=True)
    week = _week(calendar_week)
    today = getdate(nowdate())
    if getdate(week.start_date) > today:
        frappe.throw(_("{0} has not started yet. Progress cannot be recorded for a future week.").format(calendar_week))
    cutoff = min(getdate(week.end_date), today)
    ps, pe = _bounds(week)
    has_wf = _has_workflow()

    tasks = _irpos(project, None, boq_parent, search, status)
    names = [t.name for t in tasks]
    records = {}
    prev = {}
    if names:
        for r in frappe.get_list(PROGRESS, filters={"irpo_task": ["in", names], "calendar_week": calendar_week, "docstatus": ["<", 2]}, fields=RECORD_FIELDS, limit_page_length=0):
            records[r.irpo_task] = r
        for r in frappe.get_list(PROGRESS, filters={"irpo_task": ["in", names], "docstatus": 1, "week_start_date": ["<", week.start_date]},
                                fields=["irpo_task", "calendar_week", "week_start_date", "cum_completed_qty", "cum_percent"],
                                order_by="week_start_date asc", limit_page_length=0):
            prev[r.irpo_task] = r   # ascending order: the last one is the nearest earlier approved

    rows = []
    for t in tasks:
        iv = hold_intervals(t.name)
        windows = get_reporting_windows(t.name)
        closed = is_week_closed(week.start_date, windows)
        held_full = is_fully_held(ps, pe, iv)
        held_part = (not held_full) and overlaps_hold(ps, pe, iv)
        rec = records.get(t.name)
        rec_state = _rec_state(rec, has_wf)
        label = week_label(week.start_date, week.end_date, today, _anchor_week_start(t.name),
                           rec_state, held_full, held_part, closed)

        base, base_ref, live_base = None, None, None
        try:
            taskdoc = frappe.get_doc("Task", t.name)
            info = get_applicable_base(taskdoc)
            live_base = flt(info["base"])
            rev = apply_revision_base(taskdoc, info, cutoff)
            base, base_ref = flt(rev["base"]), rev.get("revision_ref")
        except Exception:
            frappe.clear_messages()

        p = prev.get(t.name)
        rows.append({
            "irpo_task": t.name, "subject": t.subject, "boq_parent": t.parent_task, "task_status": t.status,
            "anchor": str(t.exp_start_date) if t.exp_start_date else None,
            "label": label, "needs_action": needs_action(label),
            "editable": bool(label not in ("Not applicable", "Completed — reporting closed", "Hold/carried", "Approved", "Pending approval")
                             and (not rec or (rec.docstatus == 0 and rec_state["workflow_state"] in EDITABLE_STATES))),
            "base": base, "base_revision_ref": base_ref,
            "base_notice": (_("Base revised: {0} for this week, {1} now.").format(f"{base:g}", f"{live_base:g}")
                            if base is not None and live_base is not None and abs(base - live_base) > 1e-6 else None),
            "previous": ({"week": p.calendar_week, "qty": p.cum_completed_qty, "percent": p.cum_percent} if p else None),
            "record": rec,
            "closure_note": (_("Reporting closed after approved completion.") if closed else None),
            "partial_hold": bool(held_part),
            # Last active day before a Hold that starts this week (partly held weeks only)
            "default_cutoff": str(_default_cutoff(week.start_date, cutoff, iv)) if held_part else None,
            "hold_note": (_("On Hold for the whole week.") if held_full else (_("Partly on Hold this week: a Hold exception with reason is needed.") if held_part else None)),
        })
    return {
        "week": {"name": week.name, "start": str(week.start_date), "end": str(week.end_date), "cutoff_default": str(cutoff)},
        "instruction": _("Enter total completed work for this reporting period. For a previous week, include only work completed by that week's Sunday."),
        "rows": rows,
    }


@frappe.whitelist()
def get_outstanding_weeks(project=None, irpo_task=None, boq_parent=None, max_weeks=52):
    frappe.has_permission(PROGRESS, "read", throw=True)
    today = getdate(nowdate())
    has_wf = _has_workflow()
    weeks = frappe.get_all("CPC Calendar Week", filters={"start_date": ["<=", today]},
                           fields=["name", "start_date", "end_date"], order_by="start_date desc", limit=cint(max_weeks))
    weeks.reverse()
    out = []
    for t in _irpos(project, irpo_task, boq_parent, limit=300):
        anchor = _anchor_week_start(t.name)
        if not anchor:
            continue
        recs = {r.calendar_week: r for r in frappe.get_list(
            PROGRESS, filters={"irpo_task": t.name, "docstatus": ["<", 2]},
            fields=["calendar_week", "docstatus", "workflow_state", "sent_for_approval_on"], limit_page_length=0)}
        iv, windows = hold_intervals(t.name), get_reporting_windows(t.name)
        for w in weeks:
            ps, pe = _bounds(w)
            held_full = is_fully_held(ps, pe, iv)
            held_part = (not held_full) and overlaps_hold(ps, pe, iv)
            rec = recs.get(w.name)
            label = week_label(w.start_date, w.end_date, today, anchor,
                               _rec_state(rec, has_wf),
                               held_full, held_part, is_week_closed(w.start_date, windows))
            if needs_action(label):
                out.append({"irpo_task": t.name, "subject": t.subject, "boq_parent": t.parent_task,
                            "calendar_week": w.name, "week_start": str(w.start_date), "week_end": str(w.end_date), "label": label})
    return out


# ---------------------------------------------------------------- save / send

def _apply_row(doc, r, week):
    doc.irpo_task = r["irpo_task"]
    doc.calendar_week = week
    doc.measurement_cutoff_date = r.get("measurement_cutoff_date") or None
    mode = r.get("input_mode") or "Quantity"
    doc.input_mode = mode
    doc.no_change = cint(r.get("no_change"))
    if mode == "Quantity" and r.get("cum_completed_qty") not in (None, ""):
        doc.cum_completed_qty = flt(r.get("cum_completed_qty"))
    if mode == "Percentage" and r.get("cum_percent") not in (None, ""):
        doc.cum_percent = flt(r.get("cum_percent"))
    doc.remarks = r.get("remarks")
    doc.partial_hold_exception = cint(r.get("partial_hold_exception"))
    doc.hold_exception_reason = r.get("hold_exception_reason")


@frappe.whitelist()
def save_rows(calendar_week, rows, send_for_approval=0):
    """Save edited rows as independent drafts; optionally send each for approval.
    Returns a per-row result list. Re-sending the same rows updates, never duplicates.

    Save Draft (send_for_approval=0) never puts a record in the Approvals tab.
    Only Send for Approval does."""
    rows = frappe.parse_json(rows) if isinstance(rows, str) else rows
    frappe.has_permission(PROGRESS, "create", throw=True)
    has_wf = _has_workflow()
    results = []
    for r in rows:
        key = r.get("irpo_task")
        frappe.db.savepoint("row")
        try:
            frappe.has_permission("Task", "read", key, throw=True)
            name = frappe.db.get_value(PROGRESS, {"irpo_task": key, "calendar_week": calendar_week, "docstatus": ["<", 2]}, "name")
            if name:
                doc = frappe.get_doc(PROGRESS, name)
                if doc.docstatus != 0 or doc.workflow_state not in EDITABLE_STATES:
                    raise frappe.ValidationError(_("{0} is already {1} and cannot be edited here.").format(name, doc.workflow_state or "approved"))
                if not has_wf and doc.sent_for_approval_on:
                    raise frappe.ValidationError(_("{0} has been sent for approval and cannot be edited.").format(name))
                _apply_row(doc, r, calendar_week)
                doc.save()
            else:
                doc = frappe.new_doc(PROGRESS)
                _apply_row(doc, r, calendar_week)
                doc.insert()

            state = doc.workflow_state
            if not has_wf:
                if cint(send_for_approval):
                    doc.db_set("sent_for_approval_on", now_datetime(), update_modified=False)
                    state = "Pending Approval"
                else:
                    doc.db_set("sent_for_approval_on", None, update_modified=False)
                    state = "Draft"
            elif cint(send_for_approval):
                action = _pick_action(doc, lambda nxt, ds: nxt == "Pending Approval")
                if not action:
                    raise frappe.ValidationError(_("No workflow action is available to send this record for approval."))
                doc = apply_workflow(doc, action)
                state = doc.workflow_state
            results.append({"irpo_task": key, "ok": True, "name": doc.name, "state": state or "Draft"})
        except Exception as e:
            frappe.db.rollback(save_point="row")
            results.append({"irpo_task": key, "ok": False, "error": _clean(e)})
    return results


# ---------------------------------------------------------------- approval view

@frappe.whitelist()
def get_approval_queue(project=None):
    frappe.has_permission(PROGRESS, "read", throw=True)
    has_workflow = _has_workflow()
    filters = {"docstatus": 0}
    if has_workflow:
        filters["workflow_state"] = "Pending Approval"
    else:
        filters["sent_for_approval_on"] = ["is", "set"]   # only records explicitly sent for approval
    if project:
        filters["project"] = project
    out = []
    for r in frappe.get_list(PROGRESS, filters=filters, order_by="week_start_date asc, modified asc",
            fields=RECORD_FIELDS + ["project", "week_start_date", "week_ending", "owner", "entered_by", "last_material_editor",
                                    "previous_progress_reference"], limit_page_length=0):
        later = frappe.db.count(PROGRESS, {"irpo_task": r.irpo_task, "docstatus": 1, "week_start_date": [">", r.week_start_date]})
        live_base = None
        try:
            live_base = flt(get_applicable_base(frappe.get_doc("Task", r.irpo_task))["base"])
        except Exception:
            frappe.clear_messages()
        # The workflow decides who may approve: allowed if a transition to an approved state is open to this user.
        can_approve = bool(_pick_action(frappe.get_doc(PROGRESS, r.name), lambda nxt, ds: ds == "1")) if has_workflow else False
        flags = []
        if later:
            flags.append(_("Late entry: later approved measurements exist; their increments will be recalculated."))
        if r.partial_hold_exception or r.requires_hold_review:
            flags.append(_("Hold exception: {0}").format(r.hold_exception_reason or ""))
        if live_base is not None and abs(live_base - flt(r.base_qty_snapshot)) > 1e-6:
            flags.append(_("Quantity base changed since preparation ({0} → {1}); return it for re-confirmation.").format(f"{flt(r.base_qty_snapshot):g}", f"{live_base:g}"))
        r.update({"can_approve": can_approve, "block_reason": None if can_approve else "no_transition", "flags": flags, "preparer": r.entered_by or r.owner})
        out.append(r)
    return out


@frappe.whitelist()
def approve_record(name):
    doc = frappe.get_doc(PROGRESS, name)
    if not _has_workflow():
        frappe.throw(_("No workflow is active for IRPO Progress. Run the CPC migration before approving records."))
    if doc.docstatus != 0 or doc.workflow_state != "Pending Approval":
        frappe.throw(_("Only a record in Pending Approval can be approved."))
    action = _pick_action(doc, lambda nxt, ds: ds == "1")
    if not action:
        frappe.throw(_("The workflow does not allow you to approve this record."))
    doc = apply_workflow(doc, action)
    return {"name": doc.name, "state": doc.workflow_state, "docstatus": doc.docstatus}


# ---------------------------------------------------------------- task details

@frappe.whitelist()
def get_irpo_history(irpo_task):
    frappe.has_permission(PROGRESS, "read", throw=True)
    from .quantity_revision import get_base_at

    task = frappe.get_doc("Task", irpo_task)
    task.check_permission("read")
    records = frappe.get_list(PROGRESS, filters={"irpo_task": irpo_task, "docstatus": ["<", 3]}, order_by="week_start_date asc, creation asc",
        fields=["name", "calendar_week", "week_start_date", "docstatus", "workflow_state", "cum_completed_qty", "cum_percent",
                "base_qty_snapshot", "prev_completed_qty_snapshot", "period_completed_qty_snapshot", "period_percent_same_base",
                "measurement_cutoff_date", "approved_by", "approved_on", "cancellation_reason", "amended_from", "return_reason"], limit_page_length=0)
    windows = get_reporting_windows(irpo_task)
    live_base = None
    try:
        live_base = flt(get_applicable_base(task)["base"])
    except Exception:
        frappe.clear_messages()
    revisions = [{"posting_date": str(r["posting_date"]), "revision_no": r["revision_no"], "before": r["budget_qty_before"], "after": r["budget_qty_after"], "ref": r["name"]}
                 for r in revision_rows(irpo_task)]
    events = status_events(irpo_task)
    reviews = frappe.get_list("CPC IRPO Scope Review", filters={"irpo_task": irpo_task}, order_by="creation desc",
        fields=["name", "status", "reason", "requested_by", "requested_on", "reviewed_by", "review_notes",
                "commercial_change_required", "commercial_change_approved", "commercial_change_reference", "effective_date"], limit_page_length=0)
    return {
        "irpo": irpo_task, "subject": task.subject, "task_status": task.status, "progress": task.get("progress"),
        "live_base": live_base, "records": records, "revisions": revisions,
        "closed_windows": [{"from": str(s), "to": str(e) if e else None} for s, e in windows],
        "reporting_closed_now": bool(windows) and windows[-1][1] is None,
        "status_events": events, "scope_reviews": reviews,
    }
