app_name = "cpc_construction_management"
app_title = "Cpc Construction Management"
app_publisher = "info@finbyz.tech"
app_description = "Construction management of cpc"
app_email = "info@finbyz.tech"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "cpc_construction_management",
# 		"logo": "/assets/cpc_construction_management/logo.png",
# 		"title": "Cpc Construction Management",
# 		"route": "/cpc_construction_management",
# 		"has_permission": "cpc_construction_management.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/cpc_construction_management/css/cpc_construction_management.css"
# app_include_js = "/assets/cpc_construction_management/js/cpc_construction_management.js"

# include js, css files in header of web template
# web_include_css = "/assets/cpc_construction_management/css/cpc_construction_management.css"
# web_include_js = "/assets/cpc_construction_management/js/cpc_construction_management.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "cpc_construction_management/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# doctype_js = {
#     "Sales Order":"public/js/sales_order.js",
#     "Purchase Order": "public/js/purchase_order.js",     
# }

# doctype_tree_js = {
#     "Task": "public/js/task.js"   
# }

# doc_events = {
#     "Sales Order": {
#         "validate": "cpc_construction_management.cpc_construction_management.doc_events.sales_order.validate",
#         "on_submit": "cpc_construction_management.cpc_construction_management.doc_events.sales_order.on_submit",
#     },
#     "Task": {
#         "validate": [
#             "cpc_construction_management.cpc_construction_management.progress.scope_review.validate_irpo_task_cancellation",
#             "cpc_construction_management.cpc_construction_management.doc_events.task.validate_irpo_task",
#         ] 
#     },
#     "Material Request": {
#         "validate": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_expense_account.enforce_irpo_expense_account",
#         ],
#         "before_submit": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
#         ],
#         "on_submit": [
#             "cpc_construction_management.cpc_construction_management.doc_events.material_request.on_submit_material_request",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.mr_on_submit",
#         ],
#         "on_cancel": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.mr_on_cancel",
#     },
#     "Purchase Order": {
#         "before_submit": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
#         ],
#         "before_validate": "cpc_construction_management.cpc_construction_management.budget.irpo_budget.carry_forward_irpo_fields",
#         "validate": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_expense_account.enforce_irpo_expense_account",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_po_direct_fetch.validate_direct_po_linkage",
#         ],
#         "on_submit": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.po_on_submit",
#         "on_cancel": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.po_on_cancel",
#     },
#     "Purchase Receipt": {
#         "before_submit": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
#         ],
#         "validate": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_budget.carry_forward_irpo_fields",
#         ],
#         "on_submit": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pr_on_submit",
#         "on_cancel": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pr_on_cancel",
#     },
#     "Purchase Invoice": {
#         "before_submit": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
#         ],
#         "validate": [
#             "cpc_construction_management.cpc_construction_management.budget.irpo_budget.carry_forward_irpo_fields",
#             "cpc_construction_management.cpc_construction_management.budget.irpo_expense_account.enforce_irpo_expense_account",
#         ],
#         "on_submit": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pi_on_submit",
#         "on_cancel": "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pi_on_cancel",
#     },
# }



# Replace ONLY these three blocks in the app's hooks.py (everything else in hooks.py stays as is).

doctype_js = {
    "Sales Order": "public/js/sales_order.js",
    "Purchase Order": "public/js/purchase_order.js",
    "Material Request": "public/js/irpo_unplanned_mr.js",   # NEW (Task button lives in public/js/task.js)
}

doctype_tree_js = {
    "Task": "public/js/task.js",
}

