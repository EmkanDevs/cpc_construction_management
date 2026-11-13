import frappe
from frappe import _
from frappe.utils import flt, nowdate

@frappe.whitelist()
def make_material_request(irpo):
    task = frappe.get_doc("Task", irpo)
    validate_irpo_is_usable(irpo, project=task.project)

    if not task.custom_items_table:
        frappe.throw(_("Add at least one row to the Items Table before creating a Material Request"))

    mr = frappe.new_doc("Material Request")
    mr.material_request_type = "Purchase"
    mr.custom_project = task.project
    mr.task = task.name
    mr.is_created_from_task = 1

    for row in task.custom_items_table:
        if not row.item:
            continue

        available_qty = flt(row.irpo_available_qty)
        if available_qty <= 0:
            continue  # nothing left to request for this budget row

        item_details = frappe.db.get_value(
            "Item", row.item, ["item_name", "stock_uom", "description"], as_dict=True
        )

        mr.append("items", {
            "item_code": row.item,
            "item_name": item_details.item_name,
            "stock_uom": item_details.stock_uom,
            "description": item_details.description or item_details.item_name,
            "uom": row.uom,
            "qty": available_qty,
            "project": task.project,
            "task": task.name,
            "cpc_irpo": task.name,
            "cpc_irpo_budget_row_ref": row.name,
            "schedule_date": task.exp_end_date or nowdate(),
            "expense_account": task.account,
			"custom_irpo_item_type":row.irpo_item_type,
        })

    if not mr.items:
        frappe.throw(_("No items with available quantity remain on IRPO {0}. Nothing to request.").format(irpo))

    return mr



@frappe.whitelist()
def make_purchase_order(irpo, source_name=None):
    task = frappe.get_doc("Task", irpo)
    validate_irpo_is_usable(irpo, project=task.project)

    if not task.custom_items_table:
        frappe.throw(_("Add at least one row to the Items Table before creating a Purchase Order"))

    po = frappe.new_doc("Purchase Order")
    po.project = task.project
    # No po.task here — PO carries Task at the line level only

    # in make_purchase_order, same pattern:
    for row in task.custom_items_table:
        if not row.item:
            continue

        item_details = frappe.db.get_value(
            "Item", row.item, ["item_name", "stock_uom", "description"], as_dict=True
        )

        qty = flt(row.qty)
        amount = flt(row.amount)
        rate = (amount / qty) if qty else 0

        po.append("items", {
            "item_code": row.item,
            "item_name": item_details.item_name,
            "stock_uom": item_details.stock_uom,
            "description": item_details.description or item_details.item_name,
            "uom": row.uom,
            "qty": qty,
            "rate": rate,
            "project": task.project,
            "task": task.name,
            "cpc_irpo": task.name,
            "cpc_irpo_budget_row_ref": row.name,
            "schedule_date": task.exp_end_date or nowdate(),
            # UAT Issue 5 fix: set from the IRPO Task's own account at
            # creation time, rather than leaving it for ERPNext's normal
            # item_code-change default (Item's / Company's default
            # expense account) to fill in. carry_forward_irpo_fields()
            # below re-enforces this at validate/before_validate time
            # as the authoritative last word, in case the client
            # overwrites it interactively before save.
            "expense_account": task.account,
        })

    return po

def validate_irpo_is_usable(irpo, project=None):
    task = frappe.get_doc("Task", irpo)

    if not task.cpc_is_irpo or task.cpc_node_type != "IRPO":
        frappe.throw(_("{0} is not a valid IRPO Task").format(irpo))

    if task.is_group:
        frappe.throw(_("{0} is a group Task and cannot be used as an IRPO").format(irpo))

    if project and task.project != project:
        frappe.throw(_("IRPO {0} does not belong to Project {1}").format(irpo, project))

    if task.status in ("Closed", "Cancelled"):
        frappe.throw(_("IRPO {0} is {1} and cannot be used").format(irpo, task.status))

    return task



def get_consumed_qty(irpo):
    """Sum of Actual-type ledger rows for this IRPO (not cancelled)."""
    return frappe.db.sql("""
        select coalesce(sum(qty), 0)
        from `tabIRPO Quantity Ledger`
        where irpo = %s
          and ledger_type = 'Actual'
          and is_cancelled = 0
    """, irpo)[0][0] or 0


