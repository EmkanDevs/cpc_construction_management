import json
from collections import defaultdict
import frappe
from frappe import _
from frappe.utils import flt, formatdate, getdate, nowdate


@frappe.whitelist()
def get_project_financial_summary(project, company=None, from_date=None, to_date=None, finance_book=None):
	"""Main API endpoint for Project Financial Summary dashboard.
	Enforces document & report permissions and returns reconciled figures.
	"""
	if not project:
		frappe.throw(_("Project is required"), frappe.MandatoryError)

	# 1. Validate permissions
	if not frappe.has_permission("Project", "read", project):
		frappe.throw(_("Not permitted to view Project {0}").format(project), frappe.PermissionError)

	proj_doc = frappe.get_doc("Project", project)
	proj_company = proj_doc.company or frappe.defaults.get_user_default("Company")
	if company and company != proj_company:
		frappe.throw(
			_("Project {0} belongs to company {1}, but {2} was requested.").format(
				project, proj_company, company
			),
			frappe.ValidationError,
		)
	company = proj_company

	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted to view Company {0}").format(company), frappe.PermissionError)

	# Validate Financial / Accounting report permission
	user_roles = frappe.get_roles()
	has_financial_access = (
		"Accounts Manager" in user_roles
		or "Accounts User" in user_roles
		or "System Manager" in user_roles
		or frappe.has_permission("GL Entry", "read")
	)
	if not has_financial_access:
		frappe.throw(
			_("Not permitted to view financial reports and ledger summaries for {0}.").format(company),
			frappe.PermissionError,
		)

	currency = (
		frappe.get_cached_value("Company", company, "default_currency")
		or frappe.defaults.get_global_default("currency")
		or ""
	)

	# 2. Date validations
	today = getdate(nowdate())
	if to_date and getdate(to_date) > today:
		frappe.throw(
			_("Future Period To date ({0}) is not permitted. Please select today ({1}) or an earlier date.").format(
				to_date, today
			),
			frappe.ValidationError,
		)

	if from_date and getdate(from_date) > today:
		frappe.throw(
			_("Future Period From date ({0}) is not permitted. Please select today ({1}) or an earlier date.").format(
				from_date, today
			),
			frappe.ValidationError,
		)

	if from_date and to_date and getdate(from_date) > getdate(to_date):
		frappe.throw(
			_("Period From ({0}) cannot be after Period To ({1}).").format(from_date, to_date),
			frappe.ValidationError,
		)

	# 3. Fiscal Year resolution & Historical Safety
	from erpnext.accounts.utils import get_fiscal_years

	active_fys = get_fiscal_years(company=company)
	earliest_fy_start = getdate(active_fys[-1].year_start_date) if active_fys else None

	quality_flags = []

	raw_start_date = proj_doc.expected_start_date or proj_doc.actual_start_date
	if not raw_start_date or getdate(raw_start_date) > today:
		current_fy = [fy for fy in active_fys if getdate(fy.year_start_date) <= today <= getdate(fy.year_end_date)]
		start_date = current_fy[0].year_start_date if current_fy else today.replace(month=1, day=1)
	else:
		start_date = raw_start_date

	req_from_date = getdate(from_date) if from_date else getdate(start_date)
	safe_from_date = req_from_date

	if earliest_fy_start and req_from_date < earliest_fy_start:
		safe_from_date = earliest_fy_start
		quality_flags.append({
			"type": "warning",
			"code": "PERIOD_PRE_FISCAL_YEAR",
			"label": _("Period Start Adjusted"),
			"message": _(
				"Start date {0} precedes the earliest active Fiscal Year ({1}). Financial reporting period was safely bound to {1}."
			).format(formatdate(req_from_date), formatdate(earliest_fy_start)),
		})

	from_date_str = str(safe_from_date)
	to_date_str = str(to_date) if to_date else str(today)

	# 4. Gather components
	sales_info = get_sales_order_summary(project, company)
	budget_info = get_approved_cost_budget(project, proj_doc)
	earliest_date_str = get_earliest_accounting_date(project, company, proj_doc, earliest_fy_start)
	pnl_period = get_pnl_summary(project, company, from_date_str, to_date_str, finance_book)
	pnl_ptd = get_pnl_summary(project, company, earliest_date_str, to_date_str, finance_book)
	classification = get_expense_classification(project, company, from_date_str, to_date_str, pnl_period["expense"])
	purchase_status = get_purchase_status(project, company)
	budget_comparison = calculate_budget_comparison(budget_info, pnl_ptd["expense"])

	# 5. Populate quality flags
	if not budget_info["is_available"]:
		quality_flags.append({
			"type": "warning",
			"code": "BUDGET_UNAVAILABLE",
			"label": _("Budget Unavailable"),
			"message": _("No approved contract cost budget or project cost budget found for this project."),
		})
	elif budget_info.get("approved_budget") == 0.0:
		quality_flags.append({
			"type": "info",
			"code": "ZERO_BUDGET",
			"label": _("Zero Budget"),
			"message": _("The approved cost budget is zero {0}.").format(currency),
		})
	elif budget_comparison.get("is_over_budget"):
		quality_flags.append({
			"type": "danger",
			"code": "OVER_BUDGET",
			"label": _("Budget Exceeded"),
			"message": _("Project-to-date actual expense exceeds the approved budget by {0} {1}.").format(
				frappe.utils.fmt_money(budget_comparison["difference"], currency=currency), currency
			),
		})

	if flt(pnl_period["expense"]) < 0 or flt(pnl_ptd["expense"]) < 0:
		quality_flags.append({
			"type": "warning",
			"code": "NEGATIVE_EXPENSE",
			"label": _("Negative Expense Recorded"),
			"message": _("Credits or reversals exceed debits in the selected period; ledger review recommended."),
		})

	if purchase_status.get("open_po_summary", {}).get("overbilled_amount", 0) > 0:
		quality_flags.append({
			"type": "info",
			"code": "PO_OVERBILLED",
			"label": _("PO Overbilling"),
			"message": _("Purchase Orders have {0} {1} billed in excess of ordered value.").format(
				frappe.utils.fmt_money(purchase_status["open_po_summary"]["overbilled_amount"], currency=currency), currency
			),
		})

	fb_name = finance_book or _("Default Book")
	fb_label = f"{fb_name} ({_('Includes default FB entries')})"

	return {
		"project_info": {
			"name": proj_doc.name,
			"project_name": proj_doc.project_name or proj_doc.name,
			"company": company,
			"currency": currency,
			"status": proj_doc.status,
			"expected_start_date": str(proj_doc.expected_start_date) if proj_doc.expected_start_date else None,
			"expected_end_date": str(proj_doc.expected_end_date) if proj_doc.expected_end_date else None,
		},
		"period": {
			"from_date": from_date_str,
			"to_date": to_date_str,
			"finance_book": finance_book,
			"finance_book_label": fb_label,
			"include_default_book_entries": 1,
		},
		"finance_book_settings": {
			"finance_book": finance_book,
			"finance_book_label": fb_label,
			"include_default_book_entries": 1,
		},
		"sales_order_summary": sales_info,
		"approved_cost_budget": budget_info,
		"financial_result": pnl_period,
		"budget_comparison": budget_comparison,
		"expense_classification": classification,
		"purchase_status": purchase_status,
		"quality_flags": quality_flags,
		"refreshed_at": frappe.utils.now(),
	}


