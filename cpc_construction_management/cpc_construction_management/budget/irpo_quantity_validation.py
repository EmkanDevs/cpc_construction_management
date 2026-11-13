import frappe
from frappe import _
from frappe.utils import flt

from cpc_construction_management.cpc_construction_management.budget.irpo_budget import _IRPO_FIELDNAME, get_controlled_qty
from cpc_construction_management.cpc_construction_management.budget.irpo_expense_account import erpnext_owns_account
from cpc_construction_management.cpc_construction_management.doctype.irpo_quantity_settings.irpo_quantity_settings import get_action_for_voucher_type, get_settings
from cpc_construction_management.cpc_construction_management.budget.irop_uom import normalize_qty_to_irpo_uom


# Fields that mark a row as a stage TRANSFER (PO from MR, PR from PO).
# A row with one of these set is moving qty already counted in
# controlled_before from one stage to another - it is NOT new demand
# and must not be added on top.
#
# NOTE: Purchase Receipt Item links back to its PO row through
# `purchase_order_item` (ERPNext v15). `po_detail` is the Purchase
# Invoice Item field name; it is kept here only as a fallback.
_SOURCE_FIELDS = {
	"Purchase Order": ("material_request_item",),
	"Purchase Receipt": ("purchase_order_item", "po_detail"),
	# Purchase Invoice handled separately below - it can trace back
	# through either pr_detail or po_detail.
}


def _lock_budget_row(budget_row_ref):
	"""Serializes concurrent submissions against the same budget row -
	the second submitter blocks here until the first one's transaction
	commits or rolls back, so both see an up-to-date controlled qty."""
	frappe.db.sql("SELECT name FROM `tabItem Table` WHERE name = %s FOR UPDATE", budget_row_ref)


def _is_transfer_row(doc, row):
	if doc.doctype == "Purchase Invoice":
		return bool(row.get("pr_detail") or row.get("po_detail"))
	return any(row.get(f) for f in _SOURCE_FIELDS.get(doc.doctype, ()))


def _transfer_from_stage(doc, row):
	"""Which stage this row's qty is being moved OUT of, if any. Same
	source-field logic _is_transfer_row uses, but returns the stage name
	so callers can check that specific stage's balance (spec section 28) -
	not just the aggregate controlled total, which can't detect a single
	stage going negative while the overall budget still has headroom."""
	if doc.doctype == "Purchase Order":
		return "MR Pending" if row.get("material_request_item") else None
	if doc.doctype == "Purchase Receipt":
		return "PO Pending" if (row.get("purchase_order_item") or row.get("po_detail")) else None
	if doc.doctype == "Purchase Invoice":
		if row.get("pr_detail"):
			return "PR"
		if row.get("po_detail"):
			return "PO Pending"
	return None


def _stage_balance(budget_row_ref, stage):
	"""Current signed balance of one stage for one budget row, read
	directly from the ledger - the authoritative source (spec section 22).

	Sums ALL rows (no is_cancelled filter): on cancellation the original
	rows are flagged is_cancelled=1 and offsetting reversal rows are
	inserted, so the signed quantities only net to the true balance when
	both the originals and the reversals are included."""
	total = frappe.db.sql(
		"""
		select coalesce(sum(qty), 0)
		from `tabIRPO Quantity Ledger`
		where irpo_budget_row_ref = %s
		  and stage = %s
		""",
		(budget_row_ref, stage),
	)[0][0]
	return flt(total)


