// /**
//  * IRPO Task Detail Viewer
//  * Opens when the 👁 eye button on a Leaf IRPO row is clicked in the planner.
//  *
//  * 5 tabs:
//  *  1. Overview & General  – identity, hierarchy, schedule fields
//  *  2. Items Details       – planned item rows
//  *  3. Unplanned Items     – unplanned item rows
//  *  4. Dual Budget & Consumption – budget stat cards + ledger status
//  *  5. Progress & History  – IRPO quantity ledger entries
//  *
//  * Edit mode: clicking "Edit Document" makes editable fields writeable.
//  * Save mode: a Save button appears in the footer.
//  */
// // Mirrors ERPNext's Task list indicator colors (erpnext/.../task_list.js
// // get_indicator) so the header capsule matches the Task list status colors.
// const IRPO_VIEWER_STATUS_COLORS = {
// 	Open: "orange",
// 	Working: "orange",
// 	"Pending Review": "orange",
// 	Overdue: "red",
// 	Completed: "green",
// 	Cancelled: "gray",
// 	Template: "blue",
// };

// cpc_construction_management.contract_center.IRPOViewer = class IRPOViewer {
// 	constructor(view) {
// 		this.view = view;
// 		this.$root = view.$root;
// 		this.$modal = this.$root.find("#cc-irpo-viewer-modal");
// 		this._edit_mode = false;
// 		this._task_name = null;
// 		this._task = null;
// 		this._bind_events();
// 	}

// 	// ── Public ──────────────────────────────────────────────────────────────

// 	async open(task_name) {
// 		this._task_name = task_name;
// 		this._edit_mode = false;
// 		this._task = null;
// 		this.$modal.removeClass("hide").attr("aria-hidden", "false");
// 		this._set_tab("overview");
// 		this._render_loading();
// 		try {
// 			const r = await frappe.call({
// 				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpo_task_detail",
// 				args: { task_name },
// 			});
// 			if (!r || !r.message) {
// 				this._render_error();
// 				console.error("IRPOViewer: empty response for task", task_name);
// 				return;
// 			}
// 			this._task = r.message;
// 			this._render_all();
// 		} catch (err) {
// 			this._render_error();
// 			console.error("IRPOViewer load error", err);
// 		}
// 	}

// 	close() {
// 		this.$modal.addClass("hide").attr("aria-hidden", "true");
// 		this._task = null;
// 		this._task_name = null;
// 		this._exit_edit_mode();
// 	}

// 	// ── Event binding ───────────────────────────────────────────────────────

// 	_bind_events() {
// 		const $m = this.$modal;

// 		// Close
// 		$m.on("click", "[data-irpo-viewer-close]", () => this.close());

// 		// Tab switching
// 		$m.on("click", "[data-viewer-tab]", (e) => {
// 			this._set_tab($(e.currentTarget).data("viewer-tab"));
// 		});

// 		// Connections: open the doctype list filtered to the linked entries,
// 		// exactly like the Frappe Connections sidebar (count badge per doctype).
// 		$m.on("click", ".cc-viewer-conn-chip", (e) => {
// 			const $chip = $(e.currentTarget);
// 			const doctype = $chip.data("doctype");
// 			let names = $chip.data("names");
// 			if (!doctype || !names) return;
// 			if (typeof names === "string") {
// 				try {
// 					names = JSON.parse(names);
// 				} catch (err) {
// 					return;
// 				}
// 			}
// 			if (!Array.isArray(names) || !names.length) return;
// 			this.close();
// 			frappe.route_options = { name: ["in", names] };
// 			frappe.set_route("List", doctype);
// 		});

// 		// Create Material Request from this IRPO/Task — close the viewer first so
// 		// the MR dialog is not hidden behind this modal.
// 		$m.on("click", "[data-viewer-create-mr]", () => {
// 			if (!this._task || !this.view || !this.view.mr_dialog) return;
// 			const task = this._task;
// 			this.close();
// 			this.view.mr_dialog.open(task);
// 		});

// 		// Edit Document button
// 		$m.on("click", "[data-viewer-edit]", () => this._enter_edit_mode());

// 		// Save button — persists the Overview & General fields *and* the
// 		// Items grid, so there is a single save action for the whole dialog.
// 		$m.on("click", "[data-viewer-save]", () => this._save());

// 		// Cancel edit
// 		$m.on("click", "[data-viewer-cancel-edit]", () => this._exit_edit_mode());

// 		// Items grid: Add Row
// 		$m.on("click", "[data-items-add-row]", () => this._items_add_row());

// 		// Items grid: Delete Row
// 		$m.on("click", "[data-items-del-row]", (e) => {
// 			$(e.currentTarget).closest("tr").remove();
// 			this._items_mark_dirty();
// 		});

// 		// Items grid: track changes
// 		$m.on("input change", "[data-viewer-panel='items'] .cc-items-edit-input", () => this._items_mark_dirty());

// 		// Unplanned Items grid: Add Row
// 		$m.on("click", "[data-unplanned-add-row]", () => this._unplanned_add_row());

// 		// Unplanned Items grid: Delete Row
// 		$m.on("click", "[data-unplanned-del-row]", (e) => {
// 			$(e.currentTarget).closest("tr").remove();
// 			this._unplanned_mark_dirty();
// 		});

// 		// Unplanned Items grid: track changes
// 		$m.on("input change", "[data-viewer-panel='unplanned_items'] .cc-items-edit-input", () => this._unplanned_mark_dirty());

// 		// Color picker: live-update the hex label on 'input' (while the picker is
// 		// open) and save to the server on 'change' (when the picker is closed).
// 		$m.on("input", "[data-viewer-color-pick]", (e) => {
// 			const color = $(e.currentTarget).val();
// 			$m.find(".cc-viewer-color-label").text(color);
// 		});
// 		$m.on("change", "[data-viewer-color-pick]", (e) => {
// 			const color = $(e.currentTarget).val();
// 			this._save_color(color);
// 		});

// 		// Escape key
// 		$(document).on("keydown.irpo-viewer", (e) => {
// 			if (e.key === "Escape" && !$m.hasClass("hide")) this.close();
// 		});
// 	}

// 	// ── Tab management ──────────────────────────────────────────────────────

// 	_set_tab(tab_id) {
// 		const $m = this.$modal;
// 		$m.find("[data-viewer-tab]").removeClass("cc-viewer-tab-active");
// 		$m.find(`[data-viewer-tab='${tab_id}']`).addClass("cc-viewer-tab-active");
// 		$m.find("[data-viewer-panel]").addClass("hide");
// 		$m.find(`[data-viewer-panel='${tab_id}']`).removeClass("hide");
// 		$m.find(".cc-irpo-viewer-card").toggleClass("cc-viewer-wide", tab_id === "items" || tab_id === "unplanned_items");
// 	}

// 	// ── Loading / error states ──────────────────────────────────────────────

// 	_render_loading() {
// 		const $m = this.$modal;
// 		$m.find(".cc-viewer-header-title").html(
// 			`<span class="cc-viewer-skeleton cc-viewer-skeleton-title"></span>`
// 		);
// 		$m.find(".cc-viewer-header-sub").html(
// 			`<span class="cc-viewer-skeleton cc-viewer-skeleton-sub"></span>`
// 		);
// 		["overview", "items", "unplanned_items", "budget", "progress"].forEach((tab) => {
// 			$m.find(`[data-viewer-panel='${tab}']`).html(
// 				`<div class="cc-viewer-loading-body"><span class="cc-viewer-skeleton cc-viewer-skeleton-body"></span></div>`
// 			);
// 		});
// 	}

// 	_render_error() {
// 		const msg = `<p class="cc-viewer-error">${__("Could not load IRPO task details.")}</p>`;
// 		this.$modal.find("[data-viewer-panel='overview']").html(msg);
// 		this.$modal.find("[data-viewer-panel='items']").html(msg);
// 		this.$modal.find("[data-viewer-panel='unplanned_items']").html(msg);
// 	}

// 	// ── Full render ─────────────────────────────────────────────────────────

// 	_render_all() {
// 		const t = this._task;
// 		const $m = this.$modal;

// 		// ---- Header ----
// 		const so_part = t.cpc_sales_order ? `: ${frappe.utils.escape_html(t.cpc_sales_order)}` : "";
// 		const status_color = IRPO_VIEWER_STATUS_COLORS[t.status] || "gray";
// 		$m.find(".cc-viewer-header-title").html(
// 			`${frappe.utils.escape_html(t.subject || t.name)}${so_part}
// 			<span class="cc-viewer-badge cc-viewer-badge-${status_color}">${frappe.utils.escape_html(t.status || "")}</span>`
// 		);
// 		const boq_label = t.cpc_boq_code ? `• ${__("BOQ Item")}: <strong>${frappe.utils.escape_html(t.cpc_boq_code)}</strong>` : "";
// 		const proj_label = t.project ? `${__("Project")}: <strong>${frappe.utils.escape_html(t.project_name || t.project)}</strong>` : "";
// 		$m.find(".cc-viewer-header-sub").html(`${proj_label} ${boq_label}`);

// 		// ---- Tab 1: Overview & General ----
// 		$m.find("[data-viewer-panel='overview']").html(this._render_overview(t));

// 		// ---- Tab 2: Items Details ----
// 		$m.find("[data-viewer-panel='items']").html(this._render_items(t));
// 		this._items_make_controls();

// 		// ---- Tab 3: Unplanned Item Details ----
// 		$m.find("[data-viewer-panel='unplanned_items']").html(this._render_unplanned_items(t));
// 		this._unplanned_make_controls();

// 		// ---- Tab 4: Dual Budget & Consumption ----
// 		$m.find("[data-viewer-panel='budget']").html(this._render_budget(t));

// 		// ---- Tab 5: Progress & History ----
// 		$m.find("[data-viewer-panel='progress']").html(this._render_progress(t));

// 		// Reset edit mode UI
// 		this._exit_edit_mode();
// 	}

// 	// ── Tab renderers ───────────────────────────────────────────────────────

