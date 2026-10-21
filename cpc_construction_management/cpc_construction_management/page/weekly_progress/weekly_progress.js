{% include "cpc_construction_management/cpc_construction_management/page/weekly_progress/weekly_progress_view.js" %}

frappe.pages["weekly-progress"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Weekly Progress"), single_column: true });
	new cpc_construction_management.weekly_progress.View(page);
};