doc_events = {
    "Sales Order": {
        "validate": "cpc_construction_management.cpc_construction_management.doc_events.sales_order.validate",
        "on_submit": "cpc_construction_management.cpc_construction_management.doc_events.sales_order.on_submit",
    },
    "Task": {
        "validate": [
            "cpc_construction_management.cpc_construction_management.progress.scope_review.validate_irpo_task_cancellation",
            "cpc_construction_management.cpc_construction_management.doc_events.task.validate_irpo_task",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.validate_unplanned_rows",
        ],
    },
    "Material Request": {
        "validate": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_expense_account.enforce_irpo_expense_account",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.resolve_irpo_lines",
        ],
        "on_update": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.ensure_unplanned_rows",
        ],
        "before_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
            "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.warn_unplanned_budget",
        ],
        "on_submit": [
            "cpc_construction_management.cpc_construction_management.doc_events.material_request.on_submit_material_request",
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.mr_on_submit",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.post_unplanned",
        ],
        "on_cancel": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.mr_on_cancel",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.reverse_unplanned",
        ],
    },
    "Purchase Order": {
        "before_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
            "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.warn_unplanned_budget",
        ],
        "before_validate": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget.carry_forward_irpo_fields",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.carry_forward_unplanned",
        ],
        "validate": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_expense_account.enforce_irpo_expense_account",
            "cpc_construction_management.cpc_construction_management.budget.irpo_po_direct_fetch.validate_direct_po_linkage",
        ],
        "on_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.po_on_submit",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.post_unplanned",
        ],
        "on_cancel": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.po_on_cancel",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.reverse_unplanned",
        ],
    },
    "Purchase Receipt": {
        "before_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
            "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.warn_unplanned_budget",
        ],
        "validate": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget.carry_forward_irpo_fields",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.carry_forward_unplanned",
        ],
        "on_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pr_on_submit",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.post_unplanned",
        ],
        "on_cancel": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pr_on_cancel",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.reverse_unplanned",
        ],
    },
    "Purchase Invoice": {
        "before_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget_submitted.validate_irpo_budget_submitted",
            "cpc_construction_management.cpc_construction_management.budget.irpo_quantity_validation.check_quantity_budget",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.warn_unplanned_budget",
        ],
        "validate": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_budget.carry_forward_irpo_fields",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.carry_forward_unplanned",
            "cpc_construction_management.cpc_construction_management.budget.irpo_expense_account.enforce_irpo_expense_account",
        ],
        "on_submit": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pi_on_submit",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.post_unplanned",
        ],
        "on_cancel": [
            "cpc_construction_management.cpc_construction_management.budget.irpo_ledger.pi_on_cancel",
            "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.reverse_unplanned",
        ],
    },
    # NEW: Item Name / Item Type snapshot on every ledger row (planned and unplanned)
    "IRPO Quantity Ledger": {
        "before_insert": ["cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.snapshot_ledger_item_info"],
    },
}




# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "cpc_construction_management/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "cpc_construction_management.utils.jinja_methods",
# 	"filters": "cpc_construction_management.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "cpc_construction_management.install.before_install"
# after_install = "cpc_construction_management.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "cpc_construction_management.uninstall.before_uninstall"
# after_uninstall = "cpc_construction_management.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "cpc_construction_management.utils.before_app_install"
# after_app_install = "cpc_construction_management.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "cpc_construction_management.utils.before_app_uninstall"
# after_app_uninstall = "cpc_construction_management.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "cpc_construction_management.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"cpc_construction_management.tasks.all"
# 	],
# 	"daily": [
# 		"cpc_construction_management.tasks.daily"
# 	],
# 	"hourly": [
# 		"cpc_construction_management.tasks.hourly"
# 	],
# 	"weekly": [
# 		"cpc_construction_management.tasks.weekly"
# 	],
# 	"monthly": [
# 		"cpc_construction_management.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "cpc_construction_management.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "cpc_construction_management.event.get_events"
# }

# override_whitelisted_methods = {
#     "erpnext.projects.doctype.task.task.get_children": "cpc_construction_management.cpc_construction_management.doc_events.task_tree.get_children"
# }

#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "cpc_construction_management.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["cpc_construction_management.utils.before_request"]
# after_request = ["cpc_construction_management.utils.after_request"]

# Job Events
# ----------
# before_job = ["cpc_construction_management.utils.before_job"]
# after_job = ["cpc_construction_management.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"cpc_construction_management.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

fixtures = [
    {"dt": "Custom Field", "filters": [["module", "in", "Cpc Construction Management"]]},
]