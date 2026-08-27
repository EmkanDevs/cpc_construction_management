
// frappe.ui.form.on('Sales Order', {
// 	cpc_contract(frm) {
// 		if (!frm.doc.cpc_contract) return;

// 		// On select → fetch customer, project, advance %, retention %
// 		// from the contract. Written into production's existing
// 		// "advance_payment" / "retention" fields (not duplicated) —
// 		// setting "retention" also re-triggers calculate_retention()
// 		// via mkan_customization's retention(frm) handler.
// 		frappe.db.get_doc("Construction Contract", frm.doc.cpc_contract).then((contract) => {
// 			frm.set_value("customer", contract.customer);
// 			frm.set_value("project", contract.project);
// 			frm.set_value("advance_payment", contract.advance_percent);
// 			frm.set_value("retention", contract.retention_percent);

// 			populate_items_from_boq(frm, contract);
// 		});

// 		if (frm.doc.cpc_is_change_order) {
// 			refresh_related_sales_orders(frm);
// 		}
// 	},

// 	cpc_is_change_order(frm) {
// 		refresh_related_sales_orders(frm);
// 	},

// 	refresh(frm) {
// 		// The standard "Create Project" button on the Sales Order is
// 		// REMOVED — the project already exists; the SO only links to
// 		// it (read-only).
// 		frm.remove_custom_button(__("Project"), __("Create"));

// 		if (frm.doc.project) {
// 			frm.set_df_property("project", "read_only", 1);
// 		}

// 		// IMPORTANT: this is deliberately set in refresh(), not setup().
// 		// ERPNext core's own transaction controller sets an item_code
// 		// query (Allow Sales / Customer / Has Variants) inside its own
// 		// setup(), and depending on app load order that can run AFTER
// 		// ours and silently win. refresh() always fires strictly after
// 		// every app's setup() has finished, so putting it here
// 		// guarantees this is the query that's actually in effect —
// 		// only this contract's BOQ items are selectable. With no
// 		// contract chosen yet, nothing matches.
// 		frm.set_query("item_code", "items", () => {
// 			if (!frm.doc.cpc_contract) {
// 				return { filters: { name: ["in", []] } };
// 			}
// 			return {
// 				filters: {
// 					cpc_source_contract: frm.doc.cpc_contract,
// 					cpc_is_boq_item: 1,
// 				},
// 			};
// 		});
// 	},
// });

// function populate_items_from_boq(frm, contract) {
// 	// US-04: the contract's BOQ is the source of truth for what's
// 	// sellable on this SO — replace whatever was in the items table
// 	// (empty, or lines picked before the contract was set) with one
// 	// SO line per BOQ line that's already been pushed to Item Master.
// 	// Lines still missing an item_code are skipped; the user needs to
// 	// run "Create Item Master" on the contract first.
// 	frm.clear_table("items");

// 	const boq_items = contract.boq_items || [];
// 	let skipped = 0;

// 	boq_items.forEach((boq_row) => {
// 		if (!boq_row.item_code) {
// 			skipped += 1;
// 			return;
// 		}
// 		const row = frm.add_child("items");
// 		row.item_code = boq_row.item_code;
// 		row.qty = boq_row.qty;
// 	});

// 	frm.refresh_field("items");

// 	// Reuse the existing per-row handlers instead of recalculating rate/
// 	// amount/totals by hand: item_code trigger pulls rate from the
// 	// item's standard_rate (= the BOQ line's rate at Item Master
// 	// creation time, per US-02), and re-setting qty through
// 	// frappe.model.set_value fires ERPNext core's own qty handler,
// 	// which recomputes amount and the SO's grand total.
// 	(frm.doc.items || []).forEach((row) => {
// 		frm.script_manager.trigger("item_code", row.doctype, row.name);
// 		frappe.model.set_value(row.doctype, row.name, "qty", row.qty);
// 	});

// 	if (skipped) {
// 		frappe.show_alert({
// 			message: __("{0} BOQ line(s) skipped — no Item yet. Run Create Item Master on the contract first.", [skipped]),
// 			indicator: "orange",
// 		});
// 	}
// }

// frappe.ui.form.on("Sales Order Item", {
// 	item_code(frm, cdt, cdn) {
// 		const row = locals[cdt][cdn];
// 		if (!row.item_code) return;

// 		// Rate defaults from the BOQ line's sell rate; custom_boq_id
// 		// (the "BOQ Id" column) is set from the item's item_name — no
// 		// separate BOQ-code stamp is needed since item_code on this
// 		// row already IS the BOQ code (cpc_boq_code = item_code).
// 		frappe.db.get_value("Item", row.item_code, ["standard_rate", "item_name"]).then(({ message }) => {
// 			if (!message) return;
// 			if (message.standard_rate) {
// 				frappe.model.set_value(cdt, cdn, "rate", message.standard_rate);
// 			}
// 			frappe.model.set_value(cdt, cdn, "custom_boq_id", message.item_name);
// 		});
// 	},
// });

// function refresh_related_sales_orders(frm) {
// 	if (!frm.doc.cpc_is_change_order) {
// 		frm.clear_table("cpc_related_sales_orders");
// 		frm.refresh_field("cpc_related_sales_orders");
// 		return;
// 	}

// 	if (!frm.doc.cpc_contract) {
// 		frappe.show_alert({
// 			message: __("Set the Construction Contract first to see other Sales Orders on it."),
// 			indicator: "orange",
// 		});
// 		return;
// 	}

// 	frappe.call({
// 		method: "cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_related_sales_orders",
// 		args: { cpc_contract: frm.doc.cpc_contract, exclude: frm.doc.name },
// 		callback(r) {
// 			frm.clear_table("cpc_related_sales_orders");
// 			(r.message || []).forEach((sales_order) => {
// 				const row = frm.add_child("cpc_related_sales_orders");
// 				row.sales_order = sales_order;
// 			});
// 			frm.refresh_field("cpc_related_sales_orders");
// 		},
// 	});
// }

