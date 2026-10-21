// Copyright (c) 2026, CPC / Emkaan
// License: see license.txt

frappe.ui.form.on("CPC Weekly Calendar", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}

		frm.add_custom_button(__("Generate Weeks"), () => {
			frappe.confirm(
				__("Generate all weeks for {0}? Existing weeks are never changed - this only fills in what's missing.", [frm.doc.week_year]),
				() => {
					frm.call("generate_weeks").then((r) => {
						frm.reload_doc();
						if (r.message) {
							frappe.show_alert({
								message: __("{0} of {1} weeks generated for {2}.", [
									r.message.created,
									r.message.total_weeks,
									frm.doc.week_year,
								]),
								indicator: r.message.created ? "green" : "blue",
							});
						}
					});
				}
			);
		}).addClass("btn-primary");
	},
});