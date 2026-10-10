// Copyright (c) 2026, CPC / Emkaan
// License: see license.txt

frappe.ui.form.on("IRPO Progress", {
	setup(frm) {
		frm.set_query("irpo_task", () => ({
			filters: { cpc_is_irpo: 1, is_group: 0 },
		}));
		frm.set_query("calendar_week", () => ({
			filters: { start_date: ["<=", frappe.datetime.get_today()] },
		}));
	},

	refresh(frm) {
		const state = frm.doc.workflow_state;

		// Draft/pending values are proposals; only an Approved record is official.
		if (!frm.is_new() && frm.doc.docstatus === 0) {
			frm.dashboard.set_headline_alert(
				__("Proposed values only. Official progress on the IRPO does not change until this is approved."),
				"orange"
			);
		}

		if (
			!frm.is_new() &&
			frm.doc.docstatus === 0 &&
			state === "Pending Approval" &&
			frappe.user.has_role("IRPO Progress Approver")
		) {
			frm.add_custom_button(__("Return with Reason"), () => {
				frappe.prompt(
					{ fieldname: "reason", fieldtype: "Small Text", label: __("Reason"), reqd: 1 },
					(values) => {
						frappe
							.call({
								method: "cpc_construction_management.cpc_construction_management.doctype.irpo_progress.irpo_progress.return_for_correction",
								args: { name: frm.doc.name, reason: values.reason },
								freeze: true,
							})
							.then(() => frm.reload_doc());
					},
					__("Return for Correction"),
					__("Return")
				);
			});
		}
	},

	irpo_task(frm) {
		frm.trigger("load_context");
	},

	calendar_week(frm) {
		frm.trigger("load_context");
	},

	load_context(frm) {
		if (frm.doc.docstatus || !frm.doc.irpo_task) {
			return;
		}
		frappe
			.call({
				method: "cpc_construction_management.cpc_construction_management.doctype.irpo_progress.irpo_progress.get_irpo_progress_context",
				args: {
					irpo_task: frm.doc.irpo_task,
					calendar_week: frm.doc.calendar_week || null,
				},
			})
			.then((r) => {
				const ctx = r.message;
				if (!ctx) {
					return;
				}
				const cutoff = ctx.suggested_cutoff;
				delete ctx.suggested_cutoff;
				frm.set_value(ctx);
				if (cutoff && frm.doc.calendar_week) {
					frm.set_value("measurement_cutoff_date", cutoff);
				}
			});
	},
});