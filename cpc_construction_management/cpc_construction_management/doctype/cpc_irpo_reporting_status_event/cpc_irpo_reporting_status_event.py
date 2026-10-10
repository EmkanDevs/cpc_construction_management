# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, now_datetime, nowdate


class CPCIRPOReportingStatusEvent(Document):
	def validate(self):
		if not self.recorded_by:
			self.recorded_by = frappe.session.user
		if not self.recorded_on:
			self.recorded_on = now_datetime()
		if self.effective_date and getdate(self.effective_date) > getdate(nowdate()):
			frappe.throw(f"Reporting status event effective date ({self.effective_date}) cannot be in the future.")