// // ---------------------------------------------------------------------
// // US-06: "Break into IRPOs" — kept as its own frappe.ui.form.on block
// // (own refresh() handler) so it registers alongside the block above
// // instead of editing it. See doc_events/task_irpo.py for the server side.
// // ---------------------------------------------------------------------

// frappe.ui.form.on("Sales Order", {
// 	refresh(frm) {
// 		if (frm.doc.docstatus !== 1) return; // only on submitted SOs
// 		if (!frm.doc.cpc_contract) return;    // no BOQ lines to break down without a contract

// 		frm.add_custom_button(__("Break into IRPOs"), () => {
// 			open_break_into_irpos_dialog(frm);
// 		}, __("Construction"));
// 	},
// });

// function open_break_into_irpos_dialog(frm) {
// 	frappe.call({
// 		method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_boq_lines_for_sales_order",
// 		args: { sales_order: frm.doc.name },
// 		callback: (r) => {
// 			const boq_lines = r.message || [];
// 			if (!boq_lines.length) {
// 				frappe.msgprint(__("No BOQ lines found on this Sales Order."));
// 				return;
// 			}
// 			show_irpo_dialog(frm, boq_lines);
// 		},
// 	});
// }

// // ---------------------------------------------------------------------
// // Download / Upload for the IRPOs dialog grid. The dialog's "irpos"
// // field is a Table field NOT bound to a real frm/child doctype, so it
// // never gets the native Grid toolbar's Download/Upload buttons (those
// // require frm context for import permissions). This reproduces the
// // same look/behaviour as the standard grid toolbar (same classes,
// // same button markup, and the native FileUploader dialog for Upload)
// // against the in-memory grid data instead of a server import.
// //
// // Upload accepts both CSV and Excel (.xlsx/.xls). Parsing happens
// // SERVER-SIDE via parse_uploaded_irpo_file (doc_events/task.py),
// // using Frappe's own openpyxl-backed xlsxutils — the same approach
// // core tools like Data Import / Bank Statement Import use. This
// // avoids any client-side XLSX library entirely: no vendoring, no
// // hooks.py changes, no lazy-loading, nothing that can silently fail
// // to load in the browser. The server always returns a plain array of
// // row-arrays regardless of format, which apply_uploaded_rows() maps
// // onto IRPO_COLUMNS the same way either way.
// // ---------------------------------------------------------------------

// const IRPO_COLUMNS = [
// 	{ fieldname: "subject", label: __("Subject") },
// 	{ fieldname: "cpc_uom", label: __("UoM") },
// 	{ fieldname: "exp_start_date", label: __("Planned Start") },
// 	{ fieldname: "exp_end_date", label: __("Planned End") },
// 	{ fieldname: "cpc_budget_qty", label: __("Budget Qty") },
// 	{ fieldname: "cpc_budget_amount", label: __("Budget Amount") },
// ];

// function csv_row(values) {
// 	return values
// 		.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
// 		.join(",");
// }

// function strip_header_if_present(table) {
// 	const labels = IRPO_COLUMNS.map((c) => c.label);
// 	const has_header = table.length && table[0].map((v) => String(v ?? "")).join("|") === labels.join("|");
// 	return has_header ? table.slice(1) : table;
// }

// function show_irpo_dialog(frm, boq_lines) {
// 	const boq_options = boq_lines.map((l) => l.boq_code);
// 	let budget_state = { cost_budget: 0, existing_allocated: 0 };

// 	const dialog = new frappe.ui.Dialog({
// 		title: __("Break BOQ Line into IRPOs"),
// 		size: "extra-large",
// 		fields: [
// 			{ fieldname: "boq_summary", fieldtype: "HTML" },
// 			{
// 				fieldname: "boq_code",
// 				label: __("BOQ Line (Item Code)"),
// 				fieldtype: "Select",
// 				options: boq_options,
// 				reqd: 1,
// 				onchange: () => on_boq_code_change(),
// 			},
// 			{
// 				fieldname: "irpos",
// 				label: __("IRPOs"),
// 				fieldtype: "Table",
// 				cannot_add_rows: false,
// 				in_place_edit: true,
// 				fields: [
// 					{ fieldname: "subject", label: __("Subject"), fieldtype: "Data", in_list_view: 1, reqd: 1, columns: 2 },
// 					{ fieldname: "cpc_uom", label: __("UoM"), fieldtype: "Link", options: "UOM", in_list_view: 1, reqd: 1, columns: 1 },
// 					{ fieldname: "exp_start_date", label: __("Planned Start"), fieldtype: "Date", in_list_view: 1, columns: 2 },
// 					{ fieldname: "exp_end_date", label: __("Planned End"), fieldtype: "Date", in_list_view: 1, columns: 2 },
// 					{ fieldname: "cpc_budget_qty", label: __("Budget Qty"), fieldtype: "Float", in_list_view: 1, columns: 1,
// 					  onchange: () => refresh_budget_display() },
// 					{ fieldname: "cpc_budget_amount", label: __("Budget Amount"), fieldtype: "Currency", in_list_view: 1, columns: 1,
// 					  onchange: () => refresh_budget_display() },
// 				],
// 				data: [],
// 				get_data: () => dialog.fields_dict.irpos.df.data,
// 			},
// 			{ fieldname: "budget_info", fieldtype: "HTML" },
// 		],
// 		primary_action_label: __("Create IRPOs"),
// 		primary_action: (values) => submit_irpos(values),
// 	});

