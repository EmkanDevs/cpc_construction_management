"""
IRPO Budget Qty Revision & Ledger Audit Enhancement.

Runs on Task.validate, right after _recalculate_available_qty has already
updated irpo_available_qty in-memory from the (possibly revised) Budget Qty.
This module only concerns itself with detecting the revision as a business
event, blocking unsupported decreases, and creating the audit trail — not
the arithmetic itself, which validate_irpo_task already handles.

Current scope is increase-only (spec section 18); decreases are rejected
with a validation error rather than silently handled.
"""

import frappe
from frappe import _
from frappe.utils import flt

from cpc_construction_management.cpc_construction_management.doctype.irpo_quantity_ledger.irpo_quantity_ledger import (
    create_ledger_row,
)


def process_budget_qty_revisions(doc, method=None):
    if doc.get("cpc_node_type") != "IRPO":
        return
    if doc.is_new():
        return

    before = doc.get_doc_before_save()
    if not before:
        return

    old_rows_by_name = {r.name: r for r in (before.get("custom_items_table") or [])}

    for row in doc.get("custom_items_table") or []:
        old_row = old_rows_by_name.get(row.name)
        if not old_row:
            continue  # row added this save, nothing to revise against

        old_qty = flt(old_row.get("qty"))
        new_qty = flt(row.get("qty"))

        if new_qty == old_qty:
            continue

        if new_qty < old_qty:
            frappe.throw(
                _(
                    "IRPO Budget Qty for item {0} (row {1}) cannot be decreased "
                    "from {2} to {3}. Quantity decrease is not supported by this "
                    "revision flow yet."
                ).format(frappe.bold(row.get("item")), frappe.bold(row.name), old_qty, new_qty)
            )

        _post_budget_revision(doc, row, old_row, old_qty, new_qty)


def _post_budget_revision(doc, row, old_row, old_qty, new_qty):
    difference = new_qty - old_qty

    # Duplicate-insert guard: compare against the exact (irpo, row ref,
    # before, after) tuple rather than timing, per the on_update/is_new
    # lesson from the Phase 2 ledger controller.
    duplicate = frappe.db.exists(
        "IRPO Quantity Ledger",
        {
            "irpo": doc.name,
            "irpo_budget_row_ref": row.name,
            "event_type": "Budget Revision",
            "budget_qty_before": old_qty,
            "budget_qty_after": new_qty,
            "is_cancelled": 0,
        },
    )
    if duplicate:
        return

    revision_no = frappe.db.count(
        "IRPO Quantity Ledger",
        {
            "irpo": doc.name,
            "irpo_budget_row_ref": row.name,
            "event_type": "Budget Revision",
            "is_cancelled": 0,
        },
    ) + 1

    available_before = flt(old_row.get("irpo_available_qty"))
    available_after = flt(row.get("irpo_available_qty"))  # already recalculated in-memory
    company = frappe.db.get_value("Project", doc.get("project"), "company") if doc.get("project") else None

    # <<< NEEDS irpo_quantity_ledger.create_ledger_row's real signature —
    #     see note below the code block. >>>
    create_ledger_row(
        irpo=doc.name,
        irpo_budget_row_ref=row.name,
        item=row.get("item"),
        project=doc.get("project"),
        qty=difference,
        uom=row.get("uom"),
        stage="IRPO Available",
        voucher_type="Task",
        voucher_no=doc.name,
        voucher_detail_no=row.name,
        created_from_stage="Budget Revision",
        company=company,
        transaction_qty=difference,
        transaction_uom=row.get("uom"),
        conversion_factor=1,
        remarks=_("IRPO Budget Qty revised from {0} {1} to {2} {1} ({3}{4} {1})").format(
            old_qty, row.get("uom"), new_qty, "+" if difference >= 0 else "", difference,
        ),
        event_type="Budget Revision",
        revision_no=revision_no,
        budget_qty_before=old_qty,
        budget_qty_after=new_qty,
        mr_pending_qty_after=flt(row.get("irpo_mr_pending_qty")),
        po_pending_qty_after=flt(row.get("irpo_po_pending_qty")),
        pr_qty_after=flt(row.get("irpo_pr_qty")),
        pi_actual_qty_after=flt(row.get("irpo_pi_actual_qty")),
        irpo_available_qty_before=available_before,
        irpo_available_qty=available_after,
    )

    doc.add_comment(
        "Info",
        _(
            "<b>IRPO Budget Qty Revised</b><br>"
            "Item: {item}<br>IRPO Budget Row Ref: {row_ref}<br><br>"
            "Budget Qty: {old_qty} {uom} → {new_qty} {uom}<br>"
            "Change: {sign}{diff} {uom}<br><br>"
            "IRPO Available Qty: {avail_before} {uom} → {avail_after} {uom}"
        ).format(
            item=row.get("item"), row_ref=row.name, old_qty=old_qty, new_qty=new_qty,
            uom=row.get("uom"), sign="+" if difference >= 0 else "", diff=difference,
            avail_before=available_before, avail_after=available_after,
        ),
    )