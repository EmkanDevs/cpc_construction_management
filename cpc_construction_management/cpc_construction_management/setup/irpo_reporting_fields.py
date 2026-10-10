# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt


import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CUSTOM_FIELDS = {
	"Task": [
		{
			"fieldname": "custom_irpo_reporting_section",
			"fieldtype": "Section Break",
			"label": "US-11 Weekly Progress Reporting",
			"insert_after": "custom_items_table",
			"collapsible": 1,
		},
		{
			"fieldname": "custom_irpo_reporting_anchor",
			"fieldtype": "Date",
			"label": "Reporting Anchor (Locked)",
			"insert_after": "custom_irpo_reporting_section",
			"read_only": 1,
			"description": (
				"Execution Week 1 anchor. Empty until the first approved IRPO Progress "
				"record locks it in (falls back to Expected Start Date until then)."
			),
		},
		{
			"fieldname": "custom_irpo_reporting_closed",
			"fieldtype": "Check",
			"label": "Reporting Closed (Completed)",
			"insert_after": "custom_irpo_reporting_anchor",
			"read_only": 1,
		},
		{
			"fieldname": "custom_irpo_reporting_col_break",
			"fieldtype": "Column Break",
			"insert_after": "custom_irpo_reporting_closed",
		},
		{
			"fieldname": "custom_irpo_reporting_closed_on",
			"fieldtype": "Date",
			"label": "Reporting Closed On",
			"insert_after": "custom_irpo_reporting_col_break",
			"read_only": 1,
			"depends_on": "eval:doc.custom_irpo_reporting_closed",
		},
		{
			"fieldname": "custom_irpo_reporting_status_history",
			"fieldtype": "Table",
			"label": "Reporting Status History",
			"options": "CPC IRPO Reporting Status Event",
			"insert_after": "custom_irpo_reporting_closed_on",
			"read_only": 1,
			"description": "Hold / Resume / Completed / Reopened / Schedule Change events. Managed only through the reporting-status actions — do not edit rows directly.",
		},
		{
			"fieldname": "custom_irpo_official_section",
			"fieldtype": "Section Break",
			"label": "Official Progress (Approved Records Only)",
			"insert_after": "custom_irpo_reporting_status_history",
		},
		{
			"fieldname": "custom_irpo_approved_qty",
			"fieldtype": "Float",
			"label": "Approved Cumulative Qty",
			"precision": "6",
			"insert_after": "custom_irpo_official_section",
			"read_only": 1,
		},
		{
			"fieldname": "custom_irpo_latest_approved_period",
			"fieldtype": "Link",
			"options": "CPC Calendar Week",
			"label": "Latest Approved Period",
			"insert_after": "custom_irpo_approved_qty",
			"read_only": 1,
		},
		{
			"fieldname": "custom_irpo_official_col_break",
			"fieldtype": "Column Break",
			"insert_after": "custom_irpo_latest_approved_period",
		},
		{
			"fieldname": "custom_irpo_progress_base",
			"fieldtype": "Float",
			"label": "Progress Base Used",
			"precision": "6",
			"insert_after": "custom_irpo_official_col_break",
			"read_only": 1,
			"description": "Written by the US-11 approval process. Official % is the standard Progress field above.",
		},
	]
}


def execute():
	create_custom_fields(CUSTOM_FIELDS, update=True)
	frappe.clear_cache(doctype="Task")




