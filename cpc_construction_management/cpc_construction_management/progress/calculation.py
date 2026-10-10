

import frappe
from frappe.utils import flt, getdate

from cpc_construction_management.cpc_construction_management.progress import calc_core as core

QUANTITY_BASIS_LABEL = "Sum of IRPO item-table quantities (numeric basis; mixed UOMs are not converted)"

_RECORD_FIELDS = ["name", "week_start_date", "cum_completed_qty", "docstatus", "workflow_state", "calendar_week"]


# ----------------------------------------------------------------------
# Applicable base
# ----------------------------------------------------------------------

def get_applicable_base(task):
	"""Return {"base", "label", "revision_reference"} for an IRPO Task.

	Today the base is the raw sum of the IRPO item-table quantities (the basis
	agreed in Section 10). Quantity revisions (Step 8) will make this
	effective-date aware; this is the single function to change when they do.
	"""
	task = frappe.get_doc("Task", task) if isinstance(task, str) else task
	base = sum(flt(row.qty) for row in (task.get("custom_items_table") or []))
	if base <= 0:
		frappe.throw(
			f"Setup required: {task.name} has no item quantities to use as the progress base. "
			"Add quantities to its Items Table first."
		)
	return {"base": base, "label": QUANTITY_BASIS_LABEL, "revision_reference": None}


# ----------------------------------------------------------------------
# Record lookups
# ----------------------------------------------------------------------

def get_progress_rows(task_name, exclude_name=None):
	"""All non-cancelled IRPO Progress records for an IRPO, with dates as dates."""
	filters = {"irpo_task": task_name, "docstatus": ["<", 2]}
	if exclude_name:
		filters["name"] = ["!=", exclude_name]
	rows = frappe.get_all("IRPO Progress", filters=filters, fields=_RECORD_FIELDS)
	for row in rows:
		row["week_start_date"] = getdate(row["week_start_date"])
		row["cum_completed_qty"] = flt(row["cum_completed_qty"])
	return rows


def get_latest_approved_record(task_name):
	"""Latest approved record by reporting period (not entry or approval time)."""
	return core.latest_approved(get_progress_rows(task_name))


# ----------------------------------------------------------------------
# Document calculation
# ----------------------------------------------------------------------

def calculate_for_document(doc, base_info=None):
	"""Calculate and set every derived measurement field on an IRPO Progress
	document. Raises a validation error on any rule violation."""
	base_info = base_info or get_applicable_base(doc.irpo_task)
	base = base_info["base"]
	week_start = getdate(doc.week_start_date)

	rows = get_progress_rows(doc.irpo_task, exclude_name=doc.name)
	neighbors = core.pick_neighbors(rows, week_start, exclude_name=doc.name)
	prev_row = neighbors["prev_approved"]
	prev_qty = prev_row["cum_completed_qty"] if prev_row else 0

	try:
		resolved = core.resolve_measurement(
			base, doc.input_mode, flt(doc.cum_completed_qty), flt(doc.cum_percent), prev_qty, bool(doc.no_change)
		)
		core.check_bounds(
			resolved["cum_qty"],
			neighbors["lower_bound_qty"],
			neighbors["upper_bound_qty"],
			neighbors["lower_bound_ref"],
			neighbors["upper_bound_ref"],
		)
		period = core.compute_period(resolved["cum_qty"], prev_qty, base)
	except core.CalculationError as error:
		frappe.throw(str(error))

	doc.base_qty_snapshot = base
	doc.quantity_basis_label = base_info["label"]
	doc.base_revision_reference = base_info["revision_reference"]
	doc.cum_completed_qty = resolved["cum_qty"]
	doc.cum_percent = resolved["cum_pct"]
	doc.remaining_qty = period["remaining_qty"]
	doc.previous_progress_reference = prev_row["name"] if prev_row else None
	doc.prev_completed_qty_snapshot = prev_qty
	doc.prev_percent_same_base = period["prev_pct_same_base"]
	doc.period_completed_qty_snapshot = period["period_qty"]
	doc.period_percent_same_base = period["period_pct"]


# ----------------------------------------------------------------------
# Child and parent progress (read-only; written to Task in Step 6)
# ----------------------------------------------------------------------

def get_child_live_progress(task_name, base_info=None):
    """Official live progress for one IRPO: latest approved cumulative
    quantity over the current effective base. Pending records never count."""
    task = frappe.get_doc("Task", task_name)
    latest = get_latest_approved_record(task_name)
    if not latest:
        # No approved progress yet counts as 0% and does not need a base.
        # A missing base only matters once progress exists or is being entered.
        base = 0
        try:
            base = (base_info or get_applicable_base(task))["base"]
        except frappe.ValidationError:
            frappe.clear_messages()
        return {
            "task": task_name,
            "percent": 0.0,
            "approved_qty": 0,
            "base": base,
            "latest_approved_period": None,
            "latest_approved_record": None,
        }
    base = (base_info or get_applicable_base(task))["base"]
    approved_qty = latest["cum_completed_qty"]
    return {
        "task": task_name,
        "percent": core.child_live_percent(approved_qty, base),
        "approved_qty": approved_qty,
        "base": base,
        "latest_approved_period": latest["calendar_week"],
        "latest_approved_record": latest["name"],
    }

def get_included_children(parent_task):
	"""Executable IRPO children of a BOQ parent that count in its average.

	Cancelled Tasks are excluded for now. Effective-dated membership history
	(so historical denominators never change silently) arrives with the scope
	review in Step 10; a cancellation request alone must not remove a child.
	"""
	return frappe.get_all(
		"Task",
		filters={"parent_task": parent_task, "cpc_is_irpo": 1, "is_group": 0, "status": ["!=", "Cancelled"]},
		pluck="name",
		order_by="name asc",
	)


def get_parent_progress(parent_task):
	"""BOQ parent progress = simple average of included child live %.
	Returns percent=None when there are no executable children."""
	children = [get_child_live_progress(name) for name in get_included_children(parent_task)]
	return {
		"parent": parent_task,
		"percent": core.parent_simple_average(child["percent"] for child in children),
		"included_count": len(children),
		"children": children,
	}

















