"""Idempotent setup for the unplanned-item feature.

Run once per site (safe to re-run):
  bench --site cpc.emkan-dev.com execute \
    cpc_construction_management.cpc_construction_management.setup.irpo_unplanned_fields.execute
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

ROW_REF = dict(
    fieldname="cpc_irpo_unplanned_row_ref", label="IRPO Unplanned Row Ref",
    fieldtype="Data", read_only=1, print_hide=1, insert_after="cpc_irpo_budget_row_ref",
)

FIELDS = {
    # Task: the separate Unplanned Items / Services table (Task is a standard doctype)
    "Task": [
        dict(fieldname="custom_irpo_unplanned_item", label="Unplanned Items / Services",
             fieldtype="Table", options="IRPO Unplanned Item",
             insert_after="custom_items_table", depends_on="eval:doc.cpc_is_irpo"),
    ],
    # Planned child table: Item Name + classification (requirement #11, #12)
    "Item Table": [
        dict(fieldname="item_name", label="Item Name", fieldtype="Data", read_only=1,
             fetch_from="item.item_name", insert_after="item", in_list_view=1),
        dict(fieldname="irpo_item_type", label="IRPO Item Type", fieldtype="Link",
             options="IRPO Item Type", insert_after="item_name"),
    ],
    # Carry the unplanned reference MR -> PO -> PR -> PI
    "Material Request Item": [ROW_REF],
    "Purchase Order Item": [ROW_REF],
    "Purchase Receipt Item": [ROW_REF],
    "Purchase Invoice Item": [ROW_REF],
    # Ledger: item name / type snapshots + planned-vs-unplanned flag (#10, #11, #13)
    "IRPO Quantity Ledger": [
        dict(fieldname="item_name", label="Item Name", fieldtype="Data", read_only=1, insert_after="item"),
        dict(fieldname="irpo_item_type", label="IRPO Item Type (Snapshot)", fieldtype="Data",
             read_only=1, insert_after="item_name"),
        dict(fieldname="is_unplanned", label="Is Unplanned", fieldtype="Check", read_only=1,
             default="0", in_list_view=1, insert_after="irpo_item_type"),
        dict(fieldname="irpo_unplanned_row_ref", label="IRPO Unplanned Row Ref", fieldtype="Data",
             read_only=1, search_index=1, insert_after="irpo_budget_row_ref"),
    ],
}

ITEM_TYPES = ["Material", "Service", "Asset", "Subcontractor"]


def execute():
    create_custom_fields(FIELDS, update=True)

    # Unplanned ledger rows carry NO planned budget row ref (spec section 7.1)
    make_property_setter("IRPO Quantity Ledger", "irpo_budget_row_ref", "reqd", 0, "Check")

    for t in ITEM_TYPES:
        if not frappe.db.exists("IRPO Item Type", t):
            frappe.get_doc({"doctype": "IRPO Item Type", "item_type_name": t}).insert(ignore_permissions=True)

    frappe.clear_cache()
    print("IRPO unplanned fields, ledger flags and item types ready.")