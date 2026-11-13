import frappe
from frappe import _


def validate(doc, method=None):
	if not doc.cpc_contract:
		return

	_fetch_from_contract_if_blank(doc)
	_populate_items_from_boq_if_blank(doc)
	_fill_item_descriptions(doc)
	_validate_items(doc)
	_refresh_related_sales_orders(doc)


def _fetch_from_contract_if_blank(doc):
	"""Safety net for API-created Sales Orders — the client script
	handles the interactive fetch when a user picks the contract.

	Fetches into production's existing fields (advance_payment,
	retention) rather than duplicating them — confirmed via the site's
	existing Sales Order client script, which already computes
	retention_amount off `retention` on change/validate."""
	contract = frappe.db.get_value(
		"Construction Contract",
		doc.cpc_contract,
		["customer", "project", "advance_percent", "retention_percent"],
		as_dict=True,
	)
	if not contract:
		frappe.throw(_("Construction Contract {0} not found.").format(doc.cpc_contract))

	if not doc.customer:
		doc.customer = contract.customer
	if not doc.project:
		doc.project = contract.project
	if doc.get("advance_payment") is None:
		doc.advance_payment = contract.advance_percent
	if doc.get("retention") is None:
		doc.retention = contract.retention_percent


def _populate_items_from_boq_if_blank(doc):
	"""Safety net for API-created Sales Orders. Unlike the client
	script (which replaces the items table every time the contract
	field changes, since that's an interactive re-pick), this only
	fires when items is empty — an API caller may be creating the SO
	and setting items in the same call, and this shouldn't clobber
	that."""
	if doc.items:
		return

	boq_items = frappe.get_list(
		"Contract BOQ Item",
		filters={"parent": doc.cpc_contract, "parenttype": "Construction Contract"},
		# boq_code was missing here, so custom_boq_id below was always blank.
		fields=["item_code", "boq_code", "description", "qty", "rate"],
		order_by="idx asc",
		parent_doctype="Construction Contract",
	)

	for row in boq_items:
		if not row.item_code:
			continue
		doc.append("items", {
			"item_code": row.item_code,
			"qty": row.qty,
			"rate": row.rate,
			"description": row.description,
			"custom_boq_id": row.boq_code,
		})


def _fill_item_descriptions(doc):
	"""E-04: keep the BOQ Work Description on Sales Order Items.

	The Contract Center inserts Sales Order rows with only item_code / qty /
	rate, so description was saved blank. Fill any blank description from the
	Contract BOQ Item for that item code (the BOQ Work Description the user
	typed), falling back to the Item's own description / name."""
	blank_rows = [row for row in doc.items if row.item_code and not (row.description or "").strip()]
	if not blank_rows:
		return

	boq_descriptions = {
		r.item_code: r.description
		for r in frappe.get_all(
			"Contract BOQ Item",
			filters={"parent": doc.cpc_contract, "parenttype": "Construction Contract"},
			fields=["item_code", "description"],
		)
		if r.item_code and r.description
	}

	for row in blank_rows:
		description = boq_descriptions.get(row.item_code)
		if not description:
			item = frappe.db.get_value(
				"Item", row.item_code, ["description", "item_name"], as_dict=True
			)
			description = (item.description or item.item_name) if item else None
		if description:
			row.description = description


def _validate_items(doc):
	"""Only items sourced from this contract may appear on the SO."""
	bad_rows = []

	for row in doc.items:
		if not row.item_code:
			continue

		source_contract = frappe.db.get_value("Item", row.item_code, "cpc_source_contract")

		if source_contract != doc.cpc_contract:
			bad_rows.append(row.idx)

	if bad_rows:
		frappe.throw(
			_("Row(s) {0}: Item does not belong to Construction Contract {1}. Only items pushed from that contract's BOQ may be added.").format(
				", ".join(str(r) for r in bad_rows), doc.cpc_contract
			)
		)


def _refresh_related_sales_orders(doc):
	if not doc.cpc_is_change_order:
		doc.cpc_related_sales_orders = []
		return

	related_names = frappe.get_list(
		"Sales Order",
		filters={"cpc_contract": doc.cpc_contract, "name": ["!=", doc.name or ""]},
		pluck="name",
		order_by="creation asc",
	)

	doc.set("cpc_related_sales_orders", [])
	for name in related_names:
		doc.append("cpc_related_sales_orders", {"sales_order": name})


@frappe.whitelist()
def get_related_sales_orders(cpc_contract, exclude=None):
	"""Called from the client so the list refreshes live, before save,
	the moment the checkbox is ticked."""
	if not cpc_contract:
		return []
	filters = {"cpc_contract": cpc_contract}
	if exclude:
		filters["name"] = ["!=", exclude]
	return frappe.get_list("Sales Order", filters=filters, pluck="name", order_by="creation asc")


def on_submit(doc, method=None):
	_sync_project_sales_order(doc)


