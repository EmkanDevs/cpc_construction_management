# Copyright (c) 2026, CPC and contributors
# For license information, please see license.txt

"""
US-05 / AC5 — the Connections tab on a Construction Contract should
show the one Project it created (US-03) and every Sales Order raised
against it — base RPO and every variation/change-order SO alike,
since all of them carry the same cpc_contract value.
"""

from frappe import _


def get_data():
	return {
		"fieldname": "cpc_contract",
		"non_standard_fieldnames": {
			"Project": "cpc_source_contract",
		},
		"transactions": [
			{"label": _("Project & Orders"), "items": ["Project", "Sales Order"]},
		],
	}