// Copyright (c) 2026, info@finbyz.tech and contributors
// For license information, please see license.txt

frappe.query_reports["Missing Pending Updates"] = {
	filters: [
	{ fieldname: "project", label: __("Project"), fieldtype: "Link", options: "Project",  },
	{ fieldname: "boq_parent", label: __("BOQ Parent"), fieldtype: "Link", options: "Task" },
	{ fieldname: "irpo_task", label: __("IRPO"), fieldtype: "Link", options: "Task" },
	{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -56) },
	{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
	{ fieldname: "outstanding_only", label: __("Outstanding only"), fieldtype: "Check", default: 1 },
	],
};
