
import frappe
from frappe import _
from frappe.utils import flt


def get_irpo_conversion_factor(item_code, transaction_uom, irpo_uom):
	"""
	Factor to convert a qty in transaction_uom into irpo_uom, for a given item.
	Reuses ERPNext's own Item UOM conversion mechanism (per spec section 5)
	rather than inventing a parallel one. Both ERPNext conversion factors
	are 'how many stock_uom per 1 of this uom' — stock_uom is used as the
	common pivot to convert between two arbitrary UOMs.
	"""
	if transaction_uom == irpo_uom:
		return 1.0

	from erpnext.stock.get_item_details import get_conversion_factor

	txn_to_stock = get_conversion_factor(item_code, transaction_uom).get("conversion_factor")
	irpo_to_stock = get_conversion_factor(item_code, irpo_uom).get("conversion_factor")

	if not txn_to_stock:
		frappe.throw(
			_("No UOM conversion defined for Item {0}, UOM {1}. Cannot post this transaction "
			  "against the IRPO budget (UOM {2}).").format(item_code, transaction_uom, irpo_uom)
		)
	if not irpo_to_stock:
		frappe.throw(
			_("No UOM conversion defined for Item {0}, IRPO Budget UOM {1}.").format(item_code, irpo_uom)
		)

	return txn_to_stock / irpo_to_stock


def normalize_qty_to_irpo_uom(item_code, transaction_qty, transaction_uom, irpo_uom):
	"""
	Returns (irpo_qty, conversion_factor) for a transaction row — the two
	values the IRPO Quantity Ledger's qty/conversion_factor fields need.
	"""
	factor = get_irpo_conversion_factor(item_code, transaction_uom, irpo_uom)
	return flt(transaction_qty) * factor, factor