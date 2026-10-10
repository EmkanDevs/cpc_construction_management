# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt
#
# US-11 Step 7 — late entries and recalculation audit (Section 13.2).
#
# A late approval for an earlier period (or a cancellation that removes one)
# can change which record is the immediate predecessor of exactly ONE later
# approved record — the nearest later one. No other record is ever affected:
# every record further downstream already points to a predecessor later than
# the one that just changed, so its own chain is untouched.
#
#   Week 1: approved cumulative 20
#   Week 2: missing
#   Week 3: approved cumulative 50
#   Late Week 2 approved at cumulative 35
#     -> Week 2's own period: 35 - 20 = 15
#     -> Week 3's cumulative measurement (50) does NOT change
#     -> Week 3's stored period increment changes: 30 -> 15
#
# Week 3's cumulative and base snapshot are never touched — only its previous/
# period fields are recomputed, using the SAME calc_core.compute_period the
# original approval used, and the change is logged for audit.

import frappe
from frappe.utils import flt, getdate, now_datetime

from cpc_construction_management.cpc_construction_management.progress import calc_core as core
from cpc_construction_management.cpc_construction_management.progress.calculation import get_progress_rows

SNAPSHOT_FIELDS = (
	"previous_progress_reference",
	"prev_completed_qty_snapshot",
	"prev_percent_same_base",
	"period_completed_qty_snapshot",
	"period_percent_same_base",
)


def resync_downstream_period(changed_record_name, cause):
	"""Call after a record's approval status changes (on_submit or on_cancel).
	Finds the nearest later APPROVED record for the same IRPO and, if its
	predecessor actually changed, recomputes its previous/period fields and
	appends an audit row. Returns the affected record's name, or None."""
	changed = frappe.get_doc("IRPO Progress", changed_record_name)
	changed_week_start = getdate(changed.week_start_date)

	rows = get_progress_rows(changed.irpo_task)
	later_approved = sorted(
		(r for r in rows if r["docstatus"] == 1 and r["week_start_date"] > changed_week_start),
		key=lambda r: r["week_start_date"],
	)
	if not later_approved:
		return None

	next_name = later_approved[0]["name"]
	next_doc = frappe.get_doc("IRPO Progress", next_name)

	neighbor_rows = get_progress_rows(changed.irpo_task, exclude_name=next_name)
	neighbors = core.pick_neighbors(neighbor_rows, getdate(next_doc.week_start_date), exclude_name=next_name)
	new_prev_row = neighbors["prev_approved"]
	new_prev_name = new_prev_row["name"] if new_prev_row else None

	if new_prev_name == next_doc.previous_progress_reference:
		return None  # chain unchanged - the usual case, most approvals affect nothing downstream

	new_prev_qty = flt(new_prev_row["cum_completed_qty"]) if new_prev_row else 0
	period = core.compute_period(flt(next_doc.cum_completed_qty), new_prev_qty, flt(next_doc.base_qty_snapshot))

	old_values = {f: next_doc.get(f) for f in SNAPSHOT_FIELDS}
	new_values = {
		"previous_progress_reference": new_prev_name,
		"prev_completed_qty_snapshot": new_prev_qty,
		"prev_percent_same_base": period["prev_pct_same_base"],
		"period_completed_qty_snapshot": period["period_qty"],
		"period_percent_same_base": period["period_pct"],
	}

	frappe.db.set_value("IRPO Progress", next_name, new_values, update_modified=False)
	_append_recalc_log(
		next_name,
		cause=cause,
		source_record=changed.name,
		previous_predecessor=old_values["previous_progress_reference"],
		new_predecessor=new_values["previous_progress_reference"],
		old_period_qty=old_values["period_completed_qty_snapshot"],
		new_period_qty=new_values["period_completed_qty_snapshot"],
		old_period_pct=old_values["period_percent_same_base"],
		new_period_pct=new_values["period_percent_same_base"],
	)
	return next_name


def _append_recalc_log(parent_name, **fields):
	next_idx = (frappe.db.count("CPC IRPO Progress Recalc Event", {"parent": parent_name}) or 0) + 1
	row = frappe.get_doc(
		{
			"doctype": "CPC IRPO Progress Recalc Event",
			"parent": parent_name,
			"parenttype": "IRPO Progress",
			"parentfield": "recalculation_log",
			"idx": next_idx,
			"reviewed_by": frappe.session.user,
			"reviewed_on": now_datetime(),
			**fields,
		}
	)
	row.insert(ignore_permissions=True)