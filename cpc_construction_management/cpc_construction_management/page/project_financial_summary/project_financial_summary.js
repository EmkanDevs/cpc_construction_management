frappe.provide("cpc_construction_management.project_financial_summary");

{% include "cpc_construction_management/cpc_construction_management/page/project_financial_summary/project_financial_summary_view.js" %}

frappe.pages["project-financial-summary"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Project Financial Summary"),
		single_column: true,
	});

	$(wrapper).find(".page-head").addClass("hide");
	wrapper.project_financial_summary = new cpc_construction_management.project_financial_summary.View(page);
};

frappe.pages["project-financial-summary"].on_page_show = function (wrapper) {
	if (frappe.route_options && frappe.route_options.project) {
		const new_proj = frappe.route_options.project;
		frappe.route_options = null;
		if (wrapper.project_financial_summary && wrapper.project_financial_summary.selected_project !== new_proj) {
			wrapper.project_financial_summary.selected_project = new_proj;
			if (wrapper.project_financial_summary.project_field) {
				wrapper.project_financial_summary.project_field.set_value(new_proj);
			}
			wrapper.project_financial_summary.load_summary();
		}
	}
};