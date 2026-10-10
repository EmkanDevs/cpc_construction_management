# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt

from datetime import date

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class CPCWeeklyCalendar(Document):
	def validate(self):
		if not self.week_convention:
			self.week_convention = "ISO Monday\u2013Sunday"

		if not self.is_new():
			# week_year is the autoname source; changing it after creation
			# would orphan every CPC Calendar Week already generated under it.
			existing_year = frappe.db.get_value(self.doctype, self.name, "week_year")
			if existing_year and int(existing_year) != int(self.week_year):
				frappe.throw("Week Year cannot be changed after creation. Create a new CPC Weekly Calendar for a different year instead.")

	@frappe.whitelist()
	def generate_weeks(self):
		"""Generate every ISO week (Monday-Sunday) for this calendar's year.

		Idempotent: safe to call repeatedly. Existing CPC Calendar Week
		records for this year are never modified or duplicated — only
		missing week numbers are inserted.
		"""
		if not self.week_year:
			frappe.throw("Set Week Year before generating weeks.")

		year = int(self.week_year)

		# 28 December always falls in the final ISO week of `year` (52 or 53),
		# per the ISO 8601 definition — this is the standard trick for it.
		last_week_number = date(year, 12, 28).isocalendar()[1]

		existing_week_numbers = set(
			frappe.get_all(
				"CPC Calendar Week",
				filters={"week_year": year},
				pluck="week_number",
			)
		)

		created = 0
		for week_number in range(1, last_week_number + 1):
			if week_number in existing_week_numbers:
				continue

			start_date = date.fromisocalendar(year, week_number, 1)  # Monday
			end_date = date.fromisocalendar(year, week_number, 7)    # Sunday

			week_doc = frappe.new_doc("CPC Calendar Week")
			week_doc.weekly_calendar = self.name
			week_doc.week_year = year
			week_doc.week_number = week_number
			week_doc.start_date = start_date
			week_doc.end_date = end_date
			week_doc.display_label = _format_display_label(year, week_number, start_date, end_date)
			week_doc.insert()
			created += 1

		self.db_set("generated_week_count", last_week_number)
		self.db_set("generated_by", frappe.session.user)
		self.db_set("generated_on", now_datetime())

		if created:
			frappe.msgprint(
				f"Generated {created} new week(s) for {year}. {last_week_number} total ISO weeks this year."
			)
		else:
			frappe.msgprint(f"All {last_week_number} weeks for {year} already exist. Nothing to do.")

		return {"total_weeks": last_week_number, "created": created}


def _format_display_label(year, week_number, start_date, end_date):
	if start_date.month == end_date.month:
		range_str = f"{start_date.day:02d}\u2013{end_date.day:02d} {end_date.strftime('%B')}"
	else:
		range_str = f"{start_date.strftime('%d %b')} \u2013 {end_date.strftime('%d %b')}"
	return f"{year}-W{week_number:02d} \u00b7 {range_str}"