// 	function render_boq_summary() {
// 		frappe.call({
// 			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_boq_summary_for_sales_order",
// 			args: { sales_order: frm.doc.name },
// 			callback: (r) => {
// 				const rows = r.message || [];
// 				const body = rows.map((row) => `
// 					<tr>
// 						<td>${frappe.utils.escape_html(row.boq_code)}</td>
// 						<td>${frappe.utils.escape_html(row.description || "")}</td>
// 						<td>${row.irpo_count}</td>
						
// 						<td><button class="btn btn-xs btn-default cpc-view-irpos" data-boq="${frappe.utils.escape_html(row.boq_code)}">${__("View")}</button></td>
// 					</tr>
// 				`).join("");
// 				dialog.fields_dict.boq_summary.$wrapper.html(`
// 					<div style="margin-bottom: 12px;">
// 						<b>${__("BOQ / IRPO Summary")}</b>
// 						<table class="table table-bordered" style="margin-top: 6px;">
// 							<thead>
// 								<tr>
// 									<th>${__("BOQ Item Code")}</th>
// 									<th>${__("Description")}</th>
// 									<th>${__("IRPO Count")}</th>
									
// 									<th>${__("Action")}</th>
// 								</tr>
// 							</thead>
// 							<tbody>${body}</tbody>
// 						</table>
// 					</div>
// 				`);
// 				dialog.fields_dict.boq_summary.$wrapper.find(".cpc-view-irpos").on("click", function () {
// 					show_existing_irpos_popup($(this).data("boq"));
// 				});
// 			},
// 		});
// 	}

// 	function show_existing_irpos_popup(boq_code) {
// 		frappe.call({
// 			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpos_for_boq_line",
// 			args: { sales_order: frm.doc.name, boq_code },
// 			callback: (r) => {
// 				const rows = r.message || [];
// 				const body = rows.map((row, i) => `
// 					<tr>
// 						<td>${i + 1}</td>
// 						<td>${frappe.utils.escape_html(row.subject)}</td>
// 						<td>${frappe.utils.escape_html(row.cpc_uom || "")}</td>
// 						<td>${flt(row.cpc_budget_qty)}</td>
// 						<td>${format_currency(row.cpc_budget_amount)}</td>
// 						<td>${row.exp_start_date || ""} → ${row.exp_end_date || ""}</td>
// 					</tr>
// 				`).join("") || `<tr><td colspan="6" class="text-muted">${__("No IRPOs yet")}</td></tr>`;

// 				const popup = new frappe.ui.Dialog({
// 					title: __("{0} — Existing IRPOs ({1})", [boq_code, rows.length]),
// 					fields: [{ fieldname: "list_html", fieldtype: "HTML" }],
// 				});
// 				popup.fields_dict.list_html.$wrapper.html(`
// 					<table class="table table-bordered">
// 						<thead><tr>
// 							<th>#</th><th>${__("IRPO / Subject")}</th><th>${__("UoM")}</th>
// 							<th>${__("Budget Qty")}</th><th>${__("Budget Amount")}</th><th>${__("Planned Dates")}</th>
// 						</tr></thead>
// 						<tbody>${body}</tbody>
// 					</table>
// 				`);
// 				popup.show();
// 			},
// 		});
// 	}

// 	function on_boq_code_change() {
// 		const boq_code = dialog.get_value("boq_code");
// 		if (!boq_code) {
// 			budget_state = { cost_budget: 0, existing_allocated: 0 };
// 			render_budget_info();
// 			return;
// 		}
// 		frappe.call({
// 			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_boq_budget_summary",
// 			args: { sales_order: frm.doc.name, boq_code },
// 			callback: (r) => {
// 				budget_state = {
// 					cost_budget: (r.message || {}).cost_budget || 0,
// 					existing_allocated: (r.message || {}).allocated || 0,
// 				};
// 				render_budget_info();
// 			},
// 		});
// 	}

// 	function current_dialog_total() {
// 		const rows = dialog.fields_dict.irpos.df.data || [];
// 		return rows.reduce((sum, row) => sum + (flt(row.cpc_budget_amount) || 0), 0);
// 	}

// 	function render_budget_info() {
// 		const in_dialog = current_dialog_total();
// 		const allocated_total = budget_state.existing_allocated + in_dialog;
// 		const remaining = budget_state.cost_budget - allocated_total;
// 		const over = remaining < 0;

// 		dialog.fields_dict.budget_info.$wrapper.html(`
// 			<div class="text-muted" style="margin: 4px 0 12px; line-height: 1.8;">
// 				BOQ Cost Budget: <b>${format_currency(budget_state.cost_budget)}</b><br>
// 				Already Allocated (existing IRPOs): <b>${format_currency(budget_state.existing_allocated)}</b><br>
// 				In This Dialog: <b>${format_currency(in_dialog)}</b><br>
// 				Remaining: <b style="${over ? 'color:#d1242f;' : ''}">${format_currency(remaining)}</b>
// 				${over ? '<span style="color:#d1242f;"> — exceeds BOQ budget</span>' : ''}
// 			</div>
// 		`);
// 	}

// 	function refresh_budget_display() {
// 		setTimeout(render_budget_info, 0);
// 	}

// 	function reset_irpos_table() {
// 		dialog.fields_dict.irpos.df.data.length = 0;
// 		dialog.fields_dict.irpos.grid.refresh();
// 	}

// 	function download_irpo_csv() {
// 		const rows = dialog.fields_dict.irpos.df.data || [];
// 		const header = IRPO_COLUMNS.map((c) => c.label);
// 		const body = rows.map((row) => IRPO_COLUMNS.map((c) => row[c.fieldname]));
// 		const csv = [header, ...body].map(csv_row).join("\r\n");
// 		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
// 		const link = document.createElement("a");
// 		link.href = URL.createObjectURL(blob);
// 		link.download = `irpos_${dialog.get_value("boq_code") || "template"}.csv`;
// 		link.click();
// 		URL.revokeObjectURL(link.href);
// 	}