def _validate_relationship(doc, row, irpo, budget_row):
	"""Spec section 4.1 / 16.2-3: confirm the row's IRPO chain is
	internally consistent before any quantity math runs - don't trust
	that cpc_irpo_budget_row_ref actually belongs to the row's Task/Item
	just because both fields are populated."""
	if budget_row.parent != irpo:
		frappe.throw(
			_("Row {0}: the selected IRPO Budget Row does not belong to Task {1}.")
			.format(row.idx, irpo)
		)
	if budget_row.item != row.item_code:
		frappe.throw(
			_("Row {0}: Item {1} does not match the Item configured in the selected IRPO Budget Row.")
			.format(row.idx, row.item_code)
		)
	task_project = frappe.db.get_value("Task", irpo, "project")
	if row.get("project") and task_project and row.project != task_project:
		frappe.throw(
			_("Row {0}: project {1} does not match IRPO Task project {2}.")
			.format(row.idx, row.project, task_project)
		)


def _validate_expense_account(doc, row, irpo):
	"""Spec section 18: don't let an Item default account silently bypass
	the IRPO's own Budget account."""
	if doc.doctype not in ("Purchase Order", "Purchase Invoice"):
		return  # Purchase Receipt Item has no expense_account field
	if erpnext_owns_account(doc, row):
		return  # stock item + perpetual inventory: ERPNext sets the stock/GIT account on purpose
	expected_account = frappe.db.get_value("Task", irpo, "account")
	if expected_account and row.get("expense_account") and row.expense_account != expected_account:
		frappe.throw(
			_("Row {0}: expense account {1} does not match the account configured on IRPO Task {2} ({3}).")
			.format(row.idx, row.expense_account, irpo, expected_account)
		)


def _fmt_qty(value):
	"""1.0 -> '1', 2.5 -> '2.5' (no trailing zeros in user-facing messages)."""
	return f"{flt(value, 3):g}"


def _exceeded_message(row_idx, task, item, allowed, requested, uom):
	return _(
		"Row {0}: IRPO quantity exceeded for Item {1} against {2}. "
		"Allowed quantity: {3} {5}. Requested quantity: {4} {5}."
	).format(row_idx, item, task, _fmt_qty(max(flt(allowed), 0)), _fmt_qty(requested), uom)


