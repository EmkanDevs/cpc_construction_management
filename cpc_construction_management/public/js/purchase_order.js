
// const IRPO_API =
// 	"cpc_construction_management.cpc_construction_management.budget.irpo_po_direct_fetch";

// frappe.ui.form.on("Purchase Order", {
// 	refresh(frm) {
// 		if (frm.doc.docstatus !== 0) return;
// 		frm.add_custom_button(__("IRPO"), () => open_irpo_task_dialog(frm), __("Get Items From"));
// 	},
// });

// function inject_irpo_dialog_style() {
// 	if (document.getElementById("irpo-dialog-style")) return;
// 	const style = document.createElement("style");
// 	style.id = "irpo-dialog-style";
// 	style.textContent = `
// 		/* Grid body scrolls up/down and side to side; header stays in view. */
// 		.irpo-table .dt-scrollable {
// 			max-height: 50vh;
// 			overflow: auto !important;
// 		}
// 		/* Empty / hint message: always one line. */
// 		.irpo-empty {
// 			white-space: nowrap;
// 			text-align: center;
// 			padding: 30px 0;
// 		}
// 	`;
// 	document.head.appendChild(style);
// }

// function open_irpo_task_dialog(frm) {
// 	inject_irpo_dialog_style();

// 	const PAGE = 200;
// 	let rows = [];
// 	let start = 0;
// 	let req_id = 0;
// 	let datatable = null;

// 	const d = new frappe.ui.Dialog({
// 		title: __("Select IRPO"),
// 		size: "extra-large",
// 		fields: [
// 			{
// 				fieldname: "project",
// 				fieldtype: "Link",
// 				options: "Project",
// 				label: __("Project"),
// 				reqd: 1,
// 				default: frm.doc.project || undefined,
// 				onchange: () => {
// 					d.set_value("irpo", "");
// 					load(true);
// 				},
// 			},
// 			{ fieldtype: "Column Break" },
// 			{
// 				fieldname: "irpo",
// 				fieldtype: "Link",
// 				options: "Task",
// 				label: __("IRPO / Task"),
// 				get_query: () => ({
// 					filters: {
// 						cpc_is_irpo: 1,
// 						cpc_node_type: "IRPO",
// 						status: ["not in", ["Closed", "Cancelled"]],
// 						project: d.get_value("project") || "",
// 					},
// 				}),
// 				onchange: () => load(true),
// 			},
// 			{ fieldtype: "Column Break" },
// 			{
// 				fieldname: "item_type",
// 				fieldtype: "Select",
// 				label: __("Item Type"),
// 				options: "Planned\nUnplanned",
// 				default: "Planned",
// 				onchange: () => load(true),
// 			},
// 			{ fieldtype: "Section Break" },
// 			{
// 				fieldname: "item_mode",
// 				fieldtype: "Check",
// 				label: __("Select IRPO Item"),
// 				default: 1,
// 				onchange: () => render(),
// 			},
// 			{ fieldname: "results", fieldtype: "HTML" },
// 		],
// 		primary_action_label: __("Get Items"),
// 		primary_action() {
// 			const selected = get_selected();
// 			if (!selected.length) {
// 				frappe.msgprint(__("Please select at least one row."));
// 				return;
// 			}
// 			const project = d.get_value("project");
// 			d.hide();
// 			if (d.get_value("item_mode")) {
// 				fetch_irpo_items_into_po(frm, {
// 					project,
// 					budget_row_refs: selected.map((r) => r.row_ref),
// 				});
// 			} else {
// 				fetch_irpo_items_into_po(frm, {
// 					project,
// 					irpo_tasks: selected.map((r) => r.irpo),
// 				});
// 			}
// 		},
// 	});

// 	const $res = d.fields_dict.results.$wrapper;
// 	$res.html(`
// 		<div class="irpo-table"></div>
// 		<div class="irpo-empty text-muted" style="display:none"></div>
// 		<div class="irpo-more" style="margin-top:10px;display:none">
// 			<button class="btn btn-xs btn-default">${__("More")}</button>
// 		</div>`);
// 	$res.find(".irpo-more button").on("click", () => load(false));

// 	function load(reset) {
// 		const project = d.get_value("project");
// 		if (reset) {
// 			rows = [];
// 			start = 0;
// 		}
// 		if (!project) {
// 			$res.find(".irpo-more").hide();
// 			render();
// 			return;
// 		}

