

import os
import datetime as dt
from io import BytesIO

import frappe
from frappe import _
from frappe.utils import flt, getdate
from frappe.utils.csvutils import read_csv_content
from frappe.utils import flt, getdate, nowdate
from erpnext.accounts.utils import get_fiscal_year
from cpc_construction_management.cpc_construction_management.budget.irpo_budget_revision import (
    process_budget_qty_revisions,
)


# ---------------------------------------------------------------------
# Validation Hook: Enforce the "IRPO is always a leaf" rule
# ---------------------------------------------------------------------

def validate_irpo_task(doc, method=None):
    """
    doc_events hook on Task.validate
    Enforces:
      - BOQ Node: is_group = 1, cpc_is_irpo = 0
      - IRPO: is_group = 0, cpc_is_irpo = 1, must have BOQ Node as parent, UOM required
      - Unique IRPO code per project
    """
    node_type = doc.get("cpc_node_type")
    if not node_type:
        return

    if node_type == "IRPO":
        # An IRPO is always a leaf activity
        doc.is_group = 0
        doc.cpc_is_irpo = 1

        # Check existing children in DB
        if not doc.is_new():
            has_children = frappe.db.exists("Task", {"parent_task": doc.name})
            if has_children:
                frappe.throw(
                    _("{0} is an IRPO and must remain a leaf activity — it cannot have child tasks.")
                    .format(frappe.bold(doc.subject or doc.name))
                )

        if not doc.parent_task:
            frappe.throw(_("An IRPO must have a Parent Task (its BOQ Node)."))

        parent_node_type = frappe.db.get_value("Task", doc.parent_task, "cpc_node_type")
        if parent_node_type != "BOQ Node":
            frappe.throw(
                _("Parent Task {0} is not a BOQ Node. IRPOs must sit directly under a BOQ Node.")
                .format(frappe.bold(doc.parent_task))
            )

        if not doc.get("cpc_uom"):
            frappe.throw(_("UoM is required on an IRPO activity."))

        if not doc.get("account"):
            frappe.throw(_("Account is required on an IRPO activity."))

        _recalculate_available_qty(doc)
        process_budget_qty_revisions(doc)

    elif node_type == "BOQ Node":
        doc.is_group = 1
        doc.cpc_is_irpo = 0

    # Ensure IRPO code is unique within the project
    if doc.get("cpc_irpo_code") and doc.get("project"):
        clash = frappe.db.exists(
            "Task",
            {
                "cpc_irpo_code": doc.cpc_irpo_code,
                "project": doc.project,
                "name": ["!=", doc.name],
            },
        )
        if clash:
            frappe.throw(
                _("IRPO Code {0} is already used in project {1} (Task: {2}).")
                .format(frappe.bold(doc.cpc_irpo_code), frappe.bold(doc.project), clash)
            )


def _recalculate_available_qty(doc):
    """
    UAT Issue 4 fix. Plain formula recompute on EVERY Task save — no
    dependency on any MR/PO/PR/PI existing:

        irpo_available_qty =
            qty - irpo_mr_pending_qty - irpo_po_pending_qty
                - irpo_pr_qty - irpo_pi_actual_qty

    On a fresh row the four bucket fields are still their default 0,
    so this alone yields Available = Budget Qty — no transaction
    needed. Only irpo_available_qty is written here; the four bucket
    fields are read as-is and never touched, so this can never
    conflict with irpo_summary_refresh.refresh_irpo_child_row_summary
    (the sole writer of the bucket fields, via direct
    frappe.db.set_value calls off real ledger movement on MR/PO/PR/PI
    submit/cancel).
    """
    for row in doc.get("custom_items_table") or []:
        qty = flt(row.get("qty"))
        mr_pending = flt(row.get("irpo_mr_pending_qty"))
        po_pending = flt(row.get("irpo_po_pending_qty"))
        pr_qty = flt(row.get("irpo_pr_qty"))
        pi_actual = flt(row.get("irpo_pi_actual_qty"))
        row.irpo_available_qty = qty - mr_pending - po_pending - pr_qty - pi_actual


# ---------------------------------------------------------------------
# Source-line lookup for BOQ / Sales Order
# ---------------------------------------------------------------------

def get_boq_line_source(sales_order, boq_code):
    """
    Returns the fields an IRPO/BOQ Node must fetch from the source line:
    {
        "project": ...,
        "contract": ...,
        "boq_code": ...,        # generated Item Code (matches Sales Order Item.item_code) —
                                 # kept under this name for backward compatibility with every
                                 # caller/dialog that already passes/expects an Item Code here.
        "real_boq_code": ...,   # the actual Contract BOQ Code (Item.cpc_boq_code) — THIS is
                                 # what gets stored in Task.cpc_boq_code and used to match/
                                 # filter Task and Contract BOQ Item rows from here on.
        "boq_description": ...,
        "default_uom": ...,
    }
    """
    so = frappe.db.get_value(
        "Sales Order", sales_order, ["project", "cpc_contract"], as_dict=True
    )
    if not so:
        frappe.throw(_("Sales Order {0} not found.").format(sales_order))

    item_row = frappe.db.get_value(
        "Sales Order Item",
        {"parent": sales_order, "item_code": boq_code},
        ["item_code", "item_name", "description", "uom"],
        as_dict=True,
    )
    if not item_row:
        frappe.throw(
            _("Could not find BOQ line {0} on Sales Order {1}.").format(boq_code, sales_order)
        )

    if not so.project:
        frappe.throw(_("Sales Order {0} has no Project set.").format(sales_order))

    real_boq_code = frappe.db.get_value("Item", boq_code, "cpc_boq_code") or boq_code

    return {
        "project": so.project,
        "contract": so.cpc_contract,
        "boq_code": boq_code,
        "real_boq_code": real_boq_code,
        "boq_description": item_row.description or item_row.item_name,
        "default_uom": item_row.uom,
    }


# ---------------------------------------------------------------------
# Project / Sales Order resolution for BOQ Node / IRPO Tasks
# ---------------------------------------------------------------------

def resolve_task_project(task=None, project=None, sales_order=None, contract=None):
    """Resolve the Project a BOQ Node / IRPO Task belongs to.

    Resolution order (first non-empty wins):
      1. the explicitly passed ``project``
      2. the Task's own ``project``
      3. the parent BOQ Node's ``project``
      4. the Project of the linked Sales Order (``cpc_sales_order``)
      5. the Project of the linked Construction Contract (``cpc_contract``)
      6. the Project of any submitted Sales Order for that contract

    Returns the project name or ``None``.  Never throws — callers decide
    whether a missing project is fatal.
    """
    if project:
        return project

    if task is not None:
        if task.get("project"):
            return task.project
        if task.get("cpc_sales_order"):
            sales_order = task.cpc_sales_order
        if task.get("cpc_contract"):
            contract = task.cpc_contract
        if task.get("parent_task"):
            parent_project = frappe.db.get_value("Task", task.parent_task, "project")
            if parent_project:
                return parent_project

    if sales_order and frappe.db.exists("Sales Order", sales_order):
        so_project = frappe.db.get_value("Sales Order", sales_order, "project")
        if so_project:
            return so_project

    if contract and frappe.db.exists("Construction Contract", contract):
        contract_project = frappe.db.get_value("Construction Contract", contract, "project")
        if contract_project:
            return contract_project

    if contract:
        fallback = frappe.db.get_value(
            "Sales Order",
            {"docstatus": 1, "cpc_contract": contract, "project": ["is", "set"]},
            "project",
            order_by="creation asc",
        )
        if fallback:
            return fallback

    return None


def backfill_task_project(task_name, persist=True):
    """Fill in a blank ``Task.project`` from the Task's own contract/SO links.

    Returns the resolved project name (or ``None``).  When ``persist`` is set
    and a project was resolved for a Task that had none, the value is written
    back to the database so the Task form, exports and API payloads all agree.
    """
    task = frappe.get_doc("Task", task_name) if isinstance(task_name, str) else task_name
    if not task:
        return None

    if task.get("project"):
        return task.project

    project = resolve_task_project(task=task)
    if project and persist:
        frappe.db.set_value("Task", task.name, "project", project, update_modified=False)
        task.project = project

    return project


