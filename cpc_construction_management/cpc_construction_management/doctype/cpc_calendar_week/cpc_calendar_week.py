# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt

import frappe
from frappe.model.document import Document


class CPCCalendarWeek(Document):
	def autoname(self):
		if not (self.week_year and self.week_number):
			frappe.throw("Week Year and Week Number are required to name a CPC Calendar Week.")
		self.name = f"{int(self.week_year)}-W{int(self.week_number):02d}"

	def validate(self):
		if not self.is_new():
			self._block_date_changes()

	def _block_date_changes(self):
		"""Generated week boundaries are immutable per Section 6.3 of the
		US-11 handoff — repeated generation must not change referenced dates,
		and nothing downstream should be able to shift a week's Mon-Sun range
		out from under records that already reference it."""
		before = frappe.db.get_value(
			self.doctype, self.name, ["start_date", "end_date", "week_year", "week_number"], as_dict=True
		)
		if not before:
			return
		changed = [
			field
			for field in ("start_date", "end_date", "week_year", "week_number")
			if str(before.get(field)) != str(self.get(field))
		]
		if changed:
			frappe.throw(
				f"CPC Calendar Week records are immutable once generated. "
				f"Cannot change: {', '.join(changed)}."
			)

	def on_trash(self):
		# IRPO Progress doesn't exist yet as of the Weekly Calendar step, but
		# this guard is wired now so it's active the moment Step 4 lands —
		# Section 6.3: "Prevent deletion ... when progress records reference
		# the period."
		if frappe.db.exists("DocType", "IRPO Progress") and frappe.db.exists(
			"IRPO Progress", {"calendar_week": self.name}
		):
			frappe.throw(f"Cannot delete {self.name}: one or more IRPO Progress records reference this week.")