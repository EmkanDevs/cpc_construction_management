
# # Copyright (c) 2026, info@finbyz.tech and contributors
# # For license information, please see license.txt

# import frappe
# from frappe import _
# from frappe.model.document import Document


# class IRPOQuantityLedger(Document):
# 	"""
# 	System-generated, insert-only ledger of IRPO quantity movement.
# 	One signed row per stage transition: 'stage' is the bucket the
# 	movement lands in (MR Pending / PO Pending / PR / PI Actual);
# 	'irpo_budget_row_ref' is the authoritative budget key — never
# 	Item alone, since the same Item can appear in more than one
# 	budget row within an IRPO.
# 	"""

# 	def before_insert(self):
# 		if not frappe.flags.get("irpo_ledger_allow_insert"):
# 			frappe.throw(
# 				_("IRPO Quantity Ledger rows are system-generated only. They cannot be created manually.")
# 			)

# 		if not self.irpo:
# 			frappe.throw(_("IRPO is mandatory for a quantity ledger row."))

# 		if not self.irpo_budget_row_ref:
# 			frappe.throw(_("IRPO Budget Row Ref is mandatory for a quantity ledger row."))

# 		if not self.item:
# 			frappe.throw(_("Item is mandatory for a quantity ledger row."))

# 		if not self.qty:
# 			frappe.throw(_("Qty cannot be zero for a quantity ledger row."))

# 		if not self.posting_date:
# 			self.posting_date = frappe.utils.nowdate()

# 		if self.conversion_factor is None:
# 			self.conversion_factor = 1

# 	def validate(self):
# 		from cpc_construction_management.cpc_construction_management.budget.irpo_budget import (
# 			validate_irpo_is_usable,
# 		)

# 		task = validate_irpo_is_usable(self.irpo, project=self.project)

# 		# Confirm the budget row actually belongs to this IRPO and the
# 		# Item matches (spec section 4, steps 1-2).
# 		row = next(
# 			(r for r in task.custom_items_table if r.name == self.irpo_budget_row_ref),
# 			None,
# 		)
# 		if not row:
# 			frappe.throw(
# 				_("Budget Row Ref {0} does not belong to IRPO {1}.").format(
# 					self.irpo_budget_row_ref, self.irpo
# 				)
# 			)
# 		if row.item != self.item:
# 			frappe.throw(
# 				_("Item {0} does not match Item {1} on Budget Row {2}.").format(
# 					self.item, row.item, self.irpo_budget_row_ref
# 				)
# 			)

# 	def on_update(self):
# 		if not self.flags.in_insert:
# 			frappe.throw(
# 				_(
# 					"IRPO Quantity Ledger rows cannot be edited after creation. "
# 					"Insert a reversal row instead (see reversal_of)."
# 				)
# 			)

# 	def on_trash(self):
# 		if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
# 			frappe.throw(_("IRPO Quantity Ledger rows cannot be deleted."))


# def create_ledger_row(
# 	irpo: str,
# 	irpo_budget_row_ref: str,
# 	item: str,
# 	project: str,
# 	qty: float,
# 	uom: str,
# 	stage: str,
# 	voucher_type: str,
# 	voucher_no: str,
# 	voucher_detail_no: str,
# 	created_from_stage: str,
# 	company: str = None,
# 	boq_code: str = None,
# 	transaction_qty: float = None,
# 	transaction_uom: str = None,
# 	conversion_factor: float = 1,
# 	posting_date: str = None,
# 	reversal_of: str = None,
# 	remarks: str = None,
# 	# --- Budget Revision fields (US-08 revision enhancement) ---
# 	event_type: str = None,
# 	revision_no: int = None,
# 	budget_qty_before: float = None,
# 	budget_qty_after: float = None,
# 	mr_pending_qty_after: float = None,
# 	po_pending_qty_after: float = None,
# 	pr_qty_after: float = None,
# 	pi_actual_qty_after: float = None,
# 	irpo_available_qty_before: float = None,
# 	irpo_available_qty: float = None,
# ):
# 	frappe.flags.irpo_ledger_allow_insert = True
# 	try:
# 		doc = frappe.new_doc("IRPO Quantity Ledger")
# 		doc.irpo = irpo
# 		doc.irpo_budget_row_ref = irpo_budget_row_ref
# 		doc.item = item
# 		doc.project = project
# 		doc.boq_code = boq_code
# 		doc.company = company or frappe.defaults.get_user_default("Company")
# 		doc.posting_date = posting_date or frappe.utils.nowdate()
# 		doc.stage = stage
# 		doc.created_from_stage = created_from_stage
# 		doc.voucher_type = voucher_type
# 		doc.voucher_no = voucher_no
# 		doc.voucher_detail_no = voucher_detail_no
# 		doc.reversal_of = reversal_of
# 		doc.qty = qty
# 		doc.uom = uom
# 		doc.transaction_qty = transaction_qty if transaction_qty is not None else qty
# 		doc.transaction_uom = transaction_uom or uom
# 		doc.conversion_factor = conversion_factor or 1
# 		doc.remarks = remarks
# 		doc.event_type = event_type
# 		doc.revision_no = revision_no
# 		doc.budget_qty_before = budget_qty_before
# 		doc.budget_qty_after = budget_qty_after
# 		doc.mr_pending_qty_after = mr_pending_qty_after
# 		doc.po_pending_qty_after = po_pending_qty_after
# 		doc.pr_qty_after = pr_qty_after
# 		doc.pi_actual_qty_after = pi_actual_qty_after
# 		doc.irpo_available_qty_before = irpo_available_qty_before
# 		doc.irpo_available_qty = irpo_available_qty
# 		doc.insert(ignore_permissions=True)
# 		return doc
# 	finally:
# 		frappe.flags.irpo_ledger_allow_insert = False


