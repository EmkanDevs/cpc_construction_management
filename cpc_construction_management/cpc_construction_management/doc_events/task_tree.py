import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate, date_diff, cint


@frappe.whitelist()
def get_children(doctype, parent=None, task=None, project=None, is_root=False, status_filter=None, search_term=None, **kwargs):
	"""
	Enterprise WBS Tree data provider for Task DocType.
	Provides:
	  - Standard task fields & hierarchy
	  - Custom BOQ Node & IRPO fields
	  - Aggregate rollups for parent/BOQ nodes (Budget, Qty, EV, Actuals, Dates, Child counts)
	  - CPM Schedule & Float analysis (Total Float, Free Float, Critical Path flag)
	"""
	filters = [["docstatus", "<", "2"]]

	if task:
		filters.append(["parent_task", "=", task])
	elif parent and not is_root and parent != "All Tasks":
		filters.append(["parent_task", "=", parent])
	else:
		filters.append(['ifnull(`parent_task`, "")', "=", ""])

	if project:
		filters.append(["project", "=", project])

	# Detect available columns safely on the Task DocType
	meta = frappe.get_meta(doctype)
	available_fields = {df.fieldname for df in meta.fields}
	available_fields.update({"name", "creation", "modified", "owner", "docstatus"})

	desired_fields = [
		("name", "name as value"),
		("subject", "subject as title"),
		("is_group", "is_group as expandable"),
		("parent_task", "parent_task"),
		("project", "project"),
		("status", "status"),
		("priority", "priority"),
		("color", "color"),
		("is_milestone", "is_milestone"),
		("task_weight", "task_weight"),
		("exp_start_date", "exp_start_date"),
		("exp_end_date", "exp_end_date"),
		("act_start_date", "act_start_date"),
		("act_end_date", "act_end_date"),
		("duration", "duration"),
		("expected_time", "expected_time"),
		("progress", "progress"),
		("total_costing_amount", "total_costing_amount"),
		("total_billing_amount", "total_billing_amount"),
		("total_expense_claim", "total_expense_claim"),
		("depends_on_tasks", "depends_on_tasks"),
		# Construction / CPC Custom Fields
		("cpc_node_type", "cpc_node_type"),
		("cpc_is_irpo", "cpc_is_irpo"),
		("cpc_irpo_code", "cpc_irpo_code"),
		("cpc_boq_code", "cpc_boq_code"),
		("cpc_uom", "cpc_uom"),
		("cpc_budget_qty", "cpc_budget_qty"),
		("cpc_budget_amount", "cpc_budget_amount"),
		("cpc_boq_cost_budget", "cpc_boq_cost_budget"),
		("cpc_boq_budget_allocated", "cpc_boq_budget_allocated"),
		("cpc_boq_budget_remaining", "cpc_boq_budget_remaining"),
		("cpc_sales_order", "cpc_sales_order"),
		("cpc_contract", "cpc_contract"),
		("custom_requisition", "custom_requisition"),
		("custom_wbs_item", "custom_wbs_item"),
		("custom_boq", "custom_boq"),
		("custom_boq_details", "custom_boq_details"),
	]

	fields_to_query = [alias for fn, alias in desired_fields if fn in available_fields]
	if "name as value" not in fields_to_query:
		fields_to_query.insert(0, "name as value")
	if "subject as title" not in fields_to_query:
		fields_to_query.insert(1, "subject as title")
	if "is_group as expandable" not in fields_to_query:
		fields_to_query.insert(2, "is_group as expandable")

	tasks = frappe.get_list(
		doctype,
		fields=fields_to_query,
		filters=filters,
		order_by="is_group desc, exp_start_date asc, name asc",
	)

	today = getdate(nowdate())

	# Calculate rollups & float metrics for each task
	for task_dict in tasks:
		task_name = task_dict.get("value")
		is_group = cint(task_dict.get("expandable"))
		progress = flt(task_dict.get("progress") or 0)
		exp_start = getdate(task_dict.get("exp_start_date")) if task_dict.get("exp_start_date") else None
		exp_end = getdate(task_dict.get("exp_end_date")) if task_dict.get("exp_end_date") else None

		# Calculate Duration in days if not set
		if exp_start and exp_end:
			calc_duration = date_diff(exp_end, exp_start) + 1
			if not task_dict.get("duration"):
				task_dict["duration"] = max(0, calc_duration)
		else:
			task_dict["duration"] = flt(task_dict.get("duration") or 0)

		# Schedule Overdue check
		task_dict["is_overdue"] = 0
		if exp_end and exp_end < today and progress < 100 and task_dict.get("status") not in ["Completed", "Cancelled"]:
			task_dict["is_overdue"] = 1

		# Rollup calculations for Group / BOQ Nodes
		if is_group:
			# Aggregate child IRPOs under this parent
			child_stats = frappe.db.sql(
				"""
				SELECT 
					COUNT(*) as total_children,
					COALESCE(SUM(cpc_budget_amount), 0) as rollup_budget_amount,
					COALESCE(SUM(cpc_budget_qty), 0) as rollup_budget_qty,
					COALESCE(SUM(total_costing_amount), 0) as rollup_actual_cost,
					COALESCE(AVG(progress), 0) as avg_progress,
					COALESCE(SUM(progress * COALESCE(cpc_budget_amount, 1)), 0) as weighted_progress_sum,
					COALESCE(SUM(COALESCE(cpc_budget_amount, 1)), 0) as weight_base,
					MIN(exp_start_date) as min_start,
					MAX(exp_end_date) as max_end,
					COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_count
				FROM `tabTask`
				WHERE parent_task = %s AND docstatus < 2
				""",
				(task_name,),
				as_dict=True,
			)

			if child_stats and child_stats[0].total_children > 0:
				stat = child_stats[0]
				task_dict["child_count"] = cint(stat.total_children)
				task_dict["completed_child_count"] = cint(stat.completed_count)
				task_dict["rollup_budget_amount"] = flt(stat.rollup_budget_amount)
				task_dict["rollup_budget_qty"] = flt(stat.rollup_budget_qty)
				task_dict["rollup_actual_cost"] = flt(stat.rollup_actual_cost)

				# Use child dates if parent dates are empty
				if not task_dict.get("exp_start_date") and stat.min_start:
					task_dict["exp_start_date"] = stat.min_start
				if not task_dict.get("exp_end_date") and stat.max_end:
					task_dict["exp_end_date"] = stat.max_end

				# Weighted progress
				if stat.weight_base > 0:
					task_dict["progress"] = round(flt(stat.weighted_progress_sum) / flt(stat.weight_base), 1)
				else:
					task_dict["progress"] = round(flt(stat.avg_progress), 1)

				# If parent budget amount is 0, display rolled up amount
				if not flt(task_dict.get("cpc_budget_amount")):
					task_dict["cpc_budget_amount"] = task_dict["rollup_budget_amount"]
				if not flt(task_dict.get("cpc_budget_qty")):
					task_dict["cpc_budget_qty"] = task_dict["rollup_budget_qty"]
			else:
				task_dict["child_count"] = 0
				task_dict["completed_child_count"] = 0

		# CPM Float Analysis (Total Float & Free Float)
		# For construction tasks, calculate float buffer relative to project/parent or dependencies
		total_float = 0.0
		free_float = 0.0
		is_critical = 0

		if not is_group:
			# Check successor dependencies if any
			successors = frappe.db.sql(
				"""
				SELECT t.exp_start_date 
				FROM `tabTask Depends On` tdo
				JOIN `tabTask` t ON tdo.parent = t.name
				WHERE tdo.task = %s AND t.docstatus < 2 AND t.exp_start_date IS NOT NULL
				ORDER BY t.exp_start_date ASC
				LIMIT 1
				""",
				(task_name,),
				as_dict=True,
			)

			if successors and successors[0].exp_start_date and exp_end:
				succ_start = getdate(successors[0].exp_start_date)
				free_float = flt(date_diff(succ_start, exp_end) - 1)
				total_float = free_float
			elif exp_end and project:
				# Compare against project expected end date
				proj_end = frappe.db.get_value("Project", project, "expected_end_date")
				if proj_end:
					total_float = flt(date_diff(getdate(proj_end), exp_end))
					free_float = max(0.0, total_float)

			# Critical path flag: Total float <= 0 or explicit milestone
			if (total_float <= 0 and exp_end) or cint(task_dict.get("is_milestone")):
				is_critical = 1 if task_dict.get("status") != "Completed" else 0

		task_dict["cpc_total_float"] = total_float
		task_dict["cpc_free_float"] = free_float
		task_dict["cpc_is_critical"] = is_critical

		# EVM Metrics (Earned Value Management)
		budget_amt = flt(task_dict.get("cpc_budget_amount") or 0)
		act_cost = flt(task_dict.get("total_costing_amount") or 0) + flt(task_dict.get("total_expense_claim") or 0)
		prog_pct = flt(task_dict.get("progress") or 0)
		ev = budget_amt * (prog_pct / 100.0)
		cv = ev - act_cost
		cpi = round(ev / act_cost, 2) if act_cost > 0 else (1.0 if ev > 0 else 0.0)

		task_dict["evm_earned_value"] = ev
		task_dict["evm_actual_cost"] = act_cost
		task_dict["evm_cost_variance"] = cv
		task_dict["evm_cpi"] = cpi

	return tasks


