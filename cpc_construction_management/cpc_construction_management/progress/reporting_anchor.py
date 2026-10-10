# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt


from datetime import date

import frappe
from frappe.utils import getdate, now_datetime, nowdate

APPROVER_ROLES = ("System Manager", "IRPO Progress Approver")


# ---------------------------------------------------------------------------
# Reporting anchor     
# ---------------------------------------------------------------------------

def get_reporting_anchor(task):
	"""Return the execution-week-1 anchor date for an IRPO Task.

	Locked (`custom_irpo_reporting_anchor`) once the first approved IRPO
	Progress record sets it via `lock_reporting_anchor`. Before that, it
	tracks the Task's own Expected Start Date live, per Section 7: "Initially,
	the reporting anchor is the Task Planned Start Date."
	"""
	task = _as_task_doc(task)
	if task.get("custom_irpo_reporting_anchor"):
		return getdate(task.custom_irpo_reporting_anchor)
	if task.get("exp_start_date"):
		return getdate(task.exp_start_date)
	return None


def lock_reporting_anchor(task_name):
	"""Freeze the reporting anchor at its current value.

	Call this at the point of the *first* approved IRPO Progress record for
	a Task (wired in Step 6). Idempotent — does nothing if already locked.
	Section 7: "After approved history exists ... preserve the original
	reporting anchor for this reporting series."
	"""
	task = frappe.get_doc("Task", task_name)
	if task.get("custom_irpo_reporting_anchor"):
		return getdate(task.custom_irpo_reporting_anchor)

	anchor = get_reporting_anchor(task)
	if not anchor:
		frappe.throw(f"Cannot lock a reporting anchor for {task_name}: no Expected Start Date is set.")
 
	task.db_set("custom_irpo_reporting_anchor", anchor)
	return anchor


# ---------------------------------------------------------------------------
# Calendar week resolution
# ---------------------------------------------------------------------------

def resolve_week_for_date(target_date):
	"""Return the CPC Calendar Week doc (as a dict) containing `target_date`,
	or None if that ISO year hasn't been generated yet."""
	target_date = getdate(target_date)
	rows = frappe.get_all(
		"CPC Calendar Week",
		filters={"start_date": ["<=", target_date], "end_date": [">=", target_date]},
		fields=["name", "week_year", "week_number", "start_date", "end_date", "display_label"],
		limit=1,
	)
	return rows[0] if rows else None


