import frappe
@frappe.whitelist()
def get_children(doctype, parent, task=None, project=None, is_root=False):
	filters = [["docstatus", "<", "2"]]

	if task:
		filters.append(["parent_task", "=", task])
	elif parent and not is_root:
		filters.append(["parent_task", "=", parent])
	else:
		filters.append(['ifnull(`parent_task`, "")', "=", ""])

	if project:
		filters.append(["project", "=", project])

	tasks = frappe.get_list(
		doctype,
		fields=[
			"name as value",
			"subject as title",
			"is_group as expandable",

			# Budget
			"cpc_uom",
			"cpc_budget_qty",
			"cpc_budget_amount",

			# Planned dates
			"exp_start_date",
			"exp_end_date",

			# Progress
			"progress",

			# Actual dates
			"act_start_date",
			"act_end_date",

			# Dependencies & scheduling
			"depends_on",
			"depends_on_tasks",

			# Status & priority
			"status",
			"priority",

			# Costing
			"total_costing_amount",
			"total_billing_amount",

			# Milestone & weight
			"is_milestone",
			"task_weight",

			# Duration
			"duration",
			"expected_time",

			# Color
			"color",
		],
		filters=filters,
		order_by="name",
	)

	return tasks