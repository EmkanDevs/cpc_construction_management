// // Copyright (c) 2026, info@finbyz.tech and contributors
// // For license information, please see license.txt

// frappe.ui.form.on("Construction Contract", {
// 	refresh(frm) {
// 		// US-02: "Create Item Master" — visible in Draft; also runs
// 		// automatically on submit via on_submit in the controller.
// 		if (frm.doc.docstatus === 0 && !frm.is_new() && (frm.doc.boq_items || []).length) {
// 			frm.add_custom_button(__("Create Item Master"), () => {
// 				frappe.confirm(
// 					__("Create finished-good Items for any BOQ lines that don't have one yet?"),
// 					() => {
// 						frm.call("create_item_master").then(() => {
// 							frm.reload_doc();
// 							frappe.show_alert({ message: __("Item Master updated"), indicator: "green" });
// 						});
// 					}
// 				);
// 			});
// 		}

// 		if (frm.doc.project) {
// 			frm.add_custom_button(__("Project"), () => {
// 				frappe.set_route("Form", "Project", frm.doc.project);
// 			});
// 		}

// 		toggle_revision_fields(frm);
// 	},

// 	onload(frm) {
// 		toggle_revision_fields(frm);
// 	},
// });

// // Child table: Contract BOQ Item (fieldname on parent: boq_items)
// frappe.ui.form.on("Contract BOQ Item", {
// 	qty(frm, cdt, cdn) {
// 		calculate_row(frm, cdt, cdn);
// 	},
// 	rate(frm, cdt, cdn) {
// 		calculate_row(frm, cdt, cdn);
// 	},
// 	cost_budget(frm, cdt, cdn) {
// 		calculate_row(frm, cdt, cdn);
// 	},
// 	boq_items_remove(frm) {
// 		calculate_header_totals(frm);
// 	},
// });

// function calculate_row(frm, cdt, cdn) {
// 	const row = locals[cdt][cdn];

// 	// mirrors calculate_boq_totals() in construction_contract.py so the
// 	// user sees the same numbers live, before any save/validate round-trip
// 	row.amount = flt(row.qty) * flt(row.rate);
// 	row.margin = flt(row.amount) - flt(row.cost_budget);

// 	frm.refresh_field("boq_items");
// 	calculate_header_totals(frm);
// }

// function calculate_header_totals(frm) {
// 	let base_value = 0;
// 	let total_cost_budget = 0;

// 	(frm.doc.boq_items || []).forEach((row) => {
// 		base_value += flt(row.amount);
// 		total_cost_budget += flt(row.cost_budget);
// 	});

// 	// change_order_value / revised_value have no source data now that the
// 	// is_change_order checkbox is removed from Contract BOQ Item — keep
// 	// revised_value mirroring base_value until the change-order flow returns
// 	const target_margin = flt(base_value) - flt(total_cost_budget);
// 	const target_margin_ = base_value ? (target_margin / base_value) * 100 : 0;

// 	frm.set_value("base_value", base_value);
// 	frm.set_value("change_order_value", 0);
// 	frm.set_value("revised_value", base_value);
// 	frm.set_value("total_cost_budget", total_cost_budget);
// 	frm.set_value("target_margin", target_margin);
// 	frm.set_value("target_margin_", target_margin_);

// 	toggle_revision_fields(frm);
// }

// function toggle_revision_fields(frm) {
// 	// Change Order Value / Revised Value stay hidden for now — there's no
// 	// way to flag a change-order line since that checkbox was removed.
// 	// Flip this back on once the change-order flow is reintroduced.
// 	frm.toggle_display(["revised_value", "change_order_value"], false);
// }










// Copyright (c) 2026, info@finbyz.tech and contributors
// For license information, please see license.txt

