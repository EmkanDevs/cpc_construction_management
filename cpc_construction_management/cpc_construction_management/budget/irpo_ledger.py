"""
US-08 Phase 6 — Quantity Lifecycle Server Hooks.

One signed ledger row per stage a transaction row touches. A stage
transfer (e.g. PO consuming MR Pending) is two paired rows — a
negative one in the source stage, a positive one in the destination
stage — both tagged to the voucher doing the transferring, not as a
formal reversal_of the original row (see chat).

Amendments need no special handling: Frappe cancels the original doc
first (firing on_cancel, which reverses its rows), and the amended
doc gets a new name, so its on_submit posts fresh rows independently.

Phase 8 addition: every on_submit/on_cancel handler now calls
refresh_irpo_child_row_summary(doc) after posting/reversing ledger
rows, so the Task/Item Table display fields (MR Pending, PO Pending,
PR Qty, PI/Actual Qty, Available Qty) stay in sync with the ledger.

Fix 1 (PR quantity double-count): a Purchase Receipt Item links back to
its Purchase Order row through `purchase_order_item` (ERPNext v15), NOT
`po_detail` (that is the Purchase Invoice Item field name). Reading
`po_detail` on a PR row always returned nothing, so PRs posted as fresh
consumption (None -> PR) and never drew down PO Pending.
"""

import frappe
from frappe.utils import flt

from cpc_construction_management.cpc_construction_management.budget.irpo_budget import _IRPO_FIELDNAME
from cpc_construction_management.cpc_construction_management.budget.irop_uom import normalize_qty_to_irpo_uom
from cpc_construction_management.cpc_construction_management.budget.irpo_summary_refresh import (
	refresh_irpo_child_row_summary,
)
from cpc_construction_management.cpc_construction_management.doctype.irpo_quantity_ledger.irpo_quantity_ledger import (
	create_ledger_row,
	reverse_ledger_row,
)


def _get_budget_row(budget_row_ref):
	return frappe.db.get_value("Item Table", budget_row_ref, ["item", "uom"], as_dict=True)


def _post_stage_movement(
	irpo, irpo_budget_row_ref, item, project, qty, transaction_qty, transaction_uom,
	conversion_factor, uom, to_stage, from_stage, voucher_type, voucher_no,
	voucher_detail_no, created_from_stage, company,
):
	if from_stage:
		create_ledger_row(
			irpo=irpo, irpo_budget_row_ref=irpo_budget_row_ref, item=item, project=project,
			qty=-qty, uom=uom, stage=from_stage, voucher_type=voucher_type, voucher_no=voucher_no,
			voucher_detail_no=voucher_detail_no, created_from_stage=created_from_stage, company=company,
			transaction_qty=-transaction_qty, transaction_uom=transaction_uom,
			conversion_factor=conversion_factor, remarks=f"Transferred to {to_stage}",
		)
	create_ledger_row(
		irpo=irpo, irpo_budget_row_ref=irpo_budget_row_ref, item=item, project=project,
		qty=qty, uom=uom, stage=to_stage, voucher_type=voucher_type, voucher_no=voucher_no,
		voucher_detail_no=voucher_detail_no, created_from_stage=created_from_stage, company=company,
		transaction_qty=transaction_qty, transaction_uom=transaction_uom,
		conversion_factor=conversion_factor,
		remarks=(f"Transferred from {from_stage}" if from_stage else None),
	)


def _reverse_voucher_ledger_rows(voucher_type, voucher_no):
	rows = frappe.get_all(
		"IRPO Quantity Ledger",
		filters={
			"voucher_type": voucher_type,
			"voucher_no": voucher_no,
			"is_cancelled": 0,
			"reversal_of": ["is", "not set"],   # never re-reverse a reversal row
		},
		pluck="name",
	)
	for name in rows:
		reverse_ledger_row(name, remarks=f"{voucher_type} {voucher_no} cancelled")