def _sync_project_sales_order(doc):
	"""Project.sales_order can only hold a single back-reference, so it
	represents "the base RPO for this project" — not every SO raised
	against the contract (see US-05: a contract/project can have many
	variation/change-order SOs). Only the original order writes this
	field, and only if some other base RPO hasn't already claimed it
	(e.g. this project was somehow re-pointed at a different order)."""
	if doc.cpc_is_change_order or not doc.project:
		return

	current = frappe.db.get_value("Project", doc.project, "sales_order")
	if current and current != doc.name:
		# a different base RPO already owns this Project's back-link —
		# don't silently overwrite it
		frappe.msgprint(
			_("Note: Project {0} is already linked to Sales Order {1}. Its Connections tab won't show {2} unless you update this manually.").format(
				doc.project, current, doc.name
			),
			alert=True,
			indicator="orange",
		)
		return

	if current != doc.name:
		frappe.db.set_value("Project", doc.project, "sales_order", doc.name, update_modified=False)


@frappe.whitelist()
def get_initial_workflow_state(doctype):
	"""Return the first workflow state (lowest idx) for an active workflow on
	*doctype*, or ``None`` when no workflow is configured.

	Used by the contract-center page to stamp ``workflow_state`` on programmatically
	created documents so that the workflow_transitions Server Script does not raise
	"No workflow state found".
	"""
	workflow_name = frappe.db.get_value(
		"Workflow", {"document_type": doctype, "is_active": 1}, "name"
	)
	if not workflow_name:
		return None
	return frappe.db.get_value(
		"Workflow Document State",
		{"parent": workflow_name},
		"state",
		order_by="idx asc",
	)


@frappe.whitelist()
def apply_workflow_action(name, action):
	"""Apply a workflow transition on a Sales Order by action name.

	Drives the "Save as Draft → Send for Approval → Approve/Reject" flow in the
	contract-center quick entry. Reuses Frappe's own workflow engine so the
	state machine (Draft → Pending Approval → Approved/Reject) and its docstatus
	effects are applied exactly as if the action were triggered on the form.
	"""
	from frappe.model.workflow import get_transitions, get_workflow

	doc = frappe.get_doc("Sales Order", name)
	workflow = get_workflow(doc.doctype)
	allowed_actions = {
		t["action"]
		for t in get_transitions(doc, workflow)
		if t["allowed"] in frappe.get_roles()
	}
	if action not in allowed_actions:
		current_state = doc.get(workflow.workflow_state_field)
		frappe.throw(
			_(
				"Sales Order {0} is currently in the “{1}” state and cannot be moved with “{2}”."
			).format(name, current_state or "-", action)
		)
	return frappe.model.workflow.apply_workflow(doc, action)


@frappe.whitelist()
def get_approval_progress(name):
	"""W-04: approval summary for the Contract Center Progress tab.

	Returns the current stage, who/what role the order is pending with, who
	completed earlier steps, the next allowed actions (grouped by role) and
	how long the order has been waiting at the current stage.
	"""
	from frappe.utils import get_datetime, now_datetime

	frappe.has_permission("Sales Order", "read", name, throw=True)
	doc = frappe.get_doc("Sales Order", name)
	workflow_name = frappe.db.get_value(
		"Workflow", {"document_type": "Sales Order", "is_active": 1}, "name"
	)
	if not workflow_name:
		return {
			"current_state": doc.get("workflow_state") or "",
			"is_final": 1,
			"completed": [],
			"next_actions": [],
		}

	workflow = frappe.get_cached_doc("Workflow", workflow_name)
	current_state = doc.get(workflow.workflow_state_field) or ""

	log = sorted(doc.get("state_change") or [], key=lambda r: str(r.modification_time or ""))
	last = log[-1] if log else None
	completed = [
		{"state": r.workflow_state, "user": r.username, "at": str(r.modification_time or "")}
		for r in log[:-1]
	]

	# Actions available from the current state, grouped by the role allowed to take them
	next_actions = []
	for t in workflow.transitions:
		if t.state != current_state:
			continue
		users = frappe.db.sql_list(
			"""SELECT DISTINCT hr.parent FROM `tabHas Role` hr
			JOIN `tabUser` u ON u.name = hr.parent
			WHERE hr.role = %s AND hr.parenttype = 'User' AND u.enabled = 1
			AND u.name NOT IN ('Administrator', 'Guest')""",
			t.allowed,
		)
		next_actions.append({
			"action": t.action,
			"next_state": t.next_state,
			"role": t.allowed,
			"user_count": len(users),
			"users": users[:5],
		})

	is_final = doc.docstatus == 1 or not next_actions
	since = (
		get_datetime(last.modification_time)
		if last and last.modification_time
		else get_datetime(doc.modified)
	)
	waiting = max(0, int((now_datetime() - since).total_seconds()))

	return {
		"current_state": current_state,
		"last_user": last.username if last else "",
		"last_at": str(last.modification_time) if last and last.modification_time else "",
		"completed": completed,
		"next_actions": next_actions,
		"pending_with": ", ".join(sorted({a["role"] for a in next_actions})),
		"waiting_seconds": 0 if is_final else waiting,
		"is_bottleneck": (not is_final) and waiting > 86400,
		"is_final": 1 if is_final else 0,
	}