// 	// Horizontal row of linked-document connections (Budget / Material Request /
// 	// Purchase Order) shown above the Overview fields. Each doctype is a single
// 	// clickable badge showing the connection count, in the style of Frappe's
// 	// Connections sidebar; clicking it opens the doctype's list filtered to the
// 	// linked entries for this IRPO.
// 	_render_connections(t) {
// 		const connections = t.connections;
// 		if (!connections) return "";
// 		const esc = (v) => frappe.utils.escape_html(v || "");
// 		const groups = [
// 			{ key: "Budget", label: __("Budget") },
// 			{ key: "Material Request", label: __("Material Request") },
// 			{ key: "Purchase Order", label: __("Purchase Order") },
// 		];
// 		const groups_html = groups.map((g) => {
// 			const docs = connections[g.key] || [];
// 			const chips = docs.length
// 				? `<button class="cc-viewer-conn-chip" data-doctype="${esc(docs[0].doctype)}"
// 							data-names='${esc(JSON.stringify(docs.map((d) => d.name)))}'
// 							title="${__("List {0} linked to this IRPO", [g.label])}">
// 						${docs.length}
// 					</button>`
// 				: `<span class="cc-viewer-conn-none">0</span>`;
// 			return `
// 	<div class="cc-viewer-conn-group">
// 		<span class="cc-viewer-conn-label">${g.label}</span>
// 		<div class="cc-viewer-conn-chips">${chips}</div>
// 	</div>`;
// 		}).join("");

// 		return `
// <h4 class="cc-viewer-section-title">${__("Connections")}</h4>
// <div class="cc-viewer-connections-wrap">
// 	<div class="cc-viewer-connections">
// 		${groups_html}
// 	</div>
// 	<div class="cc-viewer-conn-actions">
// 		<button type="button" class="btn btn-xs btn-primary" data-viewer-create-mr>${__(
// 			"+ Create MR"
// 		)}</button>
// 	</div>
// </div>`;
// 	}

// 	_render_overview(t) {
// 		const fmt_money = (v) => format_currency(flt(v), "SAR");
// 		const fmt_num = (v) => (v == null || v === "" ? "—" : flt(v));
// 		const fmt_text = (v) => (v == null || v === "" ? "—" : frappe.utils.escape_html(v));

// 		return `
// ${this._render_connections(t)}
// <div class="cc-viewer-section-row cc-viewer-three-col">
// 	<div class="cc-viewer-field">
// 		<label>${__("IRPO / Task ID")}</label>
// 		<div class="cc-viewer-value" data-edit-field="name">${frappe.utils.escape_html(t.name)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Subject / Description")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="subject">${frappe.utils.escape_html(t.subject || "")}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Project")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="project"
// 			data-link-doctype="Project">
// 			${frappe.utils.escape_html(t.project_name || t.project || "—")}
// 		</div>
// 	</div>
// </div>

// <div class="cc-viewer-three-col">
// 	<div class="cc-viewer-field">
// 		<label>${__("Sales Order (RPO)")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_sales_order"
// 			data-link-doctype="Sales Order">
// 			${frappe.utils.escape_html(t.cpc_sales_order || "—")}
// 		</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Construction Contract")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_contract"
// 			data-link-doctype="Construction Contract">${fmt_text(t.cpc_contract)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("BOQ Code")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_boq_code">${fmt_text(t.cpc_boq_code)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Gantt Color")}</label>
// 		<div class="cc-viewer-color-field">
// 			<input type="color" class="cc-viewer-color-pick" data-viewer-color-pick
// 				value="${frappe.utils.escape_html(t.color || "#2490ef")}"
// 				title="${__("Pick a color for the Gantt bar")}">
// 			<span class="cc-viewer-color-label">${frappe.utils.escape_html(t.color || "#2490ef")}</span>
// 		</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Planned Start")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="exp_start_date" data-field-type="Date">
// 			${t.exp_start_date ? frappe.datetime.str_to_user(t.exp_start_date) : "—"}
// 		</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Planned End")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="exp_end_date" data-field-type="Date">
// 			${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : "—"}
// 		</div>
// 	</div>
// </div>

// <h4 class="cc-viewer-section-title">${__("CPC / IRPO")}</h4>
// <div class="cc-viewer-three-col">
// 	<div class="cc-viewer-field">
// 		<label>${__("Budget Qty")}</label>
// 		<div class="cc-viewer-value">${fmt_num(t.cpc_budget_qty)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Budget Amount")}</label>
// 		<div class="cc-viewer-value">${fmt_money(t.cpc_budget_amount)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("UOM")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_uom" data-link-doctype="UOM">${fmt_text(t.cpc_uom)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("BOQ Cost Budget")}</label>
// 		<div class="cc-viewer-value">${fmt_money(t.cpc_boq_cost_budget)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("BOQ Budget Allocated")}</label>
// 		<div class="cc-viewer-value">${fmt_money(t.cpc_boq_budget_allocated)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("BOQ Budget Remaining")}</label>
// 		<div class="cc-viewer-value">${fmt_money(t.cpc_boq_budget_remaining)}</div>
// 	</div>
// 	<div class="cc-viewer-field">
// 		<label>${__("Account")}</label>
// 		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="account"
// 			data-link-doctype="Account">${fmt_text(t.account)}</div>
// 	</div>
// </div>`;
// 	}

// 	_render_items(t) {
// 		const rows = t.items || [];

// 		// Build editable row HTML for each existing item
// 		const rows_html = rows.map((r) => this._items_row_html(r)).join("");

// 		return `
// <h4 class="cc-viewer-section-title">${__("ITEMS DETAILS")}</h4>
// <span class="cc-items-dirty-badge hide" data-items-dirty-indicator>${__("Unsaved changes")}</span>
// <div class="cc-viewer-table-wrap cc-items-table-wrap">
// 	<table class="cc-viewer-table cc-items-table" id="cc-items-edit-table">
// 		<thead>
// 			<tr>
// 				<th class="cc-items-th-type">${__("IRPO Item Type")}</th>
// 				<th class="cc-items-th-item">${__("Item")}</th>
// 				<th class="cc-items-th-name">${__("Item Name")}</th>
// 				<th class="cc-items-th-uom">${__("UOM")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("QTY")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("Amount")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO MR Pending Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PO Pending Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PR Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PI / Actual Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO Available Qty")}</th>
// 				<th class="cc-items-th-del cc-items-del-col hide"></th>
// 			</tr>
// 		</thead>
// 		<tbody id="cc-items-table-body">${rows_html}</tbody>
// 	</table>
// </div>
// <div class="cc-items-bottom-bar hide" data-items-bottom-bar>
// 	<div class="cc-items-bottom-left">
// 		<button class="btn btn-xs btn-default cc-items-add-btn" data-items-add-row>
// 			<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
// 			${__("Add Row")}
// 		</button>
// 	</div>
// </div>`;
// 	}

// 	// Build a single editable table row for the items grid.
// 	_items_row_html(r) {
// 		const num = (v) => flt(v);
// 		const esc = (v) => frappe.utils.escape_html(v || "");
// 		const row_name = esc(r.name || "");
// 		return `
// <tr data-row-name="${row_name}">
// 	<td class="cc-items-td-type">
// 		<input type="hidden" data-items-field="name" value="${row_name}" />
// 		<div class="cc-items-cell-control cc-items-type-control" data-value="${esc(r.irpo_item_type || "")}"></div>
// 	</td>
// 	<td class="cc-items-td-item">
// 		<div class="cc-items-cell-control cc-items-item-control" data-value="${esc(r.item || "")}"></div>
// 	</td>
// 	<td class="cc-items-td-name">
// 		<span class="cc-items-name-value">${esc(r.item_name) || "—"}</span>
// 	</td>
// 	<td class="cc-items-td-uom">
// 		<input type="hidden" data-items-field="uom" value="${esc(r.uom || "")}" />
// 		<span class="cc-items-uom-value">${esc(r.uom) || "—"}</span>
// 	</td>
// 	<td class="cc-viewer-num">
// 		<input class="form-control form-control-sm cc-items-edit-input cc-items-num-input"
// 			data-items-field="qty" data-row="${row_name}"
// 			type="number" step="any" placeholder="0" value="${num(r.qty)}" />
// 	</td>
// 	<td class="cc-viewer-num">
// 		<input class="form-control form-control-sm cc-items-edit-input cc-items-num-input"
// 			data-items-field="amount" data-row="${row_name}"
// 			type="number" step="any" placeholder="0" value="${num(r.amount)}" />
// 	</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_mr_pending_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_po_pending_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pr_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pi_actual_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_available_qty)}</td>
// 	<td class="cc-items-td-del cc-items-del-col hide">
// 		<button class="cc-items-del-btn" data-items-del-row title="${__("Remove row")}" aria-label="${__("Remove row")}">
// 			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M5 4l1 9h4l1-9"/></svg>
// 		</button>
// 	</td>
// </tr>`;
// 	}

// 	// Build Item / UOM Link controls (same pattern as the Break IRPO dialog) for
// 	// every data row present in the items table.
// 	_items_make_controls() {
// 		this.$modal.find("#cc-items-table-body tr").each((_, tr) => {
// 			this._items_make_row_controls($(tr));
// 		});
// 	}

// 	// Create the Item + IRPO Item Type Link controls for a single table row
// 	// (shared by both the Items and Unplanned grids).
// 	_items_make_row_controls($tr) {
// 		if ($tr.data("controls-made")) return;

// 		const me = this;

// 		// IRPO Item Type link control
// 		const $type_parent = $tr.find(".cc-items-type-control");
// 		const type_ctrl = frappe.ui.form.make_control({
// 			parent: $type_parent,
// 			df: {
// 				fieldname: "irpo_item_type",
// 				fieldtype: "Link",
// 				options: "IRPO Item Type",
// 				label: __("IRPO Item Type"),
// 				placeholder: __("Search…"),
// 			},
// 			render_input: true,
// 			only_input: true,
// 		});
// 		$tr.data("type-control", type_ctrl);
// 		// A Link control is a plain `frappe.ui.form.ControlLink` instance, so it
// 		// has no jQuery-style `.on()`. Watch the input and the clear button
// 		// instead of `df.change`, which would also fire on the programmatic
// 		// `set_value()` below and wrongly flag the grid dirty.
// 		type_ctrl.$input.on("awesomplete-selectcomplete", () => me._mark_dirty_for($tr));
// 		type_ctrl.$input.on("change", () => me._mark_dirty_for($tr));
// 		type_ctrl.$wrapper.on("click", ".btn-clear", () => me._mark_dirty_for($tr));
// 		const type_val = $type_parent.attr("data-value") || "";
// 		if (type_ctrl.$input) type_ctrl.$input.val(type_val);
// 		type_ctrl.set_value(type_val);

// 		// Item link control
// 		const $parent = $tr.find(".cc-items-item-control");
// 		const item_ctrl = frappe.ui.form.make_control({
// 			parent: $parent,
// 			df: {
// 				fieldname: "item",
// 				fieldtype: "Link",
// 				options: "Item",
// 				label: __("Item"),
// 				placeholder: __("Search Item…"),
// 			},
// 			render_input: true,
// 			only_input: true,
// 		});