# def reverse_ledger_row(ledger_row_name: str, remarks: str = None):
# 	"""Insert a negative reversal row for an existing ledger row."""
# 	original = frappe.get_doc("IRPO Quantity Ledger", ledger_row_name)

# 	if original.is_cancelled:
# 		frappe.throw(_("Ledger row {0} is already cancelled/reversed.").format(ledger_row_name))

# 	reversal = create_ledger_row(
# 		irpo=original.irpo,
# 		irpo_budget_row_ref=original.irpo_budget_row_ref,
# 		item=original.item,
# 		project=original.project,
# 		qty=-original.qty,
# 		uom=original.uom,
# 		stage=original.stage,
# 		voucher_type=original.voucher_type,
# 		voucher_no=original.voucher_no,
# 		voucher_detail_no=original.voucher_detail_no,
# 		created_from_stage=original.created_from_stage,
# 		company=original.company,
# 		boq_code=original.boq_code,
# 		transaction_qty=-original.transaction_qty if original.transaction_qty else None,
# 		transaction_uom=original.transaction_uom,
# 		conversion_factor=original.conversion_factor,
# 		reversal_of=original.name,
# 		remarks=remarks or _("Reversal of {0}").format(original.name),
# 	)

# 	frappe.db.set_value("IRPO Quantity Ledger", original.name, "is_cancelled", 1)

# 	return reversal










# Copyright (c) 2026, info@finbyz.tech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class IRPOQuantityLedger(Document):
	"""
	System-generated, insert-only ledger of IRPO quantity movement.
	One signed row per stage transition: 'stage' is the bucket the
	movement lands in (MR Pending / PO Pending / PR / PI Actual);
	'irpo_budget_row_ref' is the authoritative budget key for PLANNED rows
	- never Item alone, since the same Item can appear in more than one
	budget row within an IRPO. UNPLANNED rows (is_unplanned = 1) carry
	'irpo_unplanned_row_ref' instead and have no planned budget row ref.
	"""

	def before_insert(self):
		if not frappe.flags.get("irpo_ledger_allow_insert"):
			frappe.throw(
				_("IRPO Quantity Ledger rows are system-generated only. They cannot be created manually.")
			)

		if not self.irpo:
			frappe.throw(_("IRPO is mandatory for a quantity ledger row."))

		if cint(self.is_unplanned):
			if not self.irpo_unplanned_row_ref:
				frappe.throw(_("IRPO Unplanned Row Ref is mandatory for an unplanned ledger row."))
			if self.irpo_budget_row_ref:
				frappe.throw(_("An unplanned ledger row cannot carry a planned Budget Row Ref."))
		elif not self.irpo_budget_row_ref:
			frappe.throw(_("IRPO Budget Row Ref is mandatory for a quantity ledger row."))

		if not self.item:
			frappe.throw(_("Item is mandatory for a quantity ledger row."))

		if not self.qty:
			frappe.throw(_("Qty cannot be zero for a quantity ledger row."))

		if not self.posting_date:
			self.posting_date = frappe.utils.nowdate()

		if self.conversion_factor is None:
			self.conversion_factor = 1

	def validate(self):
		from cpc_construction_management.cpc_construction_management.budget.irpo_budget import (
			validate_irpo_is_usable,
		)

		task = validate_irpo_is_usable(self.irpo, project=self.project)

		if cint(self.is_unplanned):
			row = frappe.db.get_value(
				"IRPO Unplanned Item",
				{"unplanned_row_ref": self.irpo_unplanned_row_ref},
				["parent", "item"],
				as_dict=True,
			)
			if not row or row.parent != self.irpo or row.item != self.item:
				frappe.throw(
					_("Unplanned Row Ref {0} does not belong to IRPO {1} / Item {2}.").format(
						self.irpo_unplanned_row_ref, self.irpo, self.item
					)
				)
			return

		# Confirm the budget row actually belongs to this IRPO and the
		# Item matches (spec section 4, steps 1-2).
		row = next(
			(r for r in task.custom_items_table if r.name == self.irpo_budget_row_ref),
			None,
		)
		if not row:
			frappe.throw(
				_("Budget Row Ref {0} does not belong to IRPO {1}.").format(
					self.irpo_budget_row_ref, self.irpo
				)
			)
		if row.item != self.item:
			frappe.throw(
				_("Item {0} does not match Item {1} on Budget Row {2}.").format(
					self.item, row.item, self.irpo_budget_row_ref
				)
			)

	def on_update(self):
		if not self.flags.in_insert:
			frappe.throw(
				_(
					"IRPO Quantity Ledger rows cannot be edited after creation. "
					"Insert a reversal row instead (see reversal_of)."
				)
			)

	def on_trash(self):
		if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
			frappe.throw(_("IRPO Quantity Ledger rows cannot be deleted."))