// 	function apply_uploaded_rows(data_rows) {
// 		if (!data_rows || !data_rows.length) return;

// 		const new_rows = data_rows
// 			.filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
// 			.map((r) => {
// 				const obj = {};
// 				IRPO_COLUMNS.forEach((c, i) => {
// 					let val = String(r[i] ?? "").trim();
// 					if (c.fieldname === "cpc_budget_qty" || c.fieldname === "cpc_budget_amount") {
// 						val = flt(val);
// 					}
// 					obj[c.fieldname] = val;
// 				});
// 				return obj;
// 			});

// 		if (!new_rows.length) return;

// 		dialog.fields_dict.irpos.df.data.push(...new_rows);
// 		dialog.fields_dict.irpos.grid.refresh();
// 		render_budget_info();
// 		frappe.show_alert({ message: __("Added {0} row(s) from file.", [new_rows.length]), indicator: "green" });
// 	}

// 	function upload_irpo_csv() {
// 		// Same uploader used everywhere else in the desk (Image, Link,
// 		// Library, Camera, drag-and-drop) instead of a bare <input
// 		// type=file>, so the dialog matches the standard "Upload" UX.
// 		// The uploaded file (CSV or Excel) is parsed SERVER-SIDE by
// 		// parse_uploaded_irpo_file (doc_events/task.py) via Frappe's
// 		// own xlsxutils/csvutils — no client-side XLSX library at all,
// 		// so there's nothing to vendor or lazy-load in the browser.
// 		new frappe.ui.FileUploader({
// 			allow_multiple: false,
// 			restrictions: { allowed_file_types: [".csv", ".xlsx", ".xls"] },
// 			on_success: (file_doc) => {
// 				frappe.call({
// 					method: "cpc_construction_management.cpc_construction_management.doc_events.task.parse_uploaded_irpo_file",
// 					args: { file_url: file_doc.file_url },
// 					freeze: true,
// 					freeze_message: __("Reading file..."),
// 					callback: (r) => {
// 						const rows = strip_header_if_present(r.message || []);
// 						apply_uploaded_rows(rows);
// 					},
// 					error: () => {
// 						frappe.msgprint(__("Could not read the uploaded file."));
// 					},
// 				});
// 			},
// 		});
// 	}

// 	function setup_download_upload_buttons() {
// 		const grid = dialog.fields_dict.irpos.grid;
// 		const $footer = grid.wrapper.find(".grid-footer").first();

// 		$footer.find(".grid-irpo-import-export").remove();

// 		// Own right-aligned row under the footer (below Budget Amount,
// 		// the rightmost column) rather than next to Add Row, so it
// 		// reads as a separate "file" action group.
// 		const $row = $(`<div class="grid-irpo-import-export" style="display: flex; justify-content: flex-end; margin-top: 4px;"></div>`)
// 			.appendTo($footer);

// 		$(`<button class="btn btn-xs btn-secondary grid-download-irpos">${__("Download")}</button>`)
// 			.on("click", download_irpo_csv)
// 			.appendTo($row);

// 		$(`<button class="btn btn-xs btn-secondary grid-upload-irpos" style="margin-left: 4px;" title="${__("CSV or Excel")}">${__("Upload")}</button>`)
// 			.on("click", upload_irpo_csv)
// 			.appendTo($row);
// 	}

// 	function submit_irpos(values) {
// 		if (!values.irpos || !values.irpos.length) {
// 			frappe.msgprint(__("Add at least one IRPO row."));
// 			return;
// 		}
// 		dialog.get_primary_btn().prop("disabled", true);
// 		frappe.call({
// 			method: "cpc_construction_management.cpc_construction_management.doc_events.task.break_into_irpos",
// 			args: { sales_order: frm.doc.name, boq_code: values.boq_code, irpos: values.irpos },
// 			freeze: true,
// 			freeze_message: __("Creating IRPOs..."),
// 			callback: (r) => {
// 				if (r.message) {
// 					frappe.show_alert({
// 						message: __("Created {0} IRPO(s) under {1}.", [r.message.irpos.length, r.message.boq_node]),
// 						indicator: "green",
// 					});
// 					// Stay open: clear the grid, refresh summary + budget
// 					// so the user can pick the next BOQ line right away.
// 					reset_irpos_table();
// 					render_boq_summary();
// 					on_boq_code_change();
// 				}
// 			},
// 			always: () => dialog.get_primary_btn().prop("disabled", false),
// 		});
// 	}

// 	setTimeout(() => {
// 		dialog.fields_dict.irpos.grid.wrapper.on("click", ".grid-add-row, .grid-remove-rows, .grid-row-check", () => {
// 			setTimeout(render_budget_info, 50);
// 		});
// 		setup_download_upload_buttons();
// 	}, 0);

// 	dialog.show();
// 	dialog.$wrapper.find(".modal-dialog").css("max-width", "85vw");

// 	// Persistent CSS rule (not a one-time inline style) so it survives
// 	// Frappe re-rendering the grid's rows on Add Row / data refresh.
// 	$(`<style>
// 		.modal.show .row-check.sortable-handle.col {
// 			flex: 0 0 40px !important;
// 			max-width: 40px !important;
// 			padding-left: 12px !important;
// 			padding-right: 0 !important;
// 		}
// 	</style>`).appendTo(dialog.$wrapper);

// 	render_boq_summary();
// 	render_budget_info();
// 	if (dialog.get_value("boq_code")) on_boq_code_change();
// }


























