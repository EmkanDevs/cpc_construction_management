import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, now_datetime, nowdate

from cpc_construction_management.cpc_construction_management.progress.approval_rules import (
	APPROVER_ROLE,
	approval_block_reason,
	is_stale_base,
)
from cpc_construction_management.cpc_construction_management.progress.calculation import (
	calculate_for_document,
	get_applicable_base,
)
from cpc_construction_management.cpc_construction_management.progress.completion import (
	check_reporting_open,
	sync_reporting_completion,
)
from cpc_construction_management.cpc_construction_management.progress.hold_controls import (
	validate_hold_rules_for_progress,
)
from cpc_construction_management.cpc_construction_management.progress.quantity_revision import (
	apply_revision_base,
	check_revision_conflict,
)
from cpc_construction_management.cpc_construction_management.progress.recalc_audit import resync_downstream_period
from cpc_construction_management.cpc_construction_management.progress.reporting_anchor import (
	execution_week_number,
	get_reporting_anchor,
	lock_reporting_anchor,
	resolve_week_for_date,
)
from cpc_construction_management.cpc_construction_management.progress.task_sync import (
	refresh_irpo_progress,
	require_task_fields,
)

# Fields whose change counts as a material edit (used for last_material_editor).
MATERIAL_FIELDS = (
	"irpo_task",
	"calendar_week",
	"measurement_cutoff_date",
	"input_mode",
	"cum_completed_qty",
	"cum_percent",
	"no_change",
)

# Task fieldnames for context values (confirmed names first). IRPO Task is checked
# first, then its parent BOQ Task; absent fields are skipped. Task has no
# sales_order_item field, so that value stays empty unless a candidate appears.
CONTEXT_FIELD_CANDIDATES = {
	"contract": ["cpc_contract", "custom_construction_contract", "cpc_construction_contract", "construction_contract"],
	"sales_order": ["cpc_sales_order", "custom_sales_order", "sales_order"],
	"sales_order_item": ["custom_sales_order_item", "cpc_sales_order_item", "sales_order_item"],
	"boq_code": ["cpc_boq_code", "custom_boq_code", "boq_code"],
}


