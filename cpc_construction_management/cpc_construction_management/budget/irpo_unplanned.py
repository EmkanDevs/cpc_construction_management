# """IRPO Unplanned Item tracking (spec dated 05-Oct-2026).

# Planned lines keep the existing irpo_budget_row_ref engine untouched. This module
# only handles lines carrying cpc_irpo_unplanned_row_ref and re-uses the SAME
# IRPO Quantity Ledger (rows flagged is_unplanned = 1).

# Package: cpc_construction_management.cpc_construction_management.budget.irpo_unplanned
# """
# import frappe
# from frappe import _
# from frappe.model.naming import make_autoname
# from frappe.utils import add_days, flt, fmt_money, nowdate

# from cpc_construction_management.cpc_construction_management.budget.irpo_budget import (
#     _IRPO_FIELDNAME, get_actual_amount, get_committed_amount, validate_irpo_is_usable,
# )
# from cpc_construction_management.cpc_construction_management.budget.irpo_unplanned_calc import (
#     CREATED_FROM, EVENT, STAGE, SUMMARY_FIELD,
#     available_qty, is_unplanned_only, plan_stage_rows, source_stage_for, summary_from_balances,
# )

# UNPLANNED_DT = "IRPO Unplanned Item"
# UNPLANNED_FIELD = "custom_irpo_unplanned_item"
# PLANNED_DT = "Item Table"
# PLANNED_FIELD = "custom_items_table"
# LEDGER = "IRPO Quantity Ledger"
# REF_SERIES = "IRPO-UPL-.#####"

# ITEM_DT = {
#     "Material Request": "Material Request Item",
#     "Purchase Order": "Purchase Order Item",
#     "Purchase Receipt": "Purchase Receipt Item",
#     "Purchase Invoice": "Purchase Invoice Item",
# }


# # --------------------------------------------------------------------------
# # helpers
# # --------------------------------------------------------------------------
# def _has(fieldname):
#     return frappe.get_meta(UNPLANNED_DT).has_field(fieldname)


# def _task(row):
#     # same field the planned engine reads (_IRPO_FIELDNAME), falling back to task
#     return row.get(_IRPO_FIELDNAME.get(row.doctype, "task")) or row.get("task")


# def _planned_rows(task, item):
#     return frappe.get_all(
#         PLANNED_DT,
#         filters={"parent": task, "parenttype": "Task", "parentfield": PLANNED_FIELD, "item": item},
#         fields=["name"],
#     )


# def _unplanned_lines(doc):
#     return [r for r in (doc.get("items") or []) if r.get("cpc_irpo_unplanned_row_ref") and _task(r)]


# def _row_qty(row):
#     """Quantity in the unplanned row's UOM (= Item stock UOM)."""
#     return flt(row.get("stock_qty")) or flt(row.get("qty")) * flt(row.get("conversion_factor") or 1)


# def _lock_ref(ref):
#     frappe.db.sql("select name from `tabIRPO Unplanned Item` where unplanned_row_ref=%s for update", ref)


# def _stage_balance(ref, stage):
#     # Sum ALL rows (originals + reversals) so a cancelled voucher nets to zero,
#     # same convention as the planned get_stage_balances().
#     val = frappe.db.sql(
#         "select ifnull(sum(qty),0) from `tabIRPO Quantity Ledger` where irpo_unplanned_row_ref=%s and stage=%s",
#         (ref, stage),
#     )
#     return flt(val[0][0])


# # --------------------------------------------------------------------------
# # Task: unplanned table validation   (Task.validate)
# # --------------------------------------------------------------------------
# def validate_unplanned_rows(doc, method=None):
#     rows = doc.get(UNPLANNED_FIELD) or []
#     seen = set()
#     for r in rows:
#         if not r.item:
#             continue
#         if r.item in seen:  # uniqueness for current scope = Task + Item
#             frappe.throw(_("Row {0}: Item {1} is already in Unplanned Items for this IRPO.").format(r.idx, r.item))
#         seen.add(r.item)

#         existing = r.name and frappe.db.get_value(
#             UNPLANNED_DT, r.name, ["item", "unplanned_row_ref", "uom", "irpo_mr_pending_qty", "irpo_po_pending_qty", "irpo_pr_qty", "irpo_pi_actual_qty"], as_dict=True
#         )
#         if existing:
#             if existing.item != r.item:
#                 frappe.throw(_("Row {0}: Item cannot be changed once the row exists. Add a new row instead.").format(r.idx))
#             # system-owned fields: never trust values posted back from a stale form
#             r.update({k: existing[k] for k in ("unplanned_row_ref", "uom", "irpo_mr_pending_qty", "irpo_po_pending_qty", "irpo_pr_qty", "irpo_pi_actual_qty")})
#         else:
#             r.uom = r.uom or frappe.db.get_value("Item", r.item, "stock_uom")
#             for f in SUMMARY_FIELD.values():
#                 r.set(f, 0)
#         if not r.unplanned_row_ref:  # also covers legacy rows saved before this hook existed
#             r.unplanned_row_ref = make_autoname(REF_SERIES)
#         if _has("irpo_available_qty"):
#             r.irpo_available_qty = available_qty(
#                 r.get("qty"), {stage: r.get(field) for stage, field in SUMMARY_FIELD.items()})

#     before = doc.get_doc_before_save()  # never lose audit history (spec section 9)
#     if before:
#         kept = {r.name for r in rows}
#         for old in before.get(UNPLANNED_FIELD) or []:
#             if old.name not in kept and frappe.db.exists(LEDGER, {"irpo_unplanned_row_ref": old.unplanned_row_ref}):
#                 frappe.throw(_("Unplanned row for {0} has ledger history and cannot be removed.").format(old.item))


# # --------------------------------------------------------------------------
# # Material Request: resolve planned vs unplanned   (validate + on_update)
# # --------------------------------------------------------------------------
# @frappe.whitelist()
# def check_item_planned(task, item_code):
#     """Client helper for the 'Unplanned Item / Service' info message."""
#     rows = _planned_rows(task, item_code)
#     return {
#         "planned": len(rows) == 1,
#         "ambiguous": len(rows) > 1,
#         "budget_row_ref": rows[0].name if len(rows) == 1 else None,
#     }


# def resolve_irpo_lines(doc, method=None):
#     """Direct-MR flow. Never blocks an unplanned item; only fixes references."""
#     for row in doc.get("items") or []:
#         task = _task(row)
#         if not task:
#             continue
#         task_doc = validate_irpo_is_usable(task, project=row.get("project") or doc.get("custom_project"))
#         if not row.get("project"):
#             row.project = task_doc.project
#         row.task = task

#         uref = row.get("cpc_irpo_unplanned_row_ref")
#         if uref and not frappe.db.exists(UNPLANNED_DT, {"unplanned_row_ref": uref, "parent": task, "item": row.item_code}):
#             row.cpc_irpo_unplanned_row_ref = None  # task/item changed after the ref was stamped -> re-resolve
#             uref = None
#         pref = row.get("cpc_irpo_budget_row_ref")
#         if pref and not frappe.db.exists(PLANNED_DT, {"name": pref, "parent": task, "item": row.item_code}):
#             row.cpc_irpo_budget_row_ref = None  # stale: Task or Item changed after the ref was stamped
#             pref = None
#         if uref or pref:
#             continue