def get_sales_order_summary(project, company):
	"""Sums active submitted Sales Order items belonging to the project (company-currency net value before VAT).
	Item-level project is authoritative; header-level project is fallback only for blank item project.
	Reconciles and allocates header-level additional discounts to items proportionally.
	"""
	rows = frappe.get_list(
		"Sales Order",
		filters={
			"company": company,
			"docstatus": 1,
		},
		or_filters=[
			["Sales Order Item", "project", "=", project],
			["Sales Order", "project", "=", project],
		],
		fields=[
			"name as so_name",
			"project as so_project",
			"cpc_contract",
			"base_net_total as so_base_net_total",
			"base_discount_amount as so_base_discount_amount",
			"`tabSales Order Item`.name as item_row_name",
			"`tabSales Order Item`.item_code",
			"`tabSales Order Item`.base_net_amount",
			"`tabSales Order Item`.project as item_project",
		],
		limit=0,
	)

	so_names = set()
	contract_names = set()
	total_value = 0.0

	for r in rows:
		effective_project = r.get("item_project") or r.get("so_project")
		if effective_project != project:
			continue

		so_names.add(r.so_name)
		if r.cpc_contract:
			contract_names.add(r.cpc_contract)

		item_amt = flt(r.base_net_amount)
		so_net = flt(r.so_base_net_total)
		so_disc = flt(r.so_base_discount_amount)
		if so_disc > 0 and so_net > 0:
			item_amt = item_amt * (1.0 - (so_disc / so_net))

		total_value += item_amt

	# Contracts linked directly to project
	direct_contracts = frappe.get_list(
		"Construction Contract",
		filters={"project": project, "docstatus": 1},
		pluck="name",
		limit=0,
	)
	for c_name in direct_contracts:
		contract_names.add(c_name)

	return {
		"value": flt(total_value, 2),
		"sales_order_count": len(so_names),
		"contract_count": len(contract_names),
		"sales_orders": sorted(list(so_names)),
		"contracts": sorted(list(contract_names)),
	}


