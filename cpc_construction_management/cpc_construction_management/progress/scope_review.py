"""Step 10 - whole-IRPO cancellation and scope review (handoff Section 16).

Cancelling an IRPO Task is NOT cancelling a weekly record: it changes the parent
simple average, so it needs an independent review, optional commercial change
control, and only then a finalised, dated exclusion. Nothing here edits BOQ
quantities, selling values, payment requests or invoices.

Commercial change control is configured, never invented: set the existing
Contract/commercial approver role in site_config.json as
    "cpc_commercial_change_role": "<Role Name>"
"""
import json

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime, nowdate

from .corrections import find_dependencies
from .correction_calc import hypothetical_parent_progress

REVIEW = "CPC IRPO Scope Review"
OPEN_STATES = ("Pending Review", "Approved")


def _require_reviewer():
    # Who may request and review scope changes is decided by the client through the
    # permissions of the CPC IRPO Scope Review doctype (Role Permission Manager).
    frappe.has_permission(REVIEW, "write", throw=True)


def _get_irpo(task_name):
    task = frappe.get_doc("Task", task_name)
    if not task.get("cpc_is_irpo"):
        frappe.throw(_("{0} is not an IRPO.").format(task_name))
    if task.get("status") == "Cancelled":
        frappe.throw(_("{0} is already cancelled.").format(task_name))
    return task


@frappe.whitelist()
def get_cancellation_impact(irpo_task):
    task = _get_irpo(irpo_task)
    siblings = []
    parent = None
    if task.get("parent_task"):
        parent = frappe.db.get_value("Task", task.parent_task,
            ["name", "progress", "cpc_boq_cost_budget", "cpc_boq_budget_allocated", "cpc_boq_budget_remaining"], as_dict=True)
        siblings = frappe.get_all("Task", filters={"parent_task": task.parent_task, "cpc_is_irpo": 1},
                                  fields=["name", "progress", "status"])
    parent_calc = hypothetical_parent_progress(siblings, irpo_task) if siblings else {"current": None, "without": None}

    history = frappe.get_all("IRPO Progress", filters={"irpo_task": irpo_task, "docstatus": ["<", 2]},
        fields=["name", "calendar_week", "cum_percent", "cum_completed_qty", "docstatus", "workflow_state"],
        order_by="week_start_date asc")
    ids = [h.name for h in history]
    deps = find_dependencies("IRPO Progress", ids)
    procurement = frappe.db.count("IRPO Quantity Ledger", {
        "irpo": irpo_task, "is_cancelled": 0,
        "event_type": ["in", ["MR Submit", "PO Submit", "PR Submit", "PI Submit"]]})
    return {
        "irpo": irpo_task,
        "irpo_progress": task.get("progress"),
        "parent": parent.name if parent else None,
        "current_parent_progress": parent_calc["current"],
        "hypothetical_parent_progress_without_irpo": parent_calc["without"],
        "warning": "Excluding the IRPO changes the parent average without any new work being done.",
        "progress_history": history,
        "commercial_blockers": deps["blocking"],
        "other_references": deps["references"],
        "procurement_ledger_rows": procurement,
        "cost_budget_reconciliation": (
            {"parent_cost_budget": parent.cpc_boq_cost_budget, "allocated": parent.cpc_boq_budget_allocated,
             "remaining": parent.cpc_boq_budget_remaining,
             "note": "Shown as recorded; BOQ units and cost-budget units are not netted against each other."}
            if parent else None),
        "scope_impact": "BOQ quantity, price and commercial values are NOT changed automatically.",
    }


@frappe.whitelist()
def request_scope_review(irpo_task, reason):
    _require_reviewer()
    reason = (reason or "").strip()
    if not reason:
        frappe.throw(_("A cancellation request needs a reason."))
    task = _get_irpo(irpo_task)
    open_review = frappe.db.get_value(REVIEW, {"irpo_task": irpo_task, "status": ["in", list(OPEN_STATES)]}, "name")
    if open_review:
        frappe.throw(_("{0} is already open for this IRPO.").format(open_review))

    doc = frappe.new_doc(REVIEW)
    doc.irpo_task = irpo_task
    doc.parent_boq_task = task.get("parent_task")
    doc.reason = reason
    doc.status = "Pending Review"
    doc.requested_by = frappe.session.user
    doc.requested_on = now_datetime()
    doc.impact_snapshot = json.dumps(get_cancellation_impact(irpo_task), default=str, indent=1)
    frappe.flags.cpc_scope_review_api = True
    doc.insert()
    task.add_comment("Info", _("Cancellation / Scope Review Pending: {0}. The IRPO stays included in the parent until resolved.").format(doc.name))
    return doc.name