#         planned = _planned_rows(task, row.item_code)
#         if len(planned) == 1:  # planned item: reuse the existing row reference
#             row.cpc_irpo_budget_row_ref = planned[0].name
#         elif len(planned) > 1:
#             frappe.throw(_("Row {0}: Item {1} appears on several planned rows of {2}. Create this MR from the Task so the exact planned row is carried.").format(row.idx, row.item_code, task))
#         # 0 planned rows => unplanned candidate; Task row is created after save (no ghost rows)


# def get_or_create_unplanned_row(task, item):
#     cond = {"parent": task, "parenttype": "Task", "parentfield": UNPLANNED_FIELD, "item": item}
#     row = frappe.db.get_value(UNPLANNED_DT, cond, ["name", "unplanned_row_ref"], as_dict=True)
#     if row and row.unplanned_row_ref:
#         return row.unplanned_row_ref

#     frappe.db.sql("select name from `tabTask` where name=%s for update", task)  # serialise concurrent first-use
#     row = frappe.db.get_value(UNPLANNED_DT, cond, ["name", "unplanned_row_ref"], as_dict=True)
#     if row:
#         if row.unplanned_row_ref:
#             return row.unplanned_row_ref
#         ref = make_autoname(REF_SERIES)  # row exists without a ref: stamp it, do not duplicate
#         frappe.db.set_value(UNPLANNED_DT, row.name, "unplanned_row_ref", ref, update_modified=False)
#         return ref

#     item_name, uom = frappe.db.get_value("Item", item, ["item_name", "stock_uom"])
#     values = {
#         "doctype": UNPLANNED_DT, "parent": task, "parenttype": "Task", "parentfield": UNPLANNED_FIELD,
#         "idx": frappe.db.count(UNPLANNED_DT, {"parent": task, "parentfield": UNPLANNED_FIELD}) + 1,
#         "item": item, "item_name": item_name, "uom": uom,
#         "unplanned_row_ref": make_autoname(REF_SERIES),
#     }
#     if _has("qty"):
#         values["qty"] = 0  # "no expected qty entered"; also satisfies the field if it is still marked mandatory
#     child = frappe.get_doc(values)
#     child.insert(ignore_permissions=True)
#     return child.unplanned_row_ref


# def ensure_unplanned_rows(doc, method=None):
#     """MR.on_update: create/reuse the Task row only AFTER the MR saved."""
#     if doc.docstatus == 2:
#         return
#     for row in doc.get("items") or []:
#         task = _task(row)
#         if not task or row.get("cpc_irpo_budget_row_ref") or row.get("cpc_irpo_unplanned_row_ref"):
#             continue
#         ref = get_or_create_unplanned_row(task, row.item_code)
#         row.cpc_irpo_unplanned_row_ref = ref
#         frappe.db.set_value(ITEM_DT[doc.doctype], row.name, "cpc_irpo_unplanned_row_ref", ref, update_modified=False)


# # --------------------------------------------------------------------------
# # PO / PR / PI: carry the unplanned ref forward
# # (PO: before_validate, PR/PI: validate -- same timing as carry_forward_irpo_fields)
# # --------------------------------------------------------------------------
# _SOURCES = {
#     "Purchase Order": [("material_request_item", "Material Request Item")],
#     "Purchase Receipt": [("purchase_order_item", "Purchase Order Item")],
#     "Purchase Invoice": [("pr_detail", "Purchase Receipt Item"), ("po_detail", "Purchase Order Item")],
# }


# def _po_source_mr_item(row):
#     if row.get("material_request_item"):
#         return row.material_request_item
#     if row.get("supplier_quotation_item"):  # MR -> RFQ -> SQ -> PO hop
#         return frappe.db.get_value("Supplier Quotation Item", row.supplier_quotation_item, "material_request_item")


# def _source_info(doc, row):
#     """(source row values or None, has_mr, has_po, has_pr)"""
#     dt = doc.doctype
#     has_mr = has_po = has_pr = False
#     src = None
#     if dt == "Purchase Order":
#         mri = _po_source_mr_item(row)
#         has_mr = bool(mri)
#         if mri:
#             src = frappe.db.get_value("Material Request Item", mri, ["cpc_irpo_unplanned_row_ref", "task"], as_dict=True)
#     else:
#         for fld, src_dt in _SOURCES.get(dt, []):
#             name = row.get(fld)
#             if not name:
#                 continue
#             has_pr = has_pr or src_dt == "Purchase Receipt Item"
#             has_po = has_po or src_dt == "Purchase Order Item"
#             src = src or frappe.db.get_value(src_dt, name, ["cpc_irpo_unplanned_row_ref", "task"], as_dict=True)
#     return src, has_mr, has_po, has_pr


# def carry_forward_unplanned(doc, method=None):
#     for row in doc.get("items") or []:
#         if row.get("cpc_irpo_unplanned_row_ref"):
#             continue
#         src, *_flags = _source_info(doc, row)
#         if src and src.cpc_irpo_unplanned_row_ref:
#             row.cpc_irpo_unplanned_row_ref = src.cpc_irpo_unplanned_row_ref
#             if not row.get("task") and src.task:
#                 row.task = src.task


# # --------------------------------------------------------------------------
# # Ledger posting   (on_submit / on_cancel for MR, PO, PR, PI)
# # --------------------------------------------------------------------------
# def _ledger_values(doc, row, ref_info, stage, signed_qty, event_type):
#     task = _task(row)
#     return {
#         "doctype": LEDGER, "irpo": task,
#         "project": frappe.db.get_value("Task", task, "project"),
#         "boq_code": frappe.db.get_value("Task", task, "cpc_boq_code"),
#         "company": doc.company,
#         "posting_date": doc.get("posting_date") or doc.get("transaction_date") or nowdate(),
#         "item": row.item_code, "item_name": ref_info.item_name, "irpo_item_type": ref_info.irpo_item_type,
#         "stage": stage, "created_from_stage": CREATED_FROM[doc.doctype], "event_type": event_type,
#         "voucher_type": doc.doctype, "voucher_no": doc.name, "voucher_detail_no": row.name,
#         "qty": signed_qty, "uom": ref_info.uom,
#         "transaction_qty": flt(row.qty), "transaction_uom": row.get("uom"),
#         "conversion_factor": flt(row.get("conversion_factor") or 1),
#         "is_unplanned": 1, "irpo_unplanned_row_ref": row.cpc_irpo_unplanned_row_ref,
#     }


# def _insert_ledger(values):
#     led = frappe.get_doc(values)
#     prev = frappe.flags.get("irpo_ledger_allow_insert")
#     frappe.flags.irpo_ledger_allow_insert = True  # existing gate on the immutable ledger
#     try:
#         led.insert(ignore_permissions=True)
#     finally:
#         frappe.flags.irpo_ledger_allow_insert = prev
#     return led


# def post_unplanned(doc, method=None):
#     for row in _unplanned_lines(doc):
#         ref = row.cpc_irpo_unplanned_row_ref
#         _lock_ref(ref)
#         if frappe.db.exists(LEDGER, {
#             "voucher_type": doc.doctype, "voucher_no": doc.name, "voucher_detail_no": row.name,
#             "is_unplanned": 1, "is_cancelled": 0, "reversal_of": ["is", "not set"],
#         }):
#             continue  # idempotent

#         info = frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, ["item_name", "irpo_item_type", "uom"], as_dict=True)
#         _src, has_mr, has_po, has_pr = _source_info(doc, row)
#         src_stage = source_stage_for(doc.doctype, has_mr, has_po, has_pr)
#         balance = _stage_balance(ref, src_stage) if src_stage else 0
#         for stage, signed in plan_stage_rows(STAGE[doc.doctype], src_stage, _row_qty(row), balance):
#             _insert_ledger(_ledger_values(doc, row, info, stage, signed, EVENT[doc.doctype]))
#         refresh_unplanned_row_summary(ref)


