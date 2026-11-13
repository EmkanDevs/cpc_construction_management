import frappe
from frappe import _
from frappe.utils import flt

from cpc_construction_management.cpc_construction_management.budget.irpo_budget import (
	validate_irpo_is_usable,
	get_controlled_qty,
)

# Task child tables: fieldname on Task -> child doctype.
PLANNED_FIELD = "custom_items_table"
PLANNED_DOCTYPE = "Item Table"
UNPLANNED_FIELD = "custom_irpo_unplanned_item"
UNPLANNED_DOCTYPE = "IRPO Unplanned Item"

ITEM_TYPES = {
	"Planned": {"field": PLANNED_FIELD, "doctype": PLANNED_DOCTYPE},
	"Unplanned": {"field": UNPLANNED_FIELD, "doctype": UNPLANNED_DOCTYPE},
}
CHILD_DOCTYPES = (PLANNED_DOCTYPE, UNPLANNED_DOCTYPE)


def _first_field(doctype, candidates):
	"""First fieldname from candidates that exists on the doctype, else None."""
	meta = frappe.get_meta(doctype)
	for fn in candidates:
		if meta.has_field(fn):
			return fn
	return None


def _item_col(doctype):
	return _first_field(doctype, ("item", "item_code"))


def _row_item(row):
	return row.get("item") or row.get("item_code")


def _row_uom(row):
	uom = row.get("uom")
	if not uom:
		uom = frappe.db.get_value("Item", _row_item(row), "stock_uom")
	return uom


def _get_budget_row(ref):
	"""Find a budget row ref in either child doctype. Returns dict or None."""
	for dt in CHILD_DOCTYPES:
		item_col = _item_col(dt)
		if not item_col:
			continue
		row = frappe.db.get_value(dt, ref, ["parent", item_col], as_dict=True)
		if row:
			return {"parent": row.parent, "item": row[item_col], "doctype": dt}
	return None


def _unplanned_available(row_qty, row_available):  # [UAT-2]
	"""Available qty suggested for an UNPLANNED row.

	A Direct PO may only draw on the row's IRPO Available Qty (Total Unplanned Qty
	minus MR/PO/PR/PI quantities). Never suggest more than that: the PO is blocked at
	submit when it exceeds Available. If the Available column does not exist on the
	child doctype, fall back to the row's own qty.
	"""
	if row_available is None:
		return max(flt(row_qty), 0.0)
	return max(flt(row_available), 0.0)