// 		const my_req = ++req_id;
// 		frappe.call({
// 			method: `${IRPO_API}.search_irpo_item_rows`,
// 			args: {
// 				project,
// 				irpo: d.get_value("irpo") || null,
// 				item_type: d.get_value("item_type") || "Planned",
// 				start,
// 				limit: PAGE,
// 			},
// 			callback: (r) => {
// 				if (my_req !== req_id) return; // stale response (e.g. the double load on open)
// 				const batch = r.message || [];
// 				rows = rows.concat(batch);
// 				start += batch.length;
// 				$res.find(".irpo-more").toggle(batch.length === PAGE);
// 				render();
// 			},
// 		});
// 	}

// 	function render() {
// 		const item_mode = !!d.get_value("item_mode");
// 		const money = (v) => format_currency(v || 0, frm.doc.currency);
// 		const type_pill = (v) =>
// 			`<span class="indicator-pill ${v === "Planned" ? "green" : "orange"} no-indicator-dot">${__(v)}</span>`;
// 		let columns, data;

// 		if (item_mode) {
// 			columns = [
// 				{ id: "item_type", name: __("Item Type"), width: 110, format: type_pill },
// 				{ id: "irpo", name: __("IRPO / Task"), width: 150 },
// 				{ id: "task_subject", name: __("Task Subject"), width: 150 },
// 				{ id: "project", name: __("Project"), width: 130 },
// 				{ id: "irpo_budget_amount", name: __("IRPO Budget Amount"), width: 170, align: "right", format: money },
// 				{ id: "item_code", name: __("Item Code"), width: 110 },
// 				{ id: "item_name", name: __("Item Name"), width: 170 },
// 				{ id: "uom", name: __("UOM"), width: 70 },
// 				{ id: "budget_qty", name: __("IRPO Budget Qty"), width: 130, align: "right" },
// 				{ id: "available_qty", name: __("IRPO Available Qty"), width: 150, align: "right" },
// 			];
// 			data = rows.map((r) => ({ ...r, row_ref: r.cpc_irpo_budget_row_ref }));
// 		} else {
// 			columns = [
// 				{ id: "irpo", name: __("IRPO / Task"), width: 180 },
// 				{ id: "task_subject", name: __("Task Subject"), width: 280 },
// 				{ id: "project", name: __("Project"), width: 180 },
// 				{ id: "irpo_budget_amount", name: __("IRPO Budget Amount"), width: 170, align: "right", format: money },
// 			];
// 			const seen = new Set();
// 			data = rows.filter((r) => !seen.has(r.irpo) && seen.add(r.irpo));
// 		}

// 		const DT = frappe.DataTable || window.DataTable;
// 		const $table = $res.find(".irpo-table").empty();
// 		datatable = new DT($table.get(0), {
// 			columns,
// 			data,
// 			// "fixed" keeps each column at its set width, so a wide grid
// 			// scrolls sideways instead of squeezing and cutting headers.
// 			layout: "fixed",
// 			inlineFilters: true,
// 			serialNoColumn: false,
// 			checkboxColumn: true,
// 			cellHeight: 35,
// 			disableReorderColumn: true,
// 			// Real message is shown in .irpo-empty so it stays on one line.
// 			noDataMessage: "\u00A0",
// 		});

// 		const $empty = $res.find(".irpo-empty");
// 		if (data.length) {
// 			$empty.hide();
// 			$table.find(".dt-scrollable").show();
// 		} else {
// 			// Collapse the blank grid body so the message sits right under the filter row.
// 			$table.find(".dt-scrollable").hide();
// 			$empty
// 				.text(
// 					d.get_value("project")
// 						? __("No {0} IRPO items found.", [__(d.get_value("item_type") || "Planned")])
// 						: __("Select a Project to see IRPO items.")
// 				)
// 				.show();
// 		}
// 	}

// 	function get_selected() {
// 		if (!datatable) return [];
// 		return datatable.rowmanager
// 			.getCheckedRows()
// 			.map((i) => datatable.datamanager.data[i])
// 			.filter(Boolean);
// 	}

// 	d.show();
// 	load(true);
// }

// function fetch_irpo_items_into_po(frm, args) {
// 	frappe.call({
// 		method: `${IRPO_API}.get_irpo_items_for_purchase_order`,
// 		args,
// 		freeze: true,
// 		callback: async (r) => {
// 			const rows = r.message || [];
// 			if (!rows.length) {
// 				frappe.msgprint(__("No item rows found."));
// 				return;
// 			}