# def reverse_unplanned(doc, method=None):
#     originals = frappe.get_all(
#         LEDGER,
#         filters={"voucher_type": doc.doctype, "voucher_no": doc.name, "is_unplanned": 1,
#                  "is_cancelled": 0, "reversal_of": ["is", "not set"]},
#         pluck="name",
#     )
#     refs = set()
#     for name in originals:
#         o = frappe.get_doc(LEDGER, name)
#         refs.add(o.irpo_unplanned_row_ref)
#         _lock_ref(o.irpo_unplanned_row_ref)
#         _insert_ledger({
#             "doctype": LEDGER, "irpo": o.irpo, "project": o.project, "boq_code": o.boq_code, "company": o.company,
#             "posting_date": nowdate(), "item": o.item, "item_name": o.item_name, "irpo_item_type": o.irpo_item_type,
#             "stage": o.stage, "created_from_stage": o.created_from_stage, "event_type": "Cancel",
#             "voucher_type": o.voucher_type, "voucher_no": o.voucher_no, "voucher_detail_no": o.voucher_detail_no,
#             "qty": -flt(o.qty), "uom": o.uom, "transaction_qty": -flt(o.transaction_qty),
#             "transaction_uom": o.transaction_uom, "conversion_factor": o.conversion_factor,
#             "is_unplanned": 1, "irpo_unplanned_row_ref": o.irpo_unplanned_row_ref, "reversal_of": o.name,
#         })
#         frappe.db.set_value(LEDGER, o.name, "is_cancelled", 1, update_modified=False)
#     for ref in refs:
#         refresh_unplanned_row_summary(ref)


# def refresh_unplanned_row_summary(ref):
#     balances = dict(frappe.db.sql(
#         "select stage, sum(qty) from `tabIRPO Quantity Ledger` where irpo_unplanned_row_ref=%s group by stage", ref))
#     values = summary_from_balances(balances)
#     if _has("irpo_available_qty"):
#         qty = frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, "qty") if _has("qty") else 0
#         values["irpo_available_qty"] = available_qty(qty, balances)
#     frappe.db.set_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, values, update_modified=False)


# def snapshot_ledger_item_info(doc, method=None):
#     """IRPO Quantity Ledger.before_insert: copy Item Name + IRPO Item Type as a
#     historical snapshot for BOTH planned and unplanned rows, so the existing
#     planned posting code (create_ledger_row) does not need to change."""
#     info = None
#     if doc.get("irpo_unplanned_row_ref"):
#         doc.is_unplanned = 1
#         info = frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": doc.irpo_unplanned_row_ref}, ["item_name", "irpo_item_type"], as_dict=True)
#     elif doc.get("irpo_budget_row_ref"):
#         doc.is_unplanned = 0
#         info = frappe.db.get_value(PLANNED_DT, {"name": doc.irpo_budget_row_ref, "parent": doc.irpo}, ["item_name", "irpo_item_type"], as_dict=True)
#     if not doc.get("item_name"):
#         doc.item_name = (info and info.item_name) or frappe.db.get_value("Item", doc.item, "item_name")
#     if not doc.get("irpo_item_type") and info:
#         doc.irpo_item_type = info.irpo_item_type


# # --------------------------------------------------------------------------
# # Budget warning (never throws)   (before_submit for MR, PO, PR, PI)
# # --------------------------------------------------------------------------
# def get_irpo_amount_position(task, company=None, exclude_voucher=None):
#     """Same helpers the planned flow uses, so both warnings agree."""
#     budget = flt(frappe.db.get_value("Task", task, "cpc_budget_amount"))
#     return budget, flt(get_committed_amount(task, exclude_voucher=exclude_voucher)), flt(get_actual_amount(task, company))


# def warn_unplanned_budget(doc, method=None):
#     _install_budget_wrapper()
#     lines = _unplanned_lines(doc)
#     if not lines:
#         return
#     per_task = {}
#     for r in lines:
#         per_task[_task(r)] = per_task.get(_task(r), 0) + (flt(r.get("amount")) or flt(r.get("qty")) * flt(r.get("rate")))

#     parts = [_("This document contains Unplanned Items / Services. Their cost is tracked against the IRPO but is not hard-blocked by the planned budget.")]
#     for task, amt in per_task.items():
#         budget, committed, actual = get_irpo_amount_position(task, doc.get("company"), doc.name)
#         if amt and budget:
#             over = max(0.0, committed + actual + amt - budget)
#             parts.append(_("<b>{0}</b>: IRPO Budget {1} | Committed (open PO) {2} | Actual (GL) {3} | This Unplanned Amount {4} | Expected Overrun {5}").format(
#                 task, fmt_money(budget), fmt_money(committed), fmt_money(actual), fmt_money(amt), fmt_money(over)))
#         else:
#             parts.append(_("<b>{0}</b>: amount not available yet - this unplanned item may impact the approved IRPO budget.").format(task))
#     frappe.msgprint("<br>".join(parts), title=_("Unplanned Item / Budget Override"), indicator="orange")


# # --------------------------------------------------------------------------
# # Native ERPNext Budget: stop must not block unplanned-only spend
# # --------------------------------------------------------------------------
# def _gl_is_unplanned_only(args):
#     dt = ITEM_DT.get(args.get("voucher_type"))
#     task = args.get("cpc_irpo") or args.get("task")
#     if not (dt and args.get("voucher_no") and task):
#         return False
#     rows = frappe.db.sql(
#         f"select ifnull(cpc_irpo_budget_row_ref,''), ifnull(cpc_irpo_unplanned_row_ref,'') from `tab{dt}` where parent=%s and task=%s",
#         (args.voucher_no, task))
#     return is_unplanned_only(rows)


# def _is_unplanned_budget_context(args):
#     """GL entries (PR/PI) carry voucher_type/voucher_no: decide per voucher.
#     MR/PO budget checks (buying_controller.validate_budget) pass the item row itself:
#     decide per line, so a mixed MR/PO keeps full control of its planned lines."""
#     if args.get("voucher_type"):
#         return _gl_is_unplanned_only(args)
#     return bool(args.get("cpc_irpo_unplanned_row_ref")) and not args.get("cpc_irpo_budget_row_ref")


# def _install_budget_wrapper():
#     """ERPNext checks the Budget in two places that import the function separately:
#     general_ledger (PR/PI, per GL entry) and buying_controller (MR/PO, per item row).
#     Both are wrapped. A BudgetError is downgraded to a warning only for unplanned spend;
#     planned lines (and mixed GL vouchers) stay fully controlled (spec 6.2)."""
#     from erpnext.accounts import general_ledger as gl
#     from erpnext.accounts.doctype.budget.budget import BudgetError
#     from erpnext.controllers import buying_controller as bc

#     def make(original):
#         def wrapped(args, expense_amount=0):
#             try:
#                 return original(args, expense_amount)
#             except BudgetError as e:
#                 if not _is_unplanned_budget_context(frappe._dict(args)):
#                     raise
#                 frappe.clear_last_message()
#                 frappe.msgprint(str(e), indicator="orange", title=_("Budget Exceeded (Unplanned Item)"))
#         wrapped._irpo_wrapped = True
#         return wrapped