# def create_ledger_row(
# 	irpo: str,
# 	irpo_budget_row_ref: str,
# 	item: str,
# 	project: str,
# 	qty: float,
# 	uom: str,
# 	stage: str,
# 	voucher_type: str,
# 	voucher_no: str,
# 	voucher_detail_no: str,
# 	created_from_stage: str,
# 	company: str = None,
# 	boq_code: str = None,
# 	transaction_qty: float = None,
# 	transaction_uom: str = None,
# 	conversion_factor: float = 1,
# 	posting_date: str = None,
# 	reversal_of: str = None,
# 	remarks: str = None,
# 	# --- Budget Revision fields (US-08 revision enhancement) ---
# 	event_type: str = None,
# 	revision_no: int = None,
# 	budget_qty_before: float = None,
# 	budget_qty_after: float = None,
# 	mr_pending_qty_after: float = None,
# 	po_pending_qty_after: float = None,
# 	pr_qty_after: float = None,
# 	pi_actual_qty_after: float = None,
# 	irpo_available_qty_before: float = None,
# 	irpo_available_qty: float = None,
# ):
# 	frappe.flags.irpo_ledger_allow_insert = True
# 	try:
# 		doc = frappe.new_doc("IRPO Quantity Ledger")
# 		doc.irpo = irpo
# 		doc.irpo_budget_row_ref = irpo_budget_row_ref
# 		doc.item = item
# 		doc.project = project
# 		doc.boq_code = boq_code
# 		doc.company = company or frappe.defaults.get_user_default("Company")
# 		doc.posting_date = posting_date or frappe.utils.nowdate()
# 		doc.stage = stage
# 		doc.created_from_stage = created_from_stage
# 		doc.voucher_type = voucher_type
# 		doc.voucher_no = voucher_no
# 		doc.voucher_detail_no = voucher_detail_no
# 		doc.reversal_of = reversal_of
# 		doc.qty = qty
# 		doc.uom = uom
# 		doc.transaction_qty = transaction_qty if transaction_qty is not None else qty
# 		doc.transaction_uom = transaction_uom or uom
# 		doc.conversion_factor = conversion_factor or 1
# 		doc.remarks = remarks
# 		doc.event_type = event_type
# 		doc.revision_no = revision_no
# 		doc.budget_qty_before = budget_qty_before
# 		doc.budget_qty_after = budget_qty_after
# 		doc.mr_pending_qty_after = mr_pending_qty_after
# 		doc.po_pending_qty_after = po_pending_qty_after
# 		doc.pr_qty_after = pr_qty_after
# 		doc.pi_actual_qty_after = pi_actual_qty_after
# 		doc.irpo_available_qty_before = irpo_available_qty_before
# 		doc.irpo_available_qty = irpo_available_qty
# 		doc.insert(ignore_permissions=True)
# 		return doc
# 	finally:
# 		frappe.flags.irpo_ledger_allow_insert = False


# def reverse_ledger_row(ledger_row_name: str, remarks: str = None):
# 	"""Insert a negative reversal row for an existing ledger row."""
# 	original = frappe.get_doc("IRPO Quantity Ledger", ledger_row_name)

# 	if original.is_cancelled:
# 		frappe.throw(_("Ledger row {0} is already cancelled/reversed.").format(ledger_row_name))