frappe.ui.form.on("Construction Contract", {
	onload(frm) {
		setup_project_query(frm);
		toggle_revision_fields(frm);
	},

	refresh(frm) {
		setup_project_query(frm);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Create Sales Order"), () => {
				create_sales_order(frm);
			});
		}

		toggle_revision_fields(frm);
	},

	company(frm) {
		validate_or_clear_project(frm);
	},

	customer(frm) {
		validate_or_clear_project(frm);
	},

	use_existing_project(frm) {
		if (!frm.doc.use_existing_project) {
			frm.set_value("project", "");
		}
	},
});

function setup_project_query(frm) {
	frm.set_query("project", () => {
		if (!frm.doc.company || !frm.doc.customer) {
			frappe.msgprint({
				title: __("Missing Filters"),
				indicator: "orange",
				message: __("Please select Company and Customer first to see available projects.")
			});
			return {
				filters: {
					name: ["=", ""]
				}
			};
		}
		return {
			filters: {
				company: frm.doc.company,
				customer: frm.doc.customer
			}
		};
	});
}

function validate_or_clear_project(frm) {
	if (frm.doc.project) {
		frappe.db.get_value("Project", frm.doc.project, ["company", "customer"]).then((r) => {
			if (r && r.message) {
				if (
					(frm.doc.company && r.message.company !== frm.doc.company) ||
					(frm.doc.customer && r.message.customer !== frm.doc.customer)
				) {
					frm.set_value("project", "");
				}
			}
		});
	}
}

function create_sales_order(frm) {
	// Open a new Sales Order with cpc_contract pre-set. Passing it through
	// frappe.new_doc's second arg both sets the value AND fires that
	// field's own trigger, so any fetch_from / custom cpc_contract change
	// handler on Sales Order runs and pulls everything else in.
	frappe.new_doc("Sales Order", {
		cpc_contract: frm.doc.name,
	});
}

// Child table: Contract BOQ Item (fieldname on parent: boq_items)
frappe.ui.form.on("Contract BOQ Item", {
	qty(frm, cdt, cdn) {
		calculate_row(frm, cdt, cdn);
	},
	rate(frm, cdt, cdn) {
		calculate_row(frm, cdt, cdn);
	},
	cost_budget(frm, cdt, cdn) {
		calculate_row(frm, cdt, cdn);
	},
	boq_items_remove(frm) {
		calculate_header_totals(frm);
	},
});

function calculate_row(frm, cdt, cdn) {
	const row = locals[cdt][cdn];

	// mirrors calculate_boq_totals() in construction_contract.py so the
	// user sees the same numbers live, before any save/validate round-trip
	row.amount = flt(row.qty) * flt(row.rate);
	row.margin = flt(row.amount) - flt(row.cost_budget);

	frm.refresh_field("boq_items");
	calculate_header_totals(frm);
}

function calculate_header_totals(frm) {
	let base_value = 0;
	let total_cost_budget = 0;

	(frm.doc.boq_items || []).forEach((row) => {
		base_value += flt(row.amount);
		total_cost_budget += flt(row.cost_budget);
	});

	// change_order_value / revised_value have no source data now that the
	// is_change_order checkbox is removed from Contract BOQ Item — keep
	// revised_value mirroring base_value until the change-order flow returns
	const target_margin = flt(base_value) - flt(total_cost_budget);
	const target_margin_ = base_value ? (target_margin / base_value) * 100 : 0;

	frm.set_value("base_value", base_value);
	frm.set_value("change_order_value", 0);
	frm.set_value("revised_value", base_value);
	frm.set_value("total_cost_budget", total_cost_budget);
	frm.set_value("target_margin", target_margin);
	frm.set_value("target_margin_", target_margin_);

	toggle_revision_fields(frm);
}

function toggle_revision_fields(frm) {
	// Change Order Value / Revised Value stay hidden for now — there's no
	// way to flag a change-order line since that checkbox was removed.
	// Flip this back on once the change-order flow is reintroduced.
	frm.toggle_display(["revised_value", "change_order_value"], false);
}