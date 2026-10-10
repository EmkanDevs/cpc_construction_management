# Copyright (c) 2026, info@finbyz.tech and contributors
# For license information, please see license.txt

import frappe
from cpc_construction_management.cpc_construction_management.progress.reports import audit_report


def execute(filters=None):
	columns, data, message = audit_report(filters)
	return columns, data, message
