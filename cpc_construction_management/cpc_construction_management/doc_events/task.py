
# """
# J3 · IRPO (US-06)
# -----------------
# Extends the native Task doctype (via doc_events, no controller override) so that:
#   - a "BOQ Node" Task is the group row for one BOQ line (is_group = 1)
#   - an "IRPO" Task is always a leaf under a BOQ Node (is_group = 0, no children allowed)

# Lives at cpc_construction_management/cpc_construction_management/doc_events/task_irpo.py,
# alongside the existing doc_events/sales_order.py (get_related_sales_orders).
# Wire into hooks.py:

#     doc_events = {
#         "Task": {
#             "validate": "cpc_construction_management.cpc_construction_management.doc_events.task_irpo.validate_irpo_task"
#         }
#     }

# get_boq_line_source() below matches the real US-04 sales_order.js:
# cpc_contract lives directly on the Sales Order, and a Sales Order
# Item's item_code IS the BOQ code (no separate per-item stamp).

# BOQ Node identity: subject = the Item Code itself (the BOQ line IS the
# parent task). Each created IRPO is still a tree child via parent_task/
# is_group (required for the Project Gantt/Tree + leaf enforcement), and
# is additionally appended to the BOQ Node's native depends_on ("Dependent
# Tasks") grid as a convenience view — that grid is not the source of the
# parent/child relationship, just a visible list on the Node's own form.
# """

# import frappe
# from frappe import _
# from frappe.utils import flt
# from frappe.utils.nestedset import NestedSet  # noqa: F401  (Task is a NestedSet; kept for reference)


# # ---------------------------------------------------------------------
# # Validation: enforce the "IRPO is always a leaf" rule
# # ---------------------------------------------------------------------

# def validate_irpo_task(doc, method=None):
#     """doc_events hook on Task.validate"""

#     if not doc.get("cpc_node_type"):
#         return

#     if doc.cpc_node_type == "IRPO":
#         # An IRPO is always a leaf.
#         doc.is_group = 0
#         doc.cpc_is_irpo = 1

#         # It cannot have children. On an existing doc, check the DB;
#         # on a new doc this is moot (nothing can point at it yet).
#         if not doc.is_new():
#             has_children = frappe.db.exists("Task", {"parent_task": doc.name})
#             if has_children:
#                 frappe.throw(
#                     _("{0} is an IRPO and must stay a leaf activity — it cannot have child tasks.")
#                     .format(frappe.bold(doc.subject or doc.name))
#                 )

#         if not doc.parent_task:
#             frappe.throw(_("An IRPO must have a Parent Task (its BOQ Node)."))

#         parent_node_type = frappe.db.get_value("Task", doc.parent_task, "cpc_node_type")
#         if parent_node_type != "BOQ Node":
#             frappe.throw(
#                 _("Parent Task {0} is not a BOQ Node. IRPOs must sit directly under a BOQ Node.")
#                 .format(frappe.bold(doc.parent_task))
#             )

#         if not doc.cpc_uom:
#             frappe.throw(_("UoM is required on an IRPO."))

#     elif doc.cpc_node_type == "BOQ Node":
#         doc.is_group = 1
#         doc.cpc_is_irpo = 0

#     # cpc_irpo_code should be unique within the project when set (not
#     # enforced at DB level since BOQ Nodes leave it blank).
#     if doc.cpc_irpo_code:
#         clash = frappe.db.exists(
#             "Task",
#             {
#                 "cpc_irpo_code": doc.cpc_irpo_code,
#                 "project": doc.project,
#                 "name": ["!=", doc.name],
#             },
#         )
#         if clash:
#             frappe.throw(
#                 _("IRPO Code {0} is already used in this project ({1}).")
#                 .format(frappe.bold(doc.cpc_irpo_code), clash)
#             )


# # ---------------------------------------------------------------------
# # Source-line lookup — THE ONE FUNCTION TO CONFIRM/SWAP (see module docstring)
# # ---------------------------------------------------------------------

# def get_boq_line_source(sales_order, boq_code):
#     """
#     Returns the fields an IRPO/BOQ Node must fetch from "the source line":
#         {
#             "project": ...,
#             "contract": ...,
#             "boq_code": ...,
#             "boq_description": ...,
#             "default_uom": ...,   # optional, used only to prefill the dialog
#         }

