"""Step 8 - DB layer: effective-dated quantity base from IRPO Quantity Ledger.

Confirmed ledger fields: irpo, irpo_budget_row_ref, item, posting_date, revision_no,
budget_qty_before, budget_qty_after, event_type ('Budget Revision' / 'Cancel'),
is_cancelled, reversal_of. Rows never revised keep the base from calculation.py.
"""
import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

from .calculation import get_applicable_base
from .revision_calc import base_at, base_conflict, effective_revision_rows

LEDGER = "IRPO Quantity Ledger"
LEDGER_FIELDS = [
	"name", "irpo", "irpo_budget_row_ref", "item", "posting_date", "revision_no",
	"budget_qty_before", "budget_qty_after", "event_type", "is_cancelled", "reversal_of", "creation",
]


def revision_rows(task_name):
	rows = frappe.get_all(
		LEDGER,
		filters={"irpo": task_name, "event_type": ["in", ["Budget Revision", "Cancel"]]},
		fields=LEDGER_FIELDS,
		order_by="posting_date asc, creation asc",
	)
	return effective_revision_rows(rows)


def apply_revision_base(task, base_info, cutoff):
	"""Return a copy of base_info whose 'base' is the quantity base in force at `cutoff`.
	Falls back to base_info unchanged when the IRPO has no revisions."""
	out = dict(base_info)
	rows = revision_rows(task.name)
	if not rows or not cutoff:
		return out
	base, ref = base_at(base_info["base"], rows, cutoff)
	out["base"] = base
	out["revision_ref"] = ref
	return out


def get_base_at(task_name, cutoff):
	task = frappe.get_doc("Task", task_name)
	info = get_applicable_base(task)
	return apply_revision_base(task, info, cutoff)["base"]


def check_revision_conflict(doc, base):
	"""A base below already approved completed quantity is blocked until resolved."""
	prior = frappe.db.sql(
		"""select max(cum_completed_qty) from `tabIRPO Progress`
		where irpo_task=%s and docstatus=1 and name!=%s and week_start_date<=%s""",
		(doc.irpo_task, doc.name or "", doc.week_start_date),
	)[0][0]
	if base_conflict(base, flt(prior)):
		frappe.throw(
			_("The quantity base ({0}) is below the approved completed quantity ({1}). "
			  "Resolve the quantity revision conflict before recording more progress.").format(
				f"{flt(base):g}", f"{flt(prior):g}"),
			title=_("Quantity revision conflict"),
		)


@frappe.whitelist()
def find_stale_drafts(irpo_task=None):
	"""Drafts / pending records whose stored base differs from the base now effective
	at their cutoff. They need controlled review and re-entry, never silent approval."""
	filters = {"docstatus": 0}
	if irpo_task:
		filters["irpo_task"] = irpo_task
	stale = []
	for r in frappe.get_all("IRPO Progress", filters=filters,
			fields=["name", "irpo_task", "measurement_cutoff_date", "base_qty_snapshot", "workflow_state"]):
		if not r.measurement_cutoff_date:
			continue
		now_base = get_base_at(r.irpo_task, r.measurement_cutoff_date)
		if abs(flt(now_base) - flt(r.base_qty_snapshot)) > 1e-6:
			stale.append({**r, "current_base": now_base})
	return stale