// 		$tr.data("item-control", item_ctrl);
// 		$tr.data("controls-made", true);

// 		// A Link control is a plain `frappe.ui.form.ControlLink` instance, so it
// 		// has no jQuery-style `.on()`. Watch the input and the clear button
// 		// instead of `df.change`, which would also fire on the programmatic
// 		// `set_value()` below and wrongly flag the grid dirty.
// 		const on_item_change = (item_code_override) => {
// 			me._mark_dirty_for($tr);
// 			me._items_on_item_change($tr, item_ctrl, item_code_override);
// 		};
// 		// awesomplete-selectcomplete fires the moment the user picks a suggestion
// 		// from the autocomplete dropdown, so UOM is fetched immediately on selection.
// 		item_ctrl.$input.on("awesomplete-selectcomplete", (e) => {
// 			const selected = (e.originalEvent && e.originalEvent.text && e.originalEvent.text.value)
// 				|| item_ctrl.$input.val();
// 			on_item_change(selected);
// 		});
// 		item_ctrl.$input.on("change", () => on_item_change(null));
// 		item_ctrl.$wrapper.on("click", ".btn-clear", () => on_item_change(""));

// 		// Restore the existing value into the visible input.
// 		const item_val = $parent.attr("data-value") || "";
// 		if (item_ctrl.$input) item_ctrl.$input.val(item_val);
// 		item_ctrl.set_value(item_val);
// 	}

// 	// On change of the Item Link control of a row: validate the code against the
// 	// Item doctype and keep the read-only UOM in step with the Item's stock UOM.
// 	// item_code_override is passed directly from awesomplete-selectcomplete so we
// 	// don't have to wait for the control's internal value to be committed.
// 	_items_on_item_change($tr, item_ctrl, item_code_override) {
// 		const item_code = (item_code_override !== null && item_code_override !== undefined
// 			? item_code_override
// 			: (item_ctrl.get_value() || item_ctrl.$input.val() || "")
// 		).trim();

// 		if (!item_code) {
// 			this._items_set_row_uom($tr, "");
// 			$tr.find(".cc-items-name-value").text("—");
// 			return;
// 		}

// 		frappe.call({
// 			method: "frappe.client.get_value",
// 			args: { doctype: "Item", filters: { name: item_code }, fieldname: ["item_name", "stock_uom"] },
// 			callback: (r) => {
// 				if (r.message && r.message.item_name) {
// 					$tr.find(".cc-items-item-control").removeClass("cc-items-input-invalid");
// 					this._items_set_row_uom($tr, r.message.stock_uom || "");
// 					$tr.find(".cc-items-name-value").text(r.message.item_name || "—");
// 				} else {
// 					$tr.find(".cc-items-item-control").addClass("cc-items-input-invalid");
// 				}
// 			},
// 		});
// 	}

// 	// UOM is read-only in this grid: it always mirrors the Item's stock UOM.
// 	// The hidden input is what gets submitted by _collect_items_data.
// 	_items_set_row_uom($tr, uom) {
// 		$tr.find("[data-items-field='uom']").val(uom || "");
// 		$tr.find(".cc-items-uom-value").text(uom || "—");
// 	}

// 	// Mark the items tab as having unsaved changes.
// 	_items_mark_dirty() {
// 		this.$modal.find("[data-items-dirty-indicator]").removeClass("hide");
// 	}

// 	// Mark whichever grid panel a row belongs to as dirty. Used by the shared
// 	// row-control change handlers so both the Items and Unplanned grids work.
// 	_mark_dirty_for($tr) {
// 		const panel = $tr.closest("[data-viewer-panel]").attr("data-viewer-panel");
// 		if (panel === "unplanned_items") this._unplanned_mark_dirty();
// 		else this._items_mark_dirty();
// 	}

// 	// Append a blank editable row to the items table.
// 	_items_add_row() {
// 		const blank = {
// 			name: "",
// 			irpo_item_type: "",
// 			item: "", uom: "",
// 			qty: 0, amount: 0,
// 			irpo_mr_pending_qty: 0, irpo_po_pending_qty: 0,
// 			irpo_pr_qty: 0, irpo_pi_actual_qty: 0, irpo_available_qty: 0,
// 		};
// 		this.$modal.find("#cc-items-table-body").append(this._items_row_html(blank));
// 		this._items_make_row_controls(this.$modal.find("#cc-items-table-body tr:last-child"));
// 		this._items_mark_dirty();
// 		// Focus the new item control
// 		const item_ctrl = this.$modal.find("#cc-items-table-body tr:last-child").data("item-control");
// 		if (item_ctrl) item_ctrl.$input.focus();
// 	}

// 	// Collect all rows from the editable items table.
// 	_collect_items_data() {
// 		const items = [];
// 		this.$modal.find("#cc-items-table-body tr").each((_, tr) => {
// 			const $tr = $(tr);
// 			const item_ctrl = $tr.data("item-control");
// 			const type_ctrl = $tr.data("type-control");
// 			const item = item_ctrl ? item_ctrl.get_value() : "";
// 			if (!item) return;
// 			items.push({
// 				name: $tr.find("[data-items-field='name']").val() || "",
// 				irpo_item_type: (type_ctrl ? type_ctrl.get_value() : "") || "",
// 				item,
// 				uom: $tr.find("[data-items-field='uom']").val() || "",
// 				qty: $tr.find("[data-items-field='qty']").val(),
// 				amount: $tr.find("[data-items-field='amount']").val(),
// 			});
// 		});
// 		return items;
// 	}

// 	// Persist the Items grid to the Task doctype via save_irpo_task_items.
// 	// Driven by the viewer's Save button (the standalone "Save Items" button
// 	// was removed), so it must NOT redraw the panel — the caller re-reads the
// 	// whole task and re-renders every tab instead.
// 	// Returns the saved item rows.
// 	async _persist_items() {
// 		if (!this.$modal.find("#cc-items-table-body").length) return [];
// 		if (!this._task_name) return [];

// 		const items = this._collect_items_data();
// 		// Nothing to write: the grid is empty and the task has no items either.
// 		if (!items.length && !(this._task.items || []).length) return [];

// 		const r = await frappe.call({
// 			method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_items",
// 			args: { task_name: this._task_name, items_json: JSON.stringify(items) },
// 		});
// 		return r.message || [];
// 	}

// 	// ── Unplanned Items tab ────────────────────────────────────────────────
// 	// Same structure and UI as the Items Details grid, but backed by the Task
// 	// `custom_irpo_unplanned_item` child table ("IRPO Unplanned Item"). The only
// 	// difference: no Amount column.

// 	_render_unplanned_items(t) {
// 		const rows = t.unplanned_items || [];

// 		const rows_html = rows.map((r) => this._unplanned_row_html(r)).join("");

// 		return `
// <h4 class="cc-viewer-section-title">${__("UNPLANNED ITEM DETAILS")}</h4>
// <span class="cc-items-dirty-badge hide" data-unplanned-dirty-indicator>${__("Unsaved changes")}</span>
// <div class="cc-viewer-table-wrap cc-items-table-wrap">
// 	<table class="cc-viewer-table cc-items-table" id="cc-unplanned-table">
// 		<thead>
// 			<tr>
// 				<th class="cc-items-th-type">${__("IRPO Item Type")}</th>
// 				<th class="cc-items-th-item">${__("Item")}</th>
// 				<th class="cc-items-th-name">${__("Item Name")}</th>
// 				<th class="cc-items-th-uom">${__("UOM")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("QTY")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO MR Pending Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PO Pending Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PR Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PI / Actual Qty")}</th>
// 				<th class="cc-viewer-num cc-items-th-num">${__("IRPO Available Qty")}</th>
// 				<th class="cc-items-th-del cc-items-del-col hide"></th>
// 			</tr>
// 		</thead>
// 		<tbody id="cc-unplanned-table-body">${rows_html}</tbody>
// 	</table>
// </div>
// <div class="cc-items-bottom-bar hide" data-unplanned-bottom-bar>
// 	<div class="cc-items-bottom-left">
// 		<button class="btn btn-xs btn-default cc-items-add-btn" data-unplanned-add-row>
// 			<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
// 			${__("Add Row")}
// 		</button>
// 	</div>
// </div>`;
// 	}

// 	// Build a single editable table row for the unplanned items grid. The DOM
// 	// mirrors the planned grid so the shared row-control helpers can drive it.
// 	_unplanned_row_html(r) {
// 		const num = (v) => flt(v);
// 		const esc = (v) => frappe.utils.escape_html(v || "");
// 		const row_name = esc(r.name || "");
// 		return `
// <tr data-row-name="${row_name}">
// 	<td class="cc-items-td-type">
// 		<input type="hidden" data-items-field="name" value="${row_name}" />
// 		<div class="cc-items-cell-control cc-items-type-control" data-value="${esc(r.irpo_item_type || "")}"></div>
// 	</td>
// 	<td class="cc-items-td-item">
// 		<div class="cc-items-cell-control cc-items-item-control" data-value="${esc(r.item || "")}"></div>
// 	</td>
// 	<td class="cc-items-td-name">
// 		<span class="cc-items-name-value">${esc(r.item_name) || "—"}</span>
// 	</td>
// 	<td class="cc-items-td-uom">
// 		<input type="hidden" data-items-field="uom" value="${esc(r.uom || "")}" />
// 		<span class="cc-items-uom-value">${esc(r.uom) || "—"}</span>
// 	</td>
// 	<td class="cc-viewer-num">
// 		<input class="form-control form-control-sm cc-items-edit-input cc-items-num-input"
// 			data-items-field="qty" data-row="${row_name}"
// 			type="number" step="any" placeholder="0" value="${num(r.qty)}" />
// 	</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_mr_pending_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_po_pending_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pr_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pi_actual_qty)}</td>
// 	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_available_qty)}</td>
// 	<td class="cc-items-td-del cc-items-del-col hide">
// 		<button class="cc-items-del-btn" data-unplanned-del-row title="${__("Remove row")}" aria-label="${__("Remove row")}">
// 			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M5 4l1 9h4l1-9"/></svg>
// 		</button>
// 	</td>
// </tr>`;
// 	}

// 	// Build Item / UOM Link controls for every row in the unplanned items table
// 	// (reuses the shared row-control builder from the Items grid).
// 	_unplanned_make_controls() {
// 		this.$modal.find("#cc-unplanned-table-body tr").each((_, tr) => {
// 			this._items_make_row_controls($(tr));
// 		});
// 	}