def get_committed_qty(irpo, exclude_voucher=None):
    """Sum of Commitment-type ledger rows for this IRPO (not cancelled), optionally excluding one voucher."""
    conditions = "irpo = %s and ledger_type = 'Commitment' and is_cancelled = 0"
    values = [irpo]
    if exclude_voucher:
        conditions += " and voucher_no != %s"
        values.append(exclude_voucher)

    return frappe.db.sql(f"""
        select coalesce(sum(qty), 0)
        from `tabIRPO Quantity Ledger`
        where {conditions}
    """, values)[0][0] or 0


def get_committed_amount(irpo, exclude_voucher=None):
    """Sum of amount from open, submitted PO items tagged with this IRPO.
    v1: no billed-amount netting yet — deferred until Purchase Invoice integration."""
    conditions = """
        poi.task = %s
        and po.docstatus = 1
        and po.status not in ('Closed', 'Cancelled')
    """
    values = [irpo]
    if exclude_voucher:
        conditions += " and po.name != %s"
        values.append(exclude_voucher)

    return frappe.db.sql(f"""
        select coalesce(sum(poi.amount), 0)
        from `tabPurchase Order Item` poi
        join `tabPurchase Order` po on po.name = poi.parent
        where {conditions}
    """, values)[0][0] or 0


def get_actual_amount(irpo, company=None):
    """Net expense posted to GL against this IRPO (Task accounting dimension).

    FIX: GL Entry has no `cpc_irpo` column - the IRPO link is the standard
    Task accounting dimension, stored as `task` (same decision as
    get_committed_amount). Limited to Expense-type accounts: the dimension is
    also copied onto payable / tax / stock lines of a voucher, and summing
    every line would net to roughly zero.
    """
    conditions = "gle.task = %s and gle.is_cancelled = 0 and acc.root_type = 'Expense'"
    values = [irpo]
    if company:
        conditions += " and gle.company = %s"
        values.append(company)

    return frappe.db.sql(f"""
        select coalesce(sum(gle.debit - gle.credit), 0)
        from `tabGL Entry` gle
        join `tabAccount` acc on acc.name = gle.account
        where {conditions}
    """, values)[0][0] or 0


def get_stage_balances(irpo, irpo_budget_row_ref, exclude_voucher=None):
	"""
	Returns {stage: qty} for one budget row, e.g.
	{'MR Pending': 2, 'PO Pending': 8, 'PR': 0, 'PI Actual': 5}
	Sums ALL signed ledger rows (originals + reversals) — a cancelled
	row's reversal already carries the offsetting negative qty, so
	filtering on is_cancelled here would double-count the reversal
	instead of netting it out.

	Restricted to the four consumption stages: Budget Revision rows
	(stage = 'IRPO Available') represent budget being added, not qty
	being consumed, and must never enter the controlled-qty total.
	"""
	conditions = "irpo = %s and irpo_budget_row_ref = %s and stage in (%s, %s, %s, %s)"
	values = [irpo, irpo_budget_row_ref, "MR Pending", "PO Pending", "PR", "PI Actual"]
	if exclude_voucher:
		conditions += " and voucher_no != %s"
		values.append(exclude_voucher)

	rows = frappe.db.sql(f"""
		select stage, coalesce(sum(qty), 0)
		from `tabIRPO Quantity Ledger`
		where {conditions}
		group by stage
	""", values)

	balances = {"MR Pending": 0, "PO Pending": 0, "PR": 0, "PI Actual": 0}
	balances.update(dict(rows))
	return balances


def get_controlled_qty(irpo, irpo_budget_row_ref, exclude_voucher=None):
	"""Sum of all four stage buckets — the spec's 'IRPO Controlled Qty'."""
	balances = get_stage_balances(irpo, irpo_budget_row_ref, exclude_voucher)
	return sum(balances.values())


_IRPO_CARRY_FORWARD_SOURCES = {
	"Purchase Order Item": [
		("material_request_item", "Material Request Item"),
	],
	"Purchase Receipt Item": [
		("po_detail", "Purchase Order Item"),
	],
	"Purchase Invoice Item": [
		("pr_detail", "Purchase Receipt Item"),
		("po_detail", "Purchase Order Item"),
	],
}

# Fieldname that carries the IRPO link on each child doctype — NOT the
# same everywhere: MR/PO Item use the custom cpc_irpo field; PR/PI Item
# reuse the pre-existing 'task' field instead.
_IRPO_FIELDNAME = {
	"Material Request Item": "task",
	"Purchase Order Item": "task",
	"Purchase Receipt Item": "task",
	"Purchase Invoice Item": "task",
}