def resolve_task_sales_order(task=None, sales_order=None, contract=None):
    """Resolve the Sales Order a BOQ Node / IRPO Task belongs to.

    Resolution order (first non-empty wins):
      1. the explicitly passed ``sales_order``
      2. the Task's own ``cpc_sales_order``
      3. the parent BOQ Node's ``cpc_sales_order``
      4. the Sales Order already used by another Task of the same contract
         (keeps every IRPO under a contract pointing at one consistent SO)
      5. the oldest submitted Sales Order carrying that contract

    Returns the Sales Order name or ``None``.  Never throws — callers decide
    whether a missing Sales Order is fatal.
    """
    if sales_order:
        return sales_order

    if task is not None:
        if task.get("cpc_sales_order"):
            return task.cpc_sales_order
        if task.get("cpc_contract"):
            contract = task.cpc_contract
        if task.get("parent_task"):
            parent_so = frappe.db.get_value("Task", task.parent_task, "cpc_sales_order")
            if parent_so:
                return parent_so

    if not contract:
        return None

    # Prefer a Sales Order this contract's Tasks already reference so a contract
    # with several Sales Orders stays internally consistent.
    already_used = frappe.db.get_value(
        "Task",
        {
            "cpc_contract": contract,
            "cpc_sales_order": ["is", "set"],
            "docstatus": ["<", 2],
            "name": ["!=", task.name] if task else ["is", "set"],
        },
        "cpc_sales_order",
        order_by="creation asc",
    )
    if already_used:
        return already_used

    # Otherwise fall back to the oldest submitted Sales Order for the contract.
    return frappe.db.get_value(
        "Sales Order",
        {"docstatus": 1, "cpc_contract": contract},
        "name",
        order_by="creation asc",
    )


def backfill_task_sales_order(task_name, persist=True):
    """Fill in a blank ``Task.cpc_sales_order`` from the Task's own contract.

    Returns the resolved Sales Order name (or ``None``).  When ``persist`` is
    set and a Sales Order was resolved for a Task that had none, the value is
    written back so the Task form, the viewer and exports all agree.
    """
    task = frappe.get_doc("Task", task_name) if isinstance(task_name, str) else task_name
    if not task:
        return None

    if task.get("cpc_sales_order"):
        return task.cpc_sales_order

    sales_order = resolve_task_sales_order(task=task)
    if sales_order and persist:
        frappe.db.set_value(
            "Task", task.name, "cpc_sales_order", sales_order, update_modified=False
        )
        task.cpc_sales_order = sales_order

    return sales_order


# ---------------------------------------------------------------------
# BOQ Node: get-or-create (idempotent, once per BOQ line)
# ---------------------------------------------------------------------

def get_or_create_boq_node(sales_order, boq_code):
    source = get_boq_line_source(sales_order, boq_code)

    if not source.get("project"):
        frappe.throw(_("BOQ line {0} has no Project to attach the BOQ Node to.").format(boq_code))

    existing = frappe.db.get_value(
        "Task",
        {
            "project": source["project"],
            "cpc_boq_code": source["real_boq_code"],
            "cpc_node_type": "BOQ Node",
        },
        "name",
    )
    if existing:
        return existing

    node = frappe.new_doc("Task")
    node.project = source["project"]
    node.subject = boq_code
    node.description = source.get("boq_description")
    node.is_group = 1
    node.cpc_node_type = "BOQ Node"
    node.cpc_sales_order = sales_order
    node.cpc_contract = source.get("contract")
    node.cpc_boq_code = source["real_boq_code"]
    node.insert()
    return node.name


# ---------------------------------------------------------------------
# Recompute BOQ Budget Fields & Synchronize
# ---------------------------------------------------------------------

def recompute_boq_budget_fields(contract, real_boq_code):
    """
    Calculates cost budget, allocated budget, and remaining budget across all IRPOs.
    Updates the BOQ Node and every IRPO child under it.

    ``real_boq_code`` is the actual Contract BOQ Code (e.g. GROUNDWORK) — the
    same value now stored in Task.cpc_boq_code, and looked up directly
    against Contract BOQ Item's own ``boq_code`` field (Contract BOQ Item
    carries both boq_code and item_code as separate columns).
    """
    cost_budget = 0
    if contract and frappe.db.exists("DocType", "Contract BOQ Item"):
        cost_budget = frappe.db.get_value(
            "Contract BOQ Item",
            {"parent": contract, "boq_code": real_boq_code},
            "cost_budget",
        ) or 0

    allocated = frappe.db.sql(
        """
        SELECT COALESCE(SUM(cpc_budget_amount), 0)
        FROM `tabTask`
        WHERE cpc_contract = %s
          AND cpc_boq_code = %s
          AND cpc_node_type = 'IRPO'
          AND docstatus < 2
        """,
        (contract, real_boq_code),
    )[0][0]

    remaining = flt(cost_budget) - flt(allocated)

    task_names = frappe.get_list(
        "Task",
        filters={"cpc_contract": contract, "cpc_boq_code": real_boq_code, "docstatus": ["<", 2]},
        pluck="name",
    )
    for name in task_names:
        frappe.db.set_value(
            "Task",
            name,
            {
                "cpc_boq_cost_budget": cost_budget,
                "cpc_boq_budget_allocated": allocated,
                "cpc_boq_budget_remaining": remaining,
            },
            update_modified=False,
        )

    return {"cost_budget": cost_budget, "allocated": allocated, "remaining": remaining}


# ---------------------------------------------------------------------
# Shared helpers for the planner (Contract Center) save paths
# ---------------------------------------------------------------------

def _get_project_company(project):
    """Company of the Project — needed to create the native ERPNext Budget."""
    company = frappe.db.get_value("Project", project, "company") if project else None
    if not company:
        frappe.throw(
            _("Project {0} has no Company set — cannot create Budget.").format(project or "-")
        )
    return company


def _enforce_boq_cap(contract, real_boq_code, rows, updating_names=None):
    """Server-side BOQ cost-budget cap, delta based.

    Rows that are being updated are excluded from the existing allocation and
    counted at their new amount, so unchanged rows never double-count. Same
    rule as break_into_irpos (Sales Order > Break IRPO dialog).
    """
    if not contract or not frappe.db.exists("DocType", "Contract BOQ Item"):
        return

    cost_budget = flt(
        frappe.db.get_value(
            "Contract BOQ Item",
            {"parent": contract, "boq_code": real_boq_code},
            "cost_budget",
        )
    )
    if cost_budget <= 0:
        return

    filters_sql = (
        "cpc_contract = %s AND cpc_boq_code = %s AND cpc_node_type = 'IRPO' AND docstatus < 2"
    )
    params = [contract, real_boq_code]
    updating_names = [n for n in (updating_names or []) if n]
    if updating_names:
        placeholders = ", ".join(["%s"] * len(updating_names))
        filters_sql += f" AND name NOT IN ({placeholders})"
        params.extend(updating_names)

    existing_allocated = frappe.db.sql(
        f"SELECT COALESCE(SUM(cpc_budget_amount), 0) FROM `tabTask` WHERE {filters_sql}",
        tuple(params),
    )[0][0]

    new_total = sum(flt(row.get("cpc_budget_amount")) for row in rows)
    projected = flt(existing_allocated) + flt(new_total)

    if projected > cost_budget:
        frappe.throw(
            _("Cannot save IRPOs: Projected total {0} exceeds the BOQ line's cost budget of {1} by {2}.").format(
                frappe.format_value(projected, {"fieldtype": "Currency"}),
                frappe.format_value(cost_budget, {"fieldtype": "Currency"}),
                frappe.format_value(projected - cost_budget, {"fieldtype": "Currency"}),
            )
        )


# ---------------------------------------------------------------------
# Public API: Break a BOQ line into IRPOs
# ---------------------------------------------------------------------