frappe.ui.form.on('Sales Order', {
	cpc_contract(frm) {
		if (!frm.doc.cpc_contract) return;

		// On select → fetch customer, project, advance %, retention %
		// from the contract. Written into production's existing
		// "advance_payment" / "retention" fields (not duplicated) —
		// setting "retention" also re-triggers calculate_retention()
		// via mkan_customization's retention(frm) handler.
		frappe.db.get_doc("Construction Contract", frm.doc.cpc_contract).then((contract) => {
			frm.set_value("customer", contract.customer);
			frm.set_value("project", contract.project);
			frm.set_value("advance_payment", contract.advance_percent);
			frm.set_value("retention", contract.retention_percent);

			populate_items_from_boq(frm, contract);
		});

		if (frm.doc.cpc_is_change_order) {
			refresh_related_sales_orders(frm);
		}
	},

	cpc_is_change_order(frm) {
		refresh_related_sales_orders(frm);
	},

	refresh(frm) {
		// The standard "Create Project" button on the Sales Order is
		// REMOVED — the project already exists; the SO only links to
		// it (read-only).
		frm.remove_custom_button(__("Project"), __("Create"));

		if (frm.doc.project) {
			frm.set_df_property("project", "read_only", 1);
		}

		// IMPORTANT: this is deliberately set in refresh(), not setup().
		// ERPNext core's own transaction controller sets an item_code
		// query (Allow Sales / Customer / Has Variants) inside its own
		// setup(), and depending on app load order that can run AFTER
		// ours and silently win. refresh() always fires strictly after
		// every app's setup() has finished, so putting it here
		// guarantees this is the query that's actually in effect —
		// only this contract's BOQ items are selectable. With no
		// contract chosen yet, nothing matches.
		frm.set_query("item_code", "items", () => {
			if (!frm.doc.cpc_contract) {
				return { filters: { name: ["in", []] } };
			}
			return {
				filters: {
					cpc_source_contract: frm.doc.cpc_contract,
					cpc_is_boq_item: 1,
				},
			};
		});
	},
});

function populate_items_from_boq(frm, contract) {
	// US-04: the contract's BOQ is the source of truth for what's
	// sellable on this SO — replace whatever was in the items table
	// (empty, or lines picked before the contract was set) with one
	// SO line per BOQ line that's already been pushed to Item Master.
	// Lines still missing an item_code are skipped; the user needs to
	// run "Create Item Master" on the contract first.
	frm.clear_table("items");

	const boq_items = contract.boq_items || [];
	let skipped = 0;

	boq_items.forEach((boq_row) => {
		if (!boq_row.item_code) {
			skipped += 1;
			return;
		}
		const row = frm.add_child("items");
		row.item_code = boq_row.item_code;
		row.qty = boq_row.qty;
	});

	frm.refresh_field("items");

	// Reuse the existing per-row handlers instead of recalculating rate/
	// amount/totals by hand: item_code trigger pulls rate from the
	// item's standard_rate (= the BOQ line's rate at Item Master
	// creation time, per US-02), and re-setting qty through
	// frappe.model.set_value fires ERPNext core's own qty handler,
	// which recomputes amount and the SO's grand total.
	(frm.doc.items || []).forEach((row) => {
		frm.script_manager.trigger("item_code", row.doctype, row.name);
		frappe.model.set_value(row.doctype, row.name, "qty", row.qty);
	});

	if (skipped) {
		frappe.show_alert({
			message: __("{0} BOQ line(s) skipped — no Item yet. Run Create Item Master on the contract first.", [skipped]),
			indicator: "orange",
		});
	}
}

frappe.ui.form.on("Sales Order Item", {
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;

		// Rate defaults from the BOQ line's sell rate; custom_boq_id
		// (the "BOQ Id" column) is set from the item's item_name — no
		// separate BOQ-code stamp is needed since item_code on this
		// row already IS the BOQ code (cpc_boq_code = item_code).
		frappe.db.get_value("Item", row.item_code, ["standard_rate", "item_name"]).then(({ message }) => {
			if (!message) return;
			if (message.standard_rate) {
				frappe.model.set_value(cdt, cdn, "rate", message.standard_rate);
			}
			frappe.model.set_value(cdt, cdn, "custom_boq_id", message.item_name);
		});
	},
});

function refresh_related_sales_orders(frm) {
	if (!frm.doc.cpc_is_change_order) {
		frm.clear_table("cpc_related_sales_orders");
		frm.refresh_field("cpc_related_sales_orders");
		return;
	}

	if (!frm.doc.cpc_contract) {
		frappe.show_alert({
			message: __("Set the Construction Contract first to see other Sales Orders on it."),
			indicator: "orange",
		});
		return;
	}

	frappe.call({
		method: "cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_related_sales_orders",
		args: { cpc_contract: frm.doc.cpc_contract, exclude: frm.doc.name },
		callback(r) {
			frm.clear_table("cpc_related_sales_orders");
			(r.message || []).forEach((sales_order) => {
				const row = frm.add_child("cpc_related_sales_orders");
				row.sales_order = sales_order;
			});
			frm.refresh_field("cpc_related_sales_orders");
		},
	});
}

// ---------------------------------------------------------------------
// US-06: "Break into IRPOs" — kept as its own frappe.ui.form.on block
// (own refresh() handler) so it registers alongside the block above
// instead of editing it. See doc_events/task_irpo.py for the server side.
// ---------------------------------------------------------------------

frappe.ui.form.on("Sales Order", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1) return; // only on submitted SOs
		if (!frm.doc.cpc_contract) return;    // no BOQ lines to break down without a contract

		frm.add_custom_button(__("Break into IRPOs"), () => {
			open_break_into_irpos_dialog(frm);
		}, __("Construction"));
	},
});

function open_break_into_irpos_dialog(frm) {
	frappe.call({
		method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_boq_lines_for_sales_order",
		args: { sales_order: frm.doc.name },
		callback: (r) => {
			const boq_lines = r.message || [];
			if (!boq_lines.length) {
				frappe.msgprint(__("No BOQ lines found on this Sales Order."));
				return;
			}
			show_irpo_dialog(frm, boq_lines);
		},
	});
}

