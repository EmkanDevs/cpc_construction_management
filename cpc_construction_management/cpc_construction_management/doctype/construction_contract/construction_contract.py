import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

# Role that is allowed to submit a contract even when a BOQ line has
# no margin (cost_budget >= amount). Create this role in the site if
# the override behaviour described in US-01 is required.
MARGIN_OVERRIDE_ROLE = "CPC Contract Margin Override"


class ConstructionContract(Document):
	# ------------------------------------------------------------------
	# Validation / rollups
	# ------------------------------------------------------------------
	def validate(self):
		self.validate_existing_project()
		self.apply_item_classification_defaults()
		self.calculate_boq_totals()
		self.validate_unique_boq_codes()

	def validate_existing_project(self):
		if self.use_existing_project:
			if not self.project:
				frappe.throw(_("Please select an existing Project or uncheck 'Use Existing Project'."))

			project_data = frappe.db.get_value(
				"Project", self.project, ["company", "customer"], as_dict=True
			)
			if not project_data:
				frappe.throw(_("Selected Project {0} does not exist.").format(frappe.bold(self.project)))
			if self.company and project_data.company != self.company:
				frappe.throw(
					_("Selected Project {0} belongs to company {1}, but this contract is for {2}.").format(
						frappe.bold(self.project), frappe.bold(project_data.company), frappe.bold(self.company)
					)
				)
			if self.customer and project_data.customer != self.customer:
				frappe.throw(
					_("Selected Project {0} belongs to customer {1}, but this contract is for {2}.").format(
						frappe.bold(self.project), frappe.bold(project_data.customer), frappe.bold(self.customer)
					)
				)
		elif self.docstatus == 0 and not self.use_existing_project and self.project:
			self.project = None

	def apply_item_classification_defaults(self):
		"""Fill item_group_l1/l2/l3/item_group on each BOQ row from Item Variant
		Settings' Construction defaults, if the row doesn't already have its own
		values set. Rows already linked to an Item (item_code set) are skipped —
		those fields are locked once the Item exists, so there's nothing to fill."""
		settings = frappe.get_cached_doc("Item Variant Settings")

		defaults = {
			"item_group_l1": settings.get("custom_default_item_group_l1"),
			"item_group_l2": settings.get("custom_default_item_group_l2"),
			"item_group_l3": settings.get("custom_default_item_group_l3"),
			"item_group": settings.get("custom_default_item_group"),
		}

		if not any(defaults.values()):
			return

		for row in self.boq_items:
			if row.item_code:
				continue
			for fieldname, value in defaults.items():
				if value and not row.get(fieldname):
					row.set(fieldname, value)

	def calculate_boq_totals(self):
		"""base_value = Σ of all BOQ lines.
		change_order_value / revised_value are kept as fields for when the
		change-order flow comes back, but with the is_change_order checkbox
		removed from Contract BOQ Item for now, every line counts toward
		base_value and change_order_value stays 0 (revised_value == base_value).
		target_margin_percent expresses target_margin as a % of base_value,
		so users can read margin as an amount and a rate side by side."""
		base_value = 0.0
		total_cost_budget = 0.0

		for row in self.boq_items:
			row.amount = flt(row.qty) * flt(row.rate)
			row.margin = flt(row.amount) - flt(row.cost_budget)

			base_value += flt(row.amount)
			total_cost_budget += flt(row.cost_budget)

		self.base_value = base_value
		self.change_order_value = 0.0
		self.revised_value = base_value
		self.total_cost_budget = total_cost_budget
		self.target_margin = flt(self.base_value) - flt(total_cost_budget)
		self.target_margin_percent = (
			(self.target_margin / self.base_value) * 100 if self.base_value else 0.0
		)

	def validate_unique_boq_codes(self):
		seen = {}
		for row in self.boq_items:
			if not row.boq_code:
				continue
			if row.boq_code in seen:
				frappe.throw(
					_("BOQ Code {0} is used on rows {1} and {2}. BOQ Code must be unique within the contract.").format(
						frappe.bold(row.boq_code), seen[row.boq_code], row.idx
					)
				)
			seen[row.boq_code] = row.idx

	def before_submit(self):
		if not self.boq_items:
			frappe.throw(_("Cannot submit a Construction Contract with no BOQ lines."))

		zero_margin_rows = [
			row.boq_code for row in self.boq_items if flt(row.cost_budget) >= flt(row.amount)
		]
		if zero_margin_rows and not self._has_margin_override():
			frappe.throw(
				_("No margin on {0}. Ask a user with the {1} role to override and submit.").format(
					", ".join(frappe.bold(code) for code in zero_margin_rows),
					frappe.bold(MARGIN_OVERRIDE_ROLE),
				)
			)

		unclassified_rows = [
			row.boq_code for row in self.boq_items
			if not row.item_code and not all(
				[row.item_group_l1, row.item_group_l2, row.item_group_l3, row.item_group]
			)
		]
		if unclassified_rows:
			frappe.throw(
				_("Item Group L1/L2/L3 and Item Group are required before submit on {0}.").format(
					", ".join(frappe.bold(code) for code in unclassified_rows)
				)
			)

	def _has_margin_override(self):
		return MARGIN_OVERRIDE_ROLE in frappe.get_roles(frappe.session.user)

	# ------------------------------------------------------------------
	# Submit-time automation
	# ------------------------------------------------------------------
	def on_submit(self):
		self.push_boq_to_item_master()
		self.create_project()
		self.sync_project_to_boq_items()
		try:
			from cpc_construction_management.cpc_construction_management.doc_events.task import (
				create_boq_nodes_for_contract,
			)
			create_boq_nodes_for_contract(self.name)
		except Exception as e:
			frappe.log_error(f"Error creating BOQ nodes for {self.name}: {e}")


	# ------------------------------------------------------------------
	# US-02: push BOQ lines to Item Master
	# ------------------------------------------------------------------
	@frappe.whitelist()
	def create_item_master(self):
		"""Button handler: 'Create Item Master' — visible in Draft, also
		runs automatically on submit. Idempotent: rows that already have
		an item_code are skipped."""
		self.push_boq_to_item_master()
		self.save()
		return {"created": True}

	def push_boq_to_item_master(self):
		touched = False

		for row in self.boq_items:
			if row.item_code:
				continue

			intended_code = f"{self.name}-{row.boq_code}"

			item = frappe.new_doc("Item")
			item.item_code = intended_code
			item.item_name = (row.description or intended_code)[:140]
			item.item_group = row.item_group
			item.custom_item_group_l1 = row.item_group_l1
			item.custom_item_group_l2 = row.item_group_l2
			item.custom_item_group_l3 = row.item_group_l3
			item.stock_uom = row.uom
			item.is_stock_item = 0
			item.is_sales_item = 1
			item.is_purchase_item = 0
			item.standard_rate = row.rate
			item.cpc_is_boq_item = 1
			item.cpc_source_contract = self.name
			item.cpc_boq_code = row.boq_code
			item.insert(ignore_permissions=True)

			row.item_code = item.item_code or item.name  # whatever naming actually produced
			touched = True

		if touched:
			# write item_code back without re-triggering full validate/submit flow
			for row in self.boq_items:
				frappe.db.set_value("Contract BOQ Item", row.name, "item_code", row.item_code)

	def _fill_required_custom_fields(self, doc, reference_date=None):
		"""Some sites add mandatory custom fields to standard doctypes (e.g. a
		"Group Code" field on Item Group, or a "Start Year" field on Project,
		via another installed app on the bench). Rather than fail blind on
		insert(), fill any still-empty mandatory field with a sensible default
		so auto-creation doesn't break on sites with extra required fields we
		don't know about. A field whose label/name mentions "year" is filled
		from reference_date (e.g. the contract's start_date) when one is
		given, since that's an actually-meaningful value rather than a
		placeholder. Review the value chosen here if your site's field
		expects a specific format (e.g. a coded naming convention)."""
		meta = frappe.get_meta(doc.doctype)
		for df in meta.fields:
			if not df.reqd or doc.get(df.fieldname):
				continue

			is_year_field = "year" in (df.fieldname or "").lower() or "year" in (df.label or "").lower()
			if is_year_field and reference_date:
				year_value = getdate(reference_date).year
				if df.fieldtype in ("Int", "Float"):
					doc.set(df.fieldname, year_value)
				else:
					doc.set(df.fieldname, str(year_value))
				continue

			if df.fieldtype in ("Data", "Small Text", "Text"):
				fallback = (doc.get("project_name") or doc.name or "")
				doc.set(df.fieldname, frappe.scrub(fallback).upper()[: df.get("length") or 140])
			elif df.fieldtype == "Select" and df.options:
				options = [o for o in df.options.split("\n") if o]
				if options:
					doc.set(df.fieldname, options[0])

	# ------------------------------------------------------------------
	# US-03: 1:1 Project auto-creation
	# ------------------------------------------------------------------
	def create_project(self):
		if self.project:
			if not frappe.db.get_value("Project", self.project, "cpc_source_contract"):
				frappe.db.set_value("Project", self.project, "cpc_source_contract", self.name)
			return  # idempotent — never create a second Project

		project = frappe.new_doc("Project")
		project.project_name = self.contract_title
		project.customer = self.customer
		project.company = self.company
		project.currency = self.currency
		project.expected_start_date = self.start_date
		project.expected_end_date = self.end_date
		project.cpc_source_contract = self.name
		project.cpc_ownership = self.ownership
		project.cpc_contract_value = self.base_value
		project.cpc_cost_budget = self.total_cost_budget
		project.cpc_target_margin = self.target_margin
		self._fill_required_custom_fields(project, reference_date=self.start_date)
		project.insert(ignore_permissions=True)

		# mirror the contract's number: CT-2026-0051 -> PRJ-2026-0051
		mirrored_name = self.name.replace("CT-", "PRJ-", 1) if self.name.startswith("CT-") else None
		if mirrored_name and mirrored_name != project.name and not frappe.db.exists("Project", mirrored_name):
			frappe.rename_doc("Project", project.name, mirrored_name, force=True)
			project.name = mirrored_name

		self.db_set("project", project.name, update_modified=False)

	@frappe.whitelist()
	def sync_project_to_boq_items(self):
		if not self.project:
			return
		for row in self.boq_items:
			if row.item_code:
				frappe.db.set_value("Item", row.item_code, "custom_project", self.project)






