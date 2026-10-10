import frappe
from frappe import _
from frappe.model.document import Document


class IRPOQuantityOverrideLog(Document):
	def before_insert(self):
		if not frappe.flags.get("irpo_override_log_allow_insert"):
			frappe.throw(_("Override Log entries are system-generated only."))
		self.overridden_on = frappe.utils.now()

	def on_update(self):
		if not self.is_new():
			frappe.throw(_("Override Log entries cannot be edited."))

	def on_trash(self):
		frappe.throw(_("Override Log entries cannot be deleted."))