# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt


import frappe
from frappe.utils import flt

from cpc_construction_management.cpc_construction_management.progress.calculation import (
	get_child_live_progress,
	get_parent_progress,
)

REQUIRED_TASK_FIELDS = (
	"custom_irpo_reporting_anchor",
	"custom_irpo_approved_qty",
	"custom_irpo_latest_approved_period",
	"custom_irpo_progress_base",
)

SETUP_COMMAND = (
	"bench --site <site> execute "
	"cpc_construction_management.cpc_construction_management.setup.custom_fields.irpo_reporting_fields.execute"
)


def require_task_fields():
	meta = frappe.get_meta("Task")
	missing = [f for f in REQUIRED_TASK_FIELDS if not meta.has_field(f)]
	if missing:
		frappe.throw(
			"Setup required: Task is missing the US-11 progress fields "
			f"({', '.join(missing)}). Run: {SETUP_COMMAND}"
		)


def _write(task_name, values):
	frappe.db.set_value("Task", task_name, values, update_modified=False)
	frappe.clear_document_cache("Task", task_name)


def refresh_irpo_progress(task_name):
	"""Recompute and store official progress for one IRPO and its BOQ parent."""
	require_task_fields()

	child = get_child_live_progress(task_name)
	_write(
		task_name,
		{
			"progress": flt(child["percent"], 6),
			"custom_irpo_approved_qty": child["approved_qty"],
			"custom_irpo_latest_approved_period": child["latest_approved_period"],
			"custom_irpo_progress_base": child["base"],
		},
	)

	parent = None
	parent_name = frappe.db.get_value("Task", task_name, "parent_task")
	if parent_name:
		parent = get_parent_progress(parent_name)
		# No executable children means "progress unavailable": leave the value
		# alone rather than inventing 0% or dividing by zero.
		if parent["percent"] is not None:
			_write(parent_name, {"progress": flt(parent["percent"], 6)})

	return {"child": child, "parent": parent}