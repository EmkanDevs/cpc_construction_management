# import frappe
# from frappe import _
# from frappe.utils import nowdate, flt
# from erpnext.accounts.utils import get_fiscal_year

# # TODO: placeholder account — client will confirm the correct account mapping later
# DEFAULT_BUDGET_ACCOUNT = "5112101 - Store Issue - Steel - CPC"


# def on_submit_material_request(doc, method=None):
#     """When a Material Request raised from an IRPO Task is submitted,
#     make sure exactly one Budget exists against that Task."""
#     task_name = get_task_from_items(doc)
#     if not task_name:
#         return

#     if frappe.db.exists("Budget", {"budget_against": "Task", "task": task_name}):
#         return

#     create_budget_for_task(task_name, doc.company)


# def get_task_from_items(doc):
#     """Task lives on Material Request Item, not the header. Return it only
#     when every row agrees on the same Task."""
#     tasks = {d.task for d in doc.items if d.task}

#     if not tasks:
#         return None

#     if len(tasks) > 1:
#         frappe.msgprint(
#             _("This Material Request references multiple Tasks — skipping automatic Budget creation."),
#             alert=True,
#             indicator="orange",
#         )
#         return None

#     return tasks.pop()


# def create_budget_for_task(task_name, company):
#     task = frappe.get_doc("Task", task_name)
#     fiscal_year = get_fiscal_year(nowdate(), company=company)[0]

#     budget_amount = flt(task.cpc_boq_cost_budget)

#     budget = frappe.new_doc("Budget")
#     budget.budget_against = "Task"
#     budget.task = task_name
#     budget.company = company
#     budget.fiscal_year = fiscal_year

#     budget.applicable_on_material_request = 1
#     budget.action_if_annual_budget_exceeded_on_mr = "Warn"
#     budget.action_if_accumulated_monthly_budget_exceeded_on_mr = "Warn"

#     budget.applicable_on_purchase_order = 1
#     budget.applicable_on_booking_actual_expenses = 1
#     budget.action_if_annual_budget_exceeded = "Warn"
#     budget.action_if_accumulated_monthly_budget_exceeded = "Warn"

#     budget.append("accounts", {
#         "account": DEFAULT_BUDGET_ACCOUNT,
#         "budget_amount": budget_amount,
#     })
#     budget.insert(ignore_permissions=True)

#     frappe.msgprint(
#         _("Budget {0} created against Task {1}").format(
#             frappe.utils.get_link_to_form("Budget", budget.name), task_name
#         ),
#         alert=True,
#         indicator="green",
#     )

#     return budget



import frappe
from frappe import _


def on_submit_material_request(doc, method=None):
    """Budgets are created when the IRPO is set up (break_into_irpos),
    not here — this just flags the case where one is unexpectedly
    missing, rather than creating one blind (no account to use)."""
    task_name = get_task_from_items(doc)
    if not task_name:
        return

    if not frappe.db.exists("Budget", {"budget_against": "Task", "task": task_name}):
        frappe.msgprint(
            _("No Budget found against Task {0} — it should have been created when the IRPO was set up.").format(task_name),
            alert=True, indicator="orange",
        )


def get_task_from_items(doc):
    tasks = {d.task for d in doc.items if d.task}
    if not tasks:
        return None
    if len(tasks) > 1:
        frappe.msgprint(
            _("This Material Request references multiple Tasks — skipping automatic Budget check."),
            alert=True, indicator="orange",
        )
        return None
    return tasks.pop()