// 	// Mark the unplanned items tab as having unsaved changes.
// 	_unplanned_mark_dirty() {
// 		this.$modal.find("[data-unplanned-dirty-indicator]").removeClass("hide");
// 	}

// 	// Append a blank editable row to the unplanned items table.
// 	_unplanned_add_row() {
// 		const blank = {
// 			name: "",
// 			irpo_item_type: "",
// 			item: "", uom: "",
// 			qty: 0,
// 			irpo_mr_pending_qty: 0, irpo_po_pending_qty: 0,
// 			irpo_pr_qty: 0, irpo_pi_actual_qty: 0, irpo_available_qty: 0,
// 		};
// 		this.$modal.find("#cc-unplanned-table-body").append(this._unplanned_row_html(blank));
// 		this._items_make_row_controls(this.$modal.find("#cc-unplanned-table-body tr:last-child"));
// 		this._unplanned_mark_dirty();
// 		// Focus the new item control
// 		const item_ctrl = this.$modal.find("#cc-unplanned-table-body tr:last-child").data("item-control");
// 		if (item_ctrl) item_ctrl.$input.focus();
// 	}

// 	// Collect all rows from the editable unplanned items table.
// 	_unplanned_collect_data() {
// 		const rows = [];
// 		this.$modal.find("#cc-unplanned-table-body tr").each((_, tr) => {
// 			const $tr = $(tr);
// 			const item_ctrl = $tr.data("item-control");
// 			const type_ctrl = $tr.data("type-control");
// 			const item = item_ctrl ? item_ctrl.get_value() : "";
// 			if (!item) return;
// 			rows.push({
// 				name: $tr.find("[data-items-field='name']").val() || "",
// 				irpo_item_type: (type_ctrl ? type_ctrl.get_value() : "") || "",
// 				item,
// 				uom: $tr.find("[data-items-field='uom']").val() || "",
// 				qty: $tr.find("[data-items-field='qty']").val(),
// 			});
// 		});
// 		return rows;
// 	}

// 	// Persist the Unplanned Items grid to the Task doctype via
// 	// save_irpo_task_unplanned_items. Driven by the viewer's Save button, so it
// 	// must NOT redraw the panel — the caller re-reads the whole task and
// 	// re-renders every tab instead. Returns the saved rows.
// 	async _unplanned_persist() {
// 		if (!this.$modal.find("#cc-unplanned-table-body").length) return [];
// 		if (!this._task_name) return [];

// 		const rows = this._unplanned_collect_data();
// 		// Nothing to write: the grid is empty and the task has no unplanned rows either.
// 		if (!rows.length && !(this._task.unplanned_items || []).length) return [];

// 		const r = await frappe.call({
// 			method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_unplanned_items",
// 			args: { task_name: this._task_name, items_json: JSON.stringify(rows) },
// 		});
// 		return r.message || [];
// 	}

// 	_render_budget(t) {
// 		const budget_qty = t.cpc_budget_qty ? `${flt(t.cpc_budget_qty)} ${frappe.utils.escape_html(t.cpc_uom || "")}` : "—";
// 		const total_budget = format_currency(flt(t.cpc_budget_amount), "SAR");
// 		const consumed_pct = flt(t.progress || 0);

// 		return `
// <div class="cc-viewer-stat-row">
// 	<div class="cc-viewer-stat cc-viewer-stat-purple">
// 		<div class="cc-viewer-stat-label">${__("Budget Quantity")}</div>
// 		<div class="cc-viewer-stat-value">${budget_qty}</div>
// 	</div>
// 	<div class="cc-viewer-stat cc-viewer-stat-green">
// 		<div class="cc-viewer-stat-label">${__("Total Cost Budget")}</div>
// 		<div class="cc-viewer-stat-value">${total_budget}</div>
// 	</div>
// </div>

// <div class="cc-viewer-ledger-card">
// 	<div class="cc-viewer-ledger-header">
// 		<strong>${__("Weekly Progress")}</strong>
// 		<span class="cc-viewer-ledger-pct">${consumed_pct}% ${__("progress")}</span>
// 	</div>
// 	<div class="cc-viewer-progress-wrap">
// 		<div class="cc-viewer-progress-bar" style="width:${Math.min(consumed_pct, 100)}%"></div>
// 	</div>
// </div>`;
// 	}

// 	_render_progress(t) {
// 		const entries = t.progress_history || [];
// 		if (!entries.length) {
// 			return `<p class="cc-viewer-empty">${__("No progress history entries found.")}</p>`;
// 		}
// 		const rows_html = entries.map((e) => {
// 			const status_cls = e.docstatus === 1 ? "cc-badge-green" : "cc-badge-gray";
// 			const status_label = e.docstatus === 1 ? __("Submitted") : __("Draft");
// 			return `
// <tr>
// 	<td>${frappe.utils.escape_html(e.posting_date || "")}</td>
// 	<td class="cc-viewer-pct-cell"><a href="#" data-open-voucher="${frappe.utils.escape_html(e.voucher_no || "")}">${flt(e.cumulative_pct, 1)}%</a></td>
// 	<td>+${flt(e.period_pct, 1)}%</td>
// 	<td><strong>${format_currency(flt(e.earned_value), "SAR")}</strong></td>
// 	<td><span class="cc-viewer-type-badge ${status_cls}">${status_label}</span></td>
// </tr>`;
// 		}).join("");

// 		return `
// <h4 class="cc-viewer-section-title">${__("WEEKLY PROGRESS LOG HISTORY")}</h4>
// <div class="cc-viewer-table-wrap">
// 	<table class="cc-viewer-table">
// 		<thead>
// 			<tr>
// 				<th>${__("Posting Date")}</th>
// 				<th>${__("Cumulative %")}</th>
// 				<th>${__("This Period %")}</th>
// 				<th>${__("Earned Period Value")}</th>
// 				<th>${__("Status")}</th>
// 			</tr>
// 		</thead>
// 		<tbody>${rows_html}</tbody>
// 	</table>
// </div>`;
// 	}

// 	// ── Edit mode ───────────────────────────────────────────────────────────

// 	// Show/hide the Items + Unplanned grids' editing affordances. The grid cells
// 	// stay populated and readable at all times — only "Add Row" and the per-row
// 	// delete controls appear once "Edit Document" is active, so the read-only
// 	// view has no dangling actions that cannot be saved.
// 	_set_items_editable(on) {
// 		this.$modal
// 			.find("[data-items-bottom-bar], [data-unplanned-bottom-bar], .cc-items-del-col")
// 			.toggleClass("hide", !on);
// 	}

// 	_enter_edit_mode() {
// 		if (!this._task) return;
// 		this._edit_mode = true;
// 		const $m = this.$modal;

// 		$m.find("[data-viewer-edit]").addClass("hide");
// 		$m.find("[data-viewer-save], [data-viewer-cancel-edit]").removeClass("hide");
// 		$m.find(".cc-viewer-footer").removeClass("hide");
// 		this._set_items_editable(true);

// 		// Replace each editable display div with an input
// 		$m.find(".cc-viewer-editable[data-edit-field]").each((_, el) => {
// 			const $el = $(el);
// 			const field = $el.data("edit-field");
// 			const type = $el.data("field-type") || "Data";
// 			const val = this._task[field] || "";

// 			let input_html;
// 			if (type === "Date") {
// 				input_html = `<input class="form-control cc-viewer-edit-input" data-edit-field="${field}" type="date" value="${val}" />`;
// 			} else if (type === "Select") {
// 				let opts = $el.data("select-options") || [];
// 				if (typeof opts === "string") {
// 					try {
// 						opts = JSON.parse(opts);
// 					} catch (_err) {
// 						opts = [];
// 					}
// 				}
// 				const options_html = ['<option value="">—</option>']
// 					.concat((opts || []).map((o) =>
// 						`<option value="${frappe.utils.escape_html(o)}" ${o === val ? "selected" : ""}>${frappe.utils.escape_html(o)}</option>`
// 					))
// 					.join("");
// 				input_html = `<select class="form-control cc-viewer-edit-input" data-edit-field="${field}">${options_html}</select>`;
// 			} else {
// 				input_html = `<input class="form-control cc-viewer-edit-input" data-edit-field="${field}" type="text" value="${frappe.utils.escape_html(val)}" />`;
// 			}
// 			$el.replaceWith(input_html);
// 		});
// 	}

// 	_exit_edit_mode() {
// 		const was_editing = this._edit_mode;
// 		this._edit_mode = false;
// 		const $m = this.$modal;
// 		$m.find("[data-viewer-edit]").removeClass("hide");
// 		$m.find("[data-viewer-save], [data-viewer-cancel-edit]").addClass("hide");
// 		$m.find(".cc-viewer-footer").addClass("hide");
// 		this._set_items_editable(false);

// 		// Only re-render the read-only state when leaving an active edit mode.
// 		// Re-rendering unconditionally would loop forever with _render_all(),
// 		// since _render_all() resets edit mode at the end of every render.
// 		if (was_editing && this._task) this._render_all();
// 	}

// 	async _save() {
// 		const $m = this.$modal;
// 		const data = {};
// 		$m.find(".cc-viewer-edit-input[data-edit-field]").each((_, el) => {
// 			const $el = $(el);
// 			data[$el.data("edit-field")] = $el.val();
// 		});

// 		const $btn = $m.find("[data-viewer-save]");
// 		$btn.prop("disabled", true).text(__("Saving…"));
// 		try {
// 			// Items first — it rebuilds the custom_items_table child rows.
// 			await this._persist_items();

// 			// Unplanned Items — rebuilds the custom_irpo_unplanned_item child rows.
// 			await this._unplanned_persist();

// 			if (Object.keys(data).length) {
// 				await frappe.call({
// 					method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_fields",
// 					args: { task_name: this._task_name, fields_json: JSON.stringify(data) },
// 				});
// 			}
// 			// Refresh task data and guard against an empty response
// 			const r = await frappe.call({
// 				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpo_task_detail",
// 				args: { task_name: this._task_name },
// 			});
// 			if (r && r.message) {
// 				this._task = r.message;
// 			}
// 			frappe.show_alert({ message: __("Task saved."), indicator: "green" });
// 			this._exit_edit_mode();
// 			// Also reload planner data in background so WBS reflects any changes
// 			this.view.planner._load();
// 		} catch (err) {
// 			frappe.show_alert({ message: this._save_error_message(err, __("Could not save task.")), indicator: "red" });
// 		} finally {
// 			$btn.prop("disabled", false).text(__("Save"));
// 		}
// 	}