@frappe.whitelist()
def break_into_irpos(sales_order, boq_code, irpos):
    """
    Batch create and/or update IRPOs under one BOQ line with budget cap enforcement.
    """
    frappe.has_permission("Sales Order", "read", sales_order, throw=True)
    frappe.has_permission("Task", "create", throw=True)
    if isinstance(irpos, str):
        irpos = frappe.parse_json(irpos)

    if not irpos:
        frappe.throw(_("Add at least one IRPO row."))

    source = get_boq_line_source(sales_order, boq_code)
    real_boq_code = source["real_boq_code"]
    boq_node = get_or_create_boq_node(sales_order, boq_code)

    company = frappe.db.get_value("Project", source["project"], "company")
    if not company:
        frappe.throw(_("Project {0} has no Company set — cannot create Budget.").format(source["project"]))

    updating_names = [row.get("task_name") for row in irpos if row.get("task_name")]

    # Budget cap check
    cost_budget = 0
    if source.get("contract") and frappe.db.exists("DocType", "Contract BOQ Item"):
        cost_budget = frappe.db.get_value(
            "Contract BOQ Item",
            {"parent": source["contract"], "boq_code": real_boq_code},
            "cost_budget",
        ) or 0

    if cost_budget > 0:
        filters_sql = "cpc_contract = %s AND cpc_boq_code = %s AND cpc_node_type = 'IRPO' AND docstatus < 2"
        params = [source["contract"], real_boq_code]
        if updating_names:
            placeholders = ", ".join(["%s"] * len(updating_names))
            filters_sql += f" AND name NOT IN ({placeholders})"
            params.extend(updating_names)

        existing_allocated = frappe.db.sql(
            f"SELECT COALESCE(SUM(cpc_budget_amount), 0) FROM `tabTask` WHERE {filters_sql}",
            tuple(params),
        )[0][0]

        new_total = sum(flt(row.get("cpc_budget_amount")) for row in irpos)
        projected = flt(existing_allocated) + flt(new_total)

        if projected > cost_budget:
            frappe.throw(
                _("Cannot save IRPOs: Projected total {0} exceeds the BOQ line's cost budget of {1} by {2}.").format(
                    frappe.format_value(projected, {"fieldtype": "Currency"}),
                    frappe.format_value(cost_budget, {"fieldtype": "Currency"}),
                    frappe.format_value(projected - cost_budget, {"fieldtype": "Currency"}),
                )
            )

    created = []
    updated = []

    for row in irpos:
        if not row.get("subject"):
            frappe.throw(_("Every IRPO needs a Subject."))
        if not row.get("cpc_uom"):
            frappe.throw(_("Every IRPO needs a UoM."))

        if not row.get("account"):
            frappe.throw(_("Every IRPO needs an Account."))

        task_name = row.get("task_name")

        if task_name:
            irpo = frappe.get_doc("Task", task_name)
            if irpo.cpc_node_type != "IRPO" or irpo.cpc_boq_code != real_boq_code:
                frappe.throw(_("{0} is not an IRPO under BOQ line {1}.").format(task_name, boq_code))

            irpo.subject = row["subject"]
            irpo.cpc_uom = row["cpc_uom"]
            irpo.cpc_irpo_code = row.get("cpc_irpo_code")
            irpo.exp_start_date = row.get("exp_start_date")
            irpo.exp_end_date = row.get("exp_end_date")
            irpo.cpc_budget_qty = row.get("cpc_budget_qty")
            irpo.cpc_budget_amount = row.get("cpc_budget_amount")
            irpo.account = row.get("account")
            irpo.save()
            updated.append(irpo.name)
        else:
            irpo = frappe.new_doc("Task")
            irpo.project = source["project"]
            irpo.parent_task = boq_node
            irpo.is_group = 0
            irpo.subject = row["subject"]
            irpo.cpc_node_type = "IRPO"
            irpo.cpc_is_irpo = 1
            irpo.cpc_sales_order = sales_order
            irpo.cpc_contract = source.get("contract")
            irpo.cpc_boq_code = real_boq_code
            irpo.cpc_uom = row["cpc_uom"]
            irpo.cpc_irpo_code = row.get("cpc_irpo_code")
            irpo.exp_start_date = row.get("exp_start_date")
            irpo.exp_end_date = row.get("exp_end_date")
            irpo.cpc_budget_qty = row.get("cpc_budget_qty")
            irpo.cpc_budget_amount = row.get("cpc_budget_amount")
            irpo.account = row.get("account")
            irpo.insert()
            created.append(irpo.name)
        sync_budget_for_irpo(irpo.name, irpo.account, flt(irpo.cpc_budget_amount), company)

    # Sync BOQ Node depends_on grid
    if created or updated:
        try:
            node_doc = frappe.get_doc("Task", boq_node)
            existing_dep_tasks = {dep.task for dep in node_doc.get("depends_on", [])}
            touched = False

            for task_id in created:
                if task_id not in existing_dep_tasks:
                    node_doc.append("depends_on", {"task": task_id})
                    touched = True

            if touched:
                node_doc.save()
        except Exception:
            pass

        if source.get("contract"):
            recompute_boq_budget_fields(source["contract"], real_boq_code)

    return {"boq_node": boq_node, "created": created, "updated": updated}


# ---------------------------------------------------------------------
# Helper APIs for Dialogs & Views
# ---------------------------------------------------------------------

@frappe.whitelist()
def get_boq_lines_for_sales_order(sales_order):
    """List BOQ codes available on a Sales Order.

    Returned ``boq_code`` values are the generated Item Codes (matching
    Sales Order Item.item_code) — this is the identifier the dialog/API
    plumbing passes around externally. It is resolved to the real BOQ
    Code internally (get_boq_line_source) wherever Task/Contract BOQ Item
    matching happens, so no client-side change is needed.
    """
    frappe.has_permission("Sales Order", "read", sales_order, throw=True)
    so = frappe.get_doc("Sales Order", sales_order)
    seen = {}
    for item in so.items:
        code = item.item_code
        if code and code not in seen:
            seen[code] = item.description or item.item_name
    return [{"boq_code": k, "description": v} for k, v in seen.items()]


@frappe.whitelist()
def get_boq_budget_summary(sales_order, boq_code):
    """Returns cost budget, allocated budget, remaining budget, and IRPO count for a BOQ line"""
    frappe.has_permission("Sales Order", "read", sales_order, throw=True)
    source = get_boq_line_source(sales_order, boq_code)
    real_boq_code = source["real_boq_code"]
    cost_budget = 0
    if source.get("contract") and frappe.db.exists("DocType", "Contract BOQ Item"):
        cost_budget = frappe.db.get_value(
            "Contract BOQ Item",
            {"parent": source["contract"], "boq_code": real_boq_code},
            "cost_budget",
        ) or 0

    irpo_count, allocated = frappe.db.sql(
        """
        SELECT COUNT(*), COALESCE(SUM(cpc_budget_amount), 0)
        FROM `tabTask`
        WHERE cpc_contract = %s
          AND cpc_boq_code = %s
          AND cpc_node_type = 'IRPO'
          AND docstatus < 2
        """,
        (source["contract"], real_boq_code),
    )[0]

    return {
        "cost_budget": cost_budget,
        "allocated": allocated,
        "remaining": flt(cost_budget) - flt(allocated),
        "irpo_count": irpo_count,
    }


@frappe.whitelist()
def get_boq_summary_for_sales_order(sales_order):
    """Summary table of all BOQ lines on a Sales Order"""
    frappe.has_permission("Sales Order", "read", sales_order, throw=True)
    so = frappe.get_doc("Sales Order", sales_order)
    contract = so.cpc_contract
    seen = {}
    for item in so.items:
        code = item.item_code
        if code and code not in seen:
            seen[code] = item.description or item.item_name

    rows = []
    for boq_code, description in seen.items():
        real_boq_code = frappe.db.get_value("Item", boq_code, "cpc_boq_code") or boq_code

        cost_budget = 0
        if contract and frappe.db.exists("DocType", "Contract BOQ Item"):
            cost_budget = frappe.db.get_value(
                "Contract BOQ Item",
                {"parent": contract, "boq_code": real_boq_code},
                "cost_budget",
            ) or 0

        irpo_count, allocated = frappe.db.sql(
            """
            SELECT COUNT(*), COALESCE(SUM(cpc_budget_amount), 0)
            FROM `tabTask`
            WHERE cpc_contract = %s AND cpc_boq_code = %s AND cpc_node_type = 'IRPO' AND docstatus < 2
            """,
            (contract, real_boq_code),
        )[0]

        rows.append({
            "boq_code": boq_code,
            "description": description,
            "irpo_count": irpo_count,
            "remaining": flt(cost_budget) - flt(allocated),
        })
    return rows


@frappe.whitelist()
def get_irpos_for_boq_line(sales_order, boq_code):
    """Returns existing IRPOs under one BOQ line"""
    frappe.has_permission("Sales Order", "read", sales_order, throw=True)
    source = get_boq_line_source(sales_order, boq_code)
    return frappe.get_list(
        "Task",
        filters={
            "cpc_contract": source["contract"],
            "cpc_boq_code": source["real_boq_code"],
            "cpc_node_type": "IRPO",
            "docstatus": ["<", 2],
        },
        fields=["name", "subject", "cpc_uom", "cpc_budget_qty", "cpc_budget_amount", "account",
                "exp_start_date", "exp_end_date", "cpc_irpo_code", "status", "progress"],
        order_by="creation asc",
    )


# ---------------------------------------------------------------------
# File Upload / Import Parser for IRPOs
# ---------------------------------------------------------------------

XLSX_MAGIC = b"PK\x03\x04"
XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
DATE_COLUMN_INDICES = {2, 3}


