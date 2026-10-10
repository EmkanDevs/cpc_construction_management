from cpc_construction_management.cpc_construction_management.budget import irpo_budget

def validate_purchase_order(doc, method):
    irpo_budget.validate_purchase_order(doc)

def on_submit_purchase_order(doc, method):
    irpo_budget.on_submit_purchase_order(doc)

def on_cancel_purchase_order(doc, method):
    irpo_budget.on_cancel_purchase_order(doc)