def get_approved_cost_budget(project, proj_doc):
	"""Resolves the authoritative approved Contract cost budgets linked to the Project.
	Distinguishes between a legitimate zero budget and an unavailable budget.
	"""
	contracts = frappe.get_list(
		"Construction Contract",
		filters={"project": project, "docstatus": 1},
		fields=["name", "base_value", "revised_value", "total_cost_budget", "change_order_value"],
		limit=0,
	)

	has_contracts = len(contracts) > 0
	has_project_budget = (
		proj_doc.get("cpc_cost_budget") is not None
		and str(getattr(proj_doc, "cpc_cost_budget", "")).strip() != ""
	)

	total_budget = 0.0
	contract_budgets = []
	for c in contracts:
		b = flt(c.total_cost_budget)
		total_budget += b
		contract_budgets.append({"contract": c.name, "budget": b})

	if has_contracts:
		is_available = True
		approved_budget = flt(total_budget, 2)
	elif has_project_budget:
		is_available = True
		approved_budget = flt(proj_doc.cpc_cost_budget, 2)
	else:
		is_available = False
		approved_budget = None

	return {
		"approved_budget": approved_budget,
		"is_available": is_available,
		"contracts": contract_budgets,
	}


def get_earliest_accounting_date(project, company, proj_doc, earliest_fy_start=None):
	"""Resolves the earliest valid accounting date / fiscal year start for project-to-date calculation."""
	gle_records = frappe.get_list(
		"GL Entry",
		filters={"project": project, "is_cancelled": 0, "company": company},
		fields=["posting_date"],
		order_by="posting_date asc",
		limit=1,
	)
	if gle_records:
		earliest_gle = getdate(gle_records[0].posting_date)
		if earliest_fy_start and earliest_gle < earliest_fy_start:
			earliest_gle = earliest_fy_start

		fy_records = frappe.get_list(
			"Fiscal Year",
			filters=[
				["year_start_date", "<=", earliest_gle],
				["year_end_date", ">=", earliest_gle],
				["disabled", "=", 0],
			],
			fields=["year_start_date"],
			limit=1,
		)
		if fy_records and fy_records[0].year_start_date:
			return str(fy_records[0].year_start_date)
		return str(earliest_gle)

	if earliest_fy_start:
		return str(earliest_fy_start)

	if proj_doc.expected_start_date or proj_doc.actual_start_date:
		return str(proj_doc.expected_start_date or proj_doc.actual_start_date)

	return str(getdate(nowdate()).replace(month=1, day=1))


