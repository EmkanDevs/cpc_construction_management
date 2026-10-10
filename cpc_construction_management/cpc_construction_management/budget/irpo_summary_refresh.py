import frappe
from frappe.utils import flt

STAGE_FIELD_MAP = {
	"MR Pending": "irpo_mr_pending_qty",
	"PO Pending": "irpo_po_pending_qty",
	"PR": "irpo_pr_qty",
	"PI Actual": "irpo_pi_actual_qty",
}

BUDGET_ROW_DOCTYPE = "Item Table"


def refresh_irpo_child_row_summary(document):
	"""
	Call this after ledger rows are posted for a voucher (create_ledger_row
	on submit) and after they're reversed (reverse_ledger_row on cancel).

	Recomputes each touched budget row's stage totals purely from
	IRPO Quantity Ledger — never from doc state in memory.
	"""
	touched = frappe.get_all(
		"IRPO Quantity Ledger",
		filters={"voucher_type": document.doctype, "voucher_no": document.name},
		fields=["irpo", "irpo_budget_row_ref"],
		distinct=True,
	)

	seen = set()
	for row in touched:
		key = (row.irpo, row.irpo_budget_row_ref)
		if key in seen:
			continue
		seen.add(key)
		_refresh_single_budget_row(row.irpo, row.irpo_budget_row_ref)


def _refresh_single_budget_row(irpo, budget_row_ref):
	stage_totals = frappe.get_all(
		"IRPO Quantity Ledger",
		filters={
			"irpo": irpo,
			"irpo_budget_row_ref": budget_row_ref,
			# no is_cancelled filter — see get_stage_balances for why
		},
		group_by="stage",
		fields=["stage", "sum(qty) as total"],
	)

	stage_balance = {stage: 0.0 for stage in STAGE_FIELD_MAP}
	for r in stage_totals:
		if r.stage in stage_balance:
			stage_balance[r.stage] = flt(r.total)

	budget_row = frappe.db.get_value(
		BUDGET_ROW_DOCTYPE, budget_row_ref, ["qty"], as_dict=True
	)
	if not budget_row:
		frappe.log_error(
			title="IRPO summary refresh: budget row not found",
			message=f"irpo={irpo} budget_row_ref={budget_row_ref}",
		)
		return

	controlled_qty = sum(stage_balance.values())
	available_qty = flt(budget_row.qty) - controlled_qty

	update_values = {field: stage_balance[stage] for stage, field in STAGE_FIELD_MAP.items()}
	update_values["irpo_available_qty"] = available_qty

	frappe.db.set_value(BUDGET_ROW_DOCTYPE, budget_row_ref, update_values)