def _normalize_date(value):
    if value in (None, ""):
        return ""
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    try:
        return dt.datetime.strptime(str(value).strip(), "%d-%m-%Y").date().isoformat()
    except ValueError:
        return str(value).strip()


def _cell_to_str(cell):
    if cell is None:
        return ""
    if isinstance(cell, dt.datetime):
        return cell.date().isoformat()
    if isinstance(cell, dt.date):
        return cell.isoformat()
    return str(cell)


def _row_to_str_list(row):
    out = []
    for idx, cell in enumerate(row):
        if idx in DATE_COLUMN_INDICES:
            out.append(_normalize_date(cell))
        else:
            out.append(_cell_to_str(cell))
    return out


@frappe.whitelist()
def parse_uploaded_irpo_file(file_url):
    frappe.get_doc("File", {"file_url": file_url}).check_permission("read")
    file_doc = frappe.get_doc("File", {"file_url": file_url})
    content = file_doc.get_content()
    if isinstance(content, str):
        content = content.encode("utf-8")

    if content.startswith(XLSX_MAGIC):
        import openpyxl

        workbook = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
        sheet = workbook.worksheets[0]
        rows = [list(row) for row in sheet.iter_rows(values_only=True)]
        workbook.close()

    elif content.startswith(XLS_MAGIC):
        frappe.throw(_(
            "Legacy .xls files are not supported. Please save as .xlsx in Excel and re-upload."
        ))
    else:
        text = content.decode("utf-8-sig", errors="replace")
        rows = read_csv_content(text)

    return [_row_to_str_list(row) for row in (rows or [])]


# ---------------------------------------------------------------------
# Budget sync for IRPOs
# ---------------------------------------------------------------------

def _create_and_submit_budget(task_name, account, budget_amount, company, fiscal_year):
    budget = frappe.new_doc("Budget")
    budget.budget_against = "Task"
    budget.task = task_name
    budget.company = company
    budget.fiscal_year = fiscal_year

    budget.applicable_on_material_request = 1
    budget.action_if_annual_budget_exceeded_on_mr = "Warn"
    budget.action_if_accumulated_monthly_budget_exceeded_on_mr = "Warn"

    budget.applicable_on_purchase_order = 1
    budget.applicable_on_booking_actual_expenses = 1
    budget.action_if_annual_budget_exceeded = "Warn"
    budget.action_if_accumulated_monthly_budget_exceeded = "Warn"

    budget.append("accounts", {"account": account, "budget_amount": budget_amount})
    budget.insert()

    # If submit fails (e.g. the user lacks Budget submit rights, or the
    # duplicate-Budget check trips) the exception propagates and rolls back
    # the whole action, so an IRPO is never left without an active Budget.
    budget.submit()
    return budget.name


def sync_budget_for_irpo(task_name, account, budget_amount, company):
    """Create and SUBMIT the Budget when the IRPO is first created; keep it in
    sync on edits (e.g. via Get Previous IRPO).

    - No Budget yet            -> create it and submit it.
    - Budget is Draft          -> update in place, leave it Draft (existing
                                  records are deliberately not auto-submitted).
    - Budget is Submitted      -> nothing to do if account/amount are unchanged;
                                  otherwise cancel it and create + submit a new one
                                  (a submitted Budget cannot be edited in place).
    """
    fiscal_year = get_fiscal_year(nowdate(), company=company)[0]

    # docstatus < 2: a cancelled Budget must never be picked up as "the" Budget.
    existing_name = frappe.db.exists(
        "Budget",
        {"budget_against": "Task", "task": task_name, "docstatus": ["<", 2]},
    )

    replaced_name = None
    if existing_name:
        budget = frappe.get_doc("Budget", existing_name)

        if budget.docstatus == 0:
            if budget.accounts:
                budget.accounts[0].account = account
                budget.accounts[0].budget_amount = budget_amount
            else:
                budget.append("accounts", {"account": account, "budget_amount": budget_amount})
            budget.company = company
            budget.fiscal_year = fiscal_year
            budget.save()
            return budget.name

        # Submitted Budget.
        current = budget.accounts[0] if budget.accounts else None
        if current and current.account == account and flt(current.budget_amount) == flt(budget_amount):
            return budget.name  # nothing changed

        budget.cancel()
        replaced_name = budget.name

    new_name = _create_and_submit_budget(task_name, account, budget_amount, company, fiscal_year)

    if replaced_name:
        frappe.msgprint(
            _("Budget {0} was cancelled and replaced by {1} because the IRPO's account/amount changed.").format(
                replaced_name, new_name
            ),
            alert=True, indicator="orange",
        )
    return new_name


# ---------------------------------------------------------------------
# Create BOQ Node Tasks for a submitted Construction Contract
# ---------------------------------------------------------------------

@frappe.whitelist()
def create_boq_nodes_for_contract(contract_name):
    """Create a BOQ Node Task for every BOQ line of the given Construction Contract.

    Called from the Contract Center dialog after the Construction Contract is
    submitted, so the new contract's BOQ items appear immediately as Group RPO
    rows. Idempotent — existing BOQ Nodes for the same contract + boq_code are
    left intact.

    Returns a list of created (or already-existing) Task names.

    This path already receives the real Contract BOQ Code directly from
    Contract BOQ Item (item.get("boq_code")), so cpc_boq_code is correct
    here without any change — and now that get_or_create_boq_node() also
    matches on the real code, a BOQ Node created via this planner path and
    one created via the Sales Order "Break into IRPOs" dialog correctly
    resolve to the SAME Task instead of creating duplicates.
    """
    frappe.has_permission("Construction Contract", "read", contract_name, throw=True)
    frappe.has_permission("Task", "create", throw=True)
    contract = frappe.get_doc("Construction Contract", contract_name)
    if not contract.boq_items:
        return []

    created = []
    for item in contract.boq_items:
        boq_code = item.get("boq_code") or item.get("item_code")
        if not boq_code:
            continue

        # Idempotent: skip if a BOQ Node already exists for this contract + boq_code.
        existing = frappe.db.get_value(
            "Task",
            {"cpc_contract": contract_name, "cpc_boq_code": boq_code, "cpc_node_type": "BOQ Node"},
            "name",
        )
        if existing:
            # Nodes created before Project / Sales Order stamping existed still
            # carry blanks — heal them so their IRPO children inherit them.
            backfill_task_project(existing)
            backfill_task_sales_order(existing)
            created.append(existing)
            continue

        node = frappe.new_doc("Task")
        node.subject = boq_code
        node.description = item.get("description") or ""
        node.is_group = 1
        node.cpc_node_type = "BOQ Node"
        node.cpc_contract = contract_name
        node.cpc_boq_code = boq_code
        node.cpc_boq_cost_budget = flt(item.get("cost_budget") or item.get("amount") or 0)
        # E-03: a fresh BOQ node has nothing allocated yet, so Remaining must
        # start at the full cost budget (not 0).
        node.cpc_boq_budget_allocated = 0
        node.cpc_boq_budget_remaining = flt(node.cpc_boq_cost_budget)
        node.project = resolve_task_project(contract=contract_name) or None
        node.cpc_sales_order = resolve_task_sales_order(contract=contract_name) or None
        node.insert()
        created.append(node.name)

    return created


# ---------------------------------------------------------------------
# IRPO Task Detail Viewer — data & save APIs
# ---------------------------------------------------------------------

def _irpo_connections(task_name):
    """Linked documents shown as connections on the IRPO viewer Overview tab.

    Budget          – active (non-cancelled) Budget docs budgeted against this Task.
    Material Request – MRs whose item rows carry this IRPO (task / cpc_irpo).
    Purchase Order   – POs whose item rows carry this IRPO (line-level task link).
    """
    connections = {
        "Budget": [
            {"doctype": "Budget", "name": b.name}
            for b in frappe.get_list(
                "Budget",
                filters={"budget_against": "Task", "task": task_name, "docstatus": ["<", 2]},
                fields=["name"],
                order_by="docstatus desc, creation desc",
            )
        ],
        "Material Request": [
            {"doctype": "Material Request", "name": n}
            for n in frappe.db.sql_list(
                """
                select distinct parent from `tabMaterial Request Item`
                where parenttype = 'Material Request' and task = %s
                """,
                task_name,
            )
        ],
        "Purchase Order": [
            {"doctype": "Purchase Order", "name": n}
            for n in frappe.db.sql_list(
                """
                select distinct parent from `tabPurchase Order Item`
                where parenttype = 'Purchase Order' and task = %s
                """,
                task_name,
            )
        ],
    }
    return connections