// 			const added = [];

// 			for (const source of rows) {
// 				const qty = flt(source.available_qty);
// 				if (qty <= 0) continue;

// 				const child = frm.add_child("items");
// 				const dt = child.doctype;
// 				const dn = child.name;

// 				// 1. Set the item FIRST and wait for its triggers. The standard
// 				//    item_code handler fetches item details from the server and
// 				//    writes the Item default expense account (and other defaults)
// 				//    onto the row - anything set before that can be overwritten.
// 				await frappe.model.set_value(dt, dn, "item_code", source.item_code);

// 				// 2. Now set the IRPO values, once the defaults have landed.
// 				await frappe.model.set_value(dt, dn, "uom", source.uom);
// 				await frappe.model.set_value(dt, dn, "qty", qty);
// 				await frappe.model.set_value(dt, dn, {
// 					project: source.project,
// 					task: source.task,
// 					cpc_irpo_budget_row_ref: source.cpc_irpo_budget_row_ref,
// 					schedule_date:
// 						frm.doc.schedule_date || frappe.datetime.add_days(frappe.datetime.get_today(), 7),
// 				});

// 				// 3. Expense account last: always the IRPO Task's account.
// 				await frappe.model.set_value(dt, dn, "expense_account", source.expense_account);

// 				added.push({ name: dn, expense_account: source.expense_account });
// 			}

// 			// Backstop: write the account straight onto the row objects so a late
// 			// server response can't leave the Item default on screen. (The server
// 			// validate hook enforces the same value on save either way.)
// 			added.forEach((a) => {
// 				const row = locals["Purchase Order Item"][a.name];
// 				if (row) row.expense_account = a.expense_account;
// 			});

// 			// Remove the empty placeholder row(s) - ERPNext opens a new PO
// 			// with one blank Items row, and Get IRPO adds rows after it.
// 			remove_empty_item_rows(frm);

// 			frm.refresh_field("items");

// 			if (!added.length) {
// 				frappe.msgprint(__("All selected rows are fully consumed (Available Qty = 0)."));
// 			} else {
// 				frappe.show_alert({ message: __("Fetched {0} item row(s).", [added.length]), indicator: "green" });
// 			}
// 		},
// 	});
// }

// function remove_empty_item_rows(frm) {
// 	const empty_rows = (frm.doc.items || []).filter((row) => !row.item_code);
// 	empty_rows.forEach((row) => frappe.model.clear_doc(row.doctype, row.name));

// 	// Re-number so the grid shows 1..n with no gaps.
// 	(frm.doc.items || []).forEach((row, i) => {
// 		row.idx = i + 1;
// 	});
// }




























const IRPO_API =
	"cpc_construction_management.cpc_construction_management.budget.irpo_po_direct_fetch";

frappe.ui.form.on("Purchase Order", {
	refresh(frm) {
		if (frm.doc.docstatus !== 0) return;
		frm.add_custom_button(__("IRPO"), () => open_irpo_task_dialog(frm), __("Get Items From"));
	},
});

function inject_irpo_dialog_style() {
	if (document.getElementById("irpo-dialog-style")) return;
	const style = document.createElement("style");
	style.id = "irpo-dialog-style";
	style.textContent = `
		/* Grid body scrolls up/down and side to side; header stays in view. */
		.irpo-table .dt-scrollable {
			max-height: 50vh;
			overflow: auto !important;
		}
		/* Empty / hint message: always one line. */
		.irpo-empty {
			white-space: nowrap;
			text-align: center;
			padding: 30px 0;
		}
	`;
	document.head.appendChild(style);
}