def get_pnl_summary(project, company, from_date, to_date, finance_book=None):
	"""Calls the deployed ERPNext P&L Statement report calculation for identical filters."""
	from erpnext.accounts.report.profit_and_loss_statement.profit_and_loss_statement import execute as run_pnl

	filters = frappe._dict(
		{
			"company": company,
			"project": json.dumps([project]),
			"filter_based_on": "Date Range",
			"period_start_date": from_date,
			"period_end_date": to_date,
			"periodicity": "Yearly",
			"finance_book": finance_book,
			"include_default_book_entries": 1,
		}
	)

	res = run_pnl(filters)
	data = res[1] if isinstance(res, (list, tuple)) and len(res) > 1 else []

	income = 0.0
	expense = 0.0
	income_lines = []
	expense_lines = []

	for row in data:
		account_name = str(row.get("account_name") or "")
		val = flt(row.get("total", 0))

		if "Total Income" in account_name:
			income = val
		elif "Total Expense" in account_name:
			expense = val
		elif "Profit" in account_name or "Profit" in str(row.get("account") or ""):
			continue
		elif not row.get("is_group") and abs(val) > 0.001:
			acc_title = row.get("account") or account_name
			item = {"account": acc_title, "amount": val}
			root_type = frappe.get_cached_value("Account", acc_title, "root_type")
			if root_type == "Income":
				income_lines.append(item)
			elif root_type == "Expense":
				expense_lines.append(item)
			else:
				if "Income" in str(row.get("account_type") or ""):
					income_lines.append(item)
				else:
					expense_lines.append(item)

	profit_loss = income - expense

	return {
		"income": flt(income, 2),
		"expense": flt(expense, 2),
		"profit_loss": flt(profit_loss, 2),
		"income_lines": income_lines,
		"expense_lines": expense_lines,
	}


def calculate_budget_comparison(budget_info, ptd_expense):
	"""Compares total approved budget against Project-to-date actual expense."""
	is_available = budget_info.get("is_available", False)
	approved_budget = budget_info.get("approved_budget")
	ptd_expense = flt(ptd_expense)

	if not is_available:
		return {
			"approved_budget": None,
			"ptd_expense": ptd_expense,
			"difference": None,
			"is_over_budget": False,
			"is_available": False,
			"usage_percent": None,
			"is_negative_expense": ptd_expense < 0,
			"label": _("Budget unavailable"),
		}

	# Authoritative zero budget
	if approved_budget == 0.0:
		difference = -ptd_expense
		is_over_budget = ptd_expense > 0
		label = _("Zero budget approved") if ptd_expense <= 0 else _("Over budget (Zero budget)")
		return {
			"approved_budget": 0.0,
			"ptd_expense": ptd_expense,
			"difference": abs(difference),
			"is_over_budget": is_over_budget,
			"is_available": True,
			"usage_percent": None,
			"is_negative_expense": ptd_expense < 0,
			"label": label,
		}

	difference = approved_budget - ptd_expense
	usage_percent = flt((ptd_expense / approved_budget * 100), 1)
	is_over_budget = difference < 0
	is_negative_expense = ptd_expense < 0

	label = _("Over budget by") if is_over_budget else (
		_("Negative expense (Review required)") if is_negative_expense else _("Budget less actual expense")
	)

	return {
		"approved_budget": approved_budget,
		"ptd_expense": ptd_expense,
		"difference": abs(difference),
		"is_over_budget": is_over_budget,
		"is_available": True,
		"usage_percent": usage_percent,
		"is_negative_expense": is_negative_expense,
		"label": label,
	}