#     Per the real US-04 sales_order.js: cpc_contract lives directly on the
#     Sales Order (not per item), and item_code on a Sales Order Item row
#     IS the BOQ code (cpc_boq_code = item_code) — there's no separate
#     per-item BOQ-code stamp. So boq_code here is matched against
#     Sales Order Item.item_code.
#     """
#     so = frappe.db.get_value(
#         "Sales Order", sales_order, ["project", "cpc_contract"], as_dict=True
#     )
#     if not so:
#         frappe.throw(_("Sales Order {0} not found.").format(sales_order))

#     item_row = frappe.db.get_value(
#         "Sales Order Item",
#         {"parent": sales_order, "item_code": boq_code},
#         ["item_code", "item_name", "description", "uom"],
#         as_dict=True,
#     )
#     if not item_row:
#         frappe.throw(
#             _("Could not find BOQ line {0} on Sales Order {1}.").format(boq_code, sales_order)
#         )

#     if not so.project:
#         frappe.throw(_("Sales Order {0} has no Project set.").format(sales_order))

#     return {
#         "project": so.project,
#         "contract": so.cpc_contract,
#         "boq_code": boq_code,
#         "boq_description": item_row.description or item_row.item_name,
#         "default_uom": item_row.uom,
#     }


# # ---------------------------------------------------------------------
# # BOQ Node: get-or-create (idempotent, once per BOQ line)
# # ---------------------------------------------------------------------

# def get_or_create_boq_node(sales_order, boq_code):
#     source = get_boq_line_source(sales_order, boq_code)

#     if not source.get("project"):
#         frappe.throw(_("BOQ line {0} has no Project to attach the BOQ Node to.").format(boq_code))

#     existing = frappe.db.get_value(
#         "Task",
#         {
#             "project": source["project"],
#             "cpc_boq_code": boq_code,
#             "cpc_node_type": "BOQ Node",
#         },
#         "name",
#     )
#     if existing:
#         return existing

#     node = frappe.new_doc("Task")
#     node.project = source["project"]
#     # The BOQ Line (Item Code) IS the parent task's identity — subject
#     # is the item code itself; the line description goes in the
#     # description field instead of being folded into the subject.
#     node.subject = boq_code
#     node.description = source.get("boq_description")
#     node.is_group = 1
#     node.cpc_node_type = "BOQ Node"
#     node.cpc_sales_order = sales_order
#     node.cpc_contract = source.get("contract")
#     node.cpc_boq_code = boq_code
#     node.insert(ignore_permissions=False)
#     return node.name


# # ---------------------------------------------------------------------
# # Public API: break a BOQ line into IRPOs
# # ---------------------------------------------------------------------



# def recompute_boq_budget_fields(contract, boq_code):
#     """Snapshot the BOQ line's cost budget, what's allocated across all
#     its IRPOs, and what's left — written onto the BOQ Node AND every
#     IRPO child under it (single source of truth per BOQ line)."""
#     cost_budget = frappe.db.get_value(
#         "Contract BOQ Item",
#         {"parent": contract, "item_code": boq_code},
#         "cost_budget",
#     ) or 0

#     allocated = frappe.db.sql(
#         """
#         select coalesce(sum(cpc_budget_amount), 0)
#         from `tabTask`
#         where cpc_contract = %s
#           and cpc_boq_code = %s
#           and cpc_node_type = 'IRPO'
#         """,
#         (contract, boq_code),
#     )[0][0]

#     remaining = cost_budget - allocated

#     # IMPORTANT: frappe.db.set_value with a dict of filters only updates
#     # the FIRST matching row, not every match — that was the bug. Fetch
#     # every Task sharing this contract+boq_code (the BOQ Node + all its
#     # IRPO children) and update each one by name explicitly.
#     task_names = frappe.get_all(
#         "Task",
#         filters={"cpc_contract": contract, "cpc_boq_code": boq_code},
#         pluck="name",
#     )
#     for name in task_names:
#         frappe.db.set_value(
#             "Task",
#             name,
#             {
#                 "cpc_boq_cost_budget": cost_budget,
#                 "cpc_boq_budget_allocated": allocated,
#                 "cpc_boq_budget_remaining": remaining,
#             },
#             update_modified=False,
#         )

#     return {"cost_budget": cost_budget, "allocated": allocated, "remaining": remaining}


# @frappe.whitelist()
# def break_into_irpos(sales_order, boq_code, irpos):
#     if isinstance(irpos, str):
#         irpos = frappe.parse_json(irpos)

#     if not irpos:
#         frappe.throw(_("Add at least one IRPO row."))

#     source = get_boq_line_source(sales_order, boq_code)
#     boq_node = get_or_create_boq_node(sales_order, boq_code)

