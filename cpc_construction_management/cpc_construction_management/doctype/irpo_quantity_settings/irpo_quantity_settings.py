# Copyright (c) 2026, info@finbyz.tech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class IRPOQuantitySettings(Document):
	def validate(self):
		stop_actions = (
			self.material_request_qty_action,
			self.purchase_order_qty_action,
			self.purchase_receipt_qty_action,
			self.purchase_invoice_qty_action,
		)
		if "Stop" in stop_actions and not self.quantity_override_role:
			frappe.throw(
				_(
					"Quantity Override Role is required when any voucher's Qty Action "
					"is set to Stop, otherwise no one will ever be able to submit an "
					"over-budget quantity transaction."
				)
			)


def get_settings():
	"""Cached accessor. Callers should use this rather than
	frappe.get_single directly."""
	return frappe.get_cached_doc("IRPO Quantity Settings")


def get_action_for_voucher_type(voucher_type: str) -> str:
	"""Map a source doctype (Material Request / Purchase Order /
	Purchase Receipt / Purchase Invoice) to its configured qty action."""
	settings = get_settings()
	mapping = {
		"Material Request": settings.material_request_qty_action,
		"Purchase Order": settings.purchase_order_qty_action,
		"Purchase Receipt": settings.purchase_receipt_qty_action,
		"Purchase Invoice": settings.purchase_invoice_qty_action,
	}
	action = mapping.get(voucher_type)
	if not action:
		frappe.throw(_("No quantity budget action configured for voucher type {0}.").format(voucher_type))
	return action