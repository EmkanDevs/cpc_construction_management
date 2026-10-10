# Copyright (c) 2026, info@finbyz.tech and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class IRPOBudgetOverrideLog(Document):
	def before_insert(self):
		if not self.override_by:
			self.override_by = frappe.session.user
		if not self.override_on:
			self.override_on = now_datetime()

	def on_update(self):
		if not self.is_new():
			frappe.throw(
				frappe._("IRPO Budget Override Log entries are an audit trail and cannot be edited.")
			)


def record_override(
	irpo: str,
	project: str,
	voucher_type: str,
	voucher_no: str,
	check_type: str,
	budget_qty: float = None,
	after_qty: float = None,
	over_qty: float = None,
	budget_amount: float = None,
	after_amount: float = None,
	over_amount: float = None,
	override_role: str = None,
	voucher_detail_no: str = None,
	remarks: str = None,
):
	"""Single entry point for recording a Stop override. Call this from
	apply_budget_action() in the central budget service — never insert
	this doctype directly from document hooks."""
	doc = frappe.new_doc("IRPO Budget Override Log")
	doc.irpo = irpo
	doc.project = project
	doc.voucher_type = voucher_type
	doc.voucher_no = voucher_no
	doc.voucher_detail_no = voucher_detail_no
	doc.check_type = check_type
	doc.action = "Stop"
	doc.budget_qty = budget_qty
	doc.after_qty = after_qty
	doc.over_qty = over_qty
	doc.budget_amount = budget_amount
	doc.after_amount = after_amount
	doc.over_amount = over_amount
	doc.override_role = override_role
	doc.remarks = remarks
	doc.insert(ignore_permissions=True)
	return doc