#     for module in (gl, bc):
#         if not getattr(module.validate_expense_against_budget, "_irpo_wrapped", False):
#             module.validate_expense_against_budget = make(module.validate_expense_against_budget)


# # --------------------------------------------------------------------------
# # Route B: Task > Unplanned Items > Create Material Request
# # --------------------------------------------------------------------------
# @frappe.whitelist()
# def make_material_request_from_unplanned(task, rows=None):
#     rows = frappe.parse_json(rows) if rows else None
#     t = validate_irpo_is_usable(task)
#     mr = frappe.new_doc("Material Request")
#     mr.material_request_type = "Purchase"
#     mr.custom_project = t.project
#     mr.task = t.name
#     mr.is_created_from_task = 1
#     mr.transaction_date = nowdate()
#     mr.schedule_date = add_days(nowdate(), 7)
#     mr.company = frappe.db.get_value("Project", t.project, "company") or frappe.defaults.get_user_default("Company")
#     for r in t.get(UNPLANNED_FIELD) or []:
#         if rows and r.name not in rows:
#             continue
#         expected = flt(r.get("qty"))
#         if expected > 0:
#             if flt(r.get("irpo_available_qty")) <= 0:
#                 continue  # everything expected has already been requested (same rule as planned rows)
#             qty = flt(r.irpo_available_qty)
#         else:
#             qty = 1  # no expected qty entered on the Task row: user edits it on the MR
#         mr.append("items", {
#             "item_code": r.item, "item_name": r.item_name, "uom": r.uom, "stock_uom": r.uom, "qty": qty,
#             "schedule_date": mr.schedule_date, "project": t.project, "task": t.name, "cpc_irpo": t.name,
#             "cpc_irpo_unplanned_row_ref": r.unplanned_row_ref, "expense_account": t.account, "custom_irpo_item_type":r.irpo_item_type,
#         })
#     if not mr.items:
#         frappe.throw(_("No Unplanned Items with available quantity remain on IRPO {0}. Nothing to request.").format(task))
#     return mr





























"""IRPO Unplanned Item tracking (spec dated 05-Oct-2026) + 21-Oct-2026 enhancement.

Planned lines keep the existing irpo_budget_row_ref engine untouched. This module
only handles lines carrying cpc_irpo_unplanned_row_ref and re-uses the SAME
IRPO Quantity Ledger (rows flagged is_unplanned = 1).

Package: cpc_construction_management.cpc_construction_management.budget.irpo_unplanned

Everything new in the 21-Oct enhancement is marked  # [CHG-n]  so `git diff` is easy to review:
  CHG-1 validate_unplanned_rows : block decrease, collect revisions for the ledger/Activity
  CHG-2 post_unplanned          : Direct MR (or excess over source) raises the row QTY; snapshots
  CHG-3 reverse_unplanned       : cancel lowers QTY back, stamps reversal rows (+ event type)
  CHG-4 validate_task_mr_available (new, MR before_submit)
  CHG-5 log_unplanned_revisions    (new, Task on_update)
  CHG-6 make_material_request_from_unplanned : Task-based MR uses Available only
"""
import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils import add_days, cint, flt, fmt_money, nowdate

from cpc_construction_management.cpc_construction_management.budget.irpo_budget import (
    _IRPO_FIELDNAME, get_actual_amount, get_committed_amount, validate_irpo_is_usable,
)
from cpc_construction_management.cpc_construction_management.budget.irpo_unplanned_calc import (
    CREATED_FROM, EVENT, STAGE, SUMMARY_FIELD,
    available_qty, is_unplanned_only, plan_stage_rows, source_stage_for, summary_from_balances,
)
# [CHG-0] new pure rules module
from cpc_construction_management.cpc_construction_management.budget.irpo_unplanned_rules import (
    TOL, UnplannedQtyError, check_consumption, check_qty_edit, fresh_qty, lowered_total,
)

UNPLANNED_DT = "IRPO Unplanned Item"
UNPLANNED_FIELD = "custom_irpo_unplanned_item"
PLANNED_DT = "Item Table"
PLANNED_FIELD = "custom_items_table"
LEDGER = "IRPO Quantity Ledger"
REF_SERIES = "IRPO-UPL-.#####"

# [CHG-0] ledger vocabulary + switch for the open business question
EV_ADDED_MR = "Unplanned Qty Added - MR"
EV_REVISION = "Unplanned Qty Revision - Task"
# Spec is silent on cancelling a Direct MR. True  = the quantity that MR introduced is withdrawn
# (QTY goes back down). False = it stays on the row and becomes Available (old behaviour).
LOWER_TOTAL_ON_CANCEL = True

ITEM_DT = {
    "Material Request": "Material Request Item",
    "Purchase Order": "Purchase Order Item",
    "Purchase Receipt": "Purchase Receipt Item",
    "Purchase Invoice": "Purchase Invoice Item",
}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _has(fieldname):
    return frappe.get_meta(UNPLANNED_DT).has_field(fieldname)


def _task(row):
    # same field the planned engine reads (_IRPO_FIELDNAME), falling back to task
    return row.get(_IRPO_FIELDNAME.get(row.doctype, "task")) or row.get("task")


def _planned_rows(task, item):
    return frappe.get_all(
        PLANNED_DT,
        filters={"parent": task, "parenttype": "Task", "parentfield": PLANNED_FIELD, "item": item},
        fields=["name"],
    )


def _unplanned_lines(doc):
    return [r for r in (doc.get("items") or []) if r.get("cpc_irpo_unplanned_row_ref") and _task(r)]


def _row_qty(row):
    """Quantity in the unplanned row's UOM (= Item stock UOM)."""
    return flt(row.get("stock_qty")) or flt(row.get("qty")) * flt(row.get("conversion_factor") or 1)


def _lock_ref(ref):
    frappe.db.sql("select name from `tabIRPO Unplanned Item` where unplanned_row_ref=%s for update", ref)


def _stage_balance(ref, stage):
    # Sum ALL rows (originals + reversals) so a cancelled voucher nets to zero,
    # same convention as the planned get_stage_balances().
    val = frappe.db.sql(
        "select ifnull(sum(qty),0) from `tabIRPO Quantity Ledger` where irpo_unplanned_row_ref=%s and stage=%s",
        (ref, stage),
    )
    return flt(val[0][0])


def _balances(ref):  # [CHG-0]
    return dict(frappe.db.sql(
        "select stage, sum(qty) from `tabIRPO Quantity Ledger` where irpo_unplanned_row_ref=%s group by stage", ref))


_STATE_FIELDS = ["name", "parent", "item", "item_name", "uom", "qty", "irpo_available_qty",
                 "irpo_mr_pending_qty", "irpo_po_pending_qty", "irpo_pr_qty", "irpo_pi_actual_qty"]


def _state(ref):  # [CHG-0]
    return frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, _STATE_FIELDS, as_dict=True)


def _task_comment(task, html):  # [CHG-0]
    frappe.get_doc({
        "doctype": "Comment", "comment_type": "Info",
        "reference_doctype": "Task", "reference_name": task, "content": html,
    }).insert(ignore_permissions=True)