#     # ---- US-07: hard stop if this batch would exceed the BOQ budget ----
#     cost_budget = frappe.db.get_value(
#         "Contract BOQ Item",
#         {"parent": source["contract"], "item_code": boq_code},
#         "cost_budget",
#     ) or 0

#     existing_allocated = frappe.db.sql(
#         """
#         select coalesce(sum(cpc_budget_amount), 0)
#         from `tabTask`
#         where cpc_contract = %s and cpc_boq_code = %s and cpc_node_type = 'IRPO'
#         """,
#         (source["contract"], boq_code),
#     )[0][0]

#     new_total = sum(flt(row.get("cpc_budget_amount")) for row in irpos)
#     projected = existing_allocated + new_total

#     if projected > cost_budget:
#         frappe.throw(
#             _("Cannot create these IRPOs: allocating {0} would bring the total to {1}, exceeding this BOQ line's cost budget of {2} by {3}.").format(
#                 frappe.format_value(new_total, {"fieldtype": "Currency"}),
#                 frappe.format_value(projected, {"fieldtype": "Currency"}),
#                 frappe.format_value(cost_budget, {"fieldtype": "Currency"}),
#                 frappe.format_value(projected - cost_budget, {"fieldtype": "Currency"}),
#             )
#         )
#     # ---- end budget check ----

#     created = []
#     for row in irpos:
#         if not row.get("subject"):
#             frappe.throw(_("Every IRPO needs a Subject."))
#         if not row.get("cpc_uom"):
#             frappe.throw(_("Every IRPO needs a UoM."))

#         irpo = frappe.new_doc("Task")
#         irpo.project = source["project"]
#         irpo.parent_task = boq_node
#         irpo.is_group = 0
#         irpo.subject = row["subject"]
#         irpo.cpc_node_type = "IRPO"
#         irpo.cpc_is_irpo = 1
#         irpo.cpc_sales_order = sales_order
#         irpo.cpc_contract = source.get("contract")
#         irpo.cpc_boq_code = boq_code
#         irpo.cpc_uom = row["cpc_uom"]
#         irpo.cpc_irpo_code = row.get("cpc_irpo_code")
#         irpo.exp_start_date = row.get("exp_start_date")
#         irpo.exp_end_date = row.get("exp_end_date")
#         irpo.cpc_budget_qty = row.get("cpc_budget_qty")
#         irpo.cpc_budget_amount = row.get("cpc_budget_amount")
#         irpo.insert(ignore_permissions=False)
#         created.append(irpo.name)

#     # ...unchanged depends_on append block...

#     if created:
#         recompute_boq_budget_fields(source["contract"], boq_code)

#     return {"boq_node": boq_node, "irpos": created}


# @frappe.whitelist()
# def get_boq_lines_for_sales_order(sales_order):
#     """Helper for the dialog: list BOQ codes (= item_code) available on
#     this Sales Order, for the picker."""
#     so = frappe.get_doc("Sales Order", sales_order)
#     seen = {}
#     for item in so.items:
#         code = item.item_code
#         if code and code not in seen:
#             seen[code] = item.description or item.item_name
#     return [{"boq_code": k, "description": v} for k, v in seen.items()]



# @frappe.whitelist()
# def get_boq_budget_summary(sales_order, boq_code):
#     """Called when the user picks a BOQ Line in the dialog — returns
#     the parent BOQ line's cost budget, what's already allocated to
#     existing IRPOs under it, and what's left."""
#     source = get_boq_line_source(sales_order, boq_code)

#     cost_budget = frappe.db.get_value(
#         "Contract BOQ Item",
#         {"parent": source["contract"], "item_code": boq_code},
#         "cost_budget",
#     ) or 0

#     allocated = frappe.db.sql(
#         """
#         select coalesce(sum(cpc_budget_amount), 0)
#         from `tabTask`
#         where cpc_contract = %s
#           and cpc_boq_code = %s
#           and cpc_node_type = 'IRPO'
#         """,
#         (source["contract"], boq_code),
#     )[0][0]

#     return {
#         "cost_budget": cost_budget,
#         "allocated": allocated,
#         "remaining": cost_budget - allocated,
#     }



# @frappe.whitelist()
# def get_boq_summary_for_sales_order(sales_order):
#     """Powers the summary table at the top of the dialog: every BOQ
#     line on this SO, its IRPO count, and remaining budget."""
#     so = frappe.get_doc("Sales Order", sales_order)
#     contract = so.cpc_contract
#     seen = {}
#     for item in so.items:
#         code = item.item_code
#         if code and code not in seen:
#             seen[code] = item.description or item.item_name

