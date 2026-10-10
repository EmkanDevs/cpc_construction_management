"""
Fix 2 - IRPO-linked procurement rows must always use the IRPO Task's
account as their expense_account.

Why server-side: the client-side item_code trigger writes the Item default
expense account onto a row asynchronously, so anything the Get IRPO dialog
sets on the client can be overwritten depending on timing (Steel row kept
Task.account, Cement row got the Item default 5112110). Enforcing on
validate makes the saved value independent of that race, for every path:
MR, PO from MR, Direct PO / Get IRPO, and PO-derived Purchase Invoices.

Purchase Receipt Item has no expense_account field, so it is not handled.

Purchase Invoice exception (Goods In Transit / perpetual inventory): for a
STOCK item with perpetual inventory enabled, ERPNext sets the PI row's
account to Stock Received But Not Billed (or the warehouse account) on
purpose. Overwriting that would change standard accounting, so those rows
are left to ERPNext. Non-stock items and companies without perpetual
inventory are enforced as normal.
"""

import erpnext
import frappe

from cpc_construction_management.cpc_construction_management.budget.irpo_budget import _IRPO_FIELDNAME

# Task field that holds the IRPO's expense account (spec: Task.account).
# Change this one constant if your Task field is named differently.
TASK_ACCOUNT_FIELD = "account"


def erpnext_owns_account(doc, row):
	"""True when standard ERPNext accounting must decide this row's account."""
	if doc.doctype != "Purchase Invoice":
		return False
	if not erpnext.is_perpetual_inventory_enabled(doc.company):
		return False
	return bool(row.get("item_code") and frappe.get_cached_value("Item", row.item_code, "is_stock_item"))


def enforce_irpo_expense_account(doc, method=None):
	"""validate hook for Material Request / Purchase Order / Purchase Invoice."""
	item_doctype = doc.doctype + " Item"
	irpo_field = _IRPO_FIELDNAME.get(item_doctype)
	if not irpo_field or not frappe.get_meta(item_doctype).has_field("expense_account"):
		return

	task_accounts = {}
	for row in doc.get("items") or []:
		task = row.get(irpo_field)
		if not task or not row.get("cpc_irpo_budget_row_ref"):
			continue  # overhead / non-IRPO line

		if erpnext_owns_account(doc, row):
			continue

		if task not in task_accounts:
			task_accounts[task] = frappe.db.get_value("Task", task, TASK_ACCOUNT_FIELD)
		account = task_accounts[task]
		if not account:
			continue  # Task has no account configured - nothing to enforce

		if row.get("expense_account") != account:
			row.expense_account = account