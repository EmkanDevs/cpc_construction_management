import frappe

WORKFLOW_NAME = "IRPO Progress Approval"
APPROVER_ROLE = "IRPO Progress Approver"
PREPARER_ROLES = ("Projects User", "Projects Manager", APPROVER_ROLE)

STATES = [
	# (state, docstatus, who may edit, badge style)
	("Draft", "0", PREPARER_ROLES, "Info"),
	("Pending Approval", "0", (APPROVER_ROLE,), "Warning"),
	("Returned", "0", PREPARER_ROLES, "Danger"),
	("Approved", "1", (APPROVER_ROLE,), "Success"),
	("Cancelled", "2", (APPROVER_ROLE,), "Danger"),
]

# (from state, action, to state, roles allowed to take the action)
TRANSITIONS = [
	("Draft", "Send for Approval", "Pending Approval", PREPARER_ROLES),
	("Returned", "Resubmit", "Pending Approval", PREPARER_ROLES),
	("Pending Approval", "Approve", "Approved", (APPROVER_ROLE,)),
	("Pending Approval", "Return", "Returned", (APPROVER_ROLE,)),
	("Approved", "Cancel", "Cancelled", (APPROVER_ROLE,)),
]


def execute(rebuild=0):
	_ensure_role(APPROVER_ROLE)
	for state, _docstatus, _roles, style in STATES:
		_ensure_workflow_state(state, style)
	for _from, action, _to, _roles in TRANSITIONS:
		_ensure_workflow_action(action)

	if frappe.db.exists("Workflow", WORKFLOW_NAME):
		if not int(rebuild):
			print(f"Workflow '{WORKFLOW_NAME}' already exists; left unchanged (pass rebuild=1 to recreate).")
			return
		frappe.delete_doc("Workflow", WORKFLOW_NAME, force=1)

	workflow = frappe.new_doc("Workflow")
	workflow.workflow_name = WORKFLOW_NAME
	workflow.document_type = "IRPO Progress"
	workflow.workflow_state_field = "workflow_state"
	workflow.is_active = 1
	workflow.send_email_alert = 0

	for state, docstatus, roles, _style in STATES:
		workflow.append("states", {"state": state, "doc_status": docstatus, "allow_edit": roles[0]})

	for from_state, action, to_state, roles in TRANSITIONS:
		for role in roles:
			workflow.append(
				"transitions",
				{
					"state": from_state,
					"action": action,
					"next_state": to_state,
					"allowed": role,
					# Frappe's own self-approval switch only knows the document owner;
					# the controller also blocks the last material editor.
					"allow_self_approval": 0 if action == "Approve" else 1,
				},
			)

	workflow.insert()
	print(f"Created workflow '{WORKFLOW_NAME}'.")


def _ensure_role(role):
	if not frappe.db.exists("Role", role):
		frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert()


def _ensure_workflow_state(state, style):
	if not frappe.db.exists("Workflow State", state):
		frappe.get_doc(
			{"doctype": "Workflow State", "workflow_state_name": state, "style": style}
		).insert()


def _ensure_workflow_action(action):
	if not frappe.db.exists("Workflow Action Master", action):
		frappe.get_doc(
			{"doctype": "Workflow Action Master", "workflow_action_name": action}
		).insert()