def _stamp_snapshots(names, ref, qty_before, avail_before, extra=None, fix_event=False):  # [CHG-0]
    """After-event snapshot of the Task row onto ledger rows (rows are insert-only, so this
    is written straight after the insert, in the same transaction)."""
    st = _state(ref)
    base = {
        "unplanned_qty_before": qty_before, "unplanned_qty_after": flt(st.qty),
        "mr_pending_qty_after": flt(st.irpo_mr_pending_qty), "po_pending_qty_after": flt(st.irpo_po_pending_qty),
        "pr_qty_after": flt(st.irpo_pr_qty), "pi_actual_qty_after": flt(st.irpo_pi_actual_qty),
        "irpo_available_qty_before": avail_before, "irpo_available_qty": flt(st.irpo_available_qty),
        "snapshot_captured": 1,
    }
    for n in names:
        vals = dict(base, **((extra or {}).get(n) or {}))
        if fix_event and not frappe.db.get_value(LEDGER, n, "event_type"):
            vals["event_type"] = "Cancel"  # planned mr_on_cancel leaves this blank for unplanned rows
        frappe.db.set_value(LEDGER, n, vals, update_modified=False)


# --------------------------------------------------------------------------
# Task: unplanned table validation   (Task.validate)
# --------------------------------------------------------------------------
def validate_unplanned_rows(doc, method=None):
    rows = doc.get(UNPLANNED_FIELD) or []
    seen = set()
    revisions = []  # [CHG-1]
    for r in rows:
        if not r.item:
            continue
        if r.item in seen:  # uniqueness for current scope = Task + Item
            frappe.throw(_("Row {0}: Item {1} is already in Unplanned Items for this IRPO.").format(r.idx, r.item))
        seen.add(r.item)

        existing = r.name and frappe.db.get_value(
            UNPLANNED_DT, r.name,
            ["item", "unplanned_row_ref", "uom", "qty", "irpo_available_qty", "irpo_mr_pending_qty",
             "irpo_po_pending_qty", "irpo_pr_qty", "irpo_pi_actual_qty"], as_dict=True  # [CHG-1] + qty, available
        )
        if existing:
            if existing.item != r.item:
                frappe.throw(_("Row {0}: Item cannot be changed once the row exists. Add a new row instead.").format(r.idx))
            # [CHG-1] QTY is increase-only; compare with the DB value, not the posted form
            controlled = sum(flt(existing[f]) for f in SUMMARY_FIELD.values())
            try:
                diff = check_qty_edit(existing.qty, r.get("qty"), controlled)
            except UnplannedQtyError as e:
                frappe.throw(_("Row {0}: {1}").format(r.idx, str(e)))
            if diff > TOL:
                revisions.append({
                    "row_name": r.name, "ref": existing.unplanned_row_ref, "item": r.item,
                    "item_name": r.get("item_name") or frappe.db.get_value("Item", r.item, "item_name"),
                    "uom": existing.uom, "old": flt(existing.qty), "new": flt(r.get("qty")),
                    "diff": diff, "avail_before": flt(existing.irpo_available_qty),
                })
            # system-owned fields: never trust values posted back from a stale form
            r.update({k: existing[k] for k in ("unplanned_row_ref", "uom", "irpo_mr_pending_qty", "irpo_po_pending_qty", "irpo_pr_qty", "irpo_pi_actual_qty")})
        else:
            r.uom = r.uom or frappe.db.get_value("Item", r.item, "stock_uom")
            for f in SUMMARY_FIELD.values():
                r.set(f, 0)
        if not r.unplanned_row_ref:  # also covers legacy rows saved before this hook existed
            r.unplanned_row_ref = make_autoname(REF_SERIES)
        if _has("irpo_available_qty"):
            r.irpo_available_qty = available_qty(
                r.get("qty"), {stage: r.get(field) for stage, field in SUMMARY_FIELD.items()})

    before = doc.get_doc_before_save()  # never lose audit history (spec section 9)
    if before:
        kept = {r.name for r in rows}
        for old in before.get(UNPLANNED_FIELD) or []:
            if old.name not in kept and frappe.db.exists(LEDGER, {"irpo_unplanned_row_ref": old.unplanned_row_ref}):
                frappe.throw(_("Unplanned row for {0} has ledger history and cannot be removed.").format(old.item))
    doc.flags.irpo_upl_revisions = revisions  # [CHG-1] picked up by log_unplanned_revisions (on_update)


def log_unplanned_revisions(doc, method=None):  # [CHG-5]  Task.on_update
    """One ledger row + one Activity comment per QTY increase. The flag is popped, so a
    repeated hook in the same save cannot duplicate the entry."""
    revisions = doc.flags.pop("irpo_upl_revisions", None) or []
    if not revisions:
        return
    project, boq_code, company = frappe.db.get_value("Task", doc.name, ["project", "cpc_boq_code", "company"])
    for rv in revisions:
        st = _state(rv["ref"])
        rev_no = frappe.db.count(LEDGER, {"irpo_unplanned_row_ref": rv["ref"], "event_type": EV_REVISION}) + 1
        led = _insert_ledger({
            "doctype": LEDGER, "irpo": doc.name, "project": project, "boq_code": boq_code, "company": company,
            "posting_date": nowdate(), "item": rv["item"], "item_name": rv["item_name"],
            "stage": "IRPO Available", "created_from_stage": "Manual Adjustment", "event_type": EV_REVISION,
            "revision_no": rev_no, "voucher_type": "Task", "voucher_no": doc.name, "voucher_detail_no": rv["row_name"],
            "qty": rv["diff"], "uom": rv["uom"], "transaction_qty": rv["diff"], "transaction_uom": rv["uom"],
            "conversion_factor": 1, "is_unplanned": 1, "irpo_unplanned_row_ref": rv["ref"],
            "remarks": _("Unplanned Qty revised from {0} to {1} {2}").format(rv["old"], rv["new"], rv["uom"]),
        })
        _stamp_snapshots([led.name], rv["ref"], rv["old"], rv["avail_before"])
        _task_comment(doc.name, (
            "<b>Unplanned Item Qty Revised</b><br>Item: {item} - {name}<br>Unplanned Row Ref: {ref}<br>"
            "Source: Task ({task})<br>Total Qty: {old:g} &rarr; {new:g} {uom}<br>Change: +{diff:g} {uom}<br>"
            "IRPO Available Qty: {ab:g} &rarr; {aa:g} {uom}<br>Updated By: {user}").format(
                item=rv["item"], name=rv["item_name"], ref=rv["ref"], task=doc.name, old=rv["old"],
                new=rv["new"], uom=rv["uom"], diff=rv["diff"], ab=rv["avail_before"],
                aa=flt(st.irpo_available_qty), user=frappe.session.user))


# --------------------------------------------------------------------------
# Material Request: resolve planned vs unplanned   (validate + on_update)
# --------------------------------------------------------------------------
@frappe.whitelist()
def check_item_planned(task, item_code):
    """Client helper for the 'Unplanned Item / Service' info message."""
    rows = _planned_rows(task, item_code)
    return {
        "planned": len(rows) == 1,
        "ambiguous": len(rows) > 1,
        "budget_row_ref": rows[0].name if len(rows) == 1 else None,
    }