@frappe.whitelist()
def get_task_details(task_name):
	"""
	Returns comprehensive 360-degree task details for the P6 Activity Inspector.
	"""
	if not task_name:
		frappe.throw(_("Task name is required"))

	doc = frappe.get_doc("Task", task_name)
	doc_dict = doc.as_dict()

	# Fetch dependencies (Predecessors)
	predecessors = []
	for dep in doc.get("depends_on", []):
		dep_info = frappe.db.get_value(
			"Task",
			dep.task,
			["name", "subject", "status", "exp_start_date", "exp_end_date", "progress"],
			as_dict=True,
		)
		if dep_info:
			predecessors.append(dep_info)

	# Fetch Successors (tasks that depend on this task)
	successors = frappe.db.sql(
		"""
		SELECT t.name, t.subject, t.status, t.exp_start_date, t.exp_end_date, t.progress
		FROM `tabTask Depends On` tdo
		JOIN `tabTask` t ON tdo.parent = t.name
		WHERE tdo.task = %s AND t.docstatus < 2
		""",
		(task_name,),
		as_dict=True,
	)

	# Fetch Assigned Employees if field exists
	assigned_employees = []
	if hasattr(doc, "employees") and doc.employees:
		for emp in doc.employees:
			emp_name = getattr(emp, "employee_name", None) or getattr(emp, "employee", None)
			if emp_name:
				assigned_employees.append(emp_name)

	# EVM calculation
	budget = flt(doc.get("cpc_budget_amount") or 0)
	progress = flt(doc.get("progress") or 0)
	act_cost = flt(doc.get("total_costing_amount") or 0) + flt(doc.get("total_expense_claim") or 0)
	ev = budget * (progress / 100.0)
	cv = ev - act_cost
	cpi = round(ev / act_cost, 2) if act_cost > 0 else (1.0 if ev > 0 else 0.0)

	return {
		"task": doc_dict,
		"predecessors": predecessors,
		"successors": successors,
		"assigned_employees": assigned_employees,
		"evm": {
			"budget_amount": budget,
			"actual_cost": act_cost,
			"earned_value": ev,
			"cost_variance": cv,
			"cpi": cpi,
		},
	}


