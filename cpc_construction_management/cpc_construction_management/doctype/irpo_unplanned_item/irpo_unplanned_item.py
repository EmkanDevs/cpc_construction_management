# Copyright (c) 2026, info@finbyz.tech and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class IRPOUnplannedItem(Document):
    """Task child row for items/services outside the planned table.

    No Budget Qty / Available Qty by design: an unplanned item has no
    pre-approved quantity ceiling. All *_qty fields are written only by
    budget/irpo_unplanned.py from the IRPO Quantity Ledger."""
    pass