def resolve_irpo_lines(doc, method=None):
    """Direct-MR flow. Never blocks an unplanned item; only fixes references."""
    for row in doc.get("items") or []:
        task = _task(row)
        if not task:
            continue
        task_doc = validate_irpo_is_usable(task, project=row.get("project") or doc.get("custom_project"))
        if not row.get("project"):
            row.project = task_doc.project
        row.task = task

        uref = row.get("cpc_irpo_unplanned_row_ref")
        if uref and not frappe.db.exists(UNPLANNED_DT, {"unplanned_row_ref": uref, "parent": task, "item": row.item_code}):
            row.cpc_irpo_unplanned_row_ref = None  # task/item changed after the ref was stamped -> re-resolve
            uref = None
        pref = row.get("cpc_irpo_budget_row_ref")
        if pref and not frappe.db.exists(PLANNED_DT, {"name": pref, "parent": task, "item": row.item_code}):
            row.cpc_irpo_budget_row_ref = None  # stale: Task or Item changed after the ref was stamped
            pref = None
        if uref or pref:
            continue

        planned = _planned_rows(task, row.item_code)
        if len(planned) == 1:  # planned item: reuse the existing row reference
            row.cpc_irpo_budget_row_ref = planned[0].name
        elif len(planned) > 1:
            frappe.throw(_("Row {0}: Item {1} appears on several planned rows of {2}. Create this MR from the Task so the exact planned row is carried.").format(row.idx, row.item_code, task))
        # 0 planned rows => unplanned candidate; Task row is created after save (no ghost rows)


def get_or_create_unplanned_row(task, item):
    cond = {"parent": task, "parenttype": "Task", "parentfield": UNPLANNED_FIELD, "item": item}
    row = frappe.db.get_value(UNPLANNED_DT, cond, ["name", "unplanned_row_ref"], as_dict=True)
    if row and row.unplanned_row_ref:
        return row.unplanned_row_ref

    frappe.db.sql("select name from `tabTask` where name=%s for update", task)  # serialise concurrent first-use
    row = frappe.db.get_value(UNPLANNED_DT, cond, ["name", "unplanned_row_ref"], as_dict=True)
    if row:
        if row.unplanned_row_ref:
            return row.unplanned_row_ref
        ref = make_autoname(REF_SERIES)  # row exists without a ref: stamp it, do not duplicate
        frappe.db.set_value(UNPLANNED_DT, row.name, "unplanned_row_ref", ref, update_modified=False)
        return ref

    item_name, uom = frappe.db.get_value("Item", item, ["item_name", "stock_uom"])
    values = {
        "doctype": UNPLANNED_DT, "parent": task, "parenttype": "Task", "parentfield": UNPLANNED_FIELD,
        "idx": frappe.db.count(UNPLANNED_DT, {"parent": task, "parentfield": UNPLANNED_FIELD}) + 1,
        "item": item, "item_name": item_name, "uom": uom,
        "unplanned_row_ref": make_autoname(REF_SERIES),
    }
    if _has("qty"):
        values["qty"] = 0  # "no expected qty entered"; also satisfies the field if it is still marked mandatory
    child = frappe.get_doc(values)
    child.insert(ignore_permissions=True)
    return child.unplanned_row_ref


def ensure_unplanned_rows(doc, method=None):
    """MR.on_update: create/reuse the Task row only AFTER the MR saved."""
    if doc.docstatus == 2:
        return
    for row in doc.get("items") or []:
        task = _task(row)
        if not task or row.get("cpc_irpo_budget_row_ref") or row.get("cpc_irpo_unplanned_row_ref"):
            continue
        ref = get_or_create_unplanned_row(task, row.item_code)
        row.cpc_irpo_unplanned_row_ref = ref
        frappe.db.set_value(ITEM_DT[doc.doctype], row.name, "cpc_irpo_unplanned_row_ref", ref, update_modified=False)


# --------------------------------------------------------------------------
# PO / PR / PI: carry the unplanned ref forward
# (PO: before_validate, PR/PI: validate -- same timing as carry_forward_irpo_fields)
# --------------------------------------------------------------------------
_SOURCES = {
    "Purchase Order": [("material_request_item", "Material Request Item")],
    "Purchase Receipt": [("purchase_order_item", "Purchase Order Item")],
    "Purchase Invoice": [("pr_detail", "Purchase Receipt Item"), ("po_detail", "Purchase Order Item")],
}


def _po_source_mr_item(row):
    if row.get("material_request_item"):
        return row.material_request_item
    if row.get("supplier_quotation_item"):  # MR -> RFQ -> SQ -> PO hop
        return frappe.db.get_value("Supplier Quotation Item", row.supplier_quotation_item, "material_request_item")


def _source_info(doc, row):
    """(source row values or None, has_mr, has_po, has_pr)"""
    dt = doc.doctype
    has_mr = has_po = has_pr = False
    src = None
    if dt == "Purchase Order":
        mri = _po_source_mr_item(row)
        has_mr = bool(mri)
        if mri:
            src = frappe.db.get_value("Material Request Item", mri, ["cpc_irpo_unplanned_row_ref", "task"], as_dict=True)
    else:
        for fld, src_dt in _SOURCES.get(dt, []):
            name = row.get(fld)
            if not name:
                continue
            has_pr = has_pr or src_dt == "Purchase Receipt Item"
            has_po = has_po or src_dt == "Purchase Order Item"
            src = src or frappe.db.get_value(src_dt, name, ["cpc_irpo_unplanned_row_ref", "task"], as_dict=True)
    return src, has_mr, has_po, has_pr


def carry_forward_unplanned(doc, method=None):
    for row in doc.get("items") or []:
        if row.get("cpc_irpo_unplanned_row_ref"):
            continue
        src, *_flags = _source_info(doc, row)
        if src and src.cpc_irpo_unplanned_row_ref:
            row.cpc_irpo_unplanned_row_ref = src.cpc_irpo_unplanned_row_ref
            if not row.get("task") and src.task:
                row.task = src.task


# --------------------------------------------------------------------------
# Ledger posting   (on_submit / on_cancel for MR, PO, PR, PI)
# --------------------------------------------------------------------------
def _ledger_values(doc, row, ref_info, stage, signed_qty, event_type):
    task = _task(row)
    return {
        "doctype": LEDGER, "irpo": task,
        "project": frappe.db.get_value("Task", task, "project"),
        "boq_code": frappe.db.get_value("Task", task, "cpc_boq_code"),
        "company": doc.company,
        "posting_date": doc.get("posting_date") or doc.get("transaction_date") or nowdate(),
        "item": row.item_code, "item_name": ref_info.item_name, "irpo_item_type": ref_info.irpo_item_type,
        "stage": stage, "created_from_stage": CREATED_FROM[doc.doctype], "event_type": event_type,
        "voucher_type": doc.doctype, "voucher_no": doc.name, "voucher_detail_no": row.name,
        "qty": signed_qty, "uom": ref_info.uom,
        "transaction_qty": flt(row.qty), "transaction_uom": row.get("uom"),
        "conversion_factor": flt(row.get("conversion_factor") or 1),
        "is_unplanned": 1, "irpo_unplanned_row_ref": row.cpc_irpo_unplanned_row_ref,
    }


def _insert_ledger(values):
    led = frappe.get_doc(values)
    prev = frappe.flags.get("irpo_ledger_allow_insert")
    frappe.flags.irpo_ledger_allow_insert = True  # existing gate on the immutable ledger
    try:
        led.insert(ignore_permissions=True)
    finally:
        frappe.flags.irpo_ledger_allow_insert = prev
    return led