@frappe.whitelist()
def get_irpo_task_detail(task_name):
    """Return all data needed to populate the IRPO Task Detail Viewer dialog.

    Tabs covered:
      1. Overview & General  – all Task CPC / IRPO section fields
      2. Items Details       – Task `custom_items_table` child rows
      3. Unplanned Items     – Task `custom_irpo_unplanned_item` child rows
      4. Dual Budget          – budget amounts + parent BOQ remaining
      5. Progress & History   – IRPO Quantity Ledger history
    """
    frappe.has_permission("Task", "read", task_name, throw=True)
    task = frappe.get_doc("Task", task_name)

    # Parent BOQ node label
    parent_task_subject = None
    parent_boq_remaining = None
    if task.parent_task:
        parent_task_subject = frappe.db.get_value("Task", task.parent_task, "subject")
        parent_boq_remaining = frappe.db.get_value(
            "Task", task.parent_task, "cpc_boq_budget_remaining"
        )

    # Project name (full).  Tasks created before Project stamping existed can
    # still carry a blank project — resolve it from the contract / parent BOQ
    # Node and write it back so the Task form and this viewer agree.
    project = task.project or backfill_task_project(task_name)
    project_name = None
    if project:
        project_name = frappe.db.get_value("Project", project, "project_name") or project

    # Same for the Sales Order: fall back to the contract's submitted SO so the
    # "Sales Order (RPO)" field is populated on legacy tasks too.
    sales_order = task.cpc_sales_order or backfill_task_sales_order(task_name)
    sales_order_name = None
    if sales_order:
        sales_order_name = frappe.db.get_value("Sales Order", sales_order, "name") or sales_order

    # Predecessor tasks
    depends_on_tasks = ", ".join(
        frappe.get_list(
            "Task Depends On",
            filters={"parent": task_name},
            fields=["task"],
            pluck="task",
        )
    )

    # --- Progress & History: IRPO Quantity Ledger ---
    progress_history = []
    try:
        ledger_rows = frappe.get_list(
            "IRPO Quantity Ledger",
            filters={"irpo": task_name, "is_cancelled": 0},
            fields=["posting_date", "qty AS period_pct", "voucher_no", "stage", "docstatus"],
            order_by="posting_date asc, creation asc",
        )
        cumulative = 0.0
        for row in ledger_rows:
            period = flt(row.get("period_pct") or 0)
            cumulative += period
            progress_history.append({
                "posting_date": str(row.posting_date) if row.posting_date else "",
                "period_pct": period,
                "cumulative_pct": cumulative,
                "earned_value": period * flt(task.cpc_budget_amount) / 100
                    if task.cpc_uom in ("Percent", "%") else period,
                "voucher_no": row.voucher_no,
                "docstatus": row.docstatus,
            })
    except Exception:
        pass

    # --- Items: Task `custom_items_table` child rows ---
    item_rows = []
    for row in task.get("custom_items_table") or []:
        item_rows.append({
            "name": row.name,  # child row ID needed for edits
            "irpo_budget_row_ref": row.irpo_budget_row_ref,
            "irpo_item_type": row.irpo_item_type,
            "item": row.item,
            "item_name": frappe.db.get_value("Item", row.item, "item_name") if row.item else None,
            "uom": row.uom,
            "qty": flt(row.qty),
            "amount": flt(row.amount),
            "irpo_mr_pending_qty": flt(row.irpo_mr_pending_qty),
            "irpo_po_pending_qty": flt(row.irpo_po_pending_qty),
            "irpo_pr_qty": flt(row.irpo_pr_qty),
            "irpo_pi_actual_qty": flt(row.irpo_pi_actual_qty),
            "irpo_available_qty": flt(row.irpo_available_qty),
        })

    # --- Unplanned Items: Task `custom_irpo_unplanned_item` child rows ---
    unplanned_rows = []
    for row in task.get("custom_irpo_unplanned_item") or []:
        unplanned_rows.append({
            "name": row.name,  # child row ID needed for edits
            "unplanned_row_ref": row.unplanned_row_ref,
            "irpo_item_type": row.irpo_item_type,
            "item": row.item,
            "item_name": frappe.db.get_value("Item", row.item, "item_name") if row.item else None,
            "uom": row.uom,
            "qty": flt(row.qty),
            "irpo_mr_pending_qty": flt(row.irpo_mr_pending_qty),
            "irpo_po_pending_qty": flt(row.irpo_po_pending_qty),
            "irpo_pr_qty": flt(row.irpo_pr_qty),
            "irpo_pi_actual_qty": flt(row.irpo_pi_actual_qty),
            "irpo_available_qty": flt(row.irpo_available_qty),
        })

    return {
        # Core fields
        "name": task.name,
        "subject": task.subject,
        "status": task.status,
        "project": project,
        "project_name": project_name,
        "parent_task": task.parent_task,
        "parent_task_subject": parent_task_subject,
        # Custom CPC / IRPO section fields
        "cpc_is_irpo": task.cpc_is_irpo,
        "cpc_node_type": task.cpc_node_type,
        "cpc_contract": task.cpc_contract,
        "cpc_sales_order": sales_order,
        "cpc_sales_order_name": sales_order_name,
        "cpc_boq_code": task.cpc_boq_code,
        "cpc_irpo_code": task.cpc_irpo_code,
        "cpc_uom": task.cpc_uom,
        "account": task.account,
        "color": task.color or "",
        "cpc_budget_qty": flt(task.cpc_budget_qty),
        "cpc_budget_amount": flt(task.cpc_budget_amount),
        "cpc_boq_cost_budget": flt(task.cpc_boq_cost_budget),
        "cpc_boq_budget_allocated": flt(task.cpc_boq_budget_allocated),
        "cpc_boq_budget_remaining": flt(task.cpc_boq_budget_remaining),
        # Schedule
        "exp_start_date": str(task.exp_start_date) if task.exp_start_date else None,
        "exp_end_date": str(task.exp_end_date) if task.exp_end_date else None,
        "depends_on_tasks": depends_on_tasks,
        # Progress
        "progress": flt(task.progress or 0),
        # Budget
        "parent_boq_remaining": flt(parent_boq_remaining) if parent_boq_remaining is not None else None,
        # Related data
        "items": item_rows,
        "unplanned_items": unplanned_rows,
        "progress_history": progress_history,
        "connections": _irpo_connections(task_name),
    }


@frappe.whitelist()
def save_irpo_task_fields(task_name, fields_json):
    """Patch a subset of editable fields on a Task from the IRPO viewer.

    ``fields_json`` — JSON dict with field-name → value pairs.
    Only whitelisted fields are updated (others are silently ignored).
    ``color`` is written directly via db.set_value to avoid Task hooks.
    Other fields use the full ORM save path.
    """
    frappe.has_permission("Task", "write", task_name, throw=True)
    if isinstance(fields_json, str):
        fields_json = frappe.parse_json(fields_json)

    ALLOWED = {
        "subject", "project", "cpc_sales_order", "cpc_contract",
        "cpc_node_type", "account", "cpc_irpo_code", "cpc_uom", "cpc_boq_code",
        "exp_start_date", "exp_end_date",
        "cpc_budget_qty", "cpc_budget_amount",
        "color",
    }

    updates = {k: v for k, v in fields_json.items() if k in ALLOWED}
    if not updates:
        return {"updated": 0}
    total_written = len(updates)

    # Write color directly via db.set_value — bypasses Task hooks and is safe
    # for a simple color string.  Empty string is kept as-is (resets the color).
    if "color" in updates:
        frappe.db.set_value("Task", task_name, "color", updates.pop("color") or None,
                            update_modified=False)

    # Write remaining fields through the ORM so hooks fire normally.
    if updates:
        task = frappe.get_doc("Task", task_name)
        for field, value in updates.items():
            task.set(field, value or None)
        task.save()

    return {"updated": total_written}