def get_expense_classification(project, company, from_date, to_date, total_expense):
	"""Traces P&L expense postings directly from the GL Entry population back to source vouchers and IRPO references.
	Guarantees that Planned + Unplanned + Unclassified equals total_expense,
	and that all returned detail rows reconcile 100% to the classified total.
	"""
	# 1. Fetch GL Entries for project within the period for Expense accounts
	gl_records = frappe.get_list(
		"GL Entry",
		filters={
			"company": company,
			"project": project,
			"is_cancelled": 0,
			"posting_date": ["between", [from_date, to_date]],
		},
		fields=[
			"name",
			"posting_date",
			"account",
			"voucher_type",
			"voucher_no",
			"debit",
			"credit",
			"remarks",
		],
		order_by="posting_date desc, name desc",
		limit=0,
	)

	expense_gls = [
		gl for gl in gl_records
		if frappe.get_cached_value("Account", gl.account, "root_type") == "Expense"
	]

	# 2. Extract Purchase Invoices to look up item-level IRPO row references
	pi_vouchers = {gl.voucher_no for gl in expense_gls if gl.voucher_type == "Purchase Invoice"}
	pi_gl_map = defaultdict(list)
	for gl in expense_gls:
		if gl.voucher_type == "Purchase Invoice":
			pi_gl_map[gl.voucher_no].append(gl)

	pi_items = []
	poi_refs = {}
	if pi_vouchers:
		raw_items = frappe.get_list(
			"Purchase Invoice",
			filters={"name": ["in", list(pi_vouchers)], "company": company, "docstatus": 1},
			or_filters=[
				["Purchase Invoice Item", "project", "=", project],
				["Purchase Invoice", "project", "=", project],
			],
			fields=[
				"name as pi_name",
				"project as pi_project",
				"`tabPurchase Invoice Item`.name as item_name",
				"`tabPurchase Invoice Item`.item_code",
				"`tabPurchase Invoice Item`.base_net_amount",
				"`tabPurchase Invoice Item`.project as item_project",
				"`tabPurchase Invoice Item`.cpc_irpo_budget_row_ref",
				"`tabPurchase Invoice Item`.cpc_irpo_unplanned_row_ref",
				"`tabPurchase Invoice Item`.po_detail",
			],
			limit=0,
		)
		for it in raw_items:
			eff = it.get("item_project") or it.get("pi_project")
			if eff == project:
				pi_items.append(it)

		po_details = [it.po_detail for it in pi_items if it.get("po_detail")]
		if po_details:
			pois = frappe.get_list(
				"Purchase Order Item",
				filters={"name": ["in", po_details]},
				fields=["name", "cpc_irpo_budget_row_ref", "cpc_irpo_unplanned_row_ref"],
				limit=0,
			)
			poi_refs = {p.name: p for p in pois}

	pi_items_by_voucher = defaultdict(list)
	for it in pi_items:
		pi_items_by_voucher[it.pi_name].append(it)

	planned_expense = 0.0
	unplanned_expense = 0.0
	unclassified_expense = 0.0
	details = []

	# Process Purchase Invoices item by item
	processed_vouchers = set()
	for v_no, items in pi_items_by_voucher.items():
		processed_vouchers.add(v_no)
		gl_entries_for_pi = pi_gl_map.get(v_no, [])
		posting_date = gl_entries_for_pi[0].posting_date if gl_entries_for_pi else None
		acc = gl_entries_for_pi[0].account if gl_entries_for_pi else "Expense"

		for it in items:
			amt = flt(it.base_net_amount)
			poi = poi_refs.get(it.po_detail, {})
			p_ref = it.cpc_irpo_budget_row_ref or poi.get("cpc_irpo_budget_row_ref")
			u_ref = it.cpc_irpo_unplanned_row_ref or poi.get("cpc_irpo_unplanned_row_ref")
			cat = "unclassified"
			if u_ref and not p_ref:
				unplanned_expense += amt
				cat = "unplanned"
			elif p_ref and not u_ref:
				planned_expense += amt
				cat = "planned"
			else:
				unclassified_expense += amt

			details.append({
				"voucher_type": "Purchase Invoice",
				"voucher_no": it.pi_name,
				"posting_date": str(posting_date or ""),
				"account": acc,
				"item_code": it.item_code or "",
				"amount": flt(amt, 2),
				"category": cat,
				"planned_ref": p_ref,
				"unplanned_ref": u_ref,
				"remarks": "",
			})

	# Process all other GL entries (Stock Entries, Journal Entries, or PIs not matching items)
	for gl in expense_gls:
		if gl.voucher_type == "Purchase Invoice" and gl.voucher_no in processed_vouchers:
			continue
		amt = flt(gl.debit) - flt(gl.credit)
		unclassified_expense += amt
		details.append({
			"voucher_type": gl.voucher_type,
			"voucher_no": gl.voucher_no,
			"posting_date": str(gl.posting_date),
			"account": gl.account,
			"item_code": "",
			"amount": flt(amt, 2),
			"category": "unclassified",
			"planned_ref": None,
			"unplanned_ref": None,
			"remarks": gl.remarks or "",
		})

	# Exact reconciliation with total_expense
	gl_total = planned_expense + unplanned_expense + unclassified_expense
	diff = flt(total_expense - gl_total, 2)
	if abs(diff) > 0.001:
		unclassified_expense += diff
		details.append({
			"voucher_type": "Adjustment",
			"voucher_no": _("Rounding / Variance"),
			"posting_date": str(to_date),
			"account": _("P&L Reconciling Difference"),
			"item_code": "",
			"amount": diff,
			"category": "unclassified",
			"planned_ref": None,
			"unplanned_ref": None,
			"remarks": _("Balancing adjustment to P&L reported expense"),
		})

	return {
		"total_expense": flt(total_expense, 2),
		"planned": flt(planned_expense, 2),
		"unplanned": flt(unplanned_expense, 2),
		"unclassified": flt(unclassified_expense, 2),
		"details": details,
	}