@frappe.whitelist()
def search_irpo_item_rows(
	project, irpo=None, item_code=None, txt=None, item_type="Planned", start=0, limit=200
):
	"""Read-only item-level list for the PO 'Get Items From -> IRPO' popup.

	Shows ONE item type at a time (Planned or Unplanned) - never mixed.
	Never writes to the IRPO Quantity Ledger, so opening the popup does
	not consume quantity.
	"""
	if not project:
		frappe.throw(_("Please select a Project first."))
	if item_type not in ITEM_TYPES:
		frappe.throw(_("Invalid Item Type {0}.").format(item_type))
	frappe.has_permission("Task", "read", throw=True)

	cfg = ITEM_TYPES[item_type]
	child_dt = cfg["doctype"]
	is_unplanned = item_type == "Unplanned"
	item_col = _item_col(child_dt)
	if not item_col:
		frappe.throw(_("{0} has no Item field.").format(child_dt))
	uom_col = _first_field(child_dt, ("uom",))
	uom_sql = f"c.`{uom_col}`" if uom_col else "i.stock_uom"

	# Unplanned rows: the real reference lives in `unplanned_row_ref`, and the
	# per-row available qty (if the column exists) in `irpo_available_qty`.
	extra_cols = ""
	if is_unplanned:
		meta = frappe.get_meta(child_dt)
		extra_cols += "c.unplanned_row_ref as cpc_irpo_unplanned_row_ref,\n\t\t\t"
		if meta.has_field("irpo_available_qty"):
			extra_cols += "c.irpo_available_qty as row_available_qty,\n\t\t\t"
		else:
			extra_cols += "null as row_available_qty,\n\t\t\t"

	conditions = [
		"t.cpc_is_irpo = 1",
		"t.cpc_node_type = 'IRPO'",
		"t.status not in ('Closed', 'Cancelled')",
		"t.project = %(project)s",
		f"ifnull(c.`{item_col}`, '') != ''",
	]
	# [UAT-2] a Direct PO can only draw on IRPO Available Qty: hide exhausted unplanned rows
	if is_unplanned and frappe.get_meta(child_dt).has_field("irpo_available_qty"):
		conditions.append("ifnull(c.irpo_available_qty, 0) > 0")
	values = {
		"project": project,
		"parentfield": cfg["field"],
		"item_type": item_type,
		"start": max(int(start or 0), 0),
		"limit": min(int(limit or 200), 500),
	}

	if irpo:
		conditions.append("t.name = %(irpo)s")
		values["irpo"] = irpo
	if item_code:
		conditions.append(f"c.`{item_col}` = %(item_code)s")
		values["item_code"] = item_code
	if txt:
		conditions.append(
			f"(t.name like %(txt)s or t.subject like %(txt)s "
			f"or c.`{item_col}` like %(txt)s or i.item_name like %(txt)s)"
		)
		values["txt"] = f"%{txt}%"

	rows = frappe.db.sql(
		f"""
		select
			%(item_type)s as item_type,
			t.name as irpo,
			t.subject as task_subject,
			t.project as project,
			t.cpc_budget_amount as irpo_budget_amount,
			c.name as row_name,
			c.name as cpc_irpo_budget_row_ref,
			{extra_cols}c.`{item_col}` as item_code,
			i.item_name as item_name,
			{uom_sql} as uom,
			c.qty as budget_qty
		from `tabTask` t
		inner join `tab{child_dt}` c
			on c.parent = t.name
			and c.parenttype = 'Task'
			and c.parentfield = %(parentfield)s
		left join `tabItem` i on i.name = c.`{item_col}`
		where {" and ".join(conditions)}
		order by t.name, c.idx
		limit %(start)s, %(limit)s
		""",
		values,
		as_dict=True,
	)

	# Same formula as _build_row, so the popup and the fetched qty always agree.
	for r in rows:
		if is_unplanned:
			# Unplanned rows are NOT tracked by the planned budget-row-ref engine.
			r["cpc_irpo_budget_row_ref"] = ""
			r["available_qty"] = _unplanned_available(r.budget_qty, r.get("row_available_qty"))
		else:
			r["available_qty"] = flt(r.budget_qty) - flt(
				get_controlled_qty(r.irpo, r.cpc_irpo_budget_row_ref)
			)

	return rows


@frappe.whitelist()
def get_irpo_items_for_purchase_order(project, irpo_tasks=None, budget_row_refs=None):
	"""Return PO row data.

	`budget_row_refs` holds CHILD ROW NAMES (row_name from the popup). A name may
	belong to a planned (Item Table) or an unplanned (IRPO Unplanned Item) row.
	"""
	if isinstance(irpo_tasks, str):
		irpo_tasks = frappe.parse_json(irpo_tasks)
	if isinstance(budget_row_refs, str):
		budget_row_refs = frappe.parse_json(budget_row_refs)

	if not irpo_tasks and not budget_row_refs:
		frappe.throw(_("Select at least one IRPO or Item."))

	result = []

	# Task-level selection: planned items only (unchanged behaviour).
	if irpo_tasks:
		for task_name in irpo_tasks:
			task = validate_irpo_is_usable(task_name, project=project)
			if not task.account:
				frappe.throw(_("IRPO {0} has no Expense Account set - cannot be used for a direct PO.").format(task_name))
			for row in task.get(PLANNED_FIELD) or []:
				if not _row_item(row):
					continue
				result.append(_build_row(task, row))

	if budget_row_refs:
		# Group by parent Task so validate_irpo_is_usable + account check run once per Task
		by_parent = {}
		for ref in budget_row_refs:
			budget_row = _get_budget_row(ref)
			if not budget_row:
				frappe.throw(_("IRPO item row {0} no longer exists.").format(ref))
			by_parent.setdefault(budget_row["parent"], []).append(ref)

		for task_name, refs in by_parent.items():
			task = validate_irpo_is_usable(task_name, project=project)
			if not task.account:
				frappe.throw(_("IRPO {0} has no Expense Account set - cannot be used for a direct PO.").format(task_name))
			matched = set()
			# Item-level selection: the ref may be a planned or an unplanned row.
			for cfg in ITEM_TYPES.values():
				for row in task.get(cfg["field"]) or []:
					if row.name in refs and _row_item(row):
						result.append(_build_row(task, row))
						matched.add(row.name)
			missing = [r for r in refs if r not in matched]
			if missing:
				frappe.throw(
					_("IRPO item row(s) not valid for Project {0}: {1}").format(project, ", ".join(missing))
				)

	return result


