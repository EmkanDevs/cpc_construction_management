from datetime import date, timedelta

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

WEEK_CONVENTION = "Sunday\u2013Saturday"


class CPCWeeklyCalendar(Document):
	def validate(self):
		# Saudi Arabia only: the week always runs Sunday to Saturday.
		self.week_convention = WEEK_CONVENTION

		if not self.is_new():
			# week_year is the autoname source; changing it after creation
			# would orphan every CPC Calendar Week already generated under it.
			existing_year = frappe.db.get_value(self.doctype, self.name, "week_year")
			if existing_year and int(existing_year) != int(self.week_year):
				frappe.throw("Week Year cannot be changed after creation. Create a new CPC Weekly Calendar for a different year instead.")

	@frappe.whitelist()
	def generate_weeks(self):
		"""Generate every Sunday-Saturday week for this calendar's year.

		Week 1 is the Sunday-Saturday week that contains 4 January, so every
		week belongs to exactly one year (same rule ISO uses, shifted to a
		Sunday start).

		Idempotent: safe to call repeatedly. Existing CPC Calendar Week
		records for this year are never modified or duplicated; only
		missing week numbers are inserted.
		"""
		if not self.week_year:
			frappe.throw("Set Week Year before generating weeks.")

		year = int(self.week_year)
		week_ranges = get_week_ranges(year)
		total_weeks = len(week_ranges)

		existing_week_numbers = set(
			frappe.get_all(
				"CPC Calendar Week",
				filters={"week_year": year},
				pluck="week_number",
			)
		)

		created = 0
		for week_number, start_date, end_date in week_ranges:
			if week_number in existing_week_numbers:
				continue

			week_doc = frappe.new_doc("CPC Calendar Week")
			week_doc.weekly_calendar = self.name
			week_doc.week_year = year
			week_doc.week_number = week_number
			week_doc.start_date = start_date
			week_doc.end_date = end_date
			week_doc.display_label = _format_display_label(year, week_number, start_date, end_date)
			week_doc.insert()
			created += 1

		self.db_set("week_convention", WEEK_CONVENTION)
		self.db_set("generated_week_count", total_weeks)
		self.db_set("generated_by", frappe.session.user)
		self.db_set("generated_on", now_datetime())

		if created:
			frappe.msgprint(
				f"Generated {created} new week(s) for {year}. {total_weeks} total weeks this year (Sunday\u2013Saturday)."
			)
		else:
			frappe.msgprint(f"All {total_weeks} weeks for {year} already exist. Nothing to do.")

		return {"total_weeks": total_weeks, "created": created}


def _week1_start(year):
	"""Sunday on or before 4 January of `year`."""
	jan4 = date(year, 1, 4)
	# Python weekday(): Mon=0 ... Sun=6, so days since Sunday = (weekday + 1) % 7
	return jan4 - timedelta(days=(jan4.weekday() + 1) % 7)


def get_week_ranges(year):
	"""Return [(week_number, start_sunday, end_saturday), ...] for `year`."""
	start = _week1_start(year)
	total_weeks = (_week1_start(year + 1) - start).days // 7
	return [
		(n, start + timedelta(weeks=n - 1), start + timedelta(weeks=n - 1, days=6))
		for n in range(1, total_weeks + 1)
	]


def _format_display_label(year, week_number, start_date, end_date):
	if start_date.month == end_date.month:
		range_str = f"{start_date.day:02d}\u2013{end_date.day:02d} {end_date.strftime('%B')}"
	else:
		range_str = f"{start_date.strftime('%d %b')} \u2013 {end_date.strftime('%d %b')}"
	return f"{year}-W{week_number:02d} \u00b7 {range_str}"