@frappe.whitelist()
def save_irpo_task_items(task_name, items_json):
    """Replace the custom_items_table child rows on a Task from the IRPO viewer.

    ``items_json`` — JSON list of row dicts with keys:
        name (optional, existing row ID), item, uom, qty, amount,
        irpo_budget_row_ref (preserved as-is if present)

    Existing rows not present in the payload are deleted.
    New rows (no ``name``) are appended.
    Returns the updated items list (same shape as get_irpo_task_detail).
    """
    frappe.has_permission("Task", "write", task_name, throw=True)
    if isinstance(items_json, str):
        items_json = frappe.parse_json(items_json)

    if not isinstance(items_json, list):
        frappe.throw(_("items_json must be a list."))

    task = frappe.get_doc("Task", task_name)

    # Build a lookup of existing rows by name
    existing_by_name = {r.name: r for r in task.get("custom_items_table") or []}

    # Rebuild the child table from the payload
    task.set("custom_items_table", [])
    for row_data in items_json:
        if not row_data.get("item"):
            continue  # skip blank rows
        row = task.append("custom_items_table", {})
        # Preserve the existing row name so Frappe updates in-place instead of deleting + re-creating
        existing_row = existing_by_name.get(row_data.get("name"))
        if existing_row:
            row.name = existing_row.name
        row.irpo_budget_row_ref = row_data.get("irpo_budget_row_ref") or ""
        row.irpo_item_type = row_data.get("irpo_item_type") or ""
        row.item = row_data.get("item") or ""
        row.uom = row_data.get("uom") or ""
        row.qty = flt(row_data.get("qty") or 0)
        row.amount = flt(row_data.get("amount") or 0)
        # Read-only computed fields are NOT overwritten; keep existing values
        if existing_row:
            row.irpo_mr_pending_qty = flt(existing_row.irpo_mr_pending_qty)
            row.irpo_po_pending_qty = flt(existing_row.irpo_po_pending_qty)
            row.irpo_pr_qty = flt(existing_row.irpo_pr_qty)
            row.irpo_pi_actual_qty = flt(existing_row.irpo_pi_actual_qty)
            row.irpo_available_qty = flt(existing_row.irpo_available_qty)

    task.save()

    # Return the refreshed items so the frontend can redraw
    updated_rows = []
    for row in task.get("custom_items_table") or []:
        updated_rows.append({
            "name": row.name,
            "irpo_budget_row_ref": row.irpo_budget_row_ref,
            "irpo_item_type": row.irpo_item_type,
            "item": row.item,
            "item_name": frappe.db.get_value("Item", row.item, "item_name") if row.item else None,
            "uom": row.uom,
            "qty": flt(row.qty),
            "amount": flt(row.amount),
            "irpo_mr_pending_qty": flt(row.irpo_mr_pending_qty),
            "irpo_po_pending_qty": flt(row.irpo_po_pending_qty),
            "irpo_pr_qty": flt(row.irpo_pr_qty),
            "irpo_pi_actual_qty": flt(row.irpo_pi_actual_qty),
            "irpo_available_qty": flt(row.irpo_available_qty),
        })
    return updated_rows


@frappe.whitelist()
def save_irpo_task_unplanned_items(task_name, items_json):
    """Replace the custom_irpo_unplanned_item child rows on a Task from the IRPO viewer.

    ``items_json`` — JSON list of row dicts with keys:
        name (optional, existing row ID), item, uom, qty

    Mirrors save_irpo_task_items but for the Unplanned Items table. System-owned
    fields (unplanned_row_ref, uom, tracked qty summaries) are preserved by the
    validate_unplanned_rows Task hook when an existing row name is kept; rows
    with ledger history cannot be removed (enforced by that same hook).
    Existing rows not present in the payload are deleted.
    New rows (no ``name``) are appended.
    Returns the updated rows (same shape as get_irpo_task_detail).
    """
    frappe.has_permission("Task", "write", task_name, throw=True)
    if isinstance(items_json, str):
        items_json = frappe.parse_json(items_json)

    if not isinstance(items_json, list):
        frappe.throw(_("items_json must be a list."))

    task = frappe.get_doc("Task", task_name)

    # Build a lookup of existing rows by name
    existing_by_name = {r.name: r for r in task.get("custom_irpo_unplanned_item") or []}

    # Rebuild the child table from the payload
    task.set("custom_irpo_unplanned_item", [])
    for row_data in items_json:
        if not row_data.get("item"):
            continue  # skip blank rows
        row = task.append("custom_irpo_unplanned_item", {})
        # Preserve the existing row name so Frappe updates in-place instead of deleting + re-creating
        existing_row = existing_by_name.get(row_data.get("name"))
        if existing_row:
            row.name = existing_row.name
        row.item = row_data.get("item") or ""
        row.irpo_item_type = row_data.get("irpo_item_type") or ""
        row.uom = row_data.get("uom") or ""
        row.qty = flt(row_data.get("qty") or 0)
        # Read-only / system-owned fields (unplanned_row_ref, tracked qty sums,
        # irpo_available_qty) are restored by validate_unplanned_rows.

    task.save()

    # Return the refreshed rows so the frontend can redraw
    updated_rows = []
    for row in task.get("custom_irpo_unplanned_item") or []:
        updated_rows.append({
            "name": row.name,
            "unplanned_row_ref": row.unplanned_row_ref,
            "irpo_item_type": row.irpo_item_type,
            "item": row.item,
            "item_name": frappe.db.get_value("Item", row.item, "item_name") if row.item else None,
            "uom": row.uom,
            "qty": flt(row.qty),
            "irpo_mr_pending_qty": flt(row.irpo_mr_pending_qty),
            "irpo_po_pending_qty": flt(row.irpo_po_pending_qty),
            "irpo_pr_qty": flt(row.irpo_pr_qty),
            "irpo_pi_actual_qty": flt(row.irpo_pi_actual_qty),
            "irpo_available_qty": flt(row.irpo_available_qty),
        })
    return updated_rows


# ---------------------------------------------------------------------
# Break IRPO — create Leaf IRPO Tasks under a BOQ Node
# ---------------------------------------------------------------------

@frappe.whitelist()
def break_into_leaf_irpos(boq_node_name, irpos_json):
    """Create Leaf IRPO Tasks under the given BOQ Node Task.

    ``boq_node_name`` — name of the BOQ Node Task (Group RPO row in the planner).
    ``irpos_json``    — JSON list of row dicts with keys:
        subject, cpc_uom, exp_start_date, exp_end_date,
        account, cpc_budget_qty, cpc_budget_amount, color

    Returns list of created Task names.
    """
    frappe.has_permission("Task", "write", boq_node_name, throw=True)
    frappe.has_permission("Task", "create", throw=True)
    if isinstance(irpos_json, str):
        irpos_json = frappe.parse_json(irpos_json)

    if not irpos_json:
        frappe.throw(_("Add at least one IRPO row."))

    boq_node = frappe.get_doc("Task", boq_node_name)
    if not boq_node:
        frappe.throw(_("BOQ Node {0} not found.").format(boq_node_name))

    boq_node_project = backfill_task_project(boq_node_name)
    boq_node_sales_order = backfill_task_sales_order(boq_node_name)

    # Same guarantees as the Sales Order > Break IRPO dialog: Company for the
    # native Budget, and the BOQ cost-budget cap enforced server-side.
    company = _get_project_company(boq_node_project or boq_node.project)
    _enforce_boq_cap(boq_node.cpc_contract, boq_node.cpc_boq_code, irpos_json)

    created = []
    for row in irpos_json:
        if not row.get("subject"):
            frappe.throw(_("Every IRPO row needs a Subject."))

        irpo = frappe.new_doc("Task")
        irpo.subject = row["subject"]
        irpo.parent_task = boq_node_name
        irpo.project = boq_node_project or boq_node.project or None
        irpo.is_group = 0
        irpo.cpc_node_type = "IRPO"
        irpo.cpc_is_irpo = 1
        irpo.cpc_contract = boq_node.cpc_contract
        irpo.cpc_sales_order = boq_node_sales_order or boq_node.cpc_sales_order or None
        irpo.cpc_boq_code = boq_node.cpc_boq_code
        irpo.cpc_uom = row.get("cpc_uom") or "Percent"
        irpo.exp_start_date = row.get("exp_start_date") or None
        irpo.exp_end_date = row.get("exp_end_date") or None
        irpo.cpc_budget_qty = flt(row.get("cpc_budget_qty") or 0)
        irpo.cpc_budget_amount = flt(row.get("cpc_budget_amount") or 0)
        irpo.account = row.get("account") or None
        irpo.color = row.get("color") or None
        irpo.insert()

        # Native ERPNext Budget: create + submit (E-02), same as break_into_irpos.
        sync_budget_for_irpo(irpo.name, irpo.account, flt(irpo.cpc_budget_amount), company)

        created.append(irpo.name)

    # Sync stored budget fields on the BOQ Node and all sibling IRPOs so the
    # planner's "Remaining" column (read from cpc_boq_budget_remaining) reflects
    # the newly allocated amounts straight away.
    if boq_node.cpc_contract and boq_node.cpc_boq_code:
        recompute_boq_budget_fields(boq_node.cpc_contract, boq_node.cpc_boq_code)

    return created