// 	// Save a color change immediately without requiring the user to enter edit mode.
// 	// Called by the 'change' event on the color picker once the native picker is closed.
// 	async _save_color(color) {
// 		if (!this._task_name) return;
// 		console.log("IRPOViewer: saving color", color, "for task", this._task_name);
// 		try {
// 			const r = await frappe.call({
// 				method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_fields",
// 				args: { task_name: this._task_name, fields_json: JSON.stringify({ color }) },
// 			});
// 			console.log("IRPOViewer: color save response", r);
// 			// Keep in-memory task state in sync so a re-render shows the new color.
// 			if (this._task) this._task.color = color;
// 			// Update the label next to the swatch.
// 			this.$modal.find(".cc-viewer-color-label").text(color);
// 			frappe.show_alert({ message: __("Color saved."), indicator: "green" });
// 			// Reload the planner Gantt chart so the bar color updates immediately.
// 			this.view.planner._load();
// 		} catch (err) {
// 			console.error("IRPOViewer: color save error", err);
// 			frappe.show_alert({ message: this._save_error_message(err, __("Could not save color.")), indicator: "red" });
// 		}
// 	}

// 	// Frappe already toasts the server-side reason for a failed save. Append it
// 	// to the short alert so the dialog does not hide *why* nothing was written.
// 	_save_error_message(err, fallback) {
// 		let text = "";
// 		try {
// 			if (err && err._server_messages) {
// 				const messages = JSON.parse(err._server_messages);
// 				text = messages.length ? messages[0].message : "";
// 			}
// 		} catch (_e) {
// 			// fall through to the plain message below
// 		}
// 		if (!text) text = (err && (err._error_message || err.message)) || "";
// 		if (!text) return fallback;

// 		const plain = $("<div>").html(String(text)).text().trim().split("\n")[0];
// 		return plain ? `${fallback} ${plain}` : fallback;
// 	}
// };



















/**
 * IRPO Task Detail Viewer
 * Opens when the 👁 eye button on a Leaf IRPO row is clicked in the planner.
 *
 * 5 tabs:
 *  1. Overview & General  – identity, hierarchy, schedule fields
 *  2. Items Details       – planned item rows
 *  3. Unplanned Items     – unplanned item rows
 *  4. Dual Budget & Consumption – budget stat cards + ledger status
 *  5. Progress & History  – IRPO quantity ledger entries
 *
 * Edit mode: clicking "Edit Document" makes editable fields writeable.
 * Save mode: a Save button appears in the footer.
 */
// Mirrors ERPNext's Task list indicator colors (erpnext/.../task_list.js
// get_indicator) so the header capsule matches the Task list status colors.
const IRPO_VIEWER_STATUS_COLORS = {
	Open: "orange",
	Working: "orange",
	"Pending Review": "orange",
	Overdue: "red",
	Completed: "green",
	Cancelled: "gray",
	Template: "blue",
};

