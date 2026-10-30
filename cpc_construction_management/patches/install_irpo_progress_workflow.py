import frappe

from cpc_construction_management.cpc_construction_management.setup.irpo_progress_workflow import (
	WORKFLOW_NAME,
	execute as install_workflow,
)


def execute():
	active_workflow = frappe.db.get_value(
		"Workflow", {"document_type": "IRPO Progress", "is_active": 1}, "name"
	)
	if active_workflow and active_workflow != WORKFLOW_NAME:
		frappe.throw(f"IRPO Progress already has an active workflow: {active_workflow}.")

	install_workflow()
	if not frappe.db.get_value("Workflow", WORKFLOW_NAME, "is_active"):
		frappe.throw(f"Workflow {WORKFLOW_NAME} exists but is inactive.")