@frappe.whitelist()
def get_irpos_for_boq_node(boq_node_name):
    """Return all Leaf IRPO Tasks that are direct children of ``boq_node_name``.

    Used by the Break IRPO dialog's "Get Previous IRPO" button so the user
    can load and edit existing tasks instead of only creating new ones.
    """
    frappe.has_permission("Task", "read", boq_node_name, throw=True)
    return frappe.get_list(
        "Task",
        filters={
            "parent_task": boq_node_name,
            "cpc_node_type": "IRPO",
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "subject",
            "cpc_uom",
            "exp_start_date",
            "exp_end_date",
            "account",
            "cpc_budget_qty",
            "cpc_budget_amount",
            "color",
        ],
        order_by="creation asc",
    )


@frappe.whitelist()
def save_irpo_tasks(boq_node_name, irpos_json, boq_node_color=None):
    """Create or update Leaf IRPO Tasks under the given BOQ Node Task.

    ``boq_node_name``  — name of the BOQ Node Task.
    ``irpos_json``     — JSON list of row dicts with optional ``name`` key.
    ``boq_node_color`` — hex color to set on the BOQ Node Task itself
                         (shown in the Gantt chart group bar).

    Rows with a ``name`` field that exists are updated in-place (through the
    ORM, so Task hooks fire exactly as in the Sales Order > Break IRPO dialog).
    Rows without one (or with a non-existent name) are created new.
    Every created/updated IRPO gets its native ERPNext Budget created and
    submitted / kept in sync (E-02).
    Returns ``{created: [...], updated: [...]}``.
    """
    frappe.has_permission("Task", "write", boq_node_name, throw=True)
    frappe.has_permission("Task", "create", throw=True)
    if isinstance(irpos_json, str):
        irpos_json = frappe.parse_json(irpos_json)

    if not irpos_json:
        frappe.throw(_("Add at least one IRPO row."))

    boq_node = frappe.get_doc("Task", boq_node_name)
    if not boq_node:
        frappe.throw(_("BOQ Node {0} not found.").format(boq_node_name))

    # Resolve the Project and Sales Order once for the whole break operation and
    # heal the BOQ Node itself, so every IRPO child created below inherits them.
    boq_node_project = backfill_task_project(boq_node_name)
    boq_node_sales_order = backfill_task_sales_order(boq_node_name)

    # Company is needed for the native Budget.
    company = _get_project_company(boq_node_project or boq_node.project)

    # Server-side BOQ cap, delta based: rows being updated are excluded from
    # the existing allocation and counted at their new amount.
    updating_names = [
        r.get("name")
        for r in irpos_json
        if r.get("name") and frappe.db.exists("Task", r.get("name"))
    ]
    _enforce_boq_cap(boq_node.cpc_contract, boq_node.cpc_boq_code, irpos_json, updating_names)

    created = []
    updated = []

    for row in irpos_json:
        if not row.get("subject"):
            frappe.throw(_("Every IRPO needs a Subject."))

        task_name = row.get("name")

        if task_name and frappe.db.exists("Task", task_name):
            irpo = frappe.get_doc("Task", task_name)
            irpo.subject = row["subject"]
            irpo.cpc_uom = row.get("cpc_uom") or "Percent"
            irpo.exp_start_date = row.get("exp_start_date") or None
            irpo.exp_end_date = row.get("exp_end_date") or None
            irpo.account = row.get("account") or None
            irpo.cpc_budget_qty = flt(row.get("cpc_budget_qty") or 0)
            irpo.cpc_budget_amount = flt(row.get("cpc_budget_amount") or 0)
            irpo.color = row.get("color") or None

            # Only fill these in when still blank — never overwrite a value that
            # was set deliberately.
            if not irpo.project:
                irpo.project = boq_node_project or boq_node.project or None
            if not irpo.cpc_sales_order:
                irpo.cpc_sales_order = boq_node_sales_order or boq_node.cpc_sales_order or None

            irpo.save()
            sync_budget_for_irpo(irpo.name, irpo.account, flt(irpo.cpc_budget_amount), company)
            updated.append(irpo.name)
        else:
            irpo = frappe.new_doc("Task")
            irpo.subject = row["subject"]
            irpo.parent_task = boq_node_name
            irpo.project = boq_node_project or boq_node.project or None
            irpo.is_group = 0
            irpo.cpc_node_type = "IRPO"
            irpo.cpc_is_irpo = 1
            irpo.cpc_contract = boq_node.cpc_contract
            irpo.cpc_sales_order = boq_node_sales_order or boq_node.cpc_sales_order or None
            irpo.cpc_boq_code = boq_node.cpc_boq_code
            irpo.cpc_uom = row.get("cpc_uom") or "Percent"
            irpo.exp_start_date = row.get("exp_start_date") or None
            irpo.exp_end_date = row.get("exp_end_date") or None
            irpo.cpc_budget_qty = flt(row.get("cpc_budget_qty") or 0)
            irpo.cpc_budget_amount = flt(row.get("cpc_budget_amount") or 0)
            irpo.account = row.get("account") or None
            irpo.color = row.get("color") or None
            irpo.insert()
            sync_budget_for_irpo(irpo.name, irpo.account, flt(irpo.cpc_budget_amount), company)
            created.append(irpo.name)

    # Apply the chosen color to the BOQ Node Task (Gantt group bar).
    if boq_node_color:
        frappe.db.set_value("Task", boq_node_name, "color", boq_node_color, update_modified=False)

    # Sync budget totals on the BOQ Node so the planner Remaining column is accurate.
    if boq_node.cpc_contract and boq_node.cpc_boq_code:
        recompute_boq_budget_fields(boq_node.cpc_contract, boq_node.cpc_boq_code)

    return {"created": created, "updated": updated}


@frappe.whitelist()
def cpc_make_irpo_import_workbook(rows_json):
    """Build an .xlsx workbook from the Break IRPO dialog rows.

    ``rows_json`` — JSON list of row dicts (subject, cpc_uom, exp_start_date,
    exp_end_date, account, cpc_budget_qty, cpc_budget_amount, color).

    Returns ``{"b64": <base64 xlsx>, "filename": ...}`` for client download.
    """
    import base64

    from frappe.utils.xlsxutils import make_xlsx

    rows = frappe.parse_json(rows_json) if isinstance(rows_json, str) else rows_json
    header = [
        "Subject",
        "UOM",
        "Planned Start",
        "Planned End",
        "Account",
        "Budget Qty",
        "Budget Amount",
        "Color",
    ]
    data = [header]
    for r in rows or []:
        data.append([
            r.get("subject") or "",
            r.get("cpc_uom") or "",
            r.get("exp_start_date") or "",
            r.get("exp_end_date") or "",
            r.get("account") or "",
            flt(r.get("cpc_budget_qty")),
            flt(r.get("cpc_budget_amount")),
            r.get("color") or "",
        ])
    xlsx_file = make_xlsx(data, "IRPO Tasks", column_widths=[50, 12, 14, 14, 50, 12, 14, 12])
    return {
        "b64": base64.b64encode(xlsx_file.getvalue()).decode("utf-8"),
        "filename": "IRPO_Tasks.xlsx",
    }


@frappe.whitelist()
def cpc_parse_irpo_import_file(file_url):
    """Read an uploaded .xlsx and return its rows keyed by column name.

    The header row is matched case-insensitively against the workbook written
    by ``cpc_make_irpo_import_workbook`` so a downloaded file round-trips.
    """
    frappe.get_doc("File", {"file_url": file_url}).check_permission("read")
    from datetime import date, datetime

    from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

    raw = read_xlsx_file_from_attached_file(file_url=file_url) or []
    if not raw:
        return []

    header = raw[0]
    col = {}
    for idx, cell in enumerate(header or []):
        if cell is not None:
            key = str(cell).strip().lower()
            col.setdefault(key, idx)

    def cell_of(row, key, is_date=False):
        idx = col.get(key)
        if idx is None or idx >= len(row):
            return None
        value = row[idx]
        if value is None:
            return None
        if is_date:
            if isinstance(value, (date, datetime)):
                return value.strftime("%Y-%m-%d")
            text = str(value).strip()
            return text or None
        if isinstance(value, str):
            return value.strip() or None
        return value

    result = []
    for row in raw[1:]:
        if not any(c is not None and str(c).strip() for c in row):
            continue
        result.append({
            "subject": cell_of(row, "subject"),
            "uom": cell_of(row, "uom"),
            "exp_start_date": cell_of(row, "planned start", is_date=True),
            "exp_end_date": cell_of(row, "planned end", is_date=True),
            "account": cell_of(row, "account"),
            "cpc_budget_qty": cell_of(row, "budget qty"),
            "cpc_budget_amount": cell_of(row, "budget amount"),
            "color": cell_of(row, "color"),
        })
    return result