// ---------------------------------------------------------------------
// Download / Upload for the IRPOs dialog grid. The dialog's "irpos"
// field is a Table field NOT bound to a real frm/child doctype, so it
// never gets the native Grid toolbar's Download/Upload buttons (those
// require frm context for import permissions). This reproduces the
// same look/behaviour as the standard grid toolbar (same classes,
// same button markup, and the native FileUploader dialog for Upload)
// against the in-memory grid data instead of a server import.
//
// Upload accepts both CSV and Excel (.xlsx/.xls). Parsing happens
// SERVER-SIDE via parse_uploaded_irpo_file (doc_events/task.py),
// using Frappe's own openpyxl-backed xlsxutils — the same approach
// core tools like Data Import / Bank Statement Import use. This
// avoids any client-side XLSX library entirely: no vendoring, no
// hooks.py changes, no lazy-loading, nothing that can silently fail
// to load in the browser. The server always returns a plain array of
// row-arrays regardless of format, which apply_uploaded_rows() maps
// onto IRPO_COLUMNS the same way either way.
//
// NOTE: the CSV/XLSX round-trip does NOT carry task_name, so rows
// loaded via "Get Previous IRPO" that are then downloaded and
// re-uploaded will come back in as NEW IRPOs rather than updates to
// the originals. Pre-existing limitation of the file round-trip.
// ---------------------------------------------------------------------

const IRPO_COLUMNS = [
	{ fieldname: "subject", label: __("Subject") },
	{ fieldname: "cpc_uom", label: __("UoM") },
	{ fieldname: "exp_start_date", label: __("Planned Start") },
	{ fieldname: "exp_end_date", label: __("Planned End") },
	{ fieldname: "cpc_budget_qty", label: __("Budget Qty") },
	{ fieldname: "cpc_budget_amount", label: __("Budget Amount") },
];

function csv_row(values) {
	return values
		.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
		.join(",");
}

function strip_header_if_present(table) {
	const labels = IRPO_COLUMNS.map((c) => c.label);
	const has_header = table.length && table[0].map((v) => String(v ?? "")).join("|") === labels.join("|");
	return has_header ? table.slice(1) : table;
}