#     rows = []
#     for boq_code, description in seen.items():
#         cost_budget = frappe.db.get_value(
#             "Contract BOQ Item",
#             {"parent": contract, "item_code": boq_code},
#             "cost_budget",
#         ) or 0
#         irpo_count, allocated = frappe.db.sql(
#             """
#             select count(*), coalesce(sum(cpc_budget_amount), 0)
#             from `tabTask`
#             where cpc_contract = %s and cpc_boq_code = %s and cpc_node_type = 'IRPO'
#             """,
#             (contract, boq_code),
#         )[0]
#         rows.append({
#             "boq_code": boq_code,
#             "description": description,
#             "irpo_count": irpo_count,
#             "remaining": cost_budget - flt(allocated),
#         })
#     return rows


# @frappe.whitelist()
# def get_irpos_for_boq_line(sales_order, boq_code):
#     """Powers the 'View' popup: existing IRPOs under one BOQ line."""
#     source = get_boq_line_source(sales_order, boq_code)
#     return frappe.get_all(
#         "Task",
#         filters={
#             "cpc_contract": source["contract"],
#             "cpc_boq_code": boq_code,
#             "cpc_node_type": "IRPO",
#         },
#         fields=["subject", "cpc_uom", "cpc_budget_qty", "cpc_budget_amount",
#                 "exp_start_date", "exp_end_date"],
#         order_by="creation asc",
#     )








# import os
# import datetime as dt
# from io import BytesIO

# import frappe
# from frappe import _
# from frappe.utils.csvutils import read_csv_content

# XLSX_MAGIC = b"PK\x03\x04"                       # xlsx is a zip archive
# XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"   # legacy OLE binary format

# # IRPO_COLUMNS order (client-side): subject(0), cpc_uom(1),
# # exp_start_date(2), exp_end_date(3), cpc_budget_qty(4), cpc_budget_amount(5)
# DATE_COLUMN_INDICES = {2, 3}


# def _normalize_date(value):
# 	"""
# 	Coerce a cell into an ISO YYYY-MM-DD string, which is what
# 	Frappe's Date field expects internally.

# 	Handles two cases:
# 	- A real datetime.date/datetime object (openpyxl returns these
# 	  when the source cell is a genuine Excel date, not text).
# 	- A DD-MM-YYYY text string (what our template actually uses, per
# 	  the uploaded sample — e.g. "25-08-2026"). Explicit strptime
# 	  rather than frappe.utils.getdate(), since getdate()'s
# 	  interpretation of an ambiguous string depends on System
# 	  Settings' date format and isn't guaranteed to match the
# 	  template's DD-MM-YYYY convention.
# 	"""
# 	if value in (None, ""):
# 		return ""
# 	if isinstance(value, dt.datetime):
# 		return value.date().isoformat()
# 	if isinstance(value, dt.date):
# 		return value.isoformat()
# 	try:
# 		return dt.datetime.strptime(str(value).strip(), "%d-%m-%Y").date().isoformat()
# 	except ValueError:
# 		# Not a recognizable date — leave as-is so it's visible in the
# 		# grid and the user gets a clear validation error on submit,
# 		# rather than silently dropping or guessing at their data.
# 		return str(value).strip()


# def _cell_to_str(cell):
# 	if cell is None:
# 		return ""
# 	if isinstance(cell, dt.datetime):
# 		return cell.date().isoformat()
# 	if isinstance(cell, dt.date):
# 		return cell.isoformat()
# 	return str(cell)


# def _row_to_str_list(row):
# 	out = []
# 	for idx, cell in enumerate(row):
# 		if idx in DATE_COLUMN_INDICES:
# 			out.append(_normalize_date(cell))
# 		else:
# 			out.append(_cell_to_str(cell))
# 	return out


# @frappe.whitelist()
# def parse_uploaded_irpo_file(file_url):
# 	"""
# 	Parse an uploaded CSV/XLSX file for the "Break into IRPOs" dialog
# 	and return it as a plain list of row-arrays, with the two date
# 	columns (Planned Start / Planned End) normalized to ISO
# 	YYYY-MM-DD so Frappe's Date field renders them correctly.

# 	Format is detected by sniffing the file's magic bytes rather than
# 	trusting the filename/extension.

# 	.xlsx is read directly with openpyxl (a hard dependency of every
# 	Frappe/ERPNext bench) rather than frappe.utils.xlsxutils, whose
# 	kwargs have changed across Frappe versions.

# 	Legacy .xls (pre-2007 binary format) is explicitly rejected with a
# 	clear message — openpyxl can't read it.
# 	"""
# 	file_doc = frappe.get_doc("File", {"file_url": file_url})
# 	content = file_doc.get_content()
# 	if isinstance(content, str):
# 		content = content.encode("utf-8")