def check_quantity_budget(doc, method=None):
	"""before_submit hook for Material Request / Purchase Order /
	Purchase Receipt / Purchase Invoice."""
	action = get_action_for_voucher_type(doc.doctype)
	if action == "Ignore":
		return

	irpo_field = _IRPO_FIELDNAME.get(doc.doctype + " Item")
	if not irpo_field:
		return

	exceeded_rows = []
	stage_shortfall_rows = []

	# Running totals so two rows in the SAME document that hit the same
	# budget row / source stage can't each pass on their own while
	# together exceeding what is available.
	stage_used = {}  # (budget_row_ref, stage) -> qty drawn by earlier rows in this doc
	fresh_used = {}  # budget_row_ref -> fresh qty added by earlier rows in this doc

	for row in doc.get("items") or []:
		irpo = row.get(irpo_field)
		budget_row_ref = row.get("cpc_irpo_budget_row_ref")
		if not irpo or not budget_row_ref:
			continue  # overhead / non-IRPO line

		budget_row = frappe.db.get_value(
			"Item Table", budget_row_ref, ["item", "uom", "qty", "parent"], as_dict=True
		)
		if not budget_row:
			frappe.throw(_("IRPO Budget Row {0} no longer exists.").format(budget_row_ref))

		_validate_relationship(doc, row, irpo, budget_row)
		_validate_expense_account(doc, row, irpo)

		irpo_qty, _factor = normalize_qty_to_irpo_uom(row.item_code, flt(row.qty), row.uom, budget_row.uom)

		_lock_budget_row(budget_row_ref)

		# Stage-level check (spec section 28) - must hold regardless of the
		# configured Warn/Stop/override action, since this isn't a budget
		# policy question: you cannot physically receive/invoice more than
		# the source stage currently holds for this exact row.
		from_stage = _transfer_from_stage(doc, row)
		if from_stage:
			key = (budget_row_ref, from_stage)
			available_in_stage = _stage_balance(budget_row_ref, from_stage) - stage_used.get(key, 0)
			if irpo_qty - available_in_stage > 1e-6:
				stage_shortfall_rows.append(frappe._dict(
					row=row, irpo=irpo, item=row.item_code, from_stage=from_stage,
					requested=irpo_qty, available=available_in_stage, uom=budget_row.uom,
				))
			stage_used[key] = stage_used.get(key, 0) + irpo_qty

		controlled_before = get_controlled_qty(irpo, budget_row_ref, exclude_voucher=doc.name)

		# A transfer row (PO from MR, PR from PO, PI from either) moves
		# qty that's already counted in controlled_before from one stage
		# to another - it doesn't add new demand, so the total is unchanged.
		if _is_transfer_row(doc, row):
			controlled_after = controlled_before
			allowed_qty = None
		else:
			earlier_fresh = fresh_used.get(budget_row_ref, 0)
			controlled_after = controlled_before + earlier_fresh + irpo_qty
			allowed_qty = flt(budget_row.qty) - controlled_before - earlier_fresh
			fresh_used[budget_row_ref] = earlier_fresh + irpo_qty

		if controlled_after > flt(budget_row.qty):
			exceeded_rows.append(frappe._dict(
				row=row, irpo=irpo, budget_row_ref=budget_row_ref, item=row.item_code,
				budget_qty=budget_row.qty, controlled_before=controlled_before,
				controlled_after=controlled_after, exceeded_by=controlled_after - flt(budget_row.qty),
				allowed=allowed_qty, requested=irpo_qty, uom=budget_row.uom,
			))

	if stage_shortfall_rows:
		message = "<br>".join(
			_exceeded_message(s.row.idx, s.irpo, s.item, s.available, s.requested, s.uom)
			for s in stage_shortfall_rows
		)
		frappe.throw(message, title=_("IRPO Quantity Exceeded"))

	if not exceeded_rows:
		return

	message = "<br>".join(
		_exceeded_message(e.row.idx, e.irpo, e.item, e.allowed, e.requested, e.uom)
		for e in exceeded_rows
	)

	if action == "Warn":
		frappe.msgprint(message, title=_("IRPO Quantity Budget Warning"), indicator="orange")
		return

	# action == "Stop"
	settings = get_settings()
	user_has_override = bool(
		settings.quantity_override_role and settings.quantity_override_role in frappe.get_roles()
	)
	# An override needs somewhere to record the reason. Purchase Receipt has no
	# cpc_budget_override_reason field, so there a genuine exceed is a hard stop
	# for everyone - never ask for a field that doesn't exist.
	has_reason_field = frappe.get_meta(doc.doctype).has_field("cpc_budget_override_reason")

	if not (user_has_override and has_reason_field):
		frappe.throw(message, title=_("IRPO Quantity Exceeded"))

	if not doc.get("cpc_budget_override_reason"):
		frappe.throw(
			_("This submission exceeds the IRPO quantity. Provide a reason in "
			  "'Budget Override Reason' before submitting.<br><br>{0}").format(message),
			title=_("Override Reason Required"),
		)

	for e in exceeded_rows:
		_log_override(doc, e)

	frappe.msgprint(
		_("IRPO quantity exceeded but submission allowed via override - logged."),
		title=_("Budget Overridden"), indicator="orange",
	)


def _log_override(doc, e):
	frappe.flags.irpo_override_log_allow_insert = True
	try:
		log = frappe.new_doc("IRPO Quantity Override Log")
		log.irpo = e.irpo
		log.irpo_budget_row_ref = e.budget_row_ref
		log.item = e.item
		log.voucher_type = doc.doctype
		log.voucher_no = doc.name
		log.budget_qty = e.budget_qty
		log.controlled_qty_before = e.controlled_before
		log.controlled_qty_after = e.controlled_after
		log.exceeded_qty = e.exceeded_by
		log.reason = doc.get("cpc_budget_override_reason")
		log.overridden_by = frappe.session.user
		log.insert(ignore_permissions=True)
	finally:
		frappe.flags.irpo_override_log_allow_insert = False