def post_unplanned(doc, method=None):
    # [CHG-2] a Task-based MR draws from Available; every other MR is a Direct MR
    is_task_mr = doc.doctype == "Material Request" and cint(doc.get("is_created_from_task"))
    for row in _unplanned_lines(doc):
        ref = row.cpc_irpo_unplanned_row_ref
        _lock_ref(ref)
        if frappe.db.exists(LEDGER, {
            "voucher_type": doc.doctype, "voucher_no": doc.name, "voucher_detail_no": row.name,
            "is_unplanned": 1, "is_cancelled": 0, "reversal_of": ["is", "not set"],
        }):
            continue  # idempotent

        info = frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, ["item_name", "irpo_item_type", "uom"], as_dict=True)
        _src, has_mr, has_po, has_pr = _source_info(doc, row)
        src_stage = source_stage_for(doc.doctype, has_mr, has_po, has_pr)
        balance = _stage_balance(ref, src_stage) if src_stage else 0

        # [CHG-2] new quantity (Direct MR, or the part of a PO/PR/PI larger than its source) raises QTY
        before = _state(ref)
        qty_before, avail_before = flt(before.qty), flt(before.irpo_available_qty)
        added = 0.0 if is_task_mr else fresh_qty(_row_qty(row), src_stage, balance)
        if added > TOL:
            frappe.db.set_value(UNPLANNED_DT, before.name, "qty", qty_before + added, update_modified=False)
        direct_mr = doc.doctype == "Material Request" and added > TOL
        event = EV_ADDED_MR if direct_mr else EVENT[doc.doctype]

        names, dest = [], None
        for stage, signed in plan_stage_rows(STAGE[doc.doctype], src_stage, _row_qty(row), balance):
            led = _insert_ledger(_ledger_values(doc, row, info, stage, signed, event))
            names.append(led.name)
            if signed > 0:
                dest = led.name
        refresh_unplanned_row_summary(ref)

        # [CHG-2] snapshot + record how much this row added to QTY (needed to undo it on cancel)
        extra = {dest: {"unplanned_qty_added": added}} if dest and added > TOL else None
        _stamp_snapshots(names, ref, qty_before, avail_before, extra)
        if direct_mr:
            after = _state(ref)
            _task_comment(before.parent, (
                "<b>Unplanned Item Qty Added</b><br>Item: {item} - {name}<br>Unplanned Row Ref: {ref}<br>"
                "Source: Material Request<br>Voucher: {mr}<br>Qty Added: +{q:g} {uom}<br>"
                "Total Unplanned Qty: {tb:g} &rarr; {ta:g}<br>MR Pending Qty: {mb:g} &rarr; {ma:g}<br>"
                "IRPO Available Qty: {ab:g} &rarr; {aa:g}<br>By: {user}").format(
                    item=row.item_code, name=info.item_name, ref=ref, mr=doc.name, q=added, uom=info.uom,
                    tb=qty_before, ta=flt(after.qty), mb=flt(before.irpo_mr_pending_qty),
                    ma=flt(after.irpo_mr_pending_qty), ab=avail_before, aa=flt(after.irpo_available_qty),
                    user=frappe.session.user))


def reverse_unplanned(doc, method=None):
    originals = frappe.get_all(
        LEDGER,
        filters={"voucher_type": doc.doctype, "voucher_no": doc.name, "is_unplanned": 1,
                 "is_cancelled": 0, "reversal_of": ["is", "not set"]},
        pluck="name",
    )
    refs = set()
    for name in originals:
        o = frappe.get_doc(LEDGER, name)
        refs.add(o.irpo_unplanned_row_ref)
        _lock_ref(o.irpo_unplanned_row_ref)
        _insert_ledger({
            "doctype": LEDGER, "irpo": o.irpo, "project": o.project, "boq_code": o.boq_code, "company": o.company,
            "posting_date": nowdate(), "item": o.item, "item_name": o.item_name, "irpo_item_type": o.irpo_item_type,
            "stage": o.stage, "created_from_stage": o.created_from_stage, "event_type": "Cancel",
            "voucher_type": o.voucher_type, "voucher_no": o.voucher_no, "voucher_detail_no": o.voucher_detail_no,
            "qty": -flt(o.qty), "uom": o.uom, "transaction_qty": -flt(o.transaction_qty),
            "transaction_uom": o.transaction_uom, "conversion_factor": o.conversion_factor,
            "is_unplanned": 1, "irpo_unplanned_row_ref": o.irpo_unplanned_row_ref, "reversal_of": o.name,
        })
        frappe.db.set_value(LEDGER, o.name, "is_cancelled", 1, update_modified=False)
    for ref in refs:
        refresh_unplanned_row_summary(ref)
    _finalize_cancel(doc)  # [CHG-3]


def _finalize_cancel(doc):  # [CHG-3]
    """Runs after the planned engine's mr_on_cancel / po_on_cancel... AND our own reversal above,
    so it sees every reversal row. Lowers QTY by what the cancelled voucher had added, stamps the
    snapshot, and gives engine-made reversal rows (blank event_type) the 'Cancel' event."""
    rows = frappe.get_all(
        LEDGER,
        filters={"voucher_type": doc.doctype, "voucher_no": doc.name, "is_unplanned": 1,
                 "reversal_of": ["is", "set"], "snapshot_captured": 0},
        fields=["name", "reversal_of", "irpo_unplanned_row_ref as ref"], order_by="creation asc",
    )
    by_ref = {}
    for r in rows:
        by_ref.setdefault(r.ref, []).append(r)
    for ref, rs in by_ref.items():
        _lock_ref(ref)
        before = _state(ref)
        qty_before, avail_before = flt(before.qty), flt(before.irpo_available_qty)
        lowered = 0.0
        if LOWER_TOTAL_ON_CANCEL:
            for r in rs:
                orig = frappe.db.get_value(LEDGER, r.reversal_of, ["unplanned_qty_added", "total_reversed"], as_dict=True)
                if orig and flt(orig.unplanned_qty_added) > TOL and not orig.total_reversed:
                    lowered += flt(orig.unplanned_qty_added)
                    frappe.db.set_value(LEDGER, r.reversal_of, "total_reversed", 1, update_modified=False)
        if lowered > TOL:
            try:
                new_total = lowered_total(qty_before, lowered, sum(flt(_balances(ref).get(s)) for s in SUMMARY_FIELD))
            except UnplannedQtyError as e:
                frappe.throw(_("Unplanned Row {0}: {1}").format(ref, str(e)))
            frappe.db.set_value(UNPLANNED_DT, before.name, "qty", new_total, update_modified=False)
        refresh_unplanned_row_summary(ref)
        _stamp_snapshots([r.name for r in rs], ref, qty_before, avail_before, fix_event=True)
        if lowered > TOL:
            after = _state(ref)
            _task_comment(before.parent, (
                "<b>Unplanned Item Qty Reversed</b> ({dt} {no} cancelled)<br>Item: {item} - {name} ({ref})<br>"
                "Total Unplanned Qty: {tb:g} &rarr; {ta:g}").format(
                    dt=doc.doctype, no=doc.name, item=before.item, name=before.item_name, ref=ref,
                    tb=qty_before, ta=flt(after.qty)))


def refresh_unplanned_row_summary(ref):
    balances = dict(frappe.db.sql(
        "select stage, sum(qty) from `tabIRPO Quantity Ledger` where irpo_unplanned_row_ref=%s group by stage", ref))
    values = summary_from_balances(balances)
    if _has("irpo_available_qty"):
        qty = frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, "qty") if _has("qty") else 0
        values["irpo_available_qty"] = available_qty(qty, balances)
    frappe.db.set_value(UNPLANNED_DT, {"unplanned_row_ref": ref}, values, update_modified=False)