# 	if content.startswith(XLSX_MAGIC):
# 		import openpyxl

# 		workbook = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
# 		sheet = workbook.worksheets[0]
# 		rows = [list(row) for row in sheet.iter_rows(values_only=True)]
# 		workbook.close()

# 	elif content.startswith(XLS_MAGIC):
# 		frappe.throw(_(
# 			"This looks like a legacy .xls file (Excel 97-2003 format), which isn't "
# 			"supported. Please open it in Excel and use \"Save As\" \u2192 .xlsx, then "
# 			"upload again."
# 		))

# 	else:
# 		text = content.decode("utf-8-sig", errors="replace")
# 		rows = read_csv_content(text)

# 	return [_row_to_str_list(row) for row in (rows or [])]


















import frappe
from frappe import _
from frappe.utils import flt
from frappe.utils.nestedset import NestedSet  # noqa: F401  (Task is a NestedSet; kept for reference)


# ---------------------------------------------------------------------
# Validation: enforce the "IRPO is always a leaf" rule
# ---------------------------------------------------------------------

def validate_irpo_task(doc, method=None):
    """doc_events hook on Task.validate"""

    if not doc.get("cpc_node_type"):
        return

    if doc.cpc_node_type == "IRPO":
        # An IRPO is always a leaf.
        doc.is_group = 0
        doc.cpc_is_irpo = 1

        # It cannot have children. On an existing doc, check the DB;
        # on a new doc this is moot (nothing can point at it yet).
        if not doc.is_new():
            has_children = frappe.db.exists("Task", {"parent_task": doc.name})
            if has_children:
                frappe.throw(
                    _("{0} is an IRPO and must stay a leaf activity — it cannot have child tasks.")
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

        if not doc.cpc_uom:
            frappe.throw(_("UoM is required on an IRPO."))

    elif doc.cpc_node_type == "BOQ Node":
        doc.is_group = 1
        doc.cpc_is_irpo = 0

    # cpc_irpo_code should be unique within the project when set (not
    # enforced at DB level since BOQ Nodes leave it blank).
    if doc.cpc_irpo_code:
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
                _("IRPO Code {0} is already used in this project ({1}).")
                .format(frappe.bold(doc.cpc_irpo_code), clash)
            )


# ---------------------------------------------------------------------
# Source-line lookup — THE ONE FUNCTION TO CONFIRM/SWAP (see module docstring)
# ---------------------------------------------------------------------