cpc_construction_management.contract_center.IRPOViewer = class IRPOViewer {
	constructor(view) {
		this.view = view;
		this.$root = view.$root;
		this.$modal = this.$root.find("#cc-irpo-viewer-modal");
		this._edit_mode = false;
		this._task_name = null;
		this._task = null;
		this._bind_events();
	}

	// ── Public ──────────────────────────────────────────────────────────────

	async open(task_name) {
		this._task_name = task_name;
		this._edit_mode = false;
		this._task = null;
		this.$modal.removeClass("hide").attr("aria-hidden", "false");
		this._set_tab("overview");
		this._render_loading();
		try {
			const r = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpo_task_detail",
				args: { task_name },
			});
			if (!r || !r.message) {
				this._render_error();
				console.error("IRPOViewer: empty response for task", task_name);
				return;
			}
			this._task = r.message;
			this._render_all();
		} catch (err) {
			this._render_error();
			console.error("IRPOViewer load error", err);
		}
	}

	close() {
		this.$modal.addClass("hide").attr("aria-hidden", "true");
		this._task = null;
		this._task_name = null;
		this._exit_edit_mode();
	}

	// ── Event binding ───────────────────────────────────────────────────────

	_bind_events() {
		const $m = this.$modal;

		// Close
		$m.on("click", "[data-irpo-viewer-close]", () => this.close());

		// Tab switching
		$m.on("click", "[data-viewer-tab]", (e) => {
			this._set_tab($(e.currentTarget).data("viewer-tab"));
		});

		// Connections: open the doctype list filtered to the linked entries,
		// exactly like the Frappe Connections sidebar (count badge per doctype).
		$m.on("click", ".cc-viewer-conn-chip", (e) => {
			const $chip = $(e.currentTarget);
			const doctype = $chip.data("doctype");
			let names = $chip.data("names");
			if (!doctype || !names) return;
			if (typeof names === "string") {
				try {
					names = JSON.parse(names);
				} catch (err) {
					return;
				}
			}
			if (!Array.isArray(names) || !names.length) return;
			this.close();
			// W-05: a single linked document (e.g. the IRPO's Budget) opens the
			// record itself; several open the list filtered to them.
			if (names.length === 1) {
				frappe.set_route("Form", doctype, names[0]);
				return;
			}
			frappe.route_options = { name: ["in", names] };
			frappe.set_route("List", doctype);
		});

		// Create Material Request from this IRPO/Task — close the viewer first so
		// the MR dialog is not hidden behind this modal.
		$m.on("click", "[data-viewer-create-mr]", () => {
			if (!this._task || !this.view || !this.view.mr_dialog) return;
			const task = this._task;
			this.close();
			this.view.mr_dialog.open(task);
		});

		// Edit Document button
		$m.on("click", "[data-viewer-edit]", () => this._enter_edit_mode());

		// Save button — persists the Overview & General fields *and* the
		// Items grid, so there is a single save action for the whole dialog.
		$m.on("click", "[data-viewer-save]", () => this._save());

		// Cancel edit
		$m.on("click", "[data-viewer-cancel-edit]", () => this._exit_edit_mode());

		// Items grid: Add Row
		$m.on("click", "[data-items-add-row]", () => this._items_add_row());

		// Items grid: Delete Row
		$m.on("click", "[data-items-del-row]", (e) => {
			$(e.currentTarget).closest("tr").remove();
			this._items_mark_dirty();
		});

		// Items grid: track changes
		$m.on("input change", "[data-viewer-panel='items'] .cc-items-edit-input", () => this._items_mark_dirty());

		// Unplanned Items grid: Add Row
		$m.on("click", "[data-unplanned-add-row]", () => this._unplanned_add_row());

		// Unplanned Items grid: Delete Row
		$m.on("click", "[data-unplanned-del-row]", (e) => {
			$(e.currentTarget).closest("tr").remove();
			this._unplanned_mark_dirty();
		});

		// Unplanned Items grid: track changes
		$m.on("input change", "[data-viewer-panel='unplanned_items'] .cc-items-edit-input", () => this._unplanned_mark_dirty());

		// Color picker: live-update the hex label on 'input' (while the picker is
		// open) and save to the server on 'change' (when the picker is closed).
		$m.on("input", "[data-viewer-color-pick]", (e) => {
			const color = $(e.currentTarget).val();
			$m.find(".cc-viewer-color-label").text(color);
		});
		$m.on("change", "[data-viewer-color-pick]", (e) => {
			const color = $(e.currentTarget).val();
			this._save_color(color);
		});

		// Escape key
		$(document).on("keydown.irpo-viewer", (e) => {
			if (e.key === "Escape" && !$m.hasClass("hide")) this.close();
		});
	}

	// ── Tab management ──────────────────────────────────────────────────────

	_set_tab(tab_id) {
		const $m = this.$modal;
		$m.find("[data-viewer-tab]").removeClass("cc-viewer-tab-active");
		$m.find(`[data-viewer-tab='${tab_id}']`).addClass("cc-viewer-tab-active");
		$m.find("[data-viewer-panel]").addClass("hide");
		$m.find(`[data-viewer-panel='${tab_id}']`).removeClass("hide");
		$m.find(".cc-irpo-viewer-card").toggleClass("cc-viewer-wide", tab_id === "items" || tab_id === "unplanned_items");
	}

	// ── Loading / error states ──────────────────────────────────────────────

	_render_loading() {
		const $m = this.$modal;
		$m.find(".cc-viewer-header-title").html(
			`<span class="cc-viewer-skeleton cc-viewer-skeleton-title"></span>`
		);
		$m.find(".cc-viewer-header-sub").html(
			`<span class="cc-viewer-skeleton cc-viewer-skeleton-sub"></span>`
		);
		["overview", "items", "unplanned_items", "budget", "progress"].forEach((tab) => {
			$m.find(`[data-viewer-panel='${tab}']`).html(
				`<div class="cc-viewer-loading-body"><span class="cc-viewer-skeleton cc-viewer-skeleton-body"></span></div>`
			);
		});
	}

	_render_error() {
		const msg = `<p class="cc-viewer-error">${__("Could not load IRPO task details.")}</p>`;
		this.$modal.find("[data-viewer-panel='overview']").html(msg);
		this.$modal.find("[data-viewer-panel='items']").html(msg);
		this.$modal.find("[data-viewer-panel='unplanned_items']").html(msg);
	}

	// ── Full render ─────────────────────────────────────────────────────────

	_render_all() {
		const t = this._task;
		const $m = this.$modal;

		// ---- Header ----
		const so_part = t.cpc_sales_order ? `: ${frappe.utils.escape_html(t.cpc_sales_order)}` : "";
		const status_color = IRPO_VIEWER_STATUS_COLORS[t.status] || "gray";
		$m.find(".cc-viewer-header-title").html(
			`${frappe.utils.escape_html(t.subject || t.name)}${so_part}
			<span class="cc-viewer-badge cc-viewer-badge-${status_color}">${frappe.utils.escape_html(t.status || "")}</span>`
		);
		const boq_label = t.cpc_boq_code ? `• ${__("BOQ Item")}: <strong>${frappe.utils.escape_html(t.cpc_boq_code)}</strong>` : "";
		const proj_label = t.project ? `${__("Project")}: <strong>${frappe.utils.escape_html(t.project_name || t.project)}</strong>` : "";
		$m.find(".cc-viewer-header-sub").html(`${proj_label} ${boq_label}`);

		// ---- Tab 1: Overview & General ----
		$m.find("[data-viewer-panel='overview']").html(this._render_overview(t));

		// ---- Tab 2: Items Details ----
		$m.find("[data-viewer-panel='items']").html(this._render_items(t));
		this._items_make_controls();

		// ---- Tab 3: Unplanned Item Details ----
		$m.find("[data-viewer-panel='unplanned_items']").html(this._render_unplanned_items(t));
		this._unplanned_make_controls();

		// ---- Tab 4: Dual Budget & Consumption ----
		$m.find("[data-viewer-panel='budget']").html(this._render_budget(t));

		// ---- Tab 5: Progress & History ----
		$m.find("[data-viewer-panel='progress']").html(this._render_progress(t));

		// Reset edit mode UI
		this._exit_edit_mode();
	}

	// ── Tab renderers ───────────────────────────────────────────────────────

	// Horizontal row of linked-document connections (Budget / Material Request /
	// Purchase Order) shown above the Overview fields. Each doctype is a single
	// clickable badge showing the connection count, in the style of Frappe's
	// Connections sidebar; clicking it opens the doctype's list filtered to the
	// linked entries for this IRPO.
	_render_connections(t) {
		const connections = t.connections;
		if (!connections) return "";
		const esc = (v) => frappe.utils.escape_html(v || "");
		const groups = [
			{ key: "Budget", label: __("Budget") },
			{ key: "Material Request", label: __("Material Request") },
			{ key: "Purchase Order", label: __("Purchase Order") },
		];
		const groups_html = groups.map((g) => {
			const docs = connections[g.key] || [];
			const chips = docs.length
				? `<button class="cc-viewer-conn-chip" data-doctype="${esc(docs[0].doctype)}"
							data-names='${esc(JSON.stringify(docs.map((d) => d.name)))}'
							title="${__("List {0} linked to this IRPO", [g.label])}">
						${docs.length}
					</button>`
				: `<span class="cc-viewer-conn-none">0</span>`;
			return `
	<div class="cc-viewer-conn-group">
		<span class="cc-viewer-conn-label">${g.label}</span>
		<div class="cc-viewer-conn-chips">${chips}</div>
	</div>`;
		}).join("");

		return `
<h4 class="cc-viewer-section-title">${__("Connections")}</h4>
<div class="cc-viewer-connections-wrap">
	<div class="cc-viewer-connections">
		${groups_html}
	</div>
	<div class="cc-viewer-conn-actions">
		<button type="button" class="btn btn-xs btn-primary" data-viewer-create-mr>${__(
			"+ Create MR"
		)}</button>
	</div>
</div>`;
	}

	_render_overview(t) {
		const fmt_money = (v) => format_currency(flt(v), "SAR");
		const fmt_num = (v) => (v == null || v === "" ? "—" : flt(v));
		const fmt_text = (v) => (v == null || v === "" ? "—" : frappe.utils.escape_html(v));

		return `
${this._render_connections(t)}
<div class="cc-viewer-section-row cc-viewer-three-col">
	<div class="cc-viewer-field">
		<label>${__("IRPO / Task ID")}</label>
		<div class="cc-viewer-value" data-edit-field="name">${frappe.utils.escape_html(t.name)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Subject / Description")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="subject">${frappe.utils.escape_html(t.subject || "")}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Project")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="project"
			data-link-doctype="Project">
			${frappe.utils.escape_html(t.project_name || t.project || "—")}
		</div>
	</div>
</div>

<div class="cc-viewer-three-col">
	<div class="cc-viewer-field">
		<label>${__("Sales Order (RPO)")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_sales_order"
			data-link-doctype="Sales Order">
			${frappe.utils.escape_html(t.cpc_sales_order || "—")}
		</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Construction Contract")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_contract"
			data-link-doctype="Construction Contract">${fmt_text(t.cpc_contract)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("BOQ Code")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_boq_code">${fmt_text(t.cpc_boq_code)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Gantt Color")}</label>
		<div class="cc-viewer-color-field">
			<input type="color" class="cc-viewer-color-pick" data-viewer-color-pick
				value="${frappe.utils.escape_html(t.color || "#2490ef")}"
				title="${__("Pick a color for the Gantt bar")}">
			<span class="cc-viewer-color-label">${frappe.utils.escape_html(t.color || "#2490ef")}</span>
		</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Planned Start")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="exp_start_date" data-field-type="Date">
			${t.exp_start_date ? frappe.datetime.str_to_user(t.exp_start_date) : "—"}
		</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Planned End")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="exp_end_date" data-field-type="Date">
			${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : "—"}
		</div>
	</div>
</div>

<h4 class="cc-viewer-section-title">${__("CPC / IRPO")}</h4>
<div class="cc-viewer-three-col">
	<div class="cc-viewer-field">
		<label>${__("Budget Qty")}</label>
		<div class="cc-viewer-value">${fmt_num(t.cpc_budget_qty)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Budget Amount")}</label>
		<div class="cc-viewer-value">${fmt_money(t.cpc_budget_amount)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("UOM")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="cpc_uom" data-link-doctype="UOM">${fmt_text(t.cpc_uom)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("BOQ Cost Budget")}</label>
		<div class="cc-viewer-value">${fmt_money(t.cpc_boq_cost_budget)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("BOQ Budget Allocated")}</label>
		<div class="cc-viewer-value">${fmt_money(t.cpc_boq_budget_allocated)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("BOQ Budget Remaining")}</label>
		<div class="cc-viewer-value">${fmt_money(t.cpc_boq_budget_remaining)}</div>
	</div>
	<div class="cc-viewer-field">
		<label>${__("Account")}</label>
		<div class="cc-viewer-value cc-viewer-editable" data-edit-field="account"
			data-link-doctype="Account">${fmt_text(t.account)}</div>
	</div>
</div>`;
	}

	_render_items(t) {
		const rows = t.items || [];

		// Build editable row HTML for each existing item
		const rows_html = rows.map((r) => this._items_row_html(r)).join("");

		return `
<h4 class="cc-viewer-section-title">${__("ITEMS DETAILS")}</h4>
<span class="cc-items-dirty-badge hide" data-items-dirty-indicator>${__("Unsaved changes")}</span>
<div class="cc-viewer-table-wrap cc-items-table-wrap">
	<table class="cc-viewer-table cc-items-table" id="cc-items-edit-table">
		<thead>
			<tr>
				<th class="cc-items-th-type">${__("IRPO Item Type")}</th>
				<th class="cc-items-th-item">${__("Item")}</th>
				<th class="cc-items-th-name">${__("Item Name")}</th>
				<th class="cc-items-th-uom">${__("UOM")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("QTY")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("Amount")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO MR Pending Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PO Pending Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PR Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PI / Actual Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO Available Qty")}</th>
				<th class="cc-items-th-del cc-items-del-col hide"></th>
			</tr>
		</thead>
		<tbody id="cc-items-table-body">${rows_html}</tbody>
	</table>
</div>
<div class="cc-items-bottom-bar hide" data-items-bottom-bar>
	<div class="cc-items-bottom-left">
		<button class="btn btn-xs btn-default cc-items-add-btn" data-items-add-row>
			<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
			${__("Add Row")}
		</button>
	</div>
</div>`;
	}

	// Build a single editable table row for the items grid.
	_items_row_html(r) {
		const num = (v) => flt(v);
		const esc = (v) => frappe.utils.escape_html(v || "");
		const row_name = esc(r.name || "");
		return `
<tr data-row-name="${row_name}">
	<td class="cc-items-td-type">
		<input type="hidden" data-items-field="name" value="${row_name}" />
		<div class="cc-items-cell-control cc-items-type-control" data-value="${esc(r.irpo_item_type || "")}"></div>
	</td>
	<td class="cc-items-td-item">
		<div class="cc-items-cell-control cc-items-item-control" data-value="${esc(r.item || "")}"></div>
	</td>
	<td class="cc-items-td-name">
		<span class="cc-items-name-value">${esc(r.item_name) || "—"}</span>
	</td>
	<td class="cc-items-td-uom">
		<input type="hidden" data-items-field="uom" value="${esc(r.uom || "")}" />
		<span class="cc-items-uom-value">${esc(r.uom) || "—"}</span>
	</td>
	<td class="cc-viewer-num">
		<input class="form-control form-control-sm cc-items-edit-input cc-items-num-input"
			data-items-field="qty" data-row="${row_name}"
			type="number" step="any" placeholder="0" value="${num(r.qty)}" />
	</td>
	<td class="cc-viewer-num">
		<input class="form-control form-control-sm cc-items-edit-input cc-items-num-input"
			data-items-field="amount" data-row="${row_name}"
			type="number" step="any" placeholder="0" value="${num(r.amount)}" />
	</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_mr_pending_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_po_pending_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pr_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pi_actual_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_available_qty)}</td>
	<td class="cc-items-td-del cc-items-del-col hide">
		<button class="cc-items-del-btn" data-items-del-row title="${__("Remove row")}" aria-label="${__("Remove row")}">
			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M5 4l1 9h4l1-9"/></svg>
		</button>
	</td>
</tr>`;
	}

	// Build Item / UOM Link controls (same pattern as the Break IRPO dialog) for
	// every data row present in the items table.
	_items_make_controls() {
		this.$modal.find("#cc-items-table-body tr").each((_, tr) => {
			this._items_make_row_controls($(tr));
		});
	}

	// Create the Item + IRPO Item Type Link controls for a single table row
	// (shared by both the Items and Unplanned grids).
	_items_make_row_controls($tr) {
		if ($tr.data("controls-made")) return;

		const me = this;

		// IRPO Item Type link control
		const $type_parent = $tr.find(".cc-items-type-control");
		const type_ctrl = frappe.ui.form.make_control({
			parent: $type_parent,
			df: {
				fieldname: "irpo_item_type",
				fieldtype: "Link",
				options: "IRPO Item Type",
				label: __("IRPO Item Type"),
				placeholder: __("Search…"),
			},
			render_input: true,
			only_input: true,
		});
		$tr.data("type-control", type_ctrl);
		// A Link control is a plain `frappe.ui.form.ControlLink` instance, so it
		// has no jQuery-style `.on()`. Watch the input and the clear button
		// instead of `df.change`, which would also fire on the programmatic
		// `set_value()` below and wrongly flag the grid dirty.
		type_ctrl.$input.on("awesomplete-selectcomplete", () => me._mark_dirty_for($tr));
		type_ctrl.$input.on("change", () => me._mark_dirty_for($tr));
		type_ctrl.$wrapper.on("click", ".btn-clear", () => me._mark_dirty_for($tr));
		const type_val = $type_parent.attr("data-value") || "";
		if (type_ctrl.$input) type_ctrl.$input.val(type_val);
		type_ctrl.set_value(type_val);

		// Item link control
		const $parent = $tr.find(".cc-items-item-control");
		const item_ctrl = frappe.ui.form.make_control({
			parent: $parent,
			df: {
				fieldname: "item",
				fieldtype: "Link",
				options: "Item",
				label: __("Item"),
				placeholder: __("Search Item…"),
			},
			render_input: true,
			only_input: true,
		});

		$tr.data("item-control", item_ctrl);
		$tr.data("controls-made", true);

		// A Link control is a plain `frappe.ui.form.ControlLink` instance, so it
		// has no jQuery-style `.on()`. Watch the input and the clear button
		// instead of `df.change`, which would also fire on the programmatic
		// `set_value()` below and wrongly flag the grid dirty.
		const on_item_change = (item_code_override) => {
			me._mark_dirty_for($tr);
			me._items_on_item_change($tr, item_ctrl, item_code_override);
		};
		// awesomplete-selectcomplete fires the moment the user picks a suggestion
		// from the autocomplete dropdown, so UOM is fetched immediately on selection.
		item_ctrl.$input.on("awesomplete-selectcomplete", (e) => {
			const selected = (e.originalEvent && e.originalEvent.text && e.originalEvent.text.value)
				|| item_ctrl.$input.val();
			on_item_change(selected);
		});
		item_ctrl.$input.on("change", () => on_item_change(null));
		item_ctrl.$wrapper.on("click", ".btn-clear", () => on_item_change(""));

		// Restore the existing value into the visible input.
		const item_val = $parent.attr("data-value") || "";
		if (item_ctrl.$input) item_ctrl.$input.val(item_val);
		item_ctrl.set_value(item_val);
	}

	// On change of the Item Link control of a row: validate the code against the
	// Item doctype and keep the read-only UOM in step with the Item's stock UOM.
	// item_code_override is passed directly from awesomplete-selectcomplete so we
	// don't have to wait for the control's internal value to be committed.
	_items_on_item_change($tr, item_ctrl, item_code_override) {
		const item_code = (item_code_override !== null && item_code_override !== undefined
			? item_code_override
			: (item_ctrl.get_value() || item_ctrl.$input.val() || "")
		).trim();

		if (!item_code) {
			this._items_set_row_uom($tr, "");
			$tr.find(".cc-items-name-value").text("—");
			return;
		}

		frappe.call({
			method: "frappe.client.get_value",
			args: { doctype: "Item", filters: { name: item_code }, fieldname: ["item_name", "stock_uom"] },
			callback: (r) => {
				if (r.message && r.message.item_name) {
					$tr.find(".cc-items-item-control").removeClass("cc-items-input-invalid");
					this._items_set_row_uom($tr, r.message.stock_uom || "");
					$tr.find(".cc-items-name-value").text(r.message.item_name || "—");
				} else {
					$tr.find(".cc-items-item-control").addClass("cc-items-input-invalid");
				}
			},
		});
	}

	// UOM is read-only in this grid: it always mirrors the Item's stock UOM.
	// The hidden input is what gets submitted by _collect_items_data.
	_items_set_row_uom($tr, uom) {
		$tr.find("[data-items-field='uom']").val(uom || "");
		$tr.find(".cc-items-uom-value").text(uom || "—");
	}

	// Mark the items tab as having unsaved changes.
	_items_mark_dirty() {
		this.$modal.find("[data-items-dirty-indicator]").removeClass("hide");
	}

	// Mark whichever grid panel a row belongs to as dirty. Used by the shared
	// row-control change handlers so both the Items and Unplanned grids work.
	_mark_dirty_for($tr) {
		const panel = $tr.closest("[data-viewer-panel]").attr("data-viewer-panel");
		if (panel === "unplanned_items") this._unplanned_mark_dirty();
		else this._items_mark_dirty();
	}

	// Append a blank editable row to the items table.
	_items_add_row() {
		const blank = {
			name: "",
			irpo_item_type: "",
			item: "", uom: "",
			qty: 0, amount: 0,
			irpo_mr_pending_qty: 0, irpo_po_pending_qty: 0,
			irpo_pr_qty: 0, irpo_pi_actual_qty: 0, irpo_available_qty: 0,
		};
		this.$modal.find("#cc-items-table-body").append(this._items_row_html(blank));
		this._items_make_row_controls(this.$modal.find("#cc-items-table-body tr:last-child"));
		this._items_mark_dirty();
		// Focus the new item control
		const item_ctrl = this.$modal.find("#cc-items-table-body tr:last-child").data("item-control");
		if (item_ctrl) item_ctrl.$input.focus();
	}

	// Collect all rows from the editable items table.
	_collect_items_data() {
		const items = [];
		this.$modal.find("#cc-items-table-body tr").each((_, tr) => {
			const $tr = $(tr);
			const item_ctrl = $tr.data("item-control");
			const type_ctrl = $tr.data("type-control");
			const item = item_ctrl ? item_ctrl.get_value() : "";
			if (!item) return;
			items.push({
				name: $tr.find("[data-items-field='name']").val() || "",
				irpo_item_type: (type_ctrl ? type_ctrl.get_value() : "") || "",
				item,
				uom: $tr.find("[data-items-field='uom']").val() || "",
				qty: $tr.find("[data-items-field='qty']").val(),
				amount: $tr.find("[data-items-field='amount']").val(),
			});
		});
		return items;
	}

	// Persist the Items grid to the Task doctype via save_irpo_task_items.
	// Driven by the viewer's Save button (the standalone "Save Items" button
	// was removed), so it must NOT redraw the panel — the caller re-reads the
	// whole task and re-renders every tab instead.
	// Returns the saved item rows.
	async _persist_items() {
		if (!this.$modal.find("#cc-items-table-body").length) return [];
		if (!this._task_name) return [];

		const items = this._collect_items_data();
		// Nothing to write: the grid is empty and the task has no items either.
		if (!items.length && !(this._task.items || []).length) return [];

		const r = await frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_items",
			args: { task_name: this._task_name, items_json: JSON.stringify(items) },
		});
		return r.message || [];
	}

	// ── Unplanned Items tab ────────────────────────────────────────────────
	// Same structure and UI as the Items Details grid, but backed by the Task
	// `custom_irpo_unplanned_item` child table ("IRPO Unplanned Item"). The only
	// difference: no Amount column.

	_render_unplanned_items(t) {
		const rows = t.unplanned_items || [];

		const rows_html = rows.map((r) => this._unplanned_row_html(r)).join("");

		return `
<h4 class="cc-viewer-section-title">${__("UNPLANNED ITEM DETAILS")}</h4>
<span class="cc-items-dirty-badge hide" data-unplanned-dirty-indicator>${__("Unsaved changes")}</span>
<div class="cc-viewer-table-wrap cc-items-table-wrap">
	<table class="cc-viewer-table cc-items-table" id="cc-unplanned-table">
		<thead>
			<tr>
				<th class="cc-items-th-type">${__("IRPO Item Type")}</th>
				<th class="cc-items-th-item">${__("Item")}</th>
				<th class="cc-items-th-name">${__("Item Name")}</th>
				<th class="cc-items-th-uom">${__("UOM")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("QTY")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO MR Pending Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PO Pending Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PR Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO PI / Actual Qty")}</th>
				<th class="cc-viewer-num cc-items-th-num">${__("IRPO Available Qty")}</th>
				<th class="cc-items-th-del cc-items-del-col hide"></th>
			</tr>
		</thead>
		<tbody id="cc-unplanned-table-body">${rows_html}</tbody>
	</table>
</div>
<div class="cc-items-bottom-bar hide" data-unplanned-bottom-bar>
	<div class="cc-items-bottom-left">
		<button class="btn btn-xs btn-default cc-items-add-btn" data-unplanned-add-row>
			<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
			${__("Add Row")}
		</button>
	</div>
</div>`;
	}

	// Build a single editable table row for the unplanned items grid. The DOM
	// mirrors the planned grid so the shared row-control helpers can drive it.
	_unplanned_row_html(r) {
		const num = (v) => flt(v);
		const esc = (v) => frappe.utils.escape_html(v || "");
		const row_name = esc(r.name || "");
		return `
<tr data-row-name="${row_name}">
	<td class="cc-items-td-type">
		<input type="hidden" data-items-field="name" value="${row_name}" />
		<div class="cc-items-cell-control cc-items-type-control" data-value="${esc(r.irpo_item_type || "")}"></div>
	</td>
	<td class="cc-items-td-item">
		<div class="cc-items-cell-control cc-items-item-control" data-value="${esc(r.item || "")}"></div>
	</td>
	<td class="cc-items-td-name">
		<span class="cc-items-name-value">${esc(r.item_name) || "—"}</span>
	</td>
	<td class="cc-items-td-uom">
		<input type="hidden" data-items-field="uom" value="${esc(r.uom || "")}" />
		<span class="cc-items-uom-value">${esc(r.uom) || "—"}</span>
	</td>
	<td class="cc-viewer-num">
		<input class="form-control form-control-sm cc-items-edit-input cc-items-num-input"
			data-items-field="qty" data-row="${row_name}"
			type="number" step="any" placeholder="0" value="${num(r.qty)}" />
	</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_mr_pending_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_po_pending_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pr_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_pi_actual_qty)}</td>
	<td class="cc-viewer-num cc-items-readonly">${num(r.irpo_available_qty)}</td>
	<td class="cc-items-td-del cc-items-del-col hide">
		<button class="cc-items-del-btn" data-unplanned-del-row title="${__("Remove row")}" aria-label="${__("Remove row")}">
			<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M5 4l1 9h4l1-9"/></svg>
		</button>
	</td>
</tr>`;
	}

	// Build Item / UOM Link controls for every row in the unplanned items table
	// (reuses the shared row-control builder from the Items grid).
	_unplanned_make_controls() {
		this.$modal.find("#cc-unplanned-table-body tr").each((_, tr) => {
			this._items_make_row_controls($(tr));
		});
	}

	// Mark the unplanned items tab as having unsaved changes.
	_unplanned_mark_dirty() {
		this.$modal.find("[data-unplanned-dirty-indicator]").removeClass("hide");
	}

	// Append a blank editable row to the unplanned items table.
	_unplanned_add_row() {
		const blank = {
			name: "",
			irpo_item_type: "",
			item: "", uom: "",
			qty: 0,
			irpo_mr_pending_qty: 0, irpo_po_pending_qty: 0,
			irpo_pr_qty: 0, irpo_pi_actual_qty: 0, irpo_available_qty: 0,
		};
		this.$modal.find("#cc-unplanned-table-body").append(this._unplanned_row_html(blank));
		this._items_make_row_controls(this.$modal.find("#cc-unplanned-table-body tr:last-child"));
		this._unplanned_mark_dirty();
		// Focus the new item control
		const item_ctrl = this.$modal.find("#cc-unplanned-table-body tr:last-child").data("item-control");
		if (item_ctrl) item_ctrl.$input.focus();
	}

	// Collect all rows from the editable unplanned items table.
	_unplanned_collect_data() {
		const rows = [];
		this.$modal.find("#cc-unplanned-table-body tr").each((_, tr) => {
			const $tr = $(tr);
			const item_ctrl = $tr.data("item-control");
			const type_ctrl = $tr.data("type-control");
			const item = item_ctrl ? item_ctrl.get_value() : "";
			if (!item) return;
			rows.push({
				name: $tr.find("[data-items-field='name']").val() || "",
				irpo_item_type: (type_ctrl ? type_ctrl.get_value() : "") || "",
				item,
				uom: $tr.find("[data-items-field='uom']").val() || "",
				qty: $tr.find("[data-items-field='qty']").val(),
			});
		});
		return rows;
	}

	// Persist the Unplanned Items grid to the Task doctype via
	// save_irpo_task_unplanned_items. Driven by the viewer's Save button, so it
	// must NOT redraw the panel — the caller re-reads the whole task and
	// re-renders every tab instead. Returns the saved rows.
	async _unplanned_persist() {
		if (!this.$modal.find("#cc-unplanned-table-body").length) return [];
		if (!this._task_name) return [];

		const rows = this._unplanned_collect_data();
		// Nothing to write: the grid is empty and the task has no unplanned rows either.
		if (!rows.length && !(this._task.unplanned_items || []).length) return [];

		const r = await frappe.call({
			method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_unplanned_items",
			args: { task_name: this._task_name, items_json: JSON.stringify(rows) },
		});
		return r.message || [];
	}

	_render_budget(t) {
		const budget_qty = t.cpc_budget_qty ? `${flt(t.cpc_budget_qty)} ${frappe.utils.escape_html(t.cpc_uom || "")}` : "—";
		const total_budget = format_currency(flt(t.cpc_budget_amount), "SAR");
		const consumed_pct = flt(t.progress || 0);

		return `
<div class="cc-viewer-stat-row">
	<div class="cc-viewer-stat cc-viewer-stat-purple">
		<div class="cc-viewer-stat-label">${__("Budget Quantity")}</div>
		<div class="cc-viewer-stat-value">${budget_qty}</div>
	</div>
	<div class="cc-viewer-stat cc-viewer-stat-green">
		<div class="cc-viewer-stat-label">${__("Total Cost Budget")}</div>
		<div class="cc-viewer-stat-value">${total_budget}</div>
	</div>
</div>

<div class="cc-viewer-ledger-card">
	<div class="cc-viewer-ledger-header">
		<strong>${__("Weekly Progress")}</strong>
		<span class="cc-viewer-ledger-pct">${consumed_pct}% ${__("progress")}</span>
	</div>
	<div class="cc-viewer-progress-wrap">
		<div class="cc-viewer-progress-bar" style="width:${Math.min(consumed_pct, 100)}%"></div>
	</div>
</div>`;
	}

	_render_progress(t) {
		const entries = t.progress_history || [];
		if (!entries.length) {
			return `<p class="cc-viewer-empty">${__("No progress history entries found.")}</p>`;
		}
		const rows_html = entries.map((e) => {
			const status_cls = e.docstatus === 1 ? "cc-badge-green" : "cc-badge-gray";
			const status_label = e.docstatus === 1 ? __("Submitted") : __("Draft");
			return `
<tr>
	<td>${frappe.utils.escape_html(e.posting_date || "")}</td>
	<td class="cc-viewer-pct-cell"><a href="#" data-open-voucher="${frappe.utils.escape_html(e.voucher_no || "")}">${flt(e.cumulative_pct, 1)}%</a></td>
	<td>+${flt(e.period_pct, 1)}%</td>
	<td><strong>${format_currency(flt(e.earned_value), "SAR")}</strong></td>
	<td><span class="cc-viewer-type-badge ${status_cls}">${status_label}</span></td>
</tr>`;
		}).join("");

		return `
<h4 class="cc-viewer-section-title">${__("WEEKLY PROGRESS LOG HISTORY")}</h4>
<div class="cc-viewer-table-wrap">
	<table class="cc-viewer-table">
		<thead>
			<tr>
				<th>${__("Posting Date")}</th>
				<th>${__("Cumulative %")}</th>
				<th>${__("This Period %")}</th>
				<th>${__("Earned Period Value")}</th>
				<th>${__("Status")}</th>
			</tr>
		</thead>
		<tbody>${rows_html}</tbody>
	</table>
</div>`;
	}

	// ── Edit mode ───────────────────────────────────────────────────────────

	// Show/hide the Items + Unplanned grids' editing affordances. The grid cells
	// stay populated and readable at all times — only "Add Row" and the per-row
	// delete controls appear once "Edit Document" is active, so the read-only
	// view has no dangling actions that cannot be saved.
	_set_items_editable(on) {
		this.$modal
			.find("[data-items-bottom-bar], [data-unplanned-bottom-bar], .cc-items-del-col")
			.toggleClass("hide", !on);
	}

	_enter_edit_mode() {
		if (!this._task) return;
		this._edit_mode = true;
		const $m = this.$modal;

		$m.find("[data-viewer-edit]").addClass("hide");
		$m.find("[data-viewer-save], [data-viewer-cancel-edit]").removeClass("hide");
		$m.find(".cc-viewer-footer").removeClass("hide");
		this._set_items_editable(true);

		// Replace each editable display div with an input
		$m.find(".cc-viewer-editable[data-edit-field]").each((_, el) => {
			const $el = $(el);
			const field = $el.data("edit-field");
			const type = $el.data("field-type") || "Data";
			const val = this._task[field] || "";

			let input_html;
			if (type === "Date") {
				input_html = `<input class="form-control cc-viewer-edit-input" data-edit-field="${field}" type="date" value="${val}" />`;
			} else if (type === "Select") {
				let opts = $el.data("select-options") || [];
				if (typeof opts === "string") {
					try {
						opts = JSON.parse(opts);
					} catch (_err) {
						opts = [];
					}
				}
				const options_html = ['<option value="">—</option>']
					.concat((opts || []).map((o) =>
						`<option value="${frappe.utils.escape_html(o)}" ${o === val ? "selected" : ""}>${frappe.utils.escape_html(o)}</option>`
					))
					.join("");
				input_html = `<select class="form-control cc-viewer-edit-input" data-edit-field="${field}">${options_html}</select>`;
			} else {
				input_html = `<input class="form-control cc-viewer-edit-input" data-edit-field="${field}" type="text" value="${frappe.utils.escape_html(val)}" />`;
			}
			$el.replaceWith(input_html);
		});
	}

	_exit_edit_mode() {
		const was_editing = this._edit_mode;
		this._edit_mode = false;
		const $m = this.$modal;
		$m.find("[data-viewer-edit]").removeClass("hide");
		$m.find("[data-viewer-save], [data-viewer-cancel-edit]").addClass("hide");
		$m.find(".cc-viewer-footer").addClass("hide");
		this._set_items_editable(false);

		// Only re-render the read-only state when leaving an active edit mode.
		// Re-rendering unconditionally would loop forever with _render_all(),
		// since _render_all() resets edit mode at the end of every render.
		if (was_editing && this._task) this._render_all();
	}

	async _save() {
		const $m = this.$modal;
		const data = {};
		$m.find(".cc-viewer-edit-input[data-edit-field]").each((_, el) => {
			const $el = $(el);
			data[$el.data("edit-field")] = $el.val();
		});

		const $btn = $m.find("[data-viewer-save]");
		$btn.prop("disabled", true).text(__("Saving…"));
		try {
			// Items first — it rebuilds the custom_items_table child rows.
			await this._persist_items();

			// Unplanned Items — rebuilds the custom_irpo_unplanned_item child rows.
			await this._unplanned_persist();

			if (Object.keys(data).length) {
				await frappe.call({
					method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_fields",
					args: { task_name: this._task_name, fields_json: JSON.stringify(data) },
				});
			}
			// Refresh task data and guard against an empty response
			const r = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpo_task_detail",
				args: { task_name: this._task_name },
			});
			if (r && r.message) {
				this._task = r.message;
			}
			frappe.show_alert({ message: __("Task saved."), indicator: "green" });
			this._exit_edit_mode();
			// Also reload planner data in background so WBS reflects any changes
			this.view.planner._load();
		} catch (err) {
			frappe.show_alert({ message: this._save_error_message(err, __("Could not save task.")), indicator: "red" });
		} finally {
			$btn.prop("disabled", false).text(__("Save"));
		}
	}

	// Save a color change immediately without requiring the user to enter edit mode.
	// Called by the 'change' event on the color picker once the native picker is closed.
	async _save_color(color) {
		if (!this._task_name) return;
		console.log("IRPOViewer: saving color", color, "for task", this._task_name);
		try {
			const r = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_task_fields",
				args: { task_name: this._task_name, fields_json: JSON.stringify({ color }) },
			});
			console.log("IRPOViewer: color save response", r);
			// Keep in-memory task state in sync so a re-render shows the new color.
			if (this._task) this._task.color = color;
			// Update the label next to the swatch.
			this.$modal.find(".cc-viewer-color-label").text(color);
			frappe.show_alert({ message: __("Color saved."), indicator: "green" });
			// Reload the planner Gantt chart so the bar color updates immediately.
			this.view.planner._load();
		} catch (err) {
			console.error("IRPOViewer: color save error", err);
			frappe.show_alert({ message: this._save_error_message(err, __("Could not save color.")), indicator: "red" });
		}
	}

	// Frappe already toasts the server-side reason for a failed save. Append it
	// to the short alert so the dialog does not hide *why* nothing was written.
	_save_error_message(err, fallback) {
		let text = "";
		try {
			if (err && err._server_messages) {
				const messages = JSON.parse(err._server_messages);
				text = messages.length ? messages[0].message : "";
			}
		} catch (_e) {
			// fall through to the plain message below
		}
		if (!text) text = (err && (err._error_message || err.message)) || "";
		if (!text) return fallback;

		const plain = $("<div>").html(String(text)).text().trim().split("\n")[0];
		return plain ? `${fallback} ${plain}` : fallback;
	}
};