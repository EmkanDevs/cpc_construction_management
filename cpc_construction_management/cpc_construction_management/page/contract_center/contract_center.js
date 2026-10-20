frappe.provide("cpc_construction_management.contract_center");

{% include "cpc_construction_management/cpc_construction_management/page/weekly_progress/weekly_progress_view.js" %}
{% include "cpc_construction_management/cpc_construction_management/page/contract_center/contract_center_view.js" %}
{% include "cpc_construction_management/cpc_construction_management/page/contract_center/contract_center_renderer.js" %}
{% include "cpc_construction_management/cpc_construction_management/page/contract_center/contract_center_dialogs.js" %}
{% include "cpc_construction_management/cpc_construction_management/page/contract_center/contract_center_planner.js" %}
{% include "cpc_construction_management/cpc_construction_management/page/contract_center/contract_center_irpo_viewer.js" %}
{% include "cpc_construction_management/cpc_construction_management/page/contract_center/contract_center_mr_dialog.js" %}

frappe.pages["contract-center"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Construction Control Center"),
		single_column: true,
	});

	$(wrapper).find(".page-head").addClass("hide");
	$(frappe.render_template("contract_center")).appendTo(page.main);
	page.contract_center = new cpc_construction_management.contract_center.View(page);
};

frappe.pages["contract-center"].on_page_show = function (wrapper) {
	wrapper.page.contract_center?.refresh();
};
