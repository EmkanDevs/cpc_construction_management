/**
 * Create Material Request dialog
 * Opened from the IRPO Task Detail Viewer → "Overview & General" tab via the
 * "Create MR" button next to the Connections strip.
 *
 * The main dialog holds the Material Request header fields (Purpose,
 * Is Created From Task, Transaction Date, Required Date) plus an inline items
 * table (Item Code, Required By, Quantity, Warehouse, UOM) with a per-row
 * Edit / Delete action column.
 *
 * The row Edit action opens a nested dialog (on top of the main one) with the
 * Expense Account and the Accounting Dimensions: Task, Project, IRPO Planned
 * Ref and Cost Center.
 */

cpc_construction_management.contract_center.MRDialog = class MRDialog {
	constructor(view) {
		this.view = view;
		this.dialog = null;
		this.item_dialog = null;
		this.task = null;
		this.company = null;
		this.items = [];
		this._controls = {};
		this.mr_name = null;
		this.mr_doc = null;
	}

	// ── Public ──────────────────────────────────────────────────────────────

	async open(task) {
		this.task = task || {};
		this.company =
			frappe.defaults.get_default("company") ||
			frappe.defaults.get_user_default("Company") ||
			null;
		if (this.task.project) {
			const r = await frappe.db.get_value(
				"Project",
				this.task.project,
				"company"
			);
			const project_company =
				r && r.message
					? typeof r.message === "object"
						? r.message.company
						: r.message
					: null;
			if (project_company) this.company = project_company;
		}
		this.items = this._seed_items(this.task);
		this._controls = {};
		this.mr_name = null;
		this.mr_doc = null;
		this._build_dialog();
		this.dialog.show();
		this._render_items();
	}

	// ── Dialog construction ─────────────────────────────────────────────────

	_build_dialog() {
		if (this.dialog) {
			this.dialog.$wrapper.remove();
			this.dialog = null;
		}
		this.dialog = new frappe.ui.Dialog({
			title: __("Create Material Request"),
			size: "extra-large",
			fields: [
				{
					fieldname: "purpose",
					fieldtype: "Select",
					label: __("Purpose"),
					options: "Purchase\nMaterial Transfer\nMaterial Issue\nManufacture\nCustomer Provided",
					default: "Purchase",
					reqd: 1,
				},
				{
					fieldname: "is_created_from_task",
					fieldtype: "Check",
					label: __("Is Created From Task"),
					default: 1,
				},
				{ fieldtype: "Column Break" },
				{
					fieldname: "transaction_date",
					fieldtype: "Date",
					label: __("Transaction Date"),
					default: frappe.datetime.get_today(),
					reqd: 1,
				},
				{
					fieldname: "schedule_date",
					fieldtype: "Date",
					label: __("Required Date"),
					default: this._default_required_date(),
				},
				{
					fieldname: "set_warehouse",
					fieldtype: "Link",
					options: "Warehouse",
					label: __("Set Warehouse"),
					description: __(
						"Applies this warehouse to every item row that has none."
					),
					default: this._default_warehouse(),
					onchange: () => {
						const wh = this.dialog.get_value("set_warehouse");
						if (!wh) return;
						let changed = false;
						this.items.forEach((item) => {
							if (!item.warehouse) {
								item.warehouse = wh;
								changed = true;
							}
						});
						if (changed) this._render_items();
					},
				},
				{ fieldtype: "Section Break", label: __("Items") },
				{ fieldname: "items_html", fieldtype: "HTML" },
			],
			primary_action_label: __("Save"),
			primary_action: () => this._save(),
			onhide: () => this._on_hide(),
		});
		this.dialog.$wrapper.addClass("cc-mr-main-modal");
		this.dialog.header.find(".title-section").append(
			`<span class="cc-mr-state-badge indicator-pill gray"></span>`
		);
		this._set_state_badge(__("Draft"));
	}

	_default_required_date() {
		return (this.task && this.task.exp_end_date) || frappe.datetime.get_today();
	}

	_default_warehouse() {
		const whs = (this.items || []).map((i) => i.warehouse).filter(Boolean);
		const uniq = [...new Set(whs)];
		return uniq.length === 1 ? uniq[0] : "";
	}

	// ── Items table ─────────────────────────────────────────────────────────

	_items_shell_html() {
		const esc = frappe.utils.escape_html;
		const reqd = '<span class="cc-mr-reqd">*</span>';
		return `
<div class="cc-mr-items">
	<table class="cc-mr-items-table">
		<thead>
			<tr>
				<th>${esc(__("Item Code"))} ${reqd}</th>
				<th>${esc(__("Required By"))} ${reqd}</th>
				<th>${esc(__("Quantity"))} ${reqd}</th>
				<th>${esc(__("Warehouse"))}</th>
				<th>${esc(__("UOM"))} ${reqd}</th>
				<th class="cc-mr-actions">${esc(__("Action"))}</th>
			</tr>
		</thead>
		<tbody data-mr-items-body></tbody>
	</table>
	<button type="button" class="btn btn-xs btn-default cc-mr-add-row" data-mr-add-row>${esc(
			__("+ Add Row")
		)}</button>
</div>`;
	}

	_render_items() {
		const $wrap = this.dialog.fields_dict.items_html.$wrapper;
		$wrap.html(this._items_shell_html());
		$wrap
			.off("click.mr-add")
			.on("click.mr-add", "[data-mr-add-row]", () => {
				const item = this._blank_item();
				this.items.push(item);
				this._append_item_row(item);
			});
		$wrap
			.off("click.mr-del")
			.on("click.mr-del", "[data-mr-del-row]", (e) => {
				const uid = $(e.currentTarget).closest("[data-mr-row]").data("uid");
				this.items = this.items.filter((it) => String(it.uid) !== String(uid));
				delete this._controls[uid];
				$(e.currentTarget).closest("[data-mr-row]").remove();
			});
		$wrap
			.off("click.mr-edit")
			.on("click.mr-edit", "[data-mr-edit-row]", (e) => {
				const uid = $(e.currentTarget).closest("[data-mr-row]").data("uid");
				const item = this.items.find((it) => String(it.uid) === String(uid));
				if (item) this._open_item_editor(item);
			});
		this.items.forEach((item) => this._append_item_row(item));
	}

	_append_item_row(item) {
		const $body = this.dialog.fields_dict.items_html.$wrapper.find("[data-mr-items-body]");
		const $row = $(`
			<tr data-mr-row data-uid="${item.uid}">
				<td><div class="cc-mr-cell" data-mr-cell="item_code"></div></td>
				<td><div class="cc-mr-cell" data-mr-cell="schedule_date"></div></td>
				<td><div class="cc-mr-cell" data-mr-cell="qty"></div></td>
				<td><div class="cc-mr-cell" data-mr-cell="warehouse"></div></td>
				<td><div class="cc-mr-cell" data-mr-cell="uom"></div></td>
				<td class="cc-mr-actions">
					<button type="button" class="btn btn-xs btn-default" data-mr-edit-row title="${__(
						"Edit"
					)}">${frappe.utils.icon("edit", "xs")}</button>
					<button type="button" class="btn btn-xs btn-default" data-mr-del-row title="${__(
						"Delete"
					)}">${frappe.utils.icon("delete", "xs")}</button>
				</td>
			</tr>`);
		$body.append($row);

		const controls = {};
		controls.item_code = this._control(
			$row.find('[data-mr-cell="item_code"]'),
			"Link",
			"Item",
			item.item_code
		);
		controls.schedule_date = this._control(
			$row.find('[data-mr-cell="schedule_date"]'),
			"Date",
			null,
			item.schedule_date
		);
		controls.qty = this._control(
			$row.find('[data-mr-cell="qty"]'),
			"Float",
			null,
			item.qty
		);
		controls.warehouse = this._control(
			$row.find('[data-mr-cell="warehouse"]'),
			"Link",
			"Warehouse",
			item.warehouse
		);
		controls.uom = this._control(
			$row.find('[data-mr-cell="uom"]'),
			"Link",
			"UOM",
			item.uom
		);
		this._controls[item.uid] = controls;

		controls.item_code.$input.on("change", () => {
			const code = controls.item_code.get_value();
			item.item_code = code || "";
			if (!code) return;
			frappe.db
				.get_value("Item", code, ["item_name", "stock_uom", "purchase_uom"])
				.then((r) => {
					const d = r && r.message ? r.message : r;
					if (!d) return;
					item.item_name = d.item_name || code;
					item.stock_uom = d.stock_uom || item.stock_uom;
					if (!controls.uom.get_value()) {
						controls.uom.set_value(d.purchase_uom || d.stock_uom || "");
					}
				});
		});
	}

	_control($parent, fieldtype, options, value, reqd = false) {
		const control = frappe.ui.form.make_control({
			parent: $parent,
			df: {
				fieldname: "mr_" + frappe.utils.get_random(8),
				fieldtype: fieldtype,
				options: options || "",
				placeholder: options || "",
				reqd: reqd ? 1 : 0,
			},
			render_input: true,
		});
		if (value !== undefined && value !== null && value !== "") {
			control.set_value(value);
		}
		return control;
	}

	// ── Nested per-row editor (all fields, Frappe grid "Edit Row" style) ─────

	_open_item_editor(item) {
		if (this.item_dialog) {
			this.item_dialog.$wrapper.remove();
			this.item_dialog = null;
		}
		this._sync_item_from_controls(item);
		const controls = this._controls[item.uid] || {};
		const account_query = () => ({
			filters: { company: this.company, is_group: 0 },
		});
		const d = new frappe.ui.Dialog({
			title: __("Item Details"),
			size: "large",
			fields: [
				{
					fieldname: "item_code",
					fieldtype: "Link",
					options: "Item",
					label: __("Item Code"),
					reqd: 1,
					default: item.item_code,
					onchange: () => this._autofill_item(d, item),
				},
				{
					fieldname: "item_name",
					fieldtype: "Data",
					label: __("Item Name"),
					read_only: 1,
					default: item.item_name,
				},
				{
					fieldname: "schedule_date",
					fieldtype: "Date",
					label: __("Required By"),
					reqd: 1,
					default: item.schedule_date,
				},
				{ fieldtype: "Column Break" },
				{
					fieldname: "qty",
					fieldtype: "Float",
					label: __("Quantity"),
					reqd: 1,
					default: item.qty,
				},
				{
					fieldname: "uom",
					fieldtype: "Link",
					options: "UOM",
					label: __("UOM"),
					reqd: 1,
					default: item.uom,
				},
				{
					fieldname: "warehouse",
					fieldtype: "Link",
					options: "Warehouse",
					label: __("Warehouse"),
					default: item.warehouse,
				},
				{ fieldtype: "Section Break", label: __("Accounting") },
				{
					fieldname: "expense_account",
					fieldtype: "Link",
					options: "Account",
					label: __("Expense Account"),
					default: item.expense_account,
					get_query: account_query,
				},
				{ fieldtype: "Section Break", label: __("Accounting Dimensions") },
				{
					fieldname: "task",
					fieldtype: "Link",
					options: "Task",
					label: __("Task"),
					default: item.task,
				},
				{
					fieldname: "project",
					fieldtype: "Link",
					options: "Project",
					label: __("Project"),
					default: item.project,
				},
				{
					fieldname: "cpc_irpo_budget_row_ref",
					fieldtype: "Data",
					label: __("IRPO Planned Ref"),
					default: item.cpc_irpo_budget_row_ref,
				},
				{ fieldtype: "Column Break" },
				{
					fieldname: "cost_center",
					fieldtype: "Link",
					options: "Cost Center",
					label: __("Cost Center"),
					default: item.cost_center,
					get_query: account_query,
				},
			],
			primary_action_label: __("Apply"),
			primary_action: (values) => {
				item.item_code = values.item_code || "";
				item.item_name = values.item_name || item.item_name;
				item.schedule_date = values.schedule_date || item.schedule_date;
				item.qty = flt(values.qty);
				item.uom = values.uom || "";
				item.warehouse = values.warehouse || "";
				item.expense_account = values.expense_account || "";
				item.task = values.task || "";
				item.project = values.project || "";
				item.cpc_irpo_budget_row_ref = values.cpc_irpo_budget_row_ref || "";
				item.cost_center = values.cost_center || "";
				this._reflect_item_in_row(item, controls);
				d.hide();
			},
		});
		d.$wrapper.addClass("cc-mr-item-editor-modal");
		this.item_dialog = d;
		d.show();
		if (item.item_code) this._autofill_item(d, item);
	}

	// Fetch Item Name / UOM for the selected Item Code and fill the form.
	_autofill_item(d, item) {
		const code = d.get_value("item_code");
		if (!code) {
			d.set_value("item_name", "");
			return;
		}
		frappe.db
			.get_value("Item", code, ["item_name", "stock_uom", "purchase_uom"])
			.then((r) => {
				const info = r && r.message ? r.message : r;
				if (!info) return;
				d.set_value("item_name", info.item_name || "");
				item.stock_uom = info.stock_uom || item.stock_uom;
				if (!d.get_value("uom")) {
					d.set_value("uom", info.purchase_uom || info.stock_uom || "");
				}
			});
	}

	// Pull any inline-table edits into the item state before opening the editor
	// so the form shows the current values (the inline cells are the source).
	_sync_item_from_controls(item) {
		const c = this._controls[item.uid];
		if (!c) return;
		if (c.item_code) item.item_code = c.item_code.get_value() || "";
		if (c.schedule_date) {
			item.schedule_date = c.schedule_date.get_value() || item.schedule_date;
		}
		if (c.qty) item.qty = flt(c.qty.get_value());
		if (c.warehouse) item.warehouse = c.warehouse.get_value() || "";
		if (c.uom) item.uom = c.uom.get_value() || "";
	}

	// Push the editor's values back into the inline table cells.
	_reflect_item_in_row(item, controls) {
		if (!controls) return;
		if (controls.item_code) controls.item_code.set_value(item.item_code || "");
		if (controls.schedule_date) {
			controls.schedule_date.set_value(item.schedule_date || "");
		}
		if (controls.qty) controls.qty.set_value(item.qty);
		if (controls.warehouse) controls.warehouse.set_value(item.warehouse || "");
		if (controls.uom) controls.uom.set_value(item.uom || "");
	}

	// ── Item state helpers ──────────────────────────────────────────────────

	_uid() {
		return "mr_" + frappe.utils.get_random(10);
	}

	// Seed from the IRPO viewer's "Items Details" tab only (`task.items`, i.e.
	// the Task custom_items_table). Unplanned items (`task.unplanned_items`)
	// are intentionally excluded for now.
	_seed_items(task) {
		return ((task && task.items) || []).map((r) => ({
			uid: this._uid(),
			item_code: r.item || "",
			item_name: r.item_name || "",
			uom: r.uom || "",
			stock_uom: r.uom || "",
			qty: flt(r.irpo_mr_pending_qty) > 0 ? flt(r.irpo_mr_pending_qty) : flt(r.qty),
			schedule_date: this._default_required_date(),
			warehouse: "",
			expense_account: (task && task.account) || "",
			task: (task && task.name) || "",
			project: (task && task.project) || "",
			cpc_irpo: (task && task.name) || "",
			cpc_irpo_budget_row_ref: r.irpo_budget_row_ref || "",
			cost_center: "",
		}));
	}

	_blank_item() {
		return {
			uid: this._uid(),
			item_code: "",
			item_name: "",
			uom: "",
			stock_uom: "",
			qty: 1,
			schedule_date: this._default_required_date(),
			warehouse: "",
			expense_account: (this.task && this.task.account) || "",
			task: (this.task && this.task.name) || "",
			project: (this.task && this.task.project) || "",
			cpc_irpo: (this.task && this.task.name) || "",
			cpc_irpo_budget_row_ref: "",
			cost_center: "",
		};
	}

	_collect_items() {
		return this.items.map((item) => {
			const c = this._controls[item.uid] || {};
			const val = (control, fallback) => (control ? control.get_value() : fallback);
			return {
				item_code: val(c.item_code, item.item_code) || item.item_code,
				item_name: item.item_name || "",
				qty: flt(val(c.qty, item.qty)),
				uom: val(c.uom, item.uom) || item.uom,
				stock_uom: item.stock_uom || val(c.uom, item.uom) || item.uom,
				warehouse: val(c.warehouse, item.warehouse) || item.warehouse,
				schedule_date:
					val(c.schedule_date, item.schedule_date) || item.schedule_date,
				expense_account: item.expense_account || "",
				cost_center: item.cost_center || "",
				project: item.project || (this.task && this.task.project) || "",
				task: item.task || (this.task && this.task.name) || "",
				cpc_irpo: (this.task && this.task.name) || "",
				cpc_irpo_budget_row_ref: item.cpc_irpo_budget_row_ref || "",
			};
		});
	}

	// Item Code, Required By (schedule_date), Quantity and UOM are mandatory.
	_validate_items(items) {
		const problems = [];
		items.forEach((row, idx) => {
			const missing = [];
			if (!row.item_code) missing.push(__("Item Code"));
			if (!row.schedule_date) missing.push(__("Required By"));
			if (row.qty == null || row.qty === "" || flt(row.qty) <= 0) {
				missing.push(__("Quantity"));
			}
			if (!row.uom) missing.push(__("UOM"));
			if (missing.length) {
				problems.push(
					__("Row {0}: {1}", [idx + 1, missing.join(", ")])
				);
			}
		});
		return problems;
	}

	// Declared quantity per Item from the IRPO "Items Details" table (QTY column),
	// summed across rows that share the same Item.
	_allowed_qty_by_item() {
		const map = {};
		((this.task && this.task.items) || []).forEach((r) => {
			const code = r.item;
			if (!code) return;
			if (!map[code]) map[code] = { qty: 0, uom: r.uom || "" };
			map[code].qty += flt(r.qty);
			if (!map[code].uom && r.uom) map[code].uom = r.uom;
		});
		return map;
	}

	// The requested qty on any row must not exceed the qty declared for that
	// Item in the IRPO "Items Details" table.
	_validate_quantities(items) {
		const allowed = this._allowed_qty_by_item();
		const task_name = (this.task && this.task.name) || "";
		const fmt = (v) => String(Number(flt(v, 3)));
		const problems = [];
		items.forEach((row, idx) => {
			const info = allowed[row.item_code];
			if (!info) return;
			const requested = flt(row.qty);
			if (requested - flt(info.qty) > 1e-6) {
				const uom = row.uom || info.uom || "";
				problems.push(
					__(
						"Row {0}: IRPO quantity exceeded for Item {1} against {2}. Allowed quantity: {3} {5}. Requested quantity: {4} {5}.",
						[
							idx + 1,
							row.item_code,
							task_name,
							fmt(info.qty),
							fmt(requested),
							uom,
						]
					)
				);
			}
		});
		return problems;
	}

	// ── Save (creates the Material Request in Draft) ────────────────────────

	_save() {
		if (this.mr_name) {
			// Already saved; the primary button is "Send for Approval" by now.
			this._refresh_workflow_buttons();
			return;
		}
		const values = this.dialog.get_values();
		if (!values) return;
		const items = this._collect_items();
		if (!items.length) {
			frappe.msgprint({
				title: __("No Items"),
				message: __("Add at least one item to the Material Request."),
				indicator: "red",
			});
			return;
		}
		const problems = this._validate_items(items);
		if (problems.length) {
			frappe.msgprint({
				title: __("Missing Values Required"),
				message:
					__("Following fields have missing values:") +
					"<br><br><ul><li>" +
					problems.join("<li>") +
					"</ul>",
				indicator: "orange",
			});
			return;
		}
		const qty_problems = this._validate_quantities(items);
		if (qty_problems.length) {
			frappe.msgprint({
				title: __("Quantity Exceeded"),
				message:
					__(
						"The requested quantities exceed the qty declared in the IRPO Items Details:"
					) +
					"<br><br><ul><li>" +
					qty_problems.join("<li>") +
					"</ul>",
				indicator: "red",
			});
			return;
		}
		const set_warehouse = values.set_warehouse || "";
		if (set_warehouse) {
			items.forEach((row) => {
				if (!row.warehouse) row.warehouse = set_warehouse;
			});
		}
		const doc = {
			doctype: "Material Request",
			material_request_type: values.purpose || "Purchase",
			is_created_from_task: values.is_created_from_task ? 1 : 0,
			transaction_date: values.transaction_date,
			schedule_date: values.schedule_date,
			set_warehouse: set_warehouse || undefined,
			company: this.company,
			task: (this.task && this.task.name) || undefined,
			custom_project: (this.task && this.task.project) || undefined,
			items: items,
		};
		const $btn = this.dialog.get_primary_btn();
		$btn.prop("disabled", true);
		frappe.call({
			method: "frappe.client.insert",
			args: { doc },
			callback: (r) => {
				$btn.prop("disabled", false);
				if (!r || !r.message) return;
				this.mr_doc = r.message;
				this.mr_name = r.message.name;
				this._set_state_badge(r.message.workflow_state || __("Draft"));
				frappe.show_alert({
					message: __("Material Request {0} saved as Draft", [
						this.mr_name,
					]),
					indicator: "green",
				});
				this._lock_form();
				this._refresh_workflow_buttons();
			},
			error: () => $btn.prop("disabled", false),
		});
	}

	// Freeze the header + inline item table once the draft is persisted.
	_lock_form() {
		const fields = this.dialog.fields_dict || {};
		[
			"purpose",
			"is_created_from_task",
			"transaction_date",
			"schedule_date",
			"set_warehouse",
		].forEach((name) => {
			const field = fields[name];
			if (field && field.$input) field.$input.prop("disabled", true);
		});
		Object.values(this._controls).forEach((controls) => {
			Object.values(controls).forEach((control) => {
				if (control && control.$input) {
					control.$input.prop("disabled", true);
					control.$input.prop("readonly", true);
				}
			});
		});
		const items_html = fields.items_html && fields.items_html.$wrapper;
		if (items_html) items_html.find("[data-mr-add-row], .cc-mr-actions").hide();
	}

	// ── Workflow: Save → Send for Approval → Approve / Reject ───────────────

	_set_state_badge(state) {
		const $badge = this.dialog.$wrapper.find(".cc-mr-state-badge");
		if (!$badge.length) return;
		$badge
			.removeClass(
				"green cyan blue orange yellow gray grey red pink darkgrey purple light-blue"
			)
			.addClass(this._state_color(state))
			.text(state || __("Draft"));
	}

	_state_color(state) {
		const s = (state || "").toLowerCase();
		if (s.includes("cancel") || s.includes("reject")) return "red";
		if (s.includes("draft")) return "gray";
		if (s.includes("pending")) return "orange";
		if (
			s.includes("approv") ||
			s.includes("issued") ||
			s.includes("completed") ||
			s.includes("transferred") ||
			s.includes("at main warehouse")
		) {
			return "green";
		}
		return "blue";
	}

	_refresh_workflow_buttons() {
		this.dialog.standard_actions.find(".cc-mr-wf-btn").remove();
		if (!this.mr_name) {
			this._set_primary(__("Save"), () => this._save());
			return;
		}
		frappe.call({
			method: "frappe.model.workflow.get_transitions",
			args: {
				doc: JSON.stringify({
					doctype: "Material Request",
					name: this.mr_name,
				}),
			},
			callback: (r) => {
				const transitions = (r && r.message) || [];
				const actions = transitions.map((t) => t.action);
				const has = (a) => actions.includes(a);

				if (has("Send for Approval")) {
					this._set_primary(__("Send for Approval"), (e) =>
						this._apply_action("Send for Approval", $(e.currentTarget))
					);
					return;
				}
				if (has("Approve") || has("Reject")) {
					this._hide_primary();
					if (has("Approve")) {
						this._add_action(__("Approve"), "btn-primary", (e) =>
							this._apply_action("Approve", $(e.currentTarget))
						);
					}
					if (has("Reject")) {
						this._add_action(__("Reject"), "btn-danger", (e) =>
							this._apply_action("Reject", $(e.currentTarget))
						);
					}
					actions
						.filter(
							(a) =>
								!["Approve", "Reject", "Send for Approval"].includes(
									a
								)
						)
						.forEach((a) =>
							this._add_action(__(a), "btn-secondary", (e) =>
								this._apply_action(a, $(e.currentTarget))
							)
						);
					return;
				}
				this._hide_primary();
				actions.forEach((a) =>
					this._add_action(__(a), "btn-secondary", (e) =>
						this._apply_action(a, $(e.currentTarget))
					)
				);
				if (!actions.length) {
					frappe.db
						.get_value("Material Request", this.mr_name, "workflow_state")
						.then((res) => {
							const state =
								res && res.message ? res.message.workflow_state : "";
							if (state) this._set_state_badge(state);
							const $label = this._add_action(
								__("Current State: {0}", [state || "—"]),
								"btn-secondary",
								null
							);
							$label.prop("disabled", true);
						});
				}
			},
		});
	}

	_apply_action(action, $btn) {
		if ($btn) $btn.prop("disabled", true);
		frappe.call({
			method: "frappe.model.workflow.apply_workflow",
			args: {
				doc: JSON.stringify({
					doctype: "Material Request",
					name: this.mr_name,
				}),
				action,
			},
			callback: (r) => {
				if ($btn) $btn.prop("disabled", false);
				const state =
					r && r.message ? r.message.workflow_state || "" : "";
				if (state) this._set_state_badge(state);
				frappe.show_alert({
					message: state
						? __("{0}: {1}", [action, state])
						: __(action),
					indicator: "green",
				});
				this._refresh_workflow_buttons();
			},
			error: () => {
				if ($btn) $btn.prop("disabled", false);
			},
		});
	}

	_set_primary(label, handler) {
		const $btn = this.dialog.get_primary_btn().removeClass("hide").html(label);
		$btn.off("click").on("click", handler);
		return $btn;
	}

	_hide_primary() {
		this.dialog.get_primary_btn().addClass("hide").off("click");
	}

	_add_action(label, css, handler) {
		const $btn = $(
			`<button type="button" class="btn btn-sm cc-mr-wf-btn ${
				css || "btn-secondary"
			}"></button>`
		).html(label);
		if (typeof handler === "function") $btn.on("click", handler);
		this.dialog.standard_actions.append($btn);
		return $btn;
	}

	_on_hide() {
		if (this.view && this.view.planner && this.view.planner.active_contract) {
			this.view.planner._load();
		}
		const viewer = this.view && this.view.irpo_viewer;
		const task_name = (this.task && this.task.name) || null;
		if (viewer && task_name) {
			viewer.open(task_name);
		}
	}
};