function open_irpo_task_dialog(frm) {
	inject_irpo_dialog_style();

	const PAGE = 200;
	let rows = [];
	let start = 0;
	let req_id = 0;
	let datatable = null;

	const d = new frappe.ui.Dialog({
		title: __("Select IRPO"),
		size: "extra-large",
		fields: [
			{
				fieldname: "project",
				fieldtype: "Link",
				options: "Project",
				label: __("Project"),
				reqd: 1,
				default: frm.doc.project || undefined,
				onchange: () => {
					d.set_value("irpo", "");
					load(true);
				},
			},
			{ fieldtype: "Column Break" },
			{
				fieldname: "irpo",
				fieldtype: "Link",
				options: "Task",
				label: __("IRPO / Task"),
				get_query: () => ({
					filters: {
						cpc_is_irpo: 1,
						cpc_node_type: "IRPO",
						status: ["not in", ["Closed", "Cancelled"]],
						project: d.get_value("project") || "",
					},
				}),
				onchange: () => load(true),
			},
			{ fieldtype: "Column Break" },
			{
				fieldname: "item_type",
				fieldtype: "Select",
				label: __("Item Type"),
				options: "Planned\nUnplanned",
				default: "Planned",
				onchange: () => load(true),
			},
			{ fieldtype: "Section Break" },
			{
				fieldname: "item_mode",
				fieldtype: "Check",
				label: __("Select IRPO Item"),
				default: 1,
				onchange: () => render(),
			},
			{ fieldname: "results", fieldtype: "HTML" },
		],
		primary_action_label: __("Get Items"),
		primary_action() {
			const selected = get_selected();
			if (!selected.length) {
				frappe.msgprint(__("Please select at least one row."));
				return;
			}
			const project = d.get_value("project");
			d.hide();
			if (d.get_value("item_mode")) {
				// row_ref is the child row NAME (works for planned and unplanned rows)
				fetch_irpo_items_into_po(frm, {
					project,
					budget_row_refs: selected.map((r) => r.row_ref),
				});
			} else {
				fetch_irpo_items_into_po(frm, {
					project,
					irpo_tasks: selected.map((r) => r.irpo),
				});
			}
		},
	});

	const $res = d.fields_dict.results.$wrapper;
	$res.html(`
		<div class="irpo-table"></div>
		<div class="irpo-empty text-muted" style="display:none"></div>
		<div class="irpo-more" style="margin-top:10px;display:none">
			<button class="btn btn-xs btn-default">${__("More")}</button>
		</div>`);
	$res.find(".irpo-more button").on("click", () => load(false));

	function load(reset) {
		const project = d.get_value("project");
		if (reset) {
			rows = [];
			start = 0;
		}
		if (!project) {
			$res.find(".irpo-more").hide();
			render();
			return;
		}

		const my_req = ++req_id;
		frappe.call({
			method: `${IRPO_API}.search_irpo_item_rows`,
			args: {
				project,
				irpo: d.get_value("irpo") || null,
				item_type: d.get_value("item_type") || "Planned",
				start,
				limit: PAGE,
			},
			callback: (r) => {
				if (my_req !== req_id) return; // stale response (e.g. the double load on open)
				const batch = r.message || [];
				rows = rows.concat(batch);
				start += batch.length;
				$res.find(".irpo-more").toggle(batch.length === PAGE);
				render();
			},
		});
	}

	function render() {
		const item_mode = !!d.get_value("item_mode");
		const money = (v) => format_currency(v || 0, frm.doc.currency);
		const type_pill = (v) =>
			`<span class="indicator-pill ${v === "Planned" ? "green" : "orange"} no-indicator-dot">${__(v)}</span>`;
		let columns, data;

		if (item_mode) {
			columns = [
				{ id: "item_type", name: __("Item Type"), width: 110, format: type_pill },
				{ id: "irpo", name: __("IRPO / Task"), width: 150 },
				{ id: "task_subject", name: __("Task Subject"), width: 150 },
				{ id: "project", name: __("Project"), width: 130 },
				{ id: "irpo_budget_amount", name: __("IRPO Budget Amount"), width: 170, align: "right", format: money },
				{ id: "item_code", name: __("Item Code"), width: 110 },
				{ id: "item_name", name: __("Item Name"), width: 170 },
				{ id: "uom", name: __("UOM"), width: 70 },
				{ id: "budget_qty", name: __("IRPO Budget Qty"), width: 130, align: "right" },
				{ id: "available_qty", name: __("IRPO Available Qty"), width: 150, align: "right" },
			];
			// Child row name = lookup key for both planned and unplanned rows.
			data = rows.map((r) => ({ ...r, row_ref: r.row_name }));
		} else {
			columns = [
				{ id: "irpo", name: __("IRPO / Task"), width: 180 },
				{ id: "task_subject", name: __("Task Subject"), width: 280 },
				{ id: "project", name: __("Project"), width: 180 },
				{ id: "irpo_budget_amount", name: __("IRPO Budget Amount"), width: 170, align: "right", format: money },
			];
			const seen = new Set();
			data = rows.filter((r) => !seen.has(r.irpo) && seen.add(r.irpo));
		}

		const DT = frappe.DataTable || window.DataTable;
		const $table = $res.find(".irpo-table").empty();
		datatable = new DT($table.get(0), {
			columns,
			data,
			// "fixed" keeps each column at its set width, so a wide grid
			// scrolls sideways instead of squeezing and cutting headers.
			layout: "fixed",
			inlineFilters: true,
			serialNoColumn: false,
			checkboxColumn: true,
			cellHeight: 35,
			disableReorderColumn: true,
			// Real message is shown in .irpo-empty so it stays on one line.
			noDataMessage: "\u00A0",
		});

		const $empty = $res.find(".irpo-empty");
		if (data.length) {
			$empty.hide();
			$table.find(".dt-scrollable").show();
		} else {
			// Collapse the blank grid body so the message sits right under the filter row.
			$table.find(".dt-scrollable").hide();
			$empty
				.text(
					d.get_value("project")
						? __("No {0} IRPO items found.", [__(d.get_value("item_type") || "Planned")])
						: __("Select a Project to see IRPO items.")
				)
				.show();
		}
	}

	function get_selected() {
		if (!datatable) return [];
		return datatable.rowmanager
			.getCheckedRows()
			.map((i) => datatable.datamanager.data[i])
			.filter(Boolean);
	}

	d.show();
	load(true);
}