def get_purchase_status(project, company):
	"""Returns current counts of distinct parent documents (MR, PO, PR, PI) and open PO commitment.
	Item-level Project is authoritative; header-level Project is fallback only for blank item project.
	Discloses full document total alongside project-specific amounts.
	"""
	# 1. Material Requests
	mr_rows = frappe.get_list(
		"Material Request",
		filters={
			"company": company,
			"docstatus": ["in", [0, 1]],
		},
		or_filters=[
			["Material Request Item", "project", "=", project],
		],
		fields=[
			"name",
			"status",
			"docstatus",
			"transaction_date",
			"`tabMaterial Request Item`.name as item_name",
			"`tabMaterial Request Item`.qty",
			"`tabMaterial Request Item`.project as item_project",
		],
		order_by="docstatus desc, transaction_date desc, name desc",
		limit=0,
	)
	mr_map = {}
	for r in mr_rows:
		if r.get("item_project") != project:
			continue

		name = r.name
		if name not in mr_map:
			mr_map[name] = {
				"name": name,
				"status": r.status,
				"docstatus": r.docstatus,
				"date": str(r.transaction_date or ""),
				"qty": 0.0,
				"item_count": 0,
			}
		if r.get("item_name"):
			mr_map[name]["item_count"] += 1
			mr_map[name]["qty"] += flt(r.qty)

	mr_docs = list(mr_map.values())
	mr_submitted = sum(1 for r in mr_docs if r["docstatus"] == 1)
	mr_draft = sum(1 for r in mr_docs if r["docstatus"] == 0)

	# 2. Purchase Orders
	po_rows = frappe.get_list(
		"Purchase Order",
		filters={
			"company": company,
			"docstatus": ["in", [0, 1]],
		},
		or_filters=[
			["Purchase Order Item", "project", "=", project],
			["Purchase Order", "project", "=", project],
		],
		fields=[
			"name",
			"project as po_project",
			"status",
			"docstatus",
			"transaction_date",
			"base_net_total",
			"`tabPurchase Order Item`.name as item_name",
			"`tabPurchase Order Item`.base_net_amount",
			"`tabPurchase Order Item`.project as item_project",
		],
		order_by="docstatus desc, transaction_date desc, name desc",
		limit=0,
	)
	po_map = {}
	for r in po_rows:
		effective_project = r.get("item_project") or r.get("po_project")
		if effective_project != project:
			continue

		name = r.name
		if name not in po_map:
			po_map[name] = {
				"name": name,
				"status": r.status,
				"docstatus": r.docstatus,
				"date": str(r.transaction_date or ""),
				"amount": 0.0,
				"total_document_amount": flt(r.base_net_total, 2),
			}
		if r.get("item_name"):
			po_map[name]["amount"] += flt(r.base_net_amount)

	po_docs = list(po_map.values())
	po_submitted = sum(1 for r in po_docs if r["docstatus"] == 1)
	po_draft = sum(1 for r in po_docs if r["docstatus"] == 0)

	# 3. Purchase Receipts
	pr_rows = frappe.get_list(
		"Purchase Receipt",
		filters={
			"company": company,
			"docstatus": ["in", [0, 1]],
		},
		or_filters=[
			["Purchase Receipt Item", "project", "=", project],
			["Purchase Receipt", "project", "=", project],
		],
		fields=[
			"name",
			"project as pr_project",
			"status",
			"docstatus",
			"posting_date as transaction_date",
			"base_net_total",
			"`tabPurchase Receipt Item`.name as item_name",
			"`tabPurchase Receipt Item`.base_net_amount",
			"`tabPurchase Receipt Item`.project as item_project",
		],
		order_by="docstatus desc, posting_date desc, name desc",
		limit=0,
	)
	pr_map = {}
	for r in pr_rows:
		effective_project = r.get("item_project") or r.get("pr_project")
		if effective_project != project:
			continue

		name = r.name
		if name not in pr_map:
			pr_map[name] = {
				"name": name,
				"status": r.status,
				"docstatus": r.docstatus,
				"date": str(r.transaction_date or ""),
				"amount": 0.0,
				"total_document_amount": flt(r.base_net_total, 2),
			}
		if r.get("item_name"):
			pr_map[name]["amount"] += flt(r.base_net_amount)

	pr_docs = list(pr_map.values())
	pr_submitted = sum(1 for r in pr_docs if r["docstatus"] == 1)
	pr_draft = sum(1 for r in pr_docs if r["docstatus"] == 0)

	# 4. Purchase Invoices
	pi_rows = frappe.get_list(
		"Purchase Invoice",
		filters={
			"company": company,
			"docstatus": ["in", [0, 1]],
		},
		or_filters=[
			["Purchase Invoice Item", "project", "=", project],
			["Purchase Invoice", "project", "=", project],
		],
		fields=[
			"name",
			"project as pi_project",
			"status",
			"docstatus",
			"posting_date as transaction_date",
			"base_net_total",
			"`tabPurchase Invoice Item`.name as item_name",
			"`tabPurchase Invoice Item`.base_net_amount",
			"`tabPurchase Invoice Item`.project as item_project",
		],
		order_by="docstatus desc, posting_date desc, name desc",
		limit=0,
	)
	pi_map = {}
	for r in pi_rows:
		effective_project = r.get("item_project") or r.get("pi_project")
		if effective_project != project:
			continue

		name = r.name
		if name not in pi_map:
			pi_map[name] = {
				"name": name,
				"status": r.status,
				"docstatus": r.docstatus,
				"date": str(r.transaction_date or ""),
				"amount": 0.0,
				"total_document_amount": flt(r.base_net_total, 2),
			}
		if r.get("item_name"):
			pi_map[name]["amount"] += flt(r.base_net_amount)

	pi_docs = list(pi_map.values())
	pi_submitted = sum(1 for r in pi_docs if r["docstatus"] == 1)
	pi_draft = sum(1 for r in pi_docs if r["docstatus"] == 0)

	# 5. Open PO amount, Overbilling, and Received-Unbilled disclosures:
	active_po_items = frappe.get_list(
		"Purchase Order",
		filters={
			"company": company,
			"docstatus": 1,
			"status": ["not in", ["Closed", "Cancelled"]],
		},
		or_filters=[
			["Purchase Order Item", "project", "=", project],
			["Purchase Order", "project", "=", project],
		],
		fields=[
			"name as po_name",
			"project as po_project",
			"`tabPurchase Order Item`.name as poi_name",
			"`tabPurchase Order Item`.base_net_amount",
			"`tabPurchase Order Item`.project as poi_project",
		],
		limit=0,
	)

	valid_po_items = []
	for p in active_po_items:
		effective_project = p.get("poi_project") or p.get("po_project")
		if effective_project == project and p.get("poi_name"):
			valid_po_items.append(p)

	poi_names = [p.poi_name for p in valid_po_items]
	billed_map = defaultdict(float)
	pr_received_map = defaultdict(float)

	if poi_names:
		pi_billed_rows = frappe.get_list(
			"Purchase Invoice",
			filters={
				"docstatus": 1,
				"company": company,
			},
			or_filters=[
				["Purchase Invoice Item", "po_detail", "in", poi_names]
			],
			fields=[
				"`tabPurchase Invoice Item`.po_detail as po_detail",
				"`tabPurchase Invoice Item`.base_net_amount as base_net_amount",
			],
			limit=0,
		)
		for billed_r in pi_billed_rows:
			if billed_r.get("po_detail"):
				billed_map[billed_r.po_detail] += flt(billed_r.base_net_amount)

		# Check Purchase Receipt Items against these PO item details
		pr_item_rows = frappe.get_list(
			"Purchase Receipt",
			filters={
				"docstatus": 1,
				"company": company,
			},
			or_filters=[
				["Purchase Receipt Item", "purchase_order_item", "in", poi_names]
			],
			fields=[
				"`tabPurchase Receipt Item`.purchase_order_item as poi_name",
				"`tabPurchase Receipt Item`.base_net_amount as base_net_amount",
			],
			limit=0,
		)
		for pri in pr_item_rows:
			if pri.get("poi_name"):
				pr_received_map[pri.poi_name] += flt(pri.base_net_amount)

	open_po_amount = 0.0
	overbilled_amount = 0.0
	received_unbilled_amount = 0.0

	for poi in valid_po_items:
		ordered_val = flt(poi.base_net_amount)
		billed_val = billed_map[poi.poi_name]
		received_val = pr_received_map[poi.poi_name]

		remainder = ordered_val - billed_val
		if remainder > 0:
			open_po_amount += remainder
		elif remainder < 0:
			overbilled_amount += abs(remainder)

		rec_unbilled = received_val - billed_val
		if rec_unbilled > 0:
			received_unbilled_amount += rec_unbilled

	return {
		"material_requests": {
			"submitted": mr_submitted,
			"draft": mr_draft,
			"documents": [
				{
					"name": r["name"],
					"status": r["status"],
					"docstatus": r["docstatus"],
					"date": r["date"],
					"qty": flt(r["qty"]),
					"item_count": r["item_count"],
				}
				for r in mr_docs
			],
		},
		"purchase_orders": {
			"submitted": po_submitted,
			"draft": po_draft,
			"documents": [
				{
					"name": r["name"],
					"status": r["status"],
					"docstatus": r["docstatus"],
					"date": r["date"],
					"amount": flt(r["amount"], 2),
					"total_document_amount": r.get("total_document_amount"),
				}
				for r in po_docs
			],
		},
		"purchase_receipts": {
			"submitted": pr_submitted,
			"draft": pr_draft,
			"documents": [
				{
					"name": r["name"],
					"status": r["status"],
					"docstatus": r["docstatus"],
					"date": r["date"],
					"amount": flt(r["amount"], 2),
					"total_document_amount": r.get("total_document_amount"),
				}
				for r in pr_docs
			],
		},
		"purchase_invoices": {
			"submitted": pi_submitted,
			"draft": pi_draft,
			"documents": [
				{
					"name": r["name"],
					"status": r["status"],
					"docstatus": r["docstatus"],
					"date": r["date"],
					"amount": flt(r["amount"], 2),
					"total_document_amount": r.get("total_document_amount"),
				}
				for r in pi_docs
			],
		},
		"open_po_amount": flt(open_po_amount, 2),
		"open_po_summary": {
			"open_po_amount": flt(open_po_amount, 2),
			"overbilled_amount": flt(overbilled_amount, 2),
			"received_unbilled_amount": flt(received_unbilled_amount, 2),
		},
	}