@frappe.whitelist()
def recalculate_project_cpm(project):
	"""
	Analyzes all tasks within a project, evaluates schedule critical path & float,
	and returns project health summary.
	"""
	if not project:
		frappe.throw(_("Project is required"))

	tasks = frappe.get_all(
		"Task",
		filters={"project": project, "docstatus": ["<", 2]},
		fields=[
			"name", "subject", "is_group", "status", "progress",
			"exp_start_date", "exp_end_date", "duration",
			"cpc_budget_amount", "total_costing_amount", "total_expense_claim",
			"is_milestone", "cpc_node_type"
		],
		order_by="exp_start_date asc",
	)

	total_budget = sum(flt(t.get("cpc_budget_amount") or 0) for t in tasks if not t.is_group)
	total_actual = sum(flt(t.get("total_costing_amount") or 0) + flt(t.get("total_expense_claim") or 0) for t in tasks if not t.is_group)
	total_ev = sum(flt(t.get("cpc_budget_amount") or 0) * (flt(t.get("progress") or 0) / 100.0) for t in tasks if not t.is_group)

	today = getdate(nowdate())
	overdue_count = 0
	completed_count = 0
	milestone_count = 0
	critical_count = 0

	for t in tasks:
		if t.status == "Completed":
			completed_count += 1
		if t.is_milestone:
			milestone_count += 1
		exp_end = getdate(t.exp_end_date) if t.exp_end_date else None
		if exp_end and exp_end < today and flt(t.progress) < 100 and t.status not in ["Completed", "Cancelled"]:
			overdue_count += 1

	cpi = round(total_ev / total_actual, 2) if total_actual > 0 else 1.0

	return {
		"total_tasks": len(tasks),
		"completed_tasks": completed_count,
		"overdue_tasks": overdue_count,
		"milestones": milestone_count,
		"total_budget": total_budget,
		"total_actual_cost": total_actual,
		"total_earned_value": total_ev,
		"cpi": cpi,
		"cost_variance": total_ev - total_actual,
	}