function fetch_irpo_items_into_po(frm, args) {
	frappe.call({
		method: `${IRPO_API}.get_irpo_items_for_purchase_order`,
		args,
		freeze: true,
		callback: async (r) => {
			const rows = r.message || [];
			if (!rows.length) {
				frappe.msgprint(__("No item rows found."));
				return;
			}

			const added = [];

			for (const source of rows) {
				const qty = flt(source.available_qty);
				if (qty <= 0) continue;

				const child = frm.add_child("items");
				const dt = child.doctype;
				const dn = child.name;

				// 1. Set the item FIRST and wait for its triggers. The standard
				//    item_code handler fetches item details from the server and
				//    writes the Item default expense account (and other defaults)
				//    onto the row - anything set before that can be overwritten.
				await frappe.model.set_value(dt, dn, "item_code", source.item_code);

				// 2. Now set the IRPO values, once the defaults have landed.
				await frappe.model.set_value(dt, dn, "uom", source.uom);
				await frappe.model.set_value(dt, dn, "qty", qty);
				await frappe.model.set_value(dt, dn, {
					project: source.project,
					task: source.task,
					// Planned rows carry the budget row ref; unplanned rows carry
					// their IRPO-UPL-##### ref. Exactly one of the two is filled.
					cpc_irpo_budget_row_ref: source.cpc_irpo_budget_row_ref || "",
					cpc_irpo_unplanned_row_ref: source.cpc_irpo_unplanned_row_ref || "",
					schedule_date:
						frm.doc.schedule_date || frappe.datetime.add_days(frappe.datetime.get_today(), 7),
				});

				// 3. Expense account last: always the IRPO Task's account.
				await frappe.model.set_value(dt, dn, "expense_account", source.expense_account);

				added.push({ name: dn, expense_account: source.expense_account });
			}

			// Backstop: write the account straight onto the row objects so a late
			// server response can't leave the Item default on screen. (The server
			// validate hook enforces the same value on save either way.)
			added.forEach((a) => {
				const row = locals["Purchase Order Item"][a.name];
				if (row) row.expense_account = a.expense_account;
			});

			// Remove the empty placeholder row(s) - ERPNext opens a new PO
			// with one blank Items row, and Get IRPO adds rows after it.
			remove_empty_item_rows(frm);

			frm.refresh_field("items");

			if (!added.length) {
				frappe.msgprint(__("All selected rows are fully consumed (Available Qty = 0)."));
			} else {
				frappe.show_alert({ message: __("Fetched {0} item row(s).", [added.length]), indicator: "green" });
			}
		},
	});
}

function remove_empty_item_rows(frm) {
	const empty_rows = (frm.doc.items || []).filter((row) => !row.item_code);
	empty_rows.forEach((row) => frappe.model.clear_doc(row.doctype, row.name));

	// Re-number so the grid shows 1..n with no gaps.
	(frm.doc.items || []).forEach((row, i) => {
		row.idx = i + 1;
	});
}