def carry_forward_irpo_fields(doc, method=None):
	child_doctype = doc.doctype + " Item"
	sources = _IRPO_CARRY_FORWARD_SOURCES.get(child_doctype)
	if not sources:
		return

	target_irpo_field = _IRPO_FIELDNAME[child_doctype]

	for row in doc.get("items") or []:
		# Linkage already fully resolved (e.g. the direct "Create PO/PI"
		# Task-button flow, where the mapper already stamped task /
		# cpc_irpo_budget_row_ref / project) — skip re-resolving it and
		# the rate fix below, but DON'T skip the row entirely: the
		# expense_account enforcement further down still needs to run.
		linkage_already_set = bool(
			row.get(target_irpo_field) and row.get("cpc_irpo_budget_row_ref") and row.get("project")
		)

		if not linkage_already_set:
			for link_field, source_doctype in sources:
				source_name = row.get(link_field)
				if not source_name:
					continue

				source_irpo_field = _IRPO_FIELDNAME[source_doctype]
				source = frappe.db.get_value(
					source_doctype,
					source_name,
					["project", source_irpo_field, "cpc_irpo_budget_row_ref"],
					as_dict=True,
				)
				if source:
					row.project = row.project or source.project
					row.set(target_irpo_field, row.get(target_irpo_field) or source.get(source_irpo_field))
					row.cpc_irpo_budget_row_ref = row.cpc_irpo_budget_row_ref or source.cpc_irpo_budget_row_ref
					break

			# --- fix rate from the budget row itself, not the Item master ---
			if doc.doctype == "Purchase Order" and row.get("cpc_irpo_budget_row_ref"):
				budget_row = frappe.db.get_value(
					"Task Items Table",  # your actual child doctype name for custom_items_table
					row.cpc_irpo_budget_row_ref,
					["amount", "qty"],
					as_dict=True,
				)
				if budget_row and flt(budget_row.qty):
					correct_rate = flt(budget_row.amount) / flt(budget_row.qty)
					row.rate = correct_rate

		# --- UAT Issue 5 fix: expense_account, hard override ---
		# Runs for EVERY row that resolves to an IRPO — whether that
		# linkage was already set by the mapper (direct "Create PO/PI"
		# button flow) or was just resolved above (Get Items From /
		# MR-to-PO transfer flow) — because an Item's own default
		# expense account (fetched client-side on item_code selection)
		# is exactly what silently overwrites this field before save.
		# This hook runs at validate/before_validate time, after any
		# such client-side default, so it's the authoritative last word.
		# Purchase Receipt Item has no expense_account field.
		if doc.doctype in ("Purchase Order", "Purchase Invoice"):
			irpo = row.get(target_irpo_field)
			if irpo:
				task_account = frappe.db.get_value("Task", irpo, "account")
				if task_account:
					row.expense_account = task_account

	# --- NEW: backfill the header-level Project field. ---
	# Standard "Get Items From" mapping only maps item rows, not header
	# fields across doctypes.
	if not doc.get("project"):
		if doc.doctype == "Purchase Order":
			# Material Request keeps its project on a custom header field
			# (custom_project), not the standard 'project' field, so walk
			# each row's material_request_item back to its parent MR and
			# read that directly rather than trusting whatever the item
			# row's own project field happens to hold.
			mr_projects = set()
			for row in doc.get("items") or []:
				if not row.get("material_request_item"):
					continue
				mr_name = frappe.db.get_value(
					"Material Request Item", row.material_request_item, "parent"
				)
				if mr_name:
					mr_project = frappe.db.get_value("Material Request", mr_name, "custom_project")
					if mr_project:
						mr_projects.add(mr_project)
			if len(mr_projects) == 1:
				doc.project = mr_projects.pop()
			elif len(mr_projects) > 1:
				frappe.msgprint(
					_("Source Material Requests belong to different Projects — header Project was left blank."),
					indicator="orange",
				)

		if not doc.get("project"):
			# Fallback for PO rows with no MR source, and for PR/PI (whose
			# source doctypes already use the standard 'project' field, so
			# the per-row value set earlier in this function is reliable).
			row_projects = {row.project for row in (doc.get("items") or []) if row.get("project")}
			if len(row_projects) == 1:
				doc.project = row_projects.pop()
			elif len(row_projects) > 1:
				frappe.msgprint(
					_("Items on this {0} belong to different Projects — header Project was left blank.")
					.format(doc.doctype),
					indicator="orange",
				)