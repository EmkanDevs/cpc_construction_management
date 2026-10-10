"""
Fix 3 - Native Budget must be SUBMITTED before IRPO procurement.

before_submit hook for Material Request / Purchase Order / Purchase Receipt /
Purchase Invoice. For every unique IRPO Task used on the document's IRPO-linked
rows, a submitted (docstatus = 1) Budget must exist with:

	Budget Against = Task
	Task           = the IRPO Task
	Company        = the document's company
	Fiscal Year    = fiscal year of the transaction date
	Budget Account includes Task.account

Rows without a Task / cpc_irpo_budget_row_ref are ignored, so normal ERPNext
procurement is not affected (TC-BUD-04). Standard ERPNext Budget Warn/Stop
rules still run afterwards, unchanged (TC-BUD-02).
"""

import frappe
from frappe import _
from erpnext.accounts.utils import get_fiscal_year

from cpc_construction_management.cpc_construction_management.budget.irpo_budget import _IRPO_FIELDNAME
from cpc_construction_management.cpc_construction_management.budget.irpo_expense_account import TASK_ACCOUNT_FIELD

# The Budget's "Budget Against" value and the Budget field that holds the
# Task link (ERPNext names the dimension field after the scrubbed doctype).
# Confirm both match what sync_budget_for_irpo() writes.
BUDGET_AGAINST = "Task"
BUDGET_DIMENSION_FIELD = frappe.scrub(BUDGET_AGAINST)  # "task"

_DATE_FIELD = {
	"Material Request": "transaction_date",
	"Purchase Order": "transaction_date",
	"Purchase Receipt": "posting_date",
	"Purchase Invoice": "posting_date",
}


def _budget_state(task, account, company, fiscal_year):
	"""'submitted' | 'draft' | 'missing' for this Task/account/company/year."""
	rows = frappe.db.sql(
		f"""
		select b.name, b.docstatus
		from `tabBudget` b
		inner join `tabBudget Account` ba on ba.parent = b.name
		where b.budget_against = %(against)s
		  and b.`{BUDGET_DIMENSION_FIELD}` = %(task)s
		  and b.company = %(company)s
		  and b.fiscal_year = %(fiscal_year)s
		  and ba.account = %(account)s
		  and b.docstatus in (0, 1)
		""",
		{
			"against": BUDGET_AGAINST,
			"task": task,
			"company": company,
			"fiscal_year": fiscal_year,
			"account": account,
		},
		as_dict=True,
	)
	if any(r.docstatus == 1 for r in rows):
		return "submitted"
	return "draft" if rows else "missing"


def validate_irpo_budget_submitted(doc, method=None):
	# Returns move stock/value back; don't trap a user who can't return goods
	# because a Budget was later cancelled.
	if doc.get("is_return"):
		return

	irpo_field = _IRPO_FIELDNAME.get(doc.doctype + " Item")
	date_field = _DATE_FIELD.get(doc.doctype)
	if not irpo_field or not date_field:
		return

	tasks = []  # unique, in first-seen order
	for row in doc.get("items") or []:
		task = row.get(irpo_field)
		if task and row.get("cpc_irpo_budget_row_ref") and task not in tasks:
			tasks.append(task)

	if not tasks:
		return  # not an IRPO-linked document

	fiscal_year = get_fiscal_year(doc.get(date_field), company=doc.company)[0]

	problems = []
	for task in tasks:
		account = frappe.db.get_value("Task", task, TASK_ACCOUNT_FIELD)
		if not account:
			problems.append(
				_("IRPO {0} has no Expense Account, so its Budget cannot be verified.").format(task)
			)
			continue

		state = _budget_state(task, account, doc.company, fiscal_year)
		if state == "submitted":
			continue

		message = _(
			"Budget for IRPO {0} is not submitted. Please submit the Budget before proceeding with procurement."
		).format(task)
		if state == "missing":
			message += " " + _("(No Budget found for account {0}, company {1}, fiscal year {2}.)").format(
				account, doc.company, fiscal_year
			)
		problems.append(message)

	if problems:
		frappe.throw("<br>".join(problems), title=_("IRPO Budget Not Submitted"))