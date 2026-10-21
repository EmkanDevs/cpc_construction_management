import frappe
from frappe.model.document import Document


class CPCIRPOScopeReview(Document):
    def validate(self):
        # Status and review fields move only through scope_review.py, never by form/API edits.
        if self.is_new() or frappe.flags.get("cpc_scope_review_api"):
            return
        guarded = ("status", "reviewed_by", "reviewed_on", "commercial_change_approved",
                   "effective_date", "finalized_by", "finalized_on", "requested_by")
        for f in guarded:
            if self.has_value_changed(f):
                frappe.throw("Use the Scope Review actions to change this record; fields are not edited directly.")