# 	reversal = create_ledger_row(
# 		irpo=original.irpo,
# 		irpo_budget_row_ref=original.irpo_budget_row_ref,
# 		item=original.item,
# 		project=original.project,
# 		qty=-original.qty,
# 		uom=original.uom,
# 		stage=original.stage,
# 		voucher_type=original.voucher_type,
# 		voucher_no=original.voucher_no,
# 		voucher_detail_no=original.voucher_detail_no,
# 		created_from_stage=original.created_from_stage,
# 		company=original.company,
# 		boq_code=original.boq_code,
# 		transaction_qty=-original.transaction_qty if original.transaction_qty else None,
# 		transaction_uom=original.transaction_uom,
# 		conversion_factor=original.conversion_factor,
# 		reversal_of=original.name,
# 		remarks=remarks or _("Reversal of {0}").format(original.name),
# 	)

# 	frappe.db.set_value("IRPO Quantity Ledger", original.name, "is_cancelled", 1)

# 	return reversal





def create_ledger_row(
	irpo: str,
	irpo_budget_row_ref: str,
	item: str,
	project: str,
	qty: float,
	uom: str,
	stage: str,
	voucher_type: str,
	voucher_no: str,
	voucher_detail_no: str,
	created_from_stage: str,
	company: str = None,
	boq_code: str = None,
	transaction_qty: float = None,
	transaction_uom: str = None,
	conversion_factor: float = 1,
	posting_date: str = None,
	reversal_of: str = None,
	remarks: str = None,
	# --- Budget Revision fields (US-08 revision enhancement) ---
	event_type: str = None,
	revision_no: int = None,
	budget_qty_before: float = None,
	budget_qty_after: float = None,
	mr_pending_qty_after: float = None,
	po_pending_qty_after: float = None,
	pr_qty_after: float = None,
	pi_actual_qty_after: float = None,
	irpo_available_qty_before: float = None,
	irpo_available_qty: float = None,
	# --- Unplanned tracking ---
	is_unplanned: int = 0,
	irpo_unplanned_row_ref: str = None,
):
	frappe.flags.irpo_ledger_allow_insert = True
	try:
		doc = frappe.new_doc("IRPO Quantity Ledger")
		doc.irpo = irpo
		doc.irpo_budget_row_ref = irpo_budget_row_ref or None
		doc.is_unplanned = cint(is_unplanned)
		doc.irpo_unplanned_row_ref = irpo_unplanned_row_ref or None
		doc.item = item
		doc.project = project
		doc.boq_code = boq_code
		doc.company = company or frappe.defaults.get_user_default("Company")
		doc.posting_date = posting_date or frappe.utils.nowdate()
		doc.stage = stage
		doc.created_from_stage = created_from_stage
		doc.voucher_type = voucher_type
		doc.voucher_no = voucher_no
		doc.voucher_detail_no = voucher_detail_no
		doc.reversal_of = reversal_of
		doc.qty = qty
		doc.uom = uom
		doc.transaction_qty = transaction_qty if transaction_qty is not None else qty
		doc.transaction_uom = transaction_uom or uom
		doc.conversion_factor = conversion_factor or 1
		doc.remarks = remarks
		doc.event_type = event_type
		doc.revision_no = revision_no
		doc.budget_qty_before = budget_qty_before
		doc.budget_qty_after = budget_qty_after
		doc.mr_pending_qty_after = mr_pending_qty_after
		doc.po_pending_qty_after = po_pending_qty_after
		doc.pr_qty_after = pr_qty_after
		doc.pi_actual_qty_after = pi_actual_qty_after
		doc.irpo_available_qty_before = irpo_available_qty_before
		doc.irpo_available_qty = irpo_available_qty
		doc.insert(ignore_permissions=True)
		return doc
	finally:
		frappe.flags.irpo_ledger_allow_insert = False


def reverse_ledger_row(ledger_row_name: str, remarks: str = None):
	"""Insert a negative reversal row for an existing ledger row."""
	original = frappe.get_doc("IRPO Quantity Ledger", ledger_row_name)

	if original.is_cancelled:
		frappe.throw(_("Ledger row {0} is already cancelled/reversed.").format(ledger_row_name))

	reversal = create_ledger_row(
		irpo=original.irpo,
		irpo_budget_row_ref=original.irpo_budget_row_ref,
		is_unplanned=original.is_unplanned,
		irpo_unplanned_row_ref=original.irpo_unplanned_row_ref,
		item=original.item,
		project=original.project,
		qty=-original.qty,
		uom=original.uom,
		stage=original.stage,
		voucher_type=original.voucher_type,
		voucher_no=original.voucher_no,
		voucher_detail_no=original.voucher_detail_no,
		created_from_stage=original.created_from_stage,
		company=original.company,
		boq_code=original.boq_code,
		transaction_qty=-original.transaction_qty if original.transaction_qty else None,
		transaction_uom=original.transaction_uom,
		conversion_factor=original.conversion_factor,
		reversal_of=original.name,
		remarks=remarks or _("Reversal of {0}").format(original.name),
	)

	frappe.db.set_value("IRPO Quantity Ledger", original.name, "is_cancelled", 1)

	return reversal