def _process_rows(doc, irpo_field, to_stage, from_stage, created_from_stage, source_field=None):
	"""source_field: a fieldname, or a tuple of fieldnames, that marks a row
	as a transfer from `from_stage`. If none of them is set on the row, the
	row is fresh consumption (no transfer-out)."""
	if isinstance(source_field, str):
		source_fields = (source_field,)
	else:
		source_fields = tuple(source_field or ())

	for row in doc.get("items") or []:
		irpo = row.get(irpo_field)
		budget_row_ref = row.get("cpc_irpo_budget_row_ref")
		if not irpo or not budget_row_ref:
			continue  # overhead / non-IRPO line, skip

		budget_row = _get_budget_row(budget_row_ref)
		if not budget_row:
			frappe.throw(
				f"IRPO Budget Row {budget_row_ref} referenced by {doc.doctype} {doc.name} "
				f"row {row.idx} no longer exists."
			)

		irpo_qty, factor = normalize_qty_to_irpo_uom(row.item_code, flt(row.qty), row.uom, budget_row.uom)

		resolved_from_stage = from_stage
		if source_fields and not any(row.get(f) for f in source_fields):
			resolved_from_stage = None  # e.g. PO created directly, no MR -> no transfer-out

		_post_stage_movement(
			irpo=irpo, irpo_budget_row_ref=budget_row_ref, item=row.item_code,
			project=row.get("project"), qty=irpo_qty, transaction_qty=flt(row.qty),
			transaction_uom=row.uom, conversion_factor=factor, uom=budget_row.uom,
			to_stage=to_stage, from_stage=resolved_from_stage, voucher_type=doc.doctype,
			voucher_no=doc.name, voucher_detail_no=row.name,
			created_from_stage=created_from_stage, company=doc.company,
		)


# ---- Material Request ----

def mr_on_submit(doc, method=None):
	_process_rows(doc, _IRPO_FIELDNAME["Material Request Item"], to_stage="MR Pending",
	              from_stage=None, created_from_stage="MR")
	refresh_irpo_child_row_summary(doc)


def mr_on_cancel(doc, method=None):
	_reverse_voucher_ledger_rows("Material Request", doc.name)
	refresh_irpo_child_row_summary(doc)


# ---- Purchase Order ----

def po_on_submit(doc, method=None):
	_process_rows(doc, _IRPO_FIELDNAME["Purchase Order Item"], to_stage="PO Pending",
	              from_stage="MR Pending", created_from_stage="PO",
	              source_field="material_request_item")
	refresh_irpo_child_row_summary(doc)


def po_on_cancel(doc, method=None):
	_reverse_voucher_ledger_rows("Purchase Order", doc.name)
	refresh_irpo_child_row_summary(doc)


# ---- Purchase Receipt ----
# PR Item links to its PO row via `purchase_order_item` (po_detail kept
# only as a fallback in case a customization adds it).

def pr_on_submit(doc, method=None):
	_process_rows(doc, _IRPO_FIELDNAME["Purchase Receipt Item"], to_stage="PR",
	              from_stage="PO Pending", created_from_stage="PR",
	              source_field=("purchase_order_item", "po_detail"))
	refresh_irpo_child_row_summary(doc)


def pr_on_cancel(doc, method=None):
	_reverse_voucher_ledger_rows("Purchase Receipt", doc.name)
	refresh_irpo_child_row_summary(doc)


# ---- Purchase Invoice ----
# Needs its own loop (not _process_rows) because from_stage depends on
# whether each row traces back through a PR or straight to a PO.

def pi_on_submit(doc, method=None):
	for row in doc.get("items") or []:
		irpo = row.get(_IRPO_FIELDNAME["Purchase Invoice Item"])
		budget_row_ref = row.get("cpc_irpo_budget_row_ref")
		if not irpo or not budget_row_ref:
			continue

		if row.get("pr_detail"):
			from_stage = "PR"
		elif row.get("po_detail"):
			from_stage = "PO Pending"
		else:
			from_stage = None

		budget_row = _get_budget_row(budget_row_ref)
		if not budget_row:
			frappe.throw(
				f"IRPO Budget Row {budget_row_ref} referenced by {doc.doctype} {doc.name} "
				f"row {row.idx} no longer exists."
			)

		irpo_qty, factor = normalize_qty_to_irpo_uom(row.item_code, flt(row.qty), row.uom, budget_row.uom)

		_post_stage_movement(
			irpo=irpo, irpo_budget_row_ref=budget_row_ref, item=row.item_code,
			project=row.get("project"), qty=irpo_qty, transaction_qty=flt(row.qty),
			transaction_uom=row.uom, conversion_factor=factor, uom=budget_row.uom,
			to_stage="PI Actual", from_stage=from_stage, voucher_type=doc.doctype,
			voucher_no=doc.name, voucher_detail_no=row.name, created_from_stage="PI",
			company=doc.company,
		)
	refresh_irpo_child_row_summary(doc)


def pi_on_cancel(doc, method=None):
	_reverse_voucher_ledger_rows("Purchase Invoice", doc.name)
	refresh_irpo_child_row_summary(doc)