def snapshot_ledger_item_info(doc, method=None):
    """IRPO Quantity Ledger.before_insert: copy Item Name + IRPO Item Type as a
    historical snapshot for BOTH planned and unplanned rows, so the existing
    planned posting code (create_ledger_row) does not need to change."""
    info = None
    if doc.get("irpo_unplanned_row_ref"):
        doc.is_unplanned = 1
        info = frappe.db.get_value(UNPLANNED_DT, {"unplanned_row_ref": doc.irpo_unplanned_row_ref}, ["item_name", "irpo_item_type"], as_dict=True)
    elif doc.get("irpo_budget_row_ref"):
        doc.is_unplanned = 0
        info = frappe.db.get_value(PLANNED_DT, {"name": doc.irpo_budget_row_ref, "parent": doc.irpo}, ["item_name", "irpo_item_type"], as_dict=True)
    if not doc.get("item_name"):
        doc.item_name = (info and info.item_name) or frappe.db.get_value("Item", doc.item, "item_name")
    if not doc.get("irpo_item_type") and info:
        doc.irpo_item_type = info.irpo_item_type


# --------------------------------------------------------------------------
# [CHG-4] Task-based MR may only use IRPO Available Qty   (MR.before_submit)
# --------------------------------------------------------------------------
def validate_task_mr_available(doc, method=None):
    if doc.doctype != "Material Request" or not cint(doc.get("is_created_from_task")):
        return
    need = {}
    for r in _unplanned_lines(doc):
        need[r.cpc_irpo_unplanned_row_ref] = need.get(r.cpc_irpo_unplanned_row_ref, 0) + _row_qty(r)
    for ref, qty in need.items():
        _lock_ref(ref)
        st = _state(ref)
        try:
            check_consumption(qty, available_qty(st.qty, _balances(ref)))
        except UnplannedQtyError as e:
            frappe.throw(_("Unplanned Row {0} ({1}): {2}").format(ref, st.item, str(e)))


# --------------------------------------------------------------------------
# Budget warning (never throws)   (before_submit for MR, PO, PR, PI)
# --------------------------------------------------------------------------
def get_irpo_amount_position(task, company=None, exclude_voucher=None):
    """Same helpers the planned flow uses, so both warnings agree."""
    budget = flt(frappe.db.get_value("Task", task, "cpc_budget_amount"))
    return budget, flt(get_committed_amount(task, exclude_voucher=exclude_voucher)), flt(get_actual_amount(task, company))


def warn_unplanned_budget(doc, method=None):
    _install_budget_wrapper()
    lines = _unplanned_lines(doc)
    if not lines:
        return
    per_task = {}
    for r in lines:
        per_task[_task(r)] = per_task.get(_task(r), 0) + (flt(r.get("amount")) or flt(r.get("qty")) * flt(r.get("rate")))

    parts = [_("This document contains Unplanned Items / Services. Their cost is tracked against the IRPO but is not hard-blocked by the planned budget.")]
    for task, amt in per_task.items():
        budget, committed, actual = get_irpo_amount_position(task, doc.get("company"), doc.name)
        if amt and budget:
            over = max(0.0, committed + actual + amt - budget)
            parts.append(_("<b>{0}</b>: IRPO Budget {1} | Committed (open PO) {2} | Actual (GL) {3} | This Unplanned Amount {4} | Expected Overrun {5}").format(
                task, fmt_money(budget), fmt_money(committed), fmt_money(actual), fmt_money(amt), fmt_money(over)))
        else:
            parts.append(_("<b>{0}</b>: amount not available yet - this unplanned item may impact the approved IRPO budget.").format(task))
    frappe.msgprint("<br>".join(parts), title=_("Unplanned Item / Budget Override"), indicator="orange")


# --------------------------------------------------------------------------
# Native ERPNext Budget: stop must not block unplanned-only spend
# --------------------------------------------------------------------------
def _gl_is_unplanned_only(args):
    dt = ITEM_DT.get(args.get("voucher_type"))
    task = args.get("cpc_irpo") or args.get("task")
    if not (dt and args.get("voucher_no") and task):
        return False
    rows = frappe.db.sql(
        f"select ifnull(cpc_irpo_budget_row_ref,''), ifnull(cpc_irpo_unplanned_row_ref,'') from `tab{dt}` where parent=%s and task=%s",
        (args.voucher_no, task))
    return is_unplanned_only(rows)


def _is_unplanned_budget_context(args):
    """GL entries (PR/PI) carry voucher_type/voucher_no: decide per voucher.
    MR/PO budget checks (buying_controller.validate_budget) pass the item row itself:
    decide per line, so a mixed MR/PO keeps full control of its planned lines."""
    if args.get("voucher_type"):
        return _gl_is_unplanned_only(args)
    return bool(args.get("cpc_irpo_unplanned_row_ref")) and not args.get("cpc_irpo_budget_row_ref")


def _install_budget_wrapper():
    """ERPNext checks the Budget in two places that import the function separately:
    general_ledger (PR/PI, per GL entry) and buying_controller (MR/PO, per item row).
    Both are wrapped. A BudgetError is downgraded to a warning only for unplanned spend;
    planned lines (and mixed GL vouchers) stay fully controlled (spec 6.2)."""
    from erpnext.accounts import general_ledger as gl
    from erpnext.accounts.doctype.budget.budget import BudgetError
    from erpnext.controllers import buying_controller as bc

    def make(original):
        def wrapped(args, expense_amount=0):
            try:
                return original(args, expense_amount)
            except BudgetError as e:
                if not _is_unplanned_budget_context(frappe._dict(args)):
                    raise
                frappe.clear_last_message()
                frappe.msgprint(str(e), indicator="orange", title=_("Budget Exceeded (Unplanned Item)"))
        wrapped._irpo_wrapped = True
        return wrapped

    for module in (gl, bc):
        if not getattr(module.validate_expense_against_budget, "_irpo_wrapped", False):
            module.validate_expense_against_budget = make(module.validate_expense_against_budget)


# --------------------------------------------------------------------------
# Route B: Task > Unplanned Items > Create Material Request
# --------------------------------------------------------------------------
@frappe.whitelist()
def make_material_request_from_unplanned(task, rows=None):
    rows = frappe.parse_json(rows) if rows else None
    t = validate_irpo_is_usable(task)
    mr = frappe.new_doc("Material Request")
    mr.material_request_type = "Purchase"
    mr.custom_project = t.project
    mr.task = t.name
    mr.is_created_from_task = 1
    mr.transaction_date = nowdate()
    mr.schedule_date = add_days(nowdate(), 7)
    mr.company = frappe.db.get_value("Project", t.project, "company") or frappe.defaults.get_user_default("Company")
    for r in t.get(UNPLANNED_FIELD) or []:
        if rows and r.name not in rows:
            continue
        # [CHG-6] a Task-based MR draws from Available only (the qty-1 fallback for rows
        # with no expected qty is removed: it would be rejected at submit by CHG-4)
        qty = flt(r.get("irpo_available_qty"))
        if qty <= 0:
            continue
        mr.append("items", {
            "item_code": r.item, "item_name": r.item_name, "uom": r.uom, "stock_uom": r.uom, "qty": qty,
            "schedule_date": mr.schedule_date, "project": t.project, "task": t.name, "cpc_irpo": t.name,
            "cpc_irpo_unplanned_row_ref": r.unplanned_row_ref, "expense_account": t.account, "custom_irpo_item_type":r.irpo_item_type,
        })
    if not mr.items:
        frappe.throw(_("No Unplanned Items with available quantity remain on IRPO {0}. Nothing to request. Use a direct Material Request to add new quantity.").format(task))
    return mr