function show_irpo_dialog(frm, boq_lines) {
	const boq_options = boq_lines.map((l) => l.boq_code);
	let budget_state = { cost_budget: 0, existing_allocated: 0 };

	const dialog = new frappe.ui.Dialog({
		title: __("Break BOQ Line into IRPOs"),
		size: "extra-large",
		fields: [
			{ fieldname: "boq_summary", fieldtype: "HTML" },
			{
				fieldname: "boq_code",
				label: __("BOQ Line (Item Code)"),
				fieldtype: "Select",
				options: boq_options,
				reqd: 1,
				onchange: () => on_boq_code_change(),
			},
			{
				// Shown only when the selected BOQ line already has
				// IRPOs created against it (toggled in on_boq_code_change
				// via toggle_get_previous_button). Loads those existing
				// IRPOs into the table below, tagged with task_name so
				// "Create IRPOs" updates them in place instead of
				// creating duplicates.
				fieldname: "get_previous_irpos",
				fieldtype: "Button",
				label: __("Get Previous IRPO"),
				click: () => fetch_previous_irpos(),
			},
			{
				fieldname: "irpos",
				label: __("IRPOs"),
				fieldtype: "Table",
				cannot_add_rows: false,
				in_place_edit: true,
				fields: [
					{ fieldname: "subject", label: __("Subject"), fieldtype: "Data", in_list_view: 1, reqd: 1, columns: 2 },
					{ fieldname: "cpc_uom", label: __("UoM"), fieldtype: "Link", options: "UOM", in_list_view: 1, reqd: 1, columns: 1 },
					{ fieldname: "exp_start_date", label: __("Planned Start"), fieldtype: "Date", in_list_view: 1, columns: 2 },
					{ fieldname: "exp_end_date", label: __("Planned End"), fieldtype: "Date", in_list_view: 1, columns: 2 },
					{ fieldname: "cpc_budget_qty", label: __("Budget Qty"), fieldtype: "Float", in_list_view: 1, columns: 1,
					  onchange: () => refresh_budget_display() },
					{ fieldname: "cpc_budget_amount", label: __("Budget Amount"), fieldtype: "Currency", in_list_view: 1, columns: 1,
					  onchange: () => refresh_budget_display() },
					// Hidden — not in_list_view, so it doesn't render as a
					// grid column. Carries the existing Task's `name` for
					// rows loaded via "Get Previous IRPO", so the server
					// can tell "update this Task" apart from "create a
					// new one". Left blank on genuinely new rows.
					{ fieldname: "task_name", label: __("Task Name"), fieldtype: "Data", read_only: 1 },
				],
				data: [],
				get_data: () => dialog.fields_dict.irpos.df.data,
			},
			{ fieldname: "budget_info", fieldtype: "HTML" },
		],
		primary_action_label: __("Save IRPOs"),
		primary_action: (values) => submit_irpos(values),
	});

	function render_boq_summary() {
		frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_boq_summary_for_sales_order",
			args: { sales_order: frm.doc.name },
			callback: (r) => {
				const rows = r.message || [];
				const body = rows.map((row) => `
					<tr>
						<td>${frappe.utils.escape_html(row.boq_code)}</td>
						<td>${frappe.utils.escape_html(row.description || "")}</td>
						<td>${row.irpo_count}</td>
						
						<td><button class="btn btn-xs btn-default cpc-view-irpos" data-boq="${frappe.utils.escape_html(row.boq_code)}">${__("View")}</button></td>
					</tr>
				`).join("");
				dialog.fields_dict.boq_summary.$wrapper.html(`
					<div style="margin-bottom: 12px;">
						<b>${__("BOQ / IRPO Summary")}</b>
						<table class="table table-bordered" style="margin-top: 6px;">
							<thead>
								<tr>
									<th>${__("BOQ Item Code")}</th>
									<th>${__("Description")}</th>
									<th>${__("IRPO Count")}</th>
									
									<th>${__("Action")}</th>
								</tr>
							</thead>
							<tbody>${body}</tbody>
						</table>
					</div>
				`);
				dialog.fields_dict.boq_summary.$wrapper.find(".cpc-view-irpos").on("click", function () {
					show_existing_irpos_popup($(this).data("boq"));
				});
			},
		});
	}

	function show_existing_irpos_popup(boq_code) {
		frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpos_for_boq_line",
			args: { sales_order: frm.doc.name, boq_code },
			callback: (r) => {
				const rows = r.message || [];
				const body = rows.map((row, i) => `
					<tr>
						<td>${i + 1}</td>
						<td>${frappe.utils.escape_html(row.subject)}</td>
						<td>${frappe.utils.escape_html(row.cpc_uom || "")}</td>
						<td>${flt(row.cpc_budget_qty)}</td>
						<td>${format_currency(row.cpc_budget_amount)}</td>
						<td>${row.exp_start_date || ""} → ${row.exp_end_date || ""}</td>
					</tr>
				`).join("") || `<tr><td colspan="6" class="text-muted">${__("No IRPOs yet")}</td></tr>`;

				const popup = new frappe.ui.Dialog({
					title: __("{0} — Existing IRPOs ({1})", [boq_code, rows.length]),
					fields: [{ fieldname: "list_html", fieldtype: "HTML" }],
				});
				popup.fields_dict.list_html.$wrapper.html(`
					<table class="table table-bordered">
						<thead><tr>
							<th>#</th><th>${__("IRPO / Subject")}</th><th>${__("UoM")}</th>
							<th>${__("Budget Qty")}</th><th>${__("Budget Amount")}</th><th>${__("Planned Dates")}</th>
						</tr></thead>
						<tbody>${body}</tbody>
					</table>
				`);
				popup.show();
			},
		});
	}

	function on_boq_code_change() {
		const boq_code = dialog.get_value("boq_code");
		if (!boq_code) {
			budget_state = { cost_budget: 0, existing_allocated: 0 };
			render_budget_info();
			toggle_get_previous_button(0);
			return;
		}
		frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_boq_budget_summary",
			args: { sales_order: frm.doc.name, boq_code },
			callback: (r) => {
				budget_state = {
					cost_budget: (r.message || {}).cost_budget || 0,
					existing_allocated: (r.message || {}).allocated || 0,
				};
				render_budget_info();
				toggle_get_previous_button((r.message || {}).irpo_count || 0);
			},
		});
	}

	function toggle_get_previous_button(count) {
		dialog.fields_dict.get_previous_irpos.$wrapper.toggle(!!count);
	}

	function fetch_previous_irpos() {
		// Appends the BOQ line's existing IRPOs to whatever is already
		// in the table (per user's choice: append, don't replace), so
		// rows already typed in aren't lost. Skips any IRPO whose
		// task_name is already loaded, so clicking the button twice
		// doesn't duplicate rows inside the dialog itself.
		const boq_code = dialog.get_value("boq_code");
		if (!boq_code) return;

		frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpos_for_boq_line",
			args: { sales_order: frm.doc.name, boq_code },
			callback: (r) => {
				const rows = r.message || [];
				const already_loaded = new Set(
					(dialog.fields_dict.irpos.df.data || []).map((row) => row.task_name).filter(Boolean)
				);
				const new_rows = rows
					.filter((row) => !already_loaded.has(row.name))
					.map((row) => ({
						task_name: row.name,
						subject: row.subject,
						cpc_uom: row.cpc_uom,
						exp_start_date: row.exp_start_date,
						exp_end_date: row.exp_end_date,
						cpc_budget_qty: row.cpc_budget_qty,
						cpc_budget_amount: row.cpc_budget_amount,
					}));

				if (!new_rows.length) {
					frappe.show_alert({ message: __("No additional previous IRPOs to load."), indicator: "orange" });
					return;
				}

				dialog.fields_dict.irpos.df.data.push(...new_rows);
				dialog.fields_dict.irpos.grid.refresh();
				render_budget_info();
				frappe.show_alert({ message: __("Loaded {0} previous IRPO(s).", [new_rows.length]), indicator: "green" });
			},
		});
	}

	function current_dialog_total() {
		const rows = dialog.fields_dict.irpos.df.data || [];
		return rows.reduce((sum, row) => sum + (flt(row.cpc_budget_amount) || 0), 0);
	}

	function render_budget_info() {
		const in_dialog = current_dialog_total();
		const allocated_total = budget_state.existing_allocated + in_dialog;
		const remaining = budget_state.cost_budget - allocated_total;
		const over = remaining < 0;

		dialog.fields_dict.budget_info.$wrapper.html(`
			<div class="text-muted" style="margin: 4px 0 12px; line-height: 1.8;">
				BOQ Cost Budget: <b>${format_currency(budget_state.cost_budget)}</b><br>
				Already Allocated (existing IRPOs): <b>${format_currency(budget_state.existing_allocated)}</b><br>
				In This Dialog: <b>${format_currency(in_dialog)}</b><br>
				Remaining: <b style="${over ? 'color:#d1242f;' : ''}">${format_currency(remaining)}</b>
				${over ? '<span style="color:#d1242f;"> — exceeds BOQ budget</span>' : ''}
			</div>
		`);
	}

	function refresh_budget_display() {
		setTimeout(render_budget_info, 0);
	}

	function reset_irpos_table() {
		dialog.fields_dict.irpos.df.data.length = 0;
		dialog.fields_dict.irpos.grid.refresh();
	}

	function download_irpo_csv() {
		const rows = dialog.fields_dict.irpos.df.data || [];
		const header = IRPO_COLUMNS.map((c) => c.label);
		const body = rows.map((row) => IRPO_COLUMNS.map((c) => row[c.fieldname]));
		const csv = [header, ...body].map(csv_row).join("\r\n");
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = `irpos_${dialog.get_value("boq_code") || "template"}.csv`;
		link.click();
		URL.revokeObjectURL(link.href);
	}

	function apply_uploaded_rows(data_rows) {
		if (!data_rows || !data_rows.length) return;

		const new_rows = data_rows
			.filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
			.map((r) => {
				const obj = {};
				IRPO_COLUMNS.forEach((c, i) => {
					let val = String(r[i] ?? "").trim();
					if (c.fieldname === "cpc_budget_qty" || c.fieldname === "cpc_budget_amount") {
						val = flt(val);
					}
					obj[c.fieldname] = val;
				});
				return obj;
			});

		if (!new_rows.length) return;

		dialog.fields_dict.irpos.df.data.push(...new_rows);
		dialog.fields_dict.irpos.grid.refresh();
		render_budget_info();
		frappe.show_alert({ message: __("Added {0} row(s) from file.", [new_rows.length]), indicator: "green" });
	}

	function upload_irpo_csv() {
		// Same uploader used everywhere else in the desk (Image, Link,
		// Library, Camera, drag-and-drop) instead of a bare <input
		// type=file>, so the dialog matches the standard "Upload" UX.
		// The uploaded file (CSV or Excel) is parsed SERVER-SIDE by
		// parse_uploaded_irpo_file (doc_events/task.py) via Frappe's
		// own xlsxutils/csvutils — no client-side XLSX library at all,
		// so there's nothing to vendor or lazy-load in the browser.
		new frappe.ui.FileUploader({
			allow_multiple: false,
			restrictions: { allowed_file_types: [".csv", ".xlsx", ".xls"] },
			on_success: (file_doc) => {
				frappe.call({
					method: "cpc_construction_management.cpc_construction_management.doc_events.task.parse_uploaded_irpo_file",
					args: { file_url: file_doc.file_url },
					freeze: true,
					freeze_message: __("Reading file..."),
					callback: (r) => {
						const rows = strip_header_if_present(r.message || []);
						apply_uploaded_rows(rows);
					},
					error: () => {
						frappe.msgprint(__("Could not read the uploaded file."));
					},
				});
			},
		});
	}

	function setup_download_upload_buttons() {
		const grid = dialog.fields_dict.irpos.grid;
		const $footer = grid.wrapper.find(".grid-footer").first();

		$footer.find(".grid-irpo-import-export").remove();

		// Own right-aligned row under the footer (below Budget Amount,
		// the rightmost column) rather than next to Add Row, so it
		// reads as a separate "file" action group.
		const $row = $(`<div class="grid-irpo-import-export" style="display: flex; justify-content: flex-end; margin-top: 4px;"></div>`)
			.appendTo($footer);

		$(`<button class="btn btn-xs btn-secondary grid-download-irpos">${__("Download")}</button>`)
			.on("click", download_irpo_csv)
			.appendTo($row);

		$(`<button class="btn btn-xs btn-secondary grid-upload-irpos" style="margin-left: 4px;" title="${__("CSV or Excel")}">${__("Upload")}</button>`)
			.on("click", upload_irpo_csv)
			.appendTo($row);
	}

	function submit_irpos(values) {
		if (!values.irpos || !values.irpos.length) {
			frappe.msgprint(__("Add at least one IRPO row."));
			return;
		}
		dialog.get_primary_btn().prop("disabled", true);
		frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.break_into_irpos",
			args: { sales_order: frm.doc.name, boq_code: values.boq_code, irpos: values.irpos },
			freeze: true,
			freeze_message: __("Saving IRPOs..."),
			callback: (r) => {
				if (r.message) {
					const { created = [], updated = [] } = r.message;
					const parts = [];
					if (created.length) parts.push(__("{0} created", [created.length]));
					if (updated.length) parts.push(__("{0} updated", [updated.length]));
					frappe.show_alert({
						message: __("IRPOs saved under {0}: {1}.", [r.message.boq_node, parts.join(", ") || "0"]),
						indicator: "green",
					});
					// Stay open: clear the grid, refresh summary + budget
					// so the user can pick the next BOQ line right away.
					reset_irpos_table();
					render_boq_summary();
					on_boq_code_change();
				}
			},
			always: () => dialog.get_primary_btn().prop("disabled", false),
		});
	}

	setTimeout(() => {
		dialog.fields_dict.irpos.grid.wrapper.on("click", ".grid-add-row, .grid-remove-rows, .grid-row-check", () => {
			setTimeout(render_budget_info, 50);
		});
		setup_download_upload_buttons();
	}, 0);

	dialog.show();
	dialog.$wrapper.find(".modal-dialog").css("max-width", "85vw");

	// Persistent CSS rule (not a one-time inline style) so it survives
	// Frappe re-rendering the grid's rows on Add Row / data refresh.
	$(`<style>
		.modal.show .row-check.sortable-handle.col {
			flex: 0 0 40px !important;
			max-width: 40px !important;
			padding-left: 12px !important;
			padding-right: 0 !important;
		}
	</style>`).appendTo(dialog.$wrapper);

	render_boq_summary();
	render_budget_info();
	toggle_get_previous_button(0);
	if (dialog.get_value("boq_code")) on_boq_code_change();
}