class IRPOProgress(Document):
	def db_insert(self, *args, **kwargs):
		# The unique index on active_key is the concurrency backstop; turn its
		# raw database error into a readable message.
		try:
			super().db_insert(*args, **kwargs)
		except frappe.UniqueValidationError:
			frappe.throw(
				f"Another active IRPO Progress record already exists for {self.irpo_task} in {self.calendar_week}. "
				"Open the existing record instead of creating a second one."
			)

	def validate(self):
		if not self.calendar_week:
			frappe.throw("Calendar Week is required.")

		prior_base = None
		if self.docstatus == 1:
			# Approval. Serialise on the IRPO so two approvals (or an approval and
			# a cancellation) for the same IRPO cannot interleave, then remember
			# the base the draft was converted on to detect a revision in between.
			frappe.db.get_value("Task", self.irpo_task, "name", for_update=True)
			before = self.get_doc_before_save()
			prior_base = flt(before.base_qty_snapshot) if before else None
		elif self.docstatus == 0:
			self._stamp_authorship()

		task = _get_usable_irpo(self.irpo_task)
		context = build_context(task, self.calendar_week, self.measurement_cutoff_date)

		if prior_base is not None and is_stale_base(prior_base, context["base_qty_snapshot"]):
			frappe.throw(
				f"The progress base changed from {prior_base:g} to {context['base_qty_snapshot']:g} after this "
				"measurement was prepared. Return it so the preparer can re-confirm the quantity on the new base."
			)

		for fieldname, value in context.items():
			if fieldname in ("suggested_cutoff", "_base_info"):
				continue
			self.set(fieldname, value)

		self._validate_cutoff(context)
		self._validate_unique_active_record()
		if self.docstatus == 0:
			check_reporting_open(self.irpo_task, self.week_start_date)
		check_revision_conflict(self, context["base_qty_snapshot"])
		calculate_for_document(self, context["_base_info"])
		self._handle_workflow_state_change()

		if self.docstatus == 0:
			validate_hold_rules_for_progress(self)

		if self.docstatus < 2:
			self.active_key = f"{self.irpo_task}::{self.calendar_week}"

	def before_submit(self):
		before = self.get_doc_before_save()
		if not before or before.workflow_state != "Pending Approval":
			frappe.throw("Only a record in Pending Approval can be approved.")

		verdict = approval_block_reason(
			frappe.session.user,
			frappe.get_roles(frappe.session.user),
			(self.owner, self.entered_by, self.last_material_editor),
		)
		if verdict == "not_approver":
			frappe.throw(f"Only a user with the {APPROVER_ROLE} role can approve progress.")
		if verdict == "not_independent":
			frappe.throw("You created or last edited this measurement, so you cannot approve it.")

		self.approved_by = frappe.session.user
		self.approved_on = now_datetime()

	def on_submit(self):
		# Same transaction as the approval: any failure below rolls the approval
		# back, so official progress is never left half updated.
		require_task_fields()
		lock_reporting_anchor(self.irpo_task)  # first approval freezes execution-week 1
		resync_downstream_period(self.name, cause="Late entry approved for an earlier period")
		refresh_irpo_progress(self.irpo_task)
		# Approved completion closes future reporting; an effective revision reopens it.
		sync_reporting_completion(self.irpo_task, self.name)

	def on_cancel(self):
		# Free the period for an amendment; multiple NULLs are allowed by the unique index.
		frappe.db.set_value(
			self.doctype,
			self.name,
			{"active_key": None, "cancelled_by": frappe.session.user, "cancelled_on": now_datetime()},
			update_modified=False,
		)
		# Cancelling the latest record restores the previous approved completion;
		# cancelling an earlier one keeps later cumulatives, but the next approved
		# record's stored predecessor/period may need to revert.
		resync_downstream_period(self.name, cause="Predecessor record cancelled")
		refresh_irpo_progress(self.irpo_task)
		# A cancelled completing record restores past reporting obligations.
		sync_reporting_completion(self.irpo_task, self.name)

	# ------------------------------------------------------------------

	def _stamp_authorship(self):
		if self.is_new():
			self.entered_by = frappe.session.user
			self.entered_on = now_datetime()
			self.last_material_editor = frappe.session.user
			return
		if any(self.has_value_changed(f) for f in MATERIAL_FIELDS):
			self.last_material_editor = frappe.session.user

	def _handle_workflow_state_change(self):
		if not self.has_value_changed("workflow_state"):
			return
		if self.workflow_state == "Pending Approval":
			self.sent_for_approval_on = now_datetime()
		elif self.workflow_state == "Returned" and not (self.return_reason or "").strip():
			frappe.throw(_("A return needs a reason. Use the 'Return with Reason' button."))

	def _validate_cutoff(self, context):
		if not self.measurement_cutoff_date:
			self.measurement_cutoff_date = context["suggested_cutoff"]
		cutoff = getdate(self.measurement_cutoff_date)
		if cutoff > getdate(nowdate()):
			frappe.throw("Measured Through cannot be in the future.")
		if not (getdate(self.week_start_date) <= cutoff <= getdate(self.week_ending)):
			frappe.throw(
				f"Measured Through ({cutoff}) must fall inside {self.calendar_week} "
				f"({self.week_start_date} to {self.week_ending})."
			)

	def _validate_unique_active_record(self):
		other = frappe.db.get_value(
			self.doctype,
			{
				"irpo_task": self.irpo_task,
				"calendar_week": self.calendar_week,
				"docstatus": ["<", 2],
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if other:
			frappe.throw(
				f"{other} is already the active record for {self.irpo_task} in {self.calendar_week}. "
				"Edit or return that record; cancel it first if it must be replaced."
			)


# ----------------------------------------------------------------------
# Shared context builder (used by validate() and by the form via API)
# ----------------------------------------------------------------------

def _get_usable_irpo(task_name):
	"""Check the Task is a live IRPO node. Mirrors what validate_irpo_is_usable
	checks in the budget module; swap to a direct call once its signature is confirmed."""
	if not task_name:
		frappe.throw("IRPO is required.")
	if not frappe.db.exists("Task", task_name):
		frappe.throw(f"Task {task_name} does not exist.")

	task = frappe.get_doc("Task", task_name)
	if not task.get("cpc_is_irpo"):
		frappe.throw(f"{task_name} is not an IRPO.")
	if task.get("is_group"):
		frappe.throw(f"{task_name} is a group task. Progress is recorded on executable IRPOs only.")
	if not task.get("project"):
		frappe.throw(f"{task_name} has no Project.")
	if task.get("status") == "Cancelled":
		frappe.throw(f"{task_name} is cancelled.")
	return task


def _context_value(sources, candidates):
	for source in sources:
		meta = frappe.get_meta(source.doctype)
		for fieldname in candidates:
			if meta.has_field(fieldname) and source.get(fieldname):
				return source.get(fieldname)
	return None


def build_context(task, calendar_week=None, cutoff=None):
	"""Server-authoritative context for a draft: source links, reporting basis
	and, when a week is given, the resolved period. The quantity base is the one
	in force at the measurement cutoff (Step 8)."""
	parent = frappe.get_doc("Task", task.parent_task) if task.get("parent_task") else None
	sources = [task] + ([parent] if parent else [])

	context = {
		"parent_boq_task": task.get("parent_task"),
		"project": task.project,
		"planned_start_date_snapshot": task.get("exp_start_date"),
	}
	for fieldname, candidates in CONTEXT_FIELD_CANDIDATES.items():
		context[fieldname] = _context_value(sources, candidates)

	base_info = get_applicable_base(task)
	context["base_qty_snapshot"] = base_info["base"]
	context["quantity_basis_label"] = base_info["label"]
	context["_base_info"] = base_info

	anchor = get_reporting_anchor(task)
	if not anchor:
		frappe.throw(f"Setup required: {task.name} has no Expected Start Date, so execution weeks cannot be numbered.")
	anchor_week = resolve_week_for_date(anchor)
	if not anchor_week:
		frappe.throw(f"Generate the CPC Weekly Calendar for {anchor.year} before recording progress.")
	context["reporting_anchor_snapshot"] = anchor

	if calendar_week:
		week = frappe.db.get_value(
			"CPC Calendar Week",
			calendar_week,
			["name", "week_year", "week_number", "start_date", "end_date"],
			as_dict=True,
		)
		if not week:
			frappe.throw(f"Calendar Week {calendar_week} does not exist.")
		if getdate(week.start_date) > getdate(nowdate()):
			frappe.throw(f"{calendar_week} has not started yet. Progress cannot be recorded for a future week.")
		if getdate(week.start_date) < getdate(anchor_week["start_date"]):
			frappe.throw(f"{calendar_week} is before this IRPO's first execution week ({anchor_week['name']}).")

		context.update(
			{
				"week_year": week.week_year,
				"week_number": week.week_number,
				"week_start_date": week.start_date,
				"week_ending": week.end_date,
				"execution_week": execution_week_number(anchor_week["start_date"], week.start_date),
				"suggested_cutoff": min(getdate(week.end_date), getdate(nowdate())),
			}
		)

	# Step 8: use the quantity revision effective at the measurement cutoff.
	cutoff_for_base = cutoff or context.get("suggested_cutoff")
	if cutoff_for_base:
		revised = apply_revision_base(task, base_info, cutoff_for_base)
		context["base_qty_snapshot"] = revised["base"]
		context["quantity_basis_label"] = revised["label"]
		context["base_revision_reference"] = revised.get("revision_ref")
		context["_base_info"] = revised
	return context


@frappe.whitelist()
def get_irpo_progress_context(irpo_task, calendar_week=None):
	"""Lets the form show source context and period as soon as the user picks
	an IRPO/week. The saved record is always recomputed server-side in validate()."""
	frappe.has_permission("IRPO Progress", "create", throw=True)
	task = _get_usable_irpo(irpo_task)
	context = build_context(task, calendar_week)
	context.pop("_base_info", None)  # server-side only
	return context


# ----------------------------------------------------------------------
# Return helper (the workflow decides who may return)
# ----------------------------------------------------------------------

@frappe.whitelist()
def return_for_correction(name, reason):
	"""Send a Pending Approval record back to its preparer with a reason.
	Official progress is untouched: nothing is written to Task."""
	reason = (reason or "").strip()
	if not reason:
		frappe.throw(_("A return needs a reason."))

	doc = frappe.get_doc("IRPO Progress", name)
	if doc.docstatus != 0 or doc.workflow_state != "Pending Approval":
		frappe.throw("Only a record in Pending Approval can be returned.")

	doc.return_reason = reason
	doc.returned_by = frappe.session.user
	doc.returned_on = now_datetime()

	from frappe.model.workflow import apply_workflow

	apply_workflow(doc, "Return")
	return doc.name