def _build_row(task, row):
	unplanned = row.doctype == UNPLANNED_DOCTYPE
	if unplanned:
		available = _unplanned_available(row.get("qty"), row.get("irpo_available_qty") if row.get("irpo_available_qty") not in (None, "") else None)
	else:
		available = flt(row.qty) - get_controlled_qty(task.name, row.name)

	return {
		"project": task.project,
		"task": task.name,
		"item_code": _row_item(row),
		"uom": _row_uom(row),
		"budget_qty": row.qty,
		"available_qty": available,
		# Planned rows carry the child row name; unplanned rows carry their own
		# IRPO-UPL-##### reference in a separate field, never in the budget ref.
		"cpc_irpo_budget_row_ref": "" if unplanned else row.name,
		"cpc_irpo_unplanned_row_ref": row.get("unplanned_row_ref") if unplanned else "",
		"expense_account": task.account,
	}


def validate_direct_po_linkage(doc, method=None):
	"""
	validate hook for Purchase Order. Runs AFTER carry_forward_irpo_fields
	has filled blanks, so this re-checks what actually ended up on the row —
	closing the gap where API/import/browser manipulation could set an
	inconsistent project/task/budget-row/account combination.

	Applies to PLANNED rows (those with cpc_irpo_budget_row_ref). Unplanned rows
	are skipped here, as before; their Direct PO quantity is checked against
	IRPO Available Qty in irpo_unplanned.validate_direct_po_available (before_submit).
	"""
	for row in doc.get("items") or []:
		budget_row_ref = row.get("cpc_irpo_budget_row_ref")
		if not budget_row_ref:
			continue  # not a planned IRPO-linked row, nothing to check

		task_name = row.get("task")
		if not task_name:
			frappe.throw(
				_("Row {0}: has an IRPO Budget Row Ref but no Task - invalid IRPO linkage.").format(row.idx)
			)

		task = frappe.db.get_value(
			"Task", task_name, ["project", "cpc_is_irpo", "account"], as_dict=True
		)
		if not task:
			frappe.throw(_("Row {0}: Task {1} does not exist.").format(row.idx, task_name))

		if not task.cpc_is_irpo:
			frappe.throw(_("Row {0}: Task {1} is not a valid IRPO.").format(row.idx, task_name))

		if row.get("project") != task.project:
			frappe.throw(
				_("Row {0}: Project {1} does not match IRPO {2}'s Project {3}.").format(
					row.idx, row.get("project"), task_name, task.project
				)
			)

		# Budget row may be a planned (Item Table) or unplanned (IRPO Unplanned Item) row.
		budget_row = _get_budget_row(budget_row_ref)
		if not budget_row:
			frappe.throw(_("Row {0}: Budget Row {1} does not exist.").format(row.idx, budget_row_ref))

		if budget_row["parent"] != task_name:
			frappe.throw(
				_("Row {0}: Budget Row {1} does not belong to Task {2}.").format(
					row.idx, budget_row_ref, task_name
				)
			)

		if budget_row["item"] != row.item_code:
			frappe.throw(
				_("Row {0}: Item {1} does not match Budget Row {2}'s Item {3}.").format(
					row.idx, row.item_code, budget_row_ref, budget_row["item"]
				)
			)

		# Section 10 — block silent account bypass. One account per IRPO
		# is the current design, so the PO row's expense_account must
		# match exactly, even if ERPNext's own item-default logic
		# overwrote it after carry_forward_irpo_fields ran.
		if row.get("expense_account") != task.account:
			frappe.throw(
				_(
					"Row {0}: Expense Account {1} does not match IRPO {2}'s Budget Account {3}. "
					"This IRPO's native Budget will not be checked correctly against a different account."
				).format(row.idx, row.get("expense_account"), task_name, task.account)
			)


@frappe.whitelist()
def get_irpo_task_names_for_project(project):
	"""Feeds the item-level dialog's list query - only eligible IRPO Tasks."""
	return frappe.get_all(
		"Task",
		filters={
			"project": project,
			"cpc_is_irpo": 1,
			"cpc_node_type": "IRPO",
			"status": ["not in", ["Closed", "Cancelled"]],
		},
		pluck="name",
	)