def execution_week_number(anchor_week_start, week_start):
	"""Section 7's formula: execution_week = (week_start - anchor_week_start)/7 + 1.
	Continues counting across year boundaries and Hold periods unchanged —
	Hold affects reporting status, never this counter (Section 3: 'Execution-
	week counter: Continues during Hold; does not pause')."""
	anchor_week_start = getdate(anchor_week_start)
	week_start = getdate(week_start)
	return ((week_start - anchor_week_start).days // 7) + 1


# ---------------------------------------------------------------------------
# Status history — Hold / Resume / Completed / Reopened
# ---------------------------------------------------------------------------

def record_status_event(task_name, event_type, effective_date, reason=None, reference_doctype=None, reference_name=None):
	"""Low-level append-only writer. Prefer the specific hold_irpo/resume_irpo/
	mark_irpo_completed/reopen_irpo wrappers below, which add state validation."""
	if event_type not in ("Hold", "Resume", "Completed", "Reopened", "Schedule Change", "Scope Change"):
		frappe.throw(f"Unknown reporting status event type: {event_type}")

	effective_date = getdate(effective_date)
	if effective_date > getdate(nowdate()):
		frappe.throw("Reporting status events cannot be dated in the future.")

	task = frappe.get_doc("Task", task_name)
	task.append(
		"custom_irpo_reporting_status_history",
		{
			"event_type": event_type,
			"effective_date": effective_date,
			"reason": reason,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"recorded_by": frappe.session.user,
			"recorded_on": now_datetime(),
		},
	)

	if event_type == "Completed":
		task.db_set("custom_irpo_reporting_closed", 1)
		task.db_set("custom_irpo_reporting_closed_on", effective_date)
	elif event_type == "Reopened":
		task.db_set("custom_irpo_reporting_closed", 0)
		task.db_set("custom_irpo_reporting_closed_on", None)

	task.save(ignore_permissions=True)
	return task.name


def _current_hold_state(events):
	"""events: list of {event_type, effective_date} sorted ascending.
	Returns (hold_intervals, currently_held: bool)."""
	hold_intervals = []  # list of (start, end_or_None)
	open_hold_start = None
	for ev in events:
		if ev["event_type"] == "Hold":
			if open_hold_start is None:
				open_hold_start = ev["effective_date"]
		elif ev["event_type"] == "Resume":
			if open_hold_start is not None:
				hold_intervals.append((open_hold_start, ev["effective_date"]))
				open_hold_start = None
	if open_hold_start is not None:
		hold_intervals.append((open_hold_start, None))
	return hold_intervals, open_hold_start is not None


def _require_approver_role():
	user_roles = frappe.get_roles(frappe.session.user)
	if not any(role in user_roles for role in APPROVER_ROLES):
		frappe.throw("You do not have permission to change IRPO reporting status.")


@frappe.whitelist()
def hold_irpo(task_name, effective_date=None, reason=None):
	_require_approver_role()
	events = _get_sorted_events(task_name)
	_, currently_held = _current_hold_state(events)
	if currently_held:
		frappe.throw(f"{task_name} is already on Hold.")
	return record_status_event(task_name, "Hold", effective_date or nowdate(), reason)


@frappe.whitelist()
def resume_irpo(task_name, effective_date=None, reason=None):
	_require_approver_role()
	events = _get_sorted_events(task_name)
	_, currently_held = _current_hold_state(events)
	if not currently_held:
		frappe.throw(f"{task_name} is not currently on Hold.")
	return record_status_event(task_name, "Resume", effective_date or nowdate(), reason)


@frappe.whitelist()
def mark_irpo_completed(task_name, effective_date=None, reason=None):
	_require_approver_role()
	return record_status_event(task_name, "Completed", effective_date or nowdate(), reason)


@frappe.whitelist()
def reopen_irpo(task_name, effective_date=None, reason=None):
	_require_approver_role()
	task = frappe.get_doc("Task", task_name)
	if not task.get("custom_irpo_reporting_closed"):
		frappe.throw(f"{task_name}'s reporting is not closed; nothing to reopen.")
	return record_status_event(task_name, "Reopened", effective_date or nowdate(), reason)


def _get_sorted_events(task_name):
	rows = frappe.get_all(
		"CPC IRPO Reporting Status Event",
		filters={"parent": task_name, "parenttype": "Task"},
		fields=["event_type", "effective_date"],
		order_by="effective_date asc, idx asc",
	)
	for row in rows:
		row["effective_date"] = getdate(row["effective_date"])
	return rows


# ---------------------------------------------------------------------------
# Applicable-week resolution
# ---------------------------------------------------------------------------

def get_applicable_weeks(task_name, as_of_date=None):
	"""Return the ordered list of execution weeks from this IRPO's anchor
	through `as_of_date` (default today), each classified per Section 8.2 /
	19.2's status vocabulary.

	Returns a dict:
	  {"status": "setup_required", "message": "..."}                    -- anchor/calendar missing
	  {"status": "ok", "anchor": date, "closed": bool, "weeks": [ {...} ]}
	"""
	task = frappe.get_doc("Task", task_name)
	anchor = get_reporting_anchor(task)
	if not anchor:
		return {"status": "setup_required", "message": "Setup required: no Expected Start Date is set on this Task."}

	anchor_week = resolve_week_for_date(anchor)
	if not anchor_week:
		return {
			"status": "setup_required",
			"message": f"Generate the CPC Weekly Calendar for {anchor.year} before reporting can begin.",
		}

	as_of_date = getdate(as_of_date) if as_of_date else getdate(now_datetime())
	as_of_week = resolve_week_for_date(as_of_date)
	if not as_of_week:
		return {
			"status": "setup_required",
			"message": f"Generate the CPC Weekly Calendar for {as_of_date.year} to resolve the current period.",
		}

	if as_of_week["start_date"] < anchor_week["start_date"]:
		# Requested as-of date is before this IRPO's own start — nothing applicable yet.
		return {"status": "ok", "anchor": anchor, "closed": False, "weeks": []}

	events = _get_sorted_events(task_name)
	hold_intervals, _ = _current_hold_state(events)
	closed_from = None
	for ev in events:
		if ev["event_type"] == "Completed":
			closed_from = ev["effective_date"]
		elif ev["event_type"] == "Reopened":
			closed_from = None

	weeks = frappe.get_all(
		"CPC Calendar Week",
		filters={"start_date": [">=", anchor_week["start_date"]], "end_date": ["<=", as_of_week["end_date"]]},
		fields=["name", "week_year", "week_number", "start_date", "end_date", "display_label"],
		order_by="start_date asc",
	)

	progress_exists = frappe.db.exists("DocType", "IRPO Progress")

	result = []
	for week in weeks:
		week["start_date"] = getdate(week["start_date"])
		week["end_date"] = getdate(week["end_date"])
		exec_week = execution_week_number(anchor_week["start_date"], week["start_date"])

		if closed_from and week["start_date"] > closed_from:
			status = "closed"
		else:
			status = _hold_status_for_week(week, hold_intervals)
			if status == "applicable":
				status = _refine_with_progress(task_name, week, as_of_week, progress_exists)

		result.append(
			{
				"calendar_week": week["name"],
				"week_year": week["week_year"],
				"week_number": week["week_number"],
				"start_date": week["start_date"],
				"end_date": week["end_date"],
				"display_label": week["display_label"],
				"execution_week": exec_week,
				"status": status,
			}
		)

	return {"status": "ok", "anchor": anchor, "closed": bool(closed_from), "weeks": result}


def _hold_status_for_week(week, hold_intervals):
	held_fully = False
	held_partially = False
	for hold_start, hold_end in hold_intervals:
		hold_end_eff = hold_end or date.max
		overlap_start = max(hold_start, week["start_date"])
		overlap_end = min(hold_end_eff, week["end_date"])
		if overlap_start <= overlap_end:
			if hold_start <= week["start_date"] and hold_end_eff >= week["end_date"]:
				held_fully = True
			else:
				held_partially = True
	if held_fully:
		return "held"
	if held_partially:
		return "partial_hold"
	return "applicable"


def _refine_with_progress(task_name, week, as_of_week, progress_exists):
	"""Distinguish generically-applicable weeks into missing / draft / pending
	/ approved / returned / current_not_entered, once IRPO Progress (Step 4)
	exists. Forward-compatible no-op until then."""
	is_current_week = week["name"] == as_of_week["name"]

	if not progress_exists:
		return "current_not_entered" if is_current_week else "missing"

	rows = frappe.get_all(
		"IRPO Progress",
		filters={"irpo_task": task_name, "calendar_week": week["name"], "docstatus": ["!=", 2]},
		fields=["workflow_state", "docstatus"],
		order_by="modified desc",
		limit=1,
	)
	if not rows:
		return "current_not_entered" if is_current_week else "missing"

	row = rows[0]
	if row["docstatus"] == 1:
		return "approved"
	return (row.get("workflow_state") or "draft").lower()


def _as_task_doc(task):
	if isinstance(task, str):
		return frappe.get_doc("Task", task)
	return task