"""Step 8 - DB layer: reporting completion and reopening (handoff 15.3 / 15.4).

Closed windows are DERIVED from approved records + effective revisions, so a
cancelled completion record automatically restores reporting obligations.
Status events (Completed / Reopened) are written best-effort for the audit trail.
"""
import frappe
from frappe import _
from frappe.utils import getdate, nowdate, now_datetime

from .calculation import get_applicable_base
from .completion_calc import closed_windows, monday, window_containing
from .hold_controls import EVENT_DT, history_table_field, status_events
from .quantity_revision import revision_rows
from .revision_calc import base_at



def get_reporting_windows(task_name, as_of=None, exclude=None):
	as_of = getdate(as_of or nowdate())
	records = [
		{"week_start": r.week_start_date, "cutoff": r.measurement_cutoff_date, "cum_qty": r.cum_completed_qty}
		for r in frappe.get_all(
			"IRPO Progress",
			filters={"irpo_task": task_name, "docstatus": 1},
			fields=["name", "week_start_date", "measurement_cutoff_date", "cum_completed_qty"],
		)
		if r.week_start_date and r.measurement_cutoff_date and r.name != exclude
	]
	if not records:
		return []
	task = frappe.get_doc("Task", task_name)
	current = get_applicable_base(task)["base"]
	rows = revision_rows(task_name)
	return closed_windows(
		records,
		[r["posting_date"] for r in rows],
		lambda d: base_at(current, rows, d)[0],
		as_of,
	)


def check_reporting_open(task_name, week_start):
	"""Block NEW measurements for a week inside a closed (post-completion) window."""
	win = window_containing(week_start, get_reporting_windows(task_name))
	if win:
		start, end = win
		frappe.throw(
			_("Reporting for this IRPO is closed from {0}{1}: approved completed quantity already equals "
			  "the effective base. It reopens automatically if an approved quantity revision makes the IRPO incomplete.")
			.format(start, f" until {end}" if end else ""),
			title=_("Reporting closed"),
		)


def _last_completion_event(task_name):
	rows = status_events(task_name, ("Completed", "Reopened"))
	return rows[-1].event_type if rows else None


def _log_event(task_name, event_type, effective_date, reason, progress_name):
	"""Append a row to the Task's reporting status history (child table), best effort."""
	try:
		field = history_table_field()
		if not field:
			return
		idx = (frappe.db.sql("select max(idx) from `tab%s` where parent=%%s and parenttype='Task'" % EVENT_DT, task_name)[0][0] or 0) + 1
		frappe.get_doc({
			"doctype": EVENT_DT, "parent": task_name, "parenttype": "Task", "parentfield": field, "idx": idx,
			"event_type": event_type, "effective_date": getdate(effective_date), "reason": reason,
			"reference_doctype": "IRPO Progress" if progress_name else None, "reference_name": progress_name,
			"recorded_by": frappe.session.user, "recorded_on": now_datetime(),
		}).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="US-11 completion event not logged", message=frappe.get_traceback())


def sync_reporting_completion(task_name, progress_name=None):
	"""Call after an approval or cancellation, inside the same transaction."""
	windows = get_reporting_windows(task_name)
	closed_now = bool(windows) and windows[-1][1] is None
	last = _last_completion_event(task_name)
	if closed_now and last != "Completed":
		_log_event(task_name, "Completed", windows[-1][0], "Approved completed quantity reached the effective base",
			progress_name)
	elif not closed_now and last == "Completed":
		if windows:
			when, why = windows[-1][1], "Approved quantity revision made the IRPO incomplete"
		else:
			when, why = monday(nowdate()), "Completion no longer supported (record cancelled or corrected)"
		_log_event(task_name, "Reopened", when, why, progress_name)