@frappe.whitelist()
def review_scope_request(name, decision, notes, commercial_change_required=0, commercial_change_reference=None):
    _require_reviewer()
    doc = frappe.get_doc(REVIEW, name)
    if doc.status != "Pending Review":
        frappe.throw(_("Only a review in Pending Review can be decided."))
    if frappe.session.user in (doc.requested_by, doc.owner):
        frappe.throw(_("The requester cannot review their own request. Another authorised PM must decide it."))
    if decision not in ("Approve", "Reject"):
        frappe.throw(_("Decision must be Approve or Reject."))
    if not (notes or "").strip():
        frappe.throw(_("Review notes are required."))
    frappe.flags.cpc_scope_review_api = True
    doc.status = "Approved" if decision == "Approve" else "Rejected"
    doc.reviewed_by = frappe.session.user
    doc.reviewed_on = now_datetime()
    doc.review_notes = notes
    doc.commercial_change_required = 1 if int(commercial_change_required or 0) else 0
    doc.commercial_change_reference = commercial_change_reference
    doc.save()
    return doc.status


@frappe.whitelist()
def record_commercial_approval(name, reference):
    """Marks the required contract/commercial change as approved under the EXISTING
    change-control authority. Refuses to run until that role is configured."""
    role = frappe.conf.get("cpc_commercial_change_role")
    if not role:
        frappe.throw(_("Commercial change control is not configured. Add "
                       "\"cpc_commercial_change_role\": \"<existing Contract change-control approver role>\" to "
                       "site_config.json. The request stays pending; the IRPO is not excluded."),
                     title=_("Configuration required"))
    if role not in frappe.get_roles(frappe.session.user):
        frappe.throw(_("Only a user with the {0} role can record the commercial change approval.").format(role))
    if not (reference or "").strip():
        frappe.throw(_("The commercial change reference is required."))
    doc = frappe.get_doc(REVIEW, name)
    if not doc.commercial_change_required:
        frappe.throw(_("This review does not require a commercial change."))
    frappe.flags.cpc_scope_review_api = True
    doc.commercial_change_reference = reference
    doc.commercial_change_approved = 1
    doc.save()
    return doc.name


@frappe.whitelist()
def finalize_cancellation(name, effective_date=None):
    _require_reviewer()
    doc = frappe.get_doc(REVIEW, name)
    if doc.status != "Approved":
        frappe.throw(_("Only an approved scope review can be finalised."))
    if doc.commercial_change_required and not doc.commercial_change_approved:
        frappe.throw(_("A commercial change is required and has not been approved under the contract change-control "
                       "authority. The request stays pending; the IRPO is not excluded."),
                     title=_("Commercial approval pending"))
    drafts = frappe.get_all("IRPO Progress", filters={"irpo_task": doc.irpo_task, "docstatus": 0}, pluck="name")
    if drafts:
        frappe.throw(_("Resolve these unapproved progress records first (approve, return or cancel): {0}").format(", ".join(drafts)))

    effective = getdate(effective_date or nowdate())
    task = _get_irpo(doc.irpo_task)
    frappe.flags.cpc_scope_finalizing = doc.name
    try:
        task.status = "Cancelled"
        task.save(ignore_permissions=True)
    finally:
        frappe.flags.cpc_scope_finalizing = None

    frappe.flags.cpc_scope_review_api = True
    doc.status = "Finalized"
    doc.effective_date = effective
    doc.finalized_by = frappe.session.user
    doc.finalized_on = now_datetime()
    doc.save()
    task.add_comment("Info", _("Cancelled effective {0} under scope review {1}. Historical progress is preserved.").format(effective, doc.name))
    _recalculate_parent(task)
    return doc.name


def _recalculate_parent(task):
    """Best effort: refresh a remaining sibling so the parent average is recomputed."""
    try:
        from .task_sync import refresh_irpo_progress
        sibling = frappe.db.get_value("Task", {"parent_task": task.get("parent_task"), "cpc_is_irpo": 1,
                                               "status": ["!=", "Cancelled"], "name": ["!=", task.name]}, "name")
        if sibling:
            refresh_irpo_progress(sibling)
    except Exception:
        frappe.log_error(title="US-11 parent recalculation after IRPO cancellation", message=frappe.get_traceback())


def validate_irpo_task_cancellation(doc, method=None):
    """Task.validate hook: an IRPO cannot be cancelled outside an approved scope review."""
    if not doc.get("cpc_is_irpo") or doc.is_new() or doc.get("status") != "Cancelled":
        return
    before = doc.get_doc_before_save()
    if not before or before.get("status") == "Cancelled":
        return
    review = frappe.flags.get("cpc_scope_finalizing")
    if review and frappe.db.get_value(REVIEW, review, ["irpo_task", "status"]) == [doc.name, "Approved"]:
        return
    frappe.throw(
        _("An IRPO cannot be cancelled directly: it changes the parent progress average. Request a Cancellation / "
          "Scope Review (CPC IRPO Scope Review). The IRPO stays included until the review is approved and finalised."),
        title=_("Scope review required"),
    )