# ---------------------------------------------------------------------
# IRPO Planner — data API
# ---------------------------------------------------------------------

@frappe.whitelist()
def get_planner_filters(cpc_contract=None):
    """Return the master-data values used to populate the planner dropdowns.

    Contract / Project / Sales Order options are sourced from Construction
    Contract and Sales Order records (not from Task rows), because Task rows
    do not always carry ``project`` / ``cpc_sales_order`` populated.

    When ``cpc_contract`` is given the Project and Sales Order options are
    scoped to that contract, so the planner only offers related records.
    """
    contracts = frappe.get_list(
        "Construction Contract",
        fields=["name", "project"],
        order_by="name desc",
    )

    if cpc_contract:
        contract_project = frappe.get_value("Construction Contract", cpc_contract, "project")
        sales_orders = frappe.get_list(
            "Sales Order",
            filters={"docstatus": 1, "cpc_contract": cpc_contract},
            fields=["name", "project", "cpc_contract"],
            order_by="name desc",
        )
        projects = []
        if contract_project:
            projects.append(contract_project)
        for so in sales_orders:
            if so.project and so.project not in projects:
                projects.append(so.project)
        return {
            "contracts": [c.name for c in contracts],
            "projects": projects,
            "sales_orders": [
                {
                    "name": so.name,
                    "project": so.project,
                    "cpc_contract": so.cpc_contract,
                }
                for so in sales_orders
            ],
        }

    sales_orders = frappe.get_list(
        "Sales Order",
        filters={"docstatus": 1, "cpc_contract": ["is", "set"]},
        fields=["name", "project", "cpc_contract"],
        order_by="name desc",
    )
    projects = []
    seen_projects = set()
    for c in contracts:
        if c.project and c.project not in seen_projects:
            seen_projects.add(c.project)
            projects.append(c.project)
    for so in sales_orders:
        if so.project and so.project not in seen_projects:
            seen_projects.add(so.project)
            projects.append(so.project)

    return {
        "contracts": [c.name for c in contracts],
        "projects": projects,
        "sales_orders": [
            {
                "name": so.name,
                "project": so.project,
                "cpc_contract": so.cpc_contract,
            }
            for so in sales_orders
        ],
    }


@frappe.whitelist()
def get_planner_data(cpc_contract=None, project=None, sales_order=None):
    """Return a flat list of all BOQ Nodes and IRPOs for the planner UI.

    Each row contains the fields needed to render both the WBS tree table and
    the Schedule Timeline (Gantt) panel.  Predecessor task names are returned
    as a comma-joined string so the JS can parse them without extra round-trips.

    Filters are resolved through master data because Task rows do not reliably
    carry ``project`` or ``cpc_sales_order``: Sales Orders map to a contract
    (and a project), Construction Contracts map to a project.
    """
    filters = {"docstatus": ["<", 2], "cpc_contract": ["is", "set"]}
    if cpc_contract:
        # A sales order wins over a project; both give a concrete contract.
        contract = cpc_contract
        if sales_order:
            so_contract = frappe.get_value("Sales Order", sales_order, "cpc_contract")
            if so_contract:
                contract = so_contract
        filters["cpc_contract"] = contract
        frappe.has_permission("Construction Contract", "read", contract, throw=True)
    elif sales_order:
        so_contract = frappe.get_value("Sales Order", sales_order, "cpc_contract")
        if so_contract:
            filters["cpc_contract"] = so_contract
        else:
            filters["cpc_contract"] = ["is", "set"]
            filters["cpc_sales_order"] = sales_order
    elif project:
        contracts = frappe.get_list(
            "Construction Contract",
            filters={"project": project},
            pluck="name",
        )
        if contracts:
            filters["cpc_contract"] = ["in", contracts]
        else:
            filters["cpc_contract"] = ["is", "set"]
            filters["project"] = project

    tasks = frappe.get_list(
        "Task",
        filters=filters,
        fields=[
            "name",
            "subject",
            "project",
            "cpc_node_type",
            "parent_task",
            "is_group",
            "cpc_uom",
            "cpc_budget_qty",
            "cpc_budget_amount",
            "cpc_boq_cost_budget",
            "cpc_boq_budget_allocated",
            "cpc_boq_budget_remaining",
            "progress",
            "exp_start_date",
            "exp_end_date",
            "cpc_sales_order",
            "cpc_contract",
            "cpc_boq_code",
            "cpc_irpo_code",
            "status",
            "color",
        ],
        order_by="cpc_node_type asc, creation asc",
    )

    if not tasks:
        return []

    # Fetch predecessor links for all tasks in one query
    task_names = [t.name for t in tasks]
    placeholders = ", ".join(["%s"] * len(task_names))
    deps_rows = frappe.db.sql(
        f"""
        SELECT parent, task AS predecessor
        FROM `tabTask Depends On`
        WHERE parent IN ({placeholders})
        """,
        tuple(task_names),
        as_dict=True,
    )
    deps_map = {}
    for dep in deps_rows:
        deps_map.setdefault(dep.parent, []).append(dep.predecessor)

    result = []
    for task in tasks:
        row = task.copy() if isinstance(task, dict) else dict(task)
        row["depends_on_tasks"] = ", ".join(deps_map.get(task.name, []))
        # Compute consumed percentage from progress field (0–100)
        row["consumed_pct"] = flt(task.progress or 0)
        result.append(row)

    # ----------------------------------------------------------------
    # Live-recompute budget figures for BOQ Node rows.
    # The stored cpc_boq_budget_remaining / cpc_boq_budget_allocated
    # fields can be stale (e.g. IRPOs created via the planner's
    # break_into_leaf_irpos before this fix, or via the SO dialog when
    # recompute was skipped). Fetching the live sum in one query and
    # patching the rows here means the planner always shows accurate
    # "Remaining" values without a separate API call.
    # ----------------------------------------------------------------
    boq_nodes = [r for r in result if r.get("cpc_node_type") == "BOQ Node"]
    if boq_nodes:
        # Build a (contract, boq_code) → allocated map from one SQL pass.
        contract_boq_pairs = list({
            (r["cpc_contract"], r["cpc_boq_code"])
            for r in boq_nodes
            if r.get("cpc_contract") and r.get("cpc_boq_code")
        })
        if contract_boq_pairs:
            pair_placeholders = ", ".join(["(%s, %s)"] * len(contract_boq_pairs))
            flat_params = [v for pair in contract_boq_pairs for v in pair]
            allocated_rows = frappe.db.sql(
                f"""
                SELECT cpc_contract, cpc_boq_code, COALESCE(SUM(cpc_budget_amount), 0) AS allocated
                FROM `tabTask`
                WHERE (cpc_contract, cpc_boq_code) IN ({pair_placeholders})
                  AND cpc_node_type = 'IRPO'
                  AND docstatus < 2
                GROUP BY cpc_contract, cpc_boq_code
                """,
                tuple(flat_params),
                as_dict=True,
            )
            allocated_map = {
                (r.cpc_contract, r.cpc_boq_code): flt(r.allocated)
                for r in allocated_rows
            }
            for row in boq_nodes:
                key = (row.get("cpc_contract"), row.get("cpc_boq_code"))
                live_allocated = allocated_map.get(key, 0.0)
                budget = flt(row.get("cpc_boq_cost_budget") or 0)
                row["cpc_boq_budget_allocated"] = live_allocated
                row["cpc_boq_budget_remaining"] = budget - live_allocated

    return result


@frappe.whitelist()
def save_planner_dates(tasks_json):
    """Batch-update exp_start_date (and exp_end_date) on Task records.

    ``tasks_json`` is a JSON-serialised list of objects:
      [{"name": "TASK-0001", "exp_start_date": "2026-09-20", "exp_end_date": "2026-10-05"}, ...]
    """
    if isinstance(tasks_json, str):
        tasks_json = frappe.parse_json(tasks_json)

    if not tasks_json:
        return {"updated": 0}

    updated = 0
    for row in tasks_json:
        name = row.get("name")
        if not name:
            continue
        frappe.has_permission("Task", "write", name, throw=True)
        frappe.db.set_value(
            "Task",
            name,
            {
                "exp_start_date": row.get("exp_start_date") or None,
                "exp_end_date": row.get("exp_end_date") or None,
            },
            update_modified=False,
        )
        updated += 1

    return {"updated": updated}