def get_boq_line_source(sales_order, boq_code):
    """
    Returns the fields an IRPO/BOQ Node must fetch from "the source line":
        {
            "project": ...,
            "contract": ...,
            "boq_code": ...,
            "boq_description": ...,
            "default_uom": ...,   # optional, used only to prefill the dialog
        }

    Per the real US-04 sales_order.js: cpc_contract lives directly on the
    Sales Order (not per item), and item_code on a Sales Order Item row
    IS the BOQ code (cpc_boq_code = item_code) — there's no separate
    per-item BOQ-code stamp. So boq_code here is matched against
    Sales Order Item.item_code.
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

    return {
        "project": so.project,
        "contract": so.cpc_contract,
        "boq_code": boq_code,
        "boq_description": item_row.description or item_row.item_name,
        "default_uom": item_row.uom,
    }


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
            "cpc_boq_code": boq_code,
            "cpc_node_type": "BOQ Node",
        },
        "name",
    )
    if existing:
        return existing

    node = frappe.new_doc("Task")
    node.project = source["project"]
    # The BOQ Line (Item Code) IS the parent task's identity — subject
    # is the item code itself; the line description goes in the
    # description field instead of being folded into the subject.
    node.subject = boq_code
    node.description = source.get("boq_description")
    node.is_group = 1
    node.cpc_node_type = "BOQ Node"
    node.cpc_sales_order = sales_order
    node.cpc_contract = source.get("contract")
    node.cpc_boq_code = boq_code
    node.insert(ignore_permissions=False)
    return node.name


# ---------------------------------------------------------------------
# Public API: break a BOQ line into IRPOs
# ---------------------------------------------------------------------


def recompute_boq_budget_fields(contract, boq_code):
    """Snapshot the BOQ line's cost budget, what's allocated across all
    its IRPOs, and what's left — written onto the BOQ Node AND every
    IRPO child under it (single source of truth per BOQ line)."""
    cost_budget = frappe.db.get_value(
        "Contract BOQ Item",
        {"parent": contract, "item_code": boq_code},
        "cost_budget",
    ) or 0

    allocated = frappe.db.sql(
        """
        select coalesce(sum(cpc_budget_amount), 0)
        from `tabTask`
        where cpc_contract = %s
          and cpc_boq_code = %s
          and cpc_node_type = 'IRPO'
        """,
        (contract, boq_code),
    )[0][0]

    remaining = cost_budget - allocated

    # IMPORTANT: frappe.db.set_value with a dict of filters only updates
    # the FIRST matching row, not every match — that was the bug. Fetch
    # every Task sharing this contract+boq_code (the BOQ Node + all its
    # IRPO children) and update each one by name explicitly.
    task_names = frappe.get_all(
        "Task",
        filters={"cpc_contract": contract, "cpc_boq_code": boq_code},
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


@frappe.whitelist()
def break_into_irpos(sales_order, boq_code, irpos):
    """
    Create and/or update IRPOs under one BOQ line.

    Each row in `irpos` may optionally carry `task_name` — the name of
    an existing IRPO Task (loaded via "Get Previous IRPO" in the
    dialog). Rows WITH task_name are UPDATED in place (no new Task);
    rows WITHOUT it are CREATED as new Tasks, exactly as before.
    """
    if isinstance(irpos, str):
        irpos = frappe.parse_json(irpos)

    if not irpos:
        frappe.throw(_("Add at least one IRPO row."))

    source = get_boq_line_source(sales_order, boq_code)
    boq_node = get_or_create_boq_node(sales_order, boq_code)

    updating_names = [row.get("task_name") for row in irpos if row.get("task_name")]

    # ---- US-07: hard stop if this batch would exceed the BOQ budget ----
    cost_budget = frappe.db.get_value(
        "Contract BOQ Item",
        {"parent": source["contract"], "item_code": boq_code},
        "cost_budget",
    ) or 0

    # Existing allocation EXCLUDING the rows we're about to update — their
    # old amount is being replaced by the row's new amount, not added on
    # top of it. Without this exclusion, editing an existing IRPO's own
    # amount would incorrectly count it twice.
    filters_sql = "cpc_contract = %s and cpc_boq_code = %s and cpc_node_type = 'IRPO'"
    params = [source["contract"], boq_code]
    if updating_names:
        placeholders = ", ".join(["%s"] * len(updating_names))
        filters_sql += f" and name not in ({placeholders})"
        params.extend(updating_names)

    existing_allocated = frappe.db.sql(
        f"select coalesce(sum(cpc_budget_amount), 0) from `tabTask` where {filters_sql}",
        tuple(params),
    )[0][0]

    new_total = sum(flt(row.get("cpc_budget_amount")) for row in irpos)
    projected = existing_allocated + new_total

    if projected > cost_budget:
        frappe.throw(
            _("Cannot save these IRPOs: allocating {0} would bring the total to {1}, exceeding this BOQ line's cost budget of {2} by {3}.").format(
                frappe.format_value(new_total, {"fieldtype": "Currency"}),
                frappe.format_value(projected, {"fieldtype": "Currency"}),
                frappe.format_value(cost_budget, {"fieldtype": "Currency"}),
                frappe.format_value(projected - cost_budget, {"fieldtype": "Currency"}),
            )
        )
    # ---- end budget check ----

    created = []
    updated = []

    for row in irpos:
        if not row.get("subject"):
            frappe.throw(_("Every IRPO needs a Subject."))
        if not row.get("cpc_uom"):
            frappe.throw(_("Every IRPO needs a UoM."))

        task_name = row.get("task_name")

        if task_name:
            irpo = frappe.get_doc("Task", task_name)

            # Safety: never let an edited/stray task_name repoint at a
            # Task that isn't actually an IRPO under this BOQ line.
            if irpo.cpc_node_type != "IRPO" or irpo.cpc_boq_code != boq_code:
                frappe.throw(
                    _("{0} is not an existing IRPO under BOQ line {1}.").format(task_name, boq_code)
                )

            irpo.subject = row["subject"]
            irpo.cpc_uom = row["cpc_uom"]
            irpo.cpc_irpo_code = row.get("cpc_irpo_code")
            irpo.exp_start_date = row.get("exp_start_date")
            irpo.exp_end_date = row.get("exp_end_date")
            irpo.cpc_budget_qty = row.get("cpc_budget_qty")
            irpo.cpc_budget_amount = row.get("cpc_budget_amount")
            irpo.save(ignore_permissions=False)
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
            irpo.cpc_boq_code = boq_code
            irpo.cpc_uom = row["cpc_uom"]
            irpo.cpc_irpo_code = row.get("cpc_irpo_code")
            irpo.exp_start_date = row.get("exp_start_date")
            irpo.exp_end_date = row.get("exp_end_date")
            irpo.cpc_budget_qty = row.get("cpc_budget_qty")
            irpo.cpc_budget_amount = row.get("cpc_budget_amount")
            irpo.insert(ignore_permissions=False)
            created.append(irpo.name)

    # ------------------------------------------------------------------
    # Keep the BOQ Node's native "Dependent Tasks" grid (depends_on,
    # child doctype Task Depends On) in sync as a convenience view —
    # per earlier notes, that grid mirrors task/subject/custom_uom/
    # custom_planned_start/custom_planned_end for every IRPO under
    # this BOQ Node.
    #
    # ⚠️ RECONSTRUCTED — I don't have your original append block for
    # `created`, so this covers both created AND updated rows using
    # the fieldnames you confirmed earlier (custom_uom,
    # custom_planned_start, custom_planned_end). Please diff this
    # against your actual code before relying on it.
    # ------------------------------------------------------------------
    if created or updated:
        node_doc = frappe.get_doc("Task", boq_node)
        existing_dep_tasks = {dep.task for dep in node_doc.get("depends_on", [])}
        by_task_name = {}
        for row in irpos:
            key = row.get("task_name")
            by_task_name[key] = row

        touched = False

        # New rows: append a Dependent Task entry if not already present.
        # `created` was built in the same iteration order as the rows
        # without task_name, so zip them back up in order here.
        new_row_iter = iter(created)
        for row in irpos:
            if row.get("task_name"):
                continue
            task_name = next(new_row_iter, None)
            if not task_name or task_name in existing_dep_tasks:
                continue
            dep_row = node_doc.append("depends_on", {})
            dep_row.task = task_name
            dep_row.subject = row["subject"]
            dep_row.custom_uom = row["cpc_uom"]
            dep_row.custom_planned_start = row.get("exp_start_date")
            dep_row.custom_planned_end = row.get("exp_end_date")
            touched = True

        # Updated rows: refresh the matching Dependent Task entry in place.
        for dep_row in node_doc.get("depends_on", []):
            src = by_task_name.get(dep_row.task)
            if not src:
                continue
            dep_row.subject = src["subject"]
            dep_row.custom_uom = src["cpc_uom"]
            dep_row.custom_planned_start = src.get("exp_start_date")
            dep_row.custom_planned_end = src.get("exp_end_date")
            touched = True

        if touched:
            node_doc.save(ignore_permissions=False)

    if created or updated:
        recompute_boq_budget_fields(source["contract"], boq_code)

    return {"boq_node": boq_node, "created": created, "updated": updated}


@frappe.whitelist()
def get_boq_lines_for_sales_order(sales_order):
    """Helper for the dialog: list BOQ codes (= item_code) available on
    this Sales Order, for the picker."""
    so = frappe.get_doc("Sales Order", sales_order)
    seen = {}
    for item in so.items:
        code = item.item_code
        if code and code not in seen:
            seen[code] = item.description or item.item_name
    return [{"boq_code": k, "description": v} for k, v in seen.items()]


@frappe.whitelist()
def get_boq_budget_summary(sales_order, boq_code):
    """Called when the user picks a BOQ Line in the dialog — returns
    the parent BOQ line's cost budget, what's already allocated to
    existing IRPOs under it, what's left, and how many IRPOs already
    exist (used to show/hide the "Get Previous IRPO" button)."""
    source = get_boq_line_source(sales_order, boq_code)

    cost_budget = frappe.db.get_value(
        "Contract BOQ Item",
        {"parent": source["contract"], "item_code": boq_code},
        "cost_budget",
    ) or 0

    irpo_count, allocated = frappe.db.sql(
        """
        select count(*), coalesce(sum(cpc_budget_amount), 0)
        from `tabTask`
        where cpc_contract = %s
          and cpc_boq_code = %s
          and cpc_node_type = 'IRPO'
        """,
        (source["contract"], boq_code),
    )[0]

    return {
        "cost_budget": cost_budget,
        "allocated": allocated,
        "remaining": cost_budget - flt(allocated),
        "irpo_count": irpo_count,
    }


@frappe.whitelist()
def get_boq_summary_for_sales_order(sales_order):
    """Powers the summary table at the top of the dialog: every BOQ
    line on this SO, its IRPO count, and remaining budget."""
    so = frappe.get_doc("Sales Order", sales_order)
    contract = so.cpc_contract
    seen = {}
    for item in so.items:
        code = item.item_code
        if code and code not in seen:
            seen[code] = item.description or item.item_name

    rows = []
    for boq_code, description in seen.items():
        cost_budget = frappe.db.get_value(
            "Contract BOQ Item",
            {"parent": contract, "item_code": boq_code},
            "cost_budget",
        ) or 0
        irpo_count, allocated = frappe.db.sql(
            """
            select count(*), coalesce(sum(cpc_budget_amount), 0)
            from `tabTask`
            where cpc_contract = %s and cpc_boq_code = %s and cpc_node_type = 'IRPO'
            """,
            (contract, boq_code),
        )[0]
        rows.append({
            "boq_code": boq_code,
            "description": description,
            "irpo_count": irpo_count,
            "remaining": cost_budget - flt(allocated),
        })
    return rows


@frappe.whitelist()
def get_irpos_for_boq_line(sales_order, boq_code):
    """Powers the 'View' popup AND the 'Get Previous IRPO' button:
    existing IRPOs under one BOQ line. `name` is included so the
    client can carry it as `task_name` and update-in-place on save."""
    source = get_boq_line_source(sales_order, boq_code)
    return frappe.get_all(
        "Task",
        filters={
            "cpc_contract": source["contract"],
            "cpc_boq_code": boq_code,
            "cpc_node_type": "IRPO",
        },
        fields=["name", "subject", "cpc_uom", "cpc_budget_qty", "cpc_budget_amount",
                "exp_start_date", "exp_end_date"],
        order_by="creation asc",
    )


import os
import datetime as dt
from io import BytesIO

import frappe
from frappe import _
from frappe.utils.csvutils import read_csv_content

XLSX_MAGIC = b"PK\x03\x04"                       # xlsx is a zip archive
XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"   # legacy OLE binary format

# IRPO_COLUMNS order (client-side): subject(0), cpc_uom(1),
# exp_start_date(2), exp_end_date(3), cpc_budget_qty(4), cpc_budget_amount(5)
#
# NOTE: this CSV/XLSX round-trip does not carry `task_name`. If a user
# downloads a table that already has "Get Previous IRPO" rows loaded
# and re-uploads it, those rows will come back in as NEW IRPOs rather
# than updates to the originals. Pre-existing limitation, unchanged
# by the update-vs-create work above — flagging in case it matters.
DATE_COLUMN_INDICES = {2, 3}


def _normalize_date(value):
	"""
	Coerce a cell into an ISO YYYY-MM-DD string, which is what
	Frappe's Date field expects internally.

	Handles two cases:
	- A real datetime.date/datetime object (openpyxl returns these
	  when the source cell is a genuine Excel date, not text).
	- A DD-MM-YYYY text string (what our template actually uses, per
	  the uploaded sample — e.g. "25-08-2026"). Explicit strptime
	  rather than frappe.utils.getdate(), since getdate()'s
	  interpretation of an ambiguous string depends on System
	  Settings' date format and isn't guaranteed to match the
	  template's DD-MM-YYYY convention.
	"""
	if value in (None, ""):
		return ""
	if isinstance(value, dt.datetime):
		return value.date().isoformat()
	if isinstance(value, dt.date):
		return value.isoformat()
	try:
		return dt.datetime.strptime(str(value).strip(), "%d-%m-%Y").date().isoformat()
	except ValueError:
		# Not a recognizable date — leave as-is so it's visible in the
		# grid and the user gets a clear validation error on submit,
		# rather than silently dropping or guessing at their data.
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
	"""
	Parse an uploaded CSV/XLSX file for the "Break into IRPOs" dialog
	and return it as a plain list of row-arrays, with the two date
	columns (Planned Start / Planned End) normalized to ISO
	YYYY-MM-DD so Frappe's Date field renders them correctly.

	Format is detected by sniffing the file's magic bytes rather than
	trusting the filename/extension.

	.xlsx is read directly with openpyxl (a hard dependency of every
	Frappe/ERPNext bench) rather than frappe.utils.xlsxutils, whose
	kwargs have changed across Frappe versions.

	Legacy .xls (pre-2007 binary format) is explicitly rejected with a
	clear message — openpyxl can't read it.
	"""
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
			"This looks like a legacy .xls file (Excel 97-2003 format), which isn't "
			"supported. Please open it in Excel and use \"Save As\" \u2192 .xlsx, then "
			"upload again."
		))

	else:
		text = content.decode("utf-8-sig", errors="replace")
		rows = read_csv_content(text)

	return [_row_to_str_list(row) for row in (rows or [])]