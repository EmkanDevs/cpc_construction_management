// cpc_construction_management.contract_center.Dialogs = class ContractCenterDialogs {
// 	constructor(view) {
// 		this.view = view;
// 		this.$root = view.$root;
// 		this.active_contract = null;
// 		this.active_sales_order = null;
// 		this.setup_contract_link_fields();
// 		this.bind_events();
// 	}

// 	setup_contract_link_fields() {
// 		this.contract_link_controls = {
// 			customer: this.make_link_control(
// 				"[data-contract-customer-field]",
// 				"contract_customer",
// 				"Customer",
// 				__("Select Customer")
// 			),
// 			company: this.make_link_control(
// 				"[data-contract-company-field]",
// 				"contract_company",
// 				"Company",
// 				__("Select Company")
// 			),
// 			currency: this.make_link_control(
// 				"[data-contract-currency-field]",
// 				"contract_currency",
// 				"Currency",
// 				__("Select Currency")
// 			),
// 		};
// 	}

// 	make_link_control(parent_selector, fieldname, options, placeholder) {
// 		return frappe.ui.form.make_control({
// 			parent: this.$root.find(parent_selector),
// 			df: {
// 				fieldname,
// 				fieldtype: "Link",
// 				options,
// 				placeholder,
// 			},
// 			render_input: true,
// 		});
// 	}

// 	bind_events() {
// 		this.$root.on("click", "[data-close-modal]", (event) =>
// 			this.close($(event.currentTarget).data("close-modal"))
// 		);
// 		this.$root.on("click", "[data-add-boq-row]", () => this.add_boq_row());
// 		this.$root.on("click", "[data-remove-boq-row]", (event) => {
// 			$(event.currentTarget).closest("tr").remove();
// 			this.update_contract_summary();
// 		});
// 		this.$root.on("click", "[data-boq-uom-field] .btn-clear", (event) => {
// 			const control = $(event.currentTarget).closest("tr").data("uom_control");
// 			if (control) control.set_value("");
// 		});
// 		this.$root.on("click", "[data-save-contract]", () => this.save_contract());
// 		this.$root.on("click", "[data-submit-contract]", () => this.submit_contract());
// 		this.$root.on("input change", "[data-contract-currency-field] input", () =>
// 			this.update_boq_currency_labels()
// 		);
// 		this.$root.on("click", "[data-create-sales-order]", () => {
// 			this.close("cc-contract-modal");
// 			this.open_sales_order(this.active_contract);
// 		});
// 		this.$root.on("click", "[data-so-break-irpo]", async () => {
// 			const contract_name = this.active_contract ? this.active_contract.name : "";
// 			const so_name = this.active_sales_order ? this.active_sales_order.name : null;
// 			this.close("cc-sales-order-modal");
// 			await this.view.planner.open(contract_name, so_name);
// 			this.view.planner._open_break_irpo_dialog();
// 		});
// 		this.$root.on("click", "[data-save-sales-order]", () => this.save_sales_order());
// 		this.$root.on("click", "[data-so-send-approval]", () =>
// 			this.apply_sales_order_workflow("Send for Approval")
// 		);
// 		this.$root.on("click", "[data-so-approve]", () =>
// 			this.apply_sales_order_workflow("Approve")
// 		);
// 		this.$root.on("click", "[data-so-reject]", () =>
// 			this.apply_sales_order_workflow("Reject")
// 		);
// 		this.$root.on(
// 			"input",
// 			"[data-boq-field='qty'], [data-boq-field='rate'], [data-boq-field='cost_budget']",
// 			(event) => this.update_boq_row_amount($(event.currentTarget).closest("tr"))
// 		);
// 		// Money cells are displayed currency-formatted ("SAR 1,234.56"); show
// 		// the raw number while editing, then format again on blur.
// 		this.$root.on(
// 			"focus",
// 			"[data-boq-field='rate'], [data-boq-field='cost_budget']",
// 			(event) => {
// 				const $input = $(event.currentTarget);
// 				if ($input.val()) $input.val(this.money_value($input));
// 				$input.data("moneyEditing", true);
// 			}
// 		);
// 		this.$root.on(
// 			"blur",
// 			"[data-boq-field='rate'], [data-boq-field='cost_budget'], [data-boq-field='amount']",
// 			(event) =>
// 				this.format_money_input(
// 					$(event.currentTarget),
// 					this.contract_link_controls.currency.get_value() || "SAR"
// 				)
// 		);
// 		this.$root.on(
// 			"focus",
// 			"[data-boq-field='rate'], [data-boq-field='cost_budget']",
// 			() => this.show_contract_summary()
// 		);
// 		this.$root.on("click", ".cc-modal", (event) => {
// 			if (event.target === event.currentTarget) this.close(event.currentTarget.id);
// 		});
// 		// The Sales Order dialog switches between the Details form and the
// 		// Progress tab (the workflow's State Change log table).
// 		this.$root.on("click", "[data-so-tab]", (event) => {
// 			this.set_so_tab($(event.currentTarget).data("so-tab"));
// 		});
// 	}

// 	open_contract() {
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		// A stale reference would make the next Save update the previous contract
// 		// instead of inserting a new one.
// 		this.active_contract = null;
// 		$modal.find("input").val("");
// 		this.set_contract_editable(true);
// 		$modal.find("[data-save-contract]").prop("disabled", false).removeClass("hide");
// 		$modal.find("[data-submit-contract]").prop("disabled", false).addClass("hide");
// 		$modal.find("[data-create-sales-order]").addClass("hide");
// 		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
// 		this.contract_link_controls.customer.set_value("");
// 		this.contract_link_controls.company.set_value(frappe.defaults.get_default("company") || "");
// 		this.contract_link_controls.currency.set_value(
// 			frappe.defaults.get_default("currency") || "SAR"
// 		);
// 		this.clear_state_card($modal, "[data-contract-state]", __("Draft Entry"));
// 		this.clear_state_card($modal, "[data-project-state]", __("Waiting"));
// 		this.clear_state_card($modal, "[data-boq-state]", __("Editable"));
// 		$modal.find("[data-field='ownership']").val("Own");
// 		$modal.find("[data-field='contract_nature']").val("Remeasurement / BOQ");
// 		$modal.find("[data-field='contract_date'], [data-field='start_date']").val("");
// 		$modal.find("[data-field='end_date']").val("");
// 		$modal.find("[data-field='advance_percent'], [data-field='retention_percent']").val("");
// 		$modal.find("[data-boq-rows]").empty();
// 		$modal.find("[data-contract-summary]").addClass("hide");
// 		$modal.find("[data-summary-field='base_value'], [data-summary-field='total_cost_budget'], [data-summary-field='target_margin'], [data-summary-field='target_margin_percent']").val("");
// 		this.show("cc-contract-modal");
// 	}

// 	// Fills the contract dialog with an existing Draft Construction Contract so
// 	// it can be edited, saved and submitted — the same "Open" behaviour that
// 	// Draft Sales Orders get with their Open SO button.
// 	async open_existing_contract(doc) {
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		this.active_contract = doc;
// 		this.active_sales_order = null;
// 		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
// 		$modal.find("input").val("");
// 		$modal.find("[data-boq-rows]").empty();
// 		$modal.find("[data-contract-summary]").addClass("hide");
// 		$modal
// 			.find(
// 				"[data-summary-field='base_value'], [data-summary-field='total_cost_budget'], [data-summary-field='target_margin'], [data-summary-field='target_margin_percent']"
// 			)
// 			.val("");

// 		this.contract_link_controls.customer.set_value(doc.customer || "");
// 		this.contract_link_controls.company.set_value(
// 			doc.company || frappe.defaults.get_default("company") || ""
// 		);
// 		this.contract_link_controls.currency.set_value(doc.currency || "SAR");
// 		const set_field = (field, value) =>
// 			$modal.find(`[data-field='${field}']`).val(value ?? "");
// 		set_field("contract_title", doc.contract_title);
// 		set_field("ownership", doc.ownership);
// 		set_field("contract_nature", doc.contract_nature);
// 		set_field("contract_date", doc.contract_date);
// 		set_field("start_date", doc.start_date);
// 		set_field("end_date", doc.end_date);
// 		set_field("advance_percent", doc.advance_percent);
// 		set_field("retention_percent", doc.retention_percent);

// 		const currency = doc.currency || "SAR";
// 		(doc.boq_items || []).forEach((item) => {
// 			const $row = this.add_boq_row();
// 			$row.find("[data-boq-field='boq_code']").val(item.boq_code || "");
// 			$row.find("[data-boq-field='description']").val(item.description || "");
// 			$row.find("[data-boq-field='qty']").val(item.qty ?? "");
// 			const uom_control = $row.data("uom_control");
// 			if (uom_control) uom_control.set_value(item.uom || null);
// 			[{ field: "rate", value: item.rate }, { field: "cost_budget", value: item.cost_budget }, { field: "amount", value: item.amount }].forEach(
// 				({ field, value }) => {
// 					if (value != null && value !== "") {
// 						$row
// 							.find(`[data-boq-field='${field}']`)
// 							.val(format_currency(flt(value), currency));
// 					}
// 				}
// 			);
// 		});

// 		this.set_state_card($modal, "[data-contract-state]", "Construction Contract", doc.name);
// 		if (doc.project) {
// 			this.set_state_card($modal, "[data-project-state]", "Project", doc.project);
// 		} else {
// 			this.clear_state_card($modal, "[data-project-state]", __("Waiting for submit"));
// 		}
// 		this.clear_state_card(
// 			$modal,
// 			"[data-boq-state]",
// 			__("Editable · {0} BOQ items", [(doc.boq_items || []).length])
// 		);
// 		$modal.find(".cc-state-strip > div").addClass("cc-saved");

// 		this.set_contract_editable(true);
// 		$modal.find("[data-save-contract]").prop("disabled", false).removeClass("hide");
// 		$modal.find("[data-submit-contract]").prop("disabled", false).removeClass("hide");
// 		$modal.find("[data-create-sales-order]").addClass("hide");
// 		this.show_contract_summary();
// 		this.show("cc-contract-modal");
// 	}

// 	// The state strip at the top of the dialog doubles as the Construction
// 	// Contract / Project cards: once the document exists its ID is rendered as a
// 	// button that navigates to the form, otherwise the label is plain text.
// 	clear_state_card($modal, selector, label) {
// 		$modal.find(selector).text(label);
// 	}

// 	set_state_card($modal, selector, doctype, name) {
// 		const action =
// 			doctype === "Project"
// 				? "open-project"
// 				: doctype === "Sales Order"
// 				? "open-sales-order"
// 				: "open-contract";
// 		$modal
// 			.find(selector)
// 			.html(
// 				`<button type="button" class="cc-state-id" data-action="${action}" data-name="${this.view.escape(
// 					name
// 				)}">${this.view.escape(name)}</button>`
// 			);
// 	}

// 	// Only the enterable Sales Order fields are editable in Draft state; the
// 	// contract/project/customer/currency identity fields stay read-only.
// 	set_sales_order_editable(editable) {
// 		this.$root
// 			.find("#cc-sales-order-modal")
// 			.find(
// 				"[data-field='delivery_date'], [data-field='customer_po'], [data-field='advance_payment'], [data-field='retention']"
// 			)
// 			.prop("readonly", !editable);
// 	}

// 	// Switches the Sales Order dialog between the Details form and the Progress
// 	// tab. The Progress tab renders the Sales Order's State Change log (the
// 	// workflow history table the Sales Order form shows on its own Progress
// 	// tab), loaded fresh from the saved document.
// 	set_so_tab(tab) {
// 		if (this._so_tab === tab) return;
// 		this._so_tab = tab;
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		$modal.find("[data-so-tab]").each((_, el) => {
// 			$(el).toggleClass("is-active", $(el).data("so-tab") === tab);
// 		});
// 		$modal.find("[data-so-form-view]").toggleClass("hide", tab !== "details");
// 		$modal.find("[data-so-progress-view]").toggleClass("hide", tab !== "progress");
// 		if (tab === "progress") this.load_so_state_change();
// 	}

// 	async load_so_state_change() {
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		const $tbody = $modal.find("[data-sales-order-state-change]");
// 		const so_name = this.active_sales_order ? this.active_sales_order.name : null;
// 		if (!so_name) {
// 			$tbody.html(
// 				`<tr><td colspan="4" class="cc-modal-loading">${__(
// 					"Save the Sales Order to see its state changes."
// 				)}</td></tr>`
// 			);
// 			return;
// 		}
// 		$tbody.html(
// 			`<tr><td colspan="4" class="cc-modal-loading">${__("Loading…")}</td></tr>`
// 		);
// 		try {
// 			const doc = await frappe.call({
// 				method: "frappe.client.get",
// 				args: { doctype: "Sales Order", name: so_name },
// 			});
// 			const rows = (doc.message && doc.message.state_change) || [];
// 			if (!rows.length) {
// 				$tbody.html(
// 					`<tr><td colspan="4" class="cc-modal-loading">${__(
// 						"No state changes yet."
// 					)}</td></tr>`
// 				);
// 				return;
// 			}
// 			$tbody.html(
// 				rows
// 					.map(
// 						(row) => `
// 					<tr>
// 						<td>${this.view.escape(row.username)}</td>
// 						<td>${this.view.escape(row.role)}</td>
// 						<td><strong>${this.view.escape(row.workflow_state)}</strong></td>
// 						<td>${this.view.escape(
// 							row.modification_time
// 								? frappe.datetime.str_to_user(row.modification_time)
// 								: ""
// 						)}</td>
// 					</tr>`
// 					)
// 					.join("")
// 			);
// 		} catch (error) {
// 			$tbody.html(
// 				`<tr><td colspan="4" class="cc-modal-loading">${__(
// 					"Could not load state changes."
// 				)}</td></tr>`
// 			);
// 		}
// 	}

// 	// Every open starts on the Details tab (the form); the Progress tab only
// 	// shows the State Change log once it is requested.
// 	reset_so_tabs($modal) {
// 		this._so_tab = "details";
// 		$modal.find("[data-so-tab]").removeClass("is-active");
// 		$modal.find("[data-so-tab='details']").addClass("is-active");
// 		$modal.find("[data-so-form-view]").removeClass("hide");
// 		$modal.find("[data-so-progress-view]").addClass("hide");
// 	}

// 	async open_sales_order(contract) {
// 		this.active_contract = contract;
// 		this.active_sales_order = null;
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
// 		$modal.find("[data-so-contract-state]").text(__("Ready"));
// 		$modal.find("[data-so-boq-state]").text(__("Loaded"));
// 		$modal.find("input").prop("readonly", true);
// 		this.set_sales_order_editable(true);
// 		this.set_sales_order_save_state("draft");
// 		$modal.find("[data-field='contract']").val(contract.name);
// 		$modal.find("[data-field='customer']").val(contract.customer);
// 		$modal.find("[data-field='project']").val(contract.project);
// 		$modal
// 			.find("[data-field='delivery_date']")
// 			.val(contract.end_date || frappe.datetime.add_days(frappe.datetime.get_today(), 7));
// 		$modal.find("[data-field='customer_po']").val("");
// 		$modal.find("[data-field='currency']").val(contract.currency || "SAR");
// 		$modal.find("[data-field='advance_payment'], [data-field='retention']").val("");
// 		$modal.find("[data-sales-order-state]").text(__("Not Saved"));
// 		$modal
// 			.find("[data-sales-order-items]")
// 			.html(
// 				`<tr><td colspan="5" class="cc-modal-loading">${__(
// 					"Loading BOQ items…"
// 				)}</td></tr>`
// 			);
// 		this.show("cc-sales-order-modal");
// 		this.reset_so_tabs($modal);

// 		try {
// 			const document = await frappe.db.get_doc("Construction Contract", contract.name);
// 			this.render_sales_order_items(document.boq_items || [], contract.currency);
// 			$modal
// 				.find("[data-field='advance_payment']")
// 				.val(document.advance_percent || "");
// 			$modal.find("[data-field='retention']").val(document.retention_percent || "");
// 		} catch (error) {
// 			$modal
// 				.find("[data-sales-order-items]")
// 				.html(
// 					`<tr><td colspan="5" class="cc-modal-loading">${__(
// 						"Could not load BOQ items."
// 					)}</td></tr>`
// 				);
// 		}
// 	}

// 	async open_existing_sales_order(contract, so_doc) {
// 		this.active_contract = contract;
// 		this.active_sales_order = so_doc;
// 		const approved = so_doc.docstatus === 1;
// 		// The dialog's mode must mirror the workflow state, not just docstatus:
// 		// a Sales Order in "Pending Approval" is still docstatus 0 but can no
// 		// longer be edited or re-sent for approval — it can only be Approved or
// 		// Rejected. Deriving the mode only from docstatus would wrongly show the
// 		// "Send for Approval" button again on an already-submitted-for-approval
// 		// order, and the workflow engine then raises "Not a valid Workflow Action".
// 		const pending_approval = so_doc.workflow_state === "Pending Approval";
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
// 		$modal.find("[data-so-boq-state]").text(__("{0} Items Loaded", [so_doc.items.length]));
// 		$modal.find("input").prop("readonly", true);
// 		this.set_sales_order_editable(!approved && !pending_approval);
// 		$modal.find("[data-field='contract']").val(so_doc.cpc_contract || contract.name);
// 		$modal.find("[data-field='customer']").val(so_doc.customer || contract.customer);
// 		$modal.find("[data-field='project']").val(so_doc.project || contract.project);
// 		$modal.find("[data-field='delivery_date']").val(so_doc.delivery_date || "");
// 		$modal.find("[data-field='customer_po']").val(so_doc.po_no || "");
// 		$modal.find("[data-field='currency']").val(so_doc.currency || contract.currency || "SAR");
// 		$modal.find("[data-field='advance_payment']").val(so_doc.advance_payment || "");
// 		$modal.find("[data-field='retention']").val(so_doc.retention || "");
// 		this.render_sales_order_items(so_doc.items || [], so_doc.currency || contract.currency || "SAR");
// 		this.set_state_card(
// 			$modal,
// 			"[data-so-contract-state]",
// 			"Construction Contract",
// 			so_doc.cpc_contract || contract.name
// 		);
// 		this.set_state_card($modal, "[data-sales-order-state]", "Sales Order", so_doc.name);
// 		$modal.find(".cc-state-strip > div").addClass("cc-saved");
// 		this.set_sales_order_save_state(
// 			approved ? "approved" : pending_approval ? "review" : "editable"
// 		);
// 		this.show("cc-sales-order-modal");
// 		this.reset_so_tabs($modal);
// 	}

// 	// Plain editable money field. Its displayed value is formatted with the
// 	// contract currency (e.g. "SAR 1,234.56") exactly like the summary fields
// 	// below the BOQ table, so Rate, Cost Budget and Amount (Value) read the
// 	// same way. While the input is focused it shows the raw number for typing.
// 	money_input(field, attributes) {
// 		return `<input class="cc-cell-input cc-number" data-boq-field="${field}" type="text" inputmode="decimal" ${attributes}>`;
// 	}

// 	// Focused fields use a plain decimal point. Displayed fields use the
// 	// selected currency's decimal and grouping separators.
// 	money_value($input) {
// 		const text = String($input.val() || "").trim();
// 		if (!text) return 0;
// 		if ($input.data("moneyEditing")) return flt(text, undefined, "#,###.##");
// 		const number = text.match(/-?\d[\d.,' ]*/)?.[0].trim();
// 		const currency =
// 			$input.data("moneyCurrency") || this.contract_link_controls.currency.get_value() || "SAR";
// 		return number ? flt(number, undefined, get_number_format(currency)) : 0;
// 	}

// 	// Reformats the current value of a money input with the currency sign.
// 	format_money_input($input, currency) {
// 		const text = String($input.val() || "").trim();
// 		if (!text) {
// 			$input.removeData("moneyEditing");
// 			return;
// 		}
// 		const value = this.money_value($input);
// 		$input.val(format_currency(value, currency));
// 		$input.removeData("moneyEditing").data("moneyCurrency", currency);
// 	}

// 	// Called whenever the Currency field changes (and per new BOQ row) so the
// 	// money cells' displayed values stay in the chosen currency.
// 	update_boq_currency_labels($scope) {
// 		const currency = this.contract_link_controls.currency.get_value() || "SAR";
// 		const $inputs = ($scope || this.$root.find("[data-boq-rows]")).find(
// 			"[data-boq-field='rate'], [data-boq-field='cost_budget'], [data-boq-field='amount']"
// 		);
// 		$inputs.each((_, input) => this.format_money_input($(input), currency));
// 	}

// 	add_boq_row() {
// 		const $row = $(`
// 			<tr>
// 				<td><input class="cc-cell-input" data-boq-field="boq_code"></td>
// 				<td><input class="cc-cell-input" data-boq-field="description" placeholder="${__("Work description")}"></td>
// 				<td><div data-boq-uom-field></div></td>
// 				<td><input class="cc-cell-input cc-number" data-boq-field="qty" type="number" min="0"></td>
// 				<td>${this.money_input("rate")}</td>
// 				<td>${this.money_input("cost_budget")}</td>
// 				<td>${this.money_input("amount", "readonly")}</td>
// 				<td><button class="cc-row-remove" data-remove-boq-row aria-label="${__("Remove row")}">×</button></td>
// 			</tr>`);
// 		this.$root.find("[data-boq-rows]").append($row);
// 		const uom_control = frappe.ui.form.make_control({
// 			parent: $row.find("[data-boq-uom-field]"),
// 			df: {
// 				fieldname: "uom",
// 				fieldtype: "Link",
// 				options: "UOM",
// 				placeholder: __("UOM"),
// 			},
// 			render_input: true,
// 		});
// 		$row.data("uom_control", uom_control);
// 		this.update_boq_currency_labels($row);
// 		if (this.$root.find("#cc-contract-modal").is(":visible")) {
// 			$row[0]?.scrollIntoView({ block: "nearest" });
// 		}
// 		return $row;
// 	}

// 	update_boq_row_amount($row) {
// 		const qty = flt($row.find("[data-boq-field='qty']").val());
// 		const rate = this.money_value($row.find("[data-boq-field='rate']"));
// 		const currency = this.contract_link_controls.currency.get_value() || "SAR";
// 		const $amount = $row.find("[data-boq-field='amount']");
// 		const amount = qty * rate;
// 		$amount.val(amount || qty || rate ? format_currency(amount, currency) : "");
// 		this.update_contract_summary();
// 	}

// 	show_contract_summary() {
// 		this.$root.find("[data-contract-summary]").removeClass("hide");
// 		this.update_contract_summary();
// 	}

// 	update_contract_summary() {
// 		const currency = this.contract_link_controls.currency.get_value() || "SAR";
// 		let base_value = 0;
// 		let total_cost_budget = 0;
// 		this.$root.find("[data-boq-rows] tr").each((_, row) => {
// 			const $row = $(row);
// 			base_value += this.money_value($row.find("[data-boq-field='amount']"));
// 			total_cost_budget += this.money_value($row.find("[data-boq-field='cost_budget']"));
// 		});
// 		const target_margin = flt(base_value) - flt(total_cost_budget);
// 		const target_margin_percent = base_value
// 			? (target_margin / base_value) * 100
// 			: 0;
// 		const set_summary = (fieldname, value) =>
// 			this.$root.find(`[data-summary-field='${fieldname}']`).val(value);
// 		set_summary("base_value", this.view.money(base_value, currency));
// 		set_summary("total_cost_budget", this.view.money(total_cost_budget, currency));
// 		set_summary("target_margin", this.view.money(target_margin, currency));
// 		set_summary("target_margin_percent", `${target_margin_percent.toFixed(2)}%`);
// 	}

// 	render_sales_order_items(rows, currency) {
// 		const html = rows
// 			.map(
// 				(row) => `
// 			<tr data-so-item data-item-code="${this.view.escape(row.item_code)}" data-qty="${flt(
// 					row.qty
// 				)}" data-rate="${flt(row.rate)}">
// 				<td><strong>${this.view.escape(row.item_code || row.boq_code)}</strong></td>
// 				<td>${this.view.escape(row.description)}</td>
// 				<td class="cc-number">${format_number(row.qty)}</td>
// 				<td class="cc-number">${this.view.money(row.rate, currency)}</td>
// 				<td class="cc-number">${this.view.money(row.amount, currency)}</td>
// 			</tr>`
// 			)
// 			.join("");
// 		this.$root
// 			.find("[data-sales-order-items]")
// 			.html(
// 				html ||
// 					`<tr><td colspan="5" class="cc-modal-loading">${__(
// 						"No BOQ items found."
// 					)}</td></tr>`
// 			);
// 	}

// 	read_contract_form($modal) {
// 		const field = (name) => $modal.find(`[data-field='${name}']`).val();
// 		return {
// 			contract_title: field("contract_title"),
// 			customer: this.contract_link_controls.customer.get_value(),
// 			ownership: field("ownership"),
// 			contract_nature: field("contract_nature"),
// 			company: this.contract_link_controls.company.get_value(),
// 			currency: this.contract_link_controls.currency.get_value(),
// 			contract_date: field("contract_date"),
// 			start_date: field("start_date"),
// 			end_date: field("end_date"),
// 			advance_percent: field("advance_percent"),
// 			retention_percent: field("retention_percent"),
// 			boq_items: $modal
// 				.find("[data-boq-rows] tr")
// 				.map((_, row) => this.read_boq_row($(row)))
// 				.get(),
// 		};
// 	}

// 	validate_contract_payload(payload) {
// 		if (
// 			!payload.contract_title ||
// 			!payload.customer ||
// 			!payload.company ||
// 			!payload.currency ||
// 			!payload.ownership ||
// 			!payload.contract_nature ||
// 			!payload.contract_date ||
// 			!payload.boq_items.length ||
// 			payload.boq_items.some((row) => !row.description || !row.uom)
// 		) {
// 			frappe.msgprint(
// 				__("Complete all required contract fields and BOQ descriptions and UOM.")
// 			);
// 			return false;
// 		}
// 		return true;
// 	}

// 	// Insert on the first Save, update the draft on every Save after that.
// 	// frappe.client.save rebuilds the document from whatever it is given, so the
// 	// draft is re-read first — otherwise fields not on the form would be wiped.
// 	async persist_contract(payload) {
// 		let doc;
// 		if (this.active_contract && this.active_contract.docstatus === 0) {
// 			const current = await frappe.call({
// 				method: "frappe.client.get",
// 				args: {
// 					doctype: "Construction Contract",
// 					name: this.active_contract.name,
// 				},
// 			});
// 			doc = Object.assign({}, current.message, payload);
// 		} else {
// 			doc = Object.assign({ doctype: "Construction Contract" }, payload);
// 			// Stamp the first workflow state so a workflow Server Script does not
// 			// raise "No workflow state found" when the document is inserted here.
// 			const wf_response = await frappe.call({
// 				method:
// 					"cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_initial_workflow_state",
// 				args: { doctype: doc.doctype },
// 			});
// 			if (wf_response && wf_response.message) {
// 				doc.workflow_state = wf_response.message;
// 			}
// 		}

// 		const saved = await frappe.call({ method: "frappe.client.save", args: { doc } });
// 		return saved.message;
// 	}

// 	// Saves the Construction Contract only — it stays a draft, stays editable
// 	// and does not create the Project or the Item Master rows.
// 	async save_contract() {
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		const payload = this.read_contract_form($modal);
// 		if (!this.validate_contract_payload(payload)) return;

// 		const $button = $modal.find("[data-save-contract]");
// 		$button.prop("disabled", true).text(__("Saving…"));
// 		try {
// 			const saved = await this.persist_contract(payload);
// 			this.after_contract_saved(saved);
// 			frappe.show_alert({
// 				message: __("Construction Contract saved as Draft"),
// 				indicator: "blue",
// 			});
// 			try {
// 				await this.view.refresh();
// 			} catch (error) {
// 				console.warn("Could not refresh register after saving the contract:", error);
// 			}
// 		} catch (error) {
// 			frappe.show_alert({
// 				message: __("Could not save the Construction Contract"),
// 				indicator: "red",
// 			});
// 		} finally {
// 			$button.prop("disabled", false).text(__("Save"));
// 		}
// 	}

// 	// Persists whatever was edited since the last Save, then submits. Submit is
// 	// what runs ConstructionContract.on_submit → Item Master rows + Project.
// 	async submit_contract() {
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		const payload = this.read_contract_form($modal);
// 		if (!this.validate_contract_payload(payload)) return;

// 		const $save = $modal.find("[data-save-contract]");
// 		const $submit = $modal.find("[data-submit-contract]");
// 		$save.prop("disabled", true);
// 		$submit.prop("disabled", true).text(__("Submitting…"));
// 		try {
// 			const saved = await this.persist_contract(payload);
// 			this.active_contract = saved;

// 			const response = await frappe.call({
// 				method: "frappe.client.submit",
// 				args: { doc: saved },
// 			});
// 			const created = response.message;

// 			await this.after_contract_submitted(created);
// 			frappe.show_alert({
// 				message: __("Construction Contract submitted"),
// 				indicator: "green",
// 			});
// 			try {
// 				await this.view.refresh();
// 			} catch (error) {
// 				console.warn("Could not refresh register after submitting the contract:", error);
// 			}

// 			// If Add Contract was opened from the IRPO planner, hand the new
// 			// contract straight back to it.
// 			const planner_callback = this._planner_add_contract_callback || null;
// 			this._planner_add_contract_callback = null;
// 			if (planner_callback) await planner_callback(created.name);
// 		} catch (error) {
// 			frappe.show_alert({
// 				message: __("Could not submit the Construction Contract"),
// 				indicator: "red",
// 			});
// 		} finally {
// 			$save.prop("disabled", false);
// 			$submit.prop("disabled", false).text(__("Submit"));
// 		}
// 	}

// 	// Draft state: the contract exists, so its ID goes on the card, but nothing
// 	// is locked yet and the Project has not been created.
// 	after_contract_saved(saved) {
// 		this.active_contract = saved;
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		const boq_count = $modal.find("[data-boq-rows] tr").length;

// 		this.set_state_card($modal, "[data-contract-state]", "Construction Contract", saved.name);
// 		this.clear_state_card($modal, "[data-project-state]", __("Waiting for submit"));
// 		this.clear_state_card(
// 			$modal,
// 			"[data-boq-state]",
// 			__("{0} BOQ items", [boq_count])
// 		);

// 		$modal.find("[data-contract-state]").closest("div").addClass("cc-saved");
// 		$modal
// 			.find("[data-project-state], [data-boq-state]")
// 			.closest("div")
// 			.removeClass("cc-saved");

// 		this.set_contract_editable(true);
// 		$modal.find("[data-save-contract]").removeClass("hide");
// 		$modal.find("[data-submit-contract]").removeClass("hide");
// 		$modal.find("[data-create-sales-order]").addClass("hide");
// 	}

// 	// Submitted state: everything locks and both IDs become navigable.
// 	async after_contract_submitted(created) {
// 		this.active_contract = created;
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		const boq_count = $modal.find("[data-boq-rows] tr").length;

// 		let project = created.project;
// 		if (!project) {
// 			const r = await frappe.db.get_value(
// 				"Construction Contract",
// 				created.name,
// 				"project"
// 			);
// 			project = r && r.message ? r.message.project : null;
// 		}

// 		this.set_state_card($modal, "[data-contract-state]", "Construction Contract", created.name);
// 		if (project) {
// 			this.set_state_card($modal, "[data-project-state]", "Project", project);
// 		} else {
// 			this.clear_state_card($modal, "[data-project-state]", __("Not created"));
// 		}
// 		this.clear_state_card(
// 			$modal,
// 			"[data-boq-state]",
// 			__("{0} BOQ items created", [boq_count])
// 		);
// 		$modal.find(".cc-state-strip > div").addClass("cc-saved");

// 		this.set_contract_editable(false);
// 		$modal.find("[data-save-contract], [data-submit-contract]").addClass("hide");
// 		$modal.find("[data-create-sales-order]").removeClass("hide");

// 		try {
// 			await frappe.call({
// 				method:
// 					"cpc_construction_management.cpc_construction_management.doc_events.task.create_boq_nodes_for_contract",
// 				args: { contract_name: created.name },
// 			});
// 		} catch (err) {
// 			console.warn("Could not create BOQ Node tasks:", err);
// 		}
// 	}

// 	// Draft keeps every form field writable. The Amount (Value) column and the
// 	// summary strip are derived, so they stay read-only in both states.
// 	set_contract_editable(editable) {
// 		const $modal = this.$root.find("#cc-contract-modal");
// 		$modal
// 			.find("input")
// 			.not("[data-boq-field='amount'], [data-summary-field]")
// 			.prop("readonly", !editable);
// 		$modal.find("[data-boq-field='amount'], [data-summary-field]").prop("readonly", true);
// 		$modal.find("select").prop("disabled", !editable);
// 		$modal.find("[data-add-boq-row], [data-remove-boq-row]").prop("disabled", !editable);
// 		this.set_link_controls_read_only(!editable);
// 		this.set_boq_uom_read_only(!editable);
// 	}

// 	set_boq_uom_read_only(read_only) {
// 		this.$root.find("[data-boq-rows] tr").each((_, row) => {
// 			const control = $(row).data("uom_control");
// 			if (!control) return;
// 			control.df.read_only = read_only;
// 			control.refresh();
// 		});
// 	}

// 	set_link_controls_read_only(read_only) {
// 		Object.values(this.contract_link_controls).forEach((control) => {
// 			control.df.read_only = read_only;
// 			control.refresh();
// 		});
// 	}

// 	read_boq_row($row) {
// 		const value = (name) => $row.find(`[data-boq-field='${name}']`).val();
// 		const uom_control = $row.data("uom_control");
// 		return {
// 			boq_code: value("boq_code"),
// 			description: value("description"),
// 			uom: uom_control ? uom_control.get_value() : null,
// 			qty: flt(value("qty")),
// 			rate: this.money_value($row.find("[data-boq-field='rate']")),
// 			cost_budget: this.money_value($row.find("[data-boq-field='cost_budget']")),
// 		};
// 	}

// 	async save_sales_order() {
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		const delivery_date = $modal.find("[data-field='delivery_date']").val();
// 		const items = $modal
// 			.find("[data-so-item]")
// 			.map((_, row) => ({
// 				item_code: $(row).data("item-code"),
// 				qty: flt($(row).data("qty")),
// 				rate: flt($(row).data("rate")),
// 				delivery_date,
// 			}))
// 			.get();
// 		if (!delivery_date || !items.length || items.some((row) => !row.item_code)) {
// 			return frappe.msgprint(
// 				__("Enter a delivery date and ensure BOQ items have item codes.")
// 			);
// 		}

// 		const doc = {
// 			doctype: "Sales Order",
// 			customer: this.active_contract.customer,
// 			cpc_contract: this.active_contract.name,
// 			project: this.active_contract.project,
// 			delivery_date,
// 			po_no: $modal.find("[data-field='customer_po']").val(),
// 			advance_payment: $modal.find("[data-field='advance_payment']").val(),
// 			retention: $modal.find("[data-field='retention']").val(),
// 			items,
// 		};
// 		const wf_response = await frappe.call({
// 			method:
// 				"cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_initial_workflow_state",
// 			args: { doctype: doc.doctype },
// 		});
// 		const initial_workflow_state = wf_response && wf_response.message;
// 		if (initial_workflow_state) {
// 			doc.workflow_state = initial_workflow_state;
// 		}

// 		const $button = $modal.find("[data-save-sales-order]");
// 		$button.prop("disabled", true).text(__("Saving…"));
// 		try {
// 			let created;
// 			// An existing Draft Sales Order keeps its items and only the
// 			// enterable fields are updated, so it is re-read before saving.
// 			if (this.active_sales_order && this.active_sales_order.docstatus === 0) {
// 				const current = await frappe.call({
// 					method: "frappe.client.get",
// 					args: {
// 						doctype: "Sales Order",
// 						name: this.active_sales_order.name,
// 					},
// 				});
// 				const merged = Object.assign({}, current.message, {
// 					delivery_date,
// 					po_no: doc.po_no,
// 					advance_payment: doc.advance_payment,
// 					retention: doc.retention,
// 				});
// 				const updated = await frappe.call({
// 					method: "frappe.client.save",
// 					args: { doc: merged },
// 				});
// 				created = updated.message;
// 			} else {
// 				created = (
// 					await frappe.call({ method: "frappe.client.insert", args: { doc } })
// 				).message;
// 			}
// 			const item_count = created.items ? created.items.length : items.length;
// 			await this.after_sales_order_draft_saved(created, item_count);
// 			frappe.show_alert({
// 				message: __("Sales Order saved as Draft"),
// 				indicator: "blue",
// 			});
// 		} catch (error) {
// 			frappe.show_alert({
// 				message: __("Could not save the Sales Order"),
// 				indicator: "red",
// 			});
// 		} finally {
// 			$button.prop("disabled", false).text(__("Save"));
// 		}
// 		try {
// 			await this.view.refresh();
// 		} catch (error) {
// 			console.warn("Could not refresh register after saving Sales Order:", error);
// 		}
// 	}

// 	after_sales_order_draft_saved(created, item_count) {
// 		this.active_sales_order = created;
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		this.set_state_card(
// 			$modal,
// 			"[data-so-contract-state]",
// 			"Construction Contract",
// 			this.active_contract.name
// 		);
// 		$modal.find("[data-so-boq-state]").text(__("{0} Items Loaded", [item_count]));
// 		this.set_state_card($modal, "[data-sales-order-state]", "Sales Order", created.name);
// 		$modal.find(".cc-state-strip > div").addClass("cc-saved");
// 		// Draft Sales Orders stay editable until they are sent for approval.
// 		$modal.find("input").prop("readonly", true);
// 		this.set_sales_order_editable(true);
// 		this.set_sales_order_save_state("editable");
// 	}

// 	set_sales_order_save_state(mode) {
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		const editable_modes = ["draft", "editable"];
// 		$modal
// 			.find("[data-save-sales-order]")
// 			.toggleClass("hide", !editable_modes.includes(mode));
// 		$modal
// 			.find("[data-so-send-approval]")
// 			.toggleClass("hide", !["editable", "send"].includes(mode));
// 		$modal.find("[data-so-approve], [data-so-reject]").toggleClass("hide", mode !== "review");
// 		$modal.find("[data-so-break-irpo]").toggleClass("hide", mode !== "approved");
// 	}

// 	async apply_sales_order_workflow(action) {
// 		if (!this.active_sales_order) return;
// 		const $modal = this.$root.find("#cc-sales-order-modal");
// 		const $action_buttons = $modal.find(
// 			"[data-so-send-approval], [data-so-approve], [data-so-reject]"
// 		);
// 		const outcome = {
// 			"Send for Approval": { editable: false, state: __("Pending Approval"), mode: "review", alert: __("Sent for Approval") },
// 			Approve: { editable: false, state: __("Approved"), mode: "approved", alert: __("Sales Order Approved") },
// 			Reject: { editable: true, state: __("Draft"), mode: "editable", alert: __("Sales Order Rejected") },
// 		}[action];
// 		if (!outcome) return;
// 		try {
// 			$action_buttons.prop("disabled", true);
// 			const r = await frappe.call({
// 				method:
// 					"cpc_construction_management.cpc_construction_management.doc_events.sales_order.apply_workflow_action",
// 				args: { name: this.active_sales_order.name, action },
// 			});
// 			this.active_sales_order = r.message;
// 			this.set_state_card(
// 				$modal,
// 				"[data-sales-order-state]",
// 				"Sales Order",
// 				this.active_sales_order.name
// 			);
// 			this.set_sales_order_editable(outcome.editable);
// 			this.set_sales_order_save_state(outcome.mode);
// 			frappe.show_alert({
// 				message: outcome.alert,
// 				indicator: action === "Approve" ? "green" : action === "Reject" ? "orange" : "blue",
// 			});
// 		} catch (error) {
// 			frappe.show_alert({
// 				message: __("Could not apply the workflow action"),
// 				indicator: "red",
// 			});
// 		} finally {
// 			$action_buttons.prop("disabled", false);
// 		}
// 		try {
// 			await this.view.refresh();
// 		} catch (error) {
// 			console.warn("Could not refresh register after workflow action:", error);
// 		}
// 	}

// 	show(id) {
// 		this.$root.find(`#${id}`).removeClass("hide").attr("aria-hidden", "false");
// 		document.body.classList.add("cc-modal-open");
// 	}

// 	close(id) {
// 		this.$root.find(`#${id}`).addClass("hide").attr("aria-hidden", "true");
// 		document.body.classList.remove("cc-modal-open");
// 	}
// };


















cpc_construction_management.contract_center.Dialogs = class ContractCenterDialogs {
	constructor(view) {
		this.view = view;
		this.$root = view.$root;
		this.active_contract = null;
		this.active_sales_order = null;
		this.setup_contract_link_fields();
		this.bind_events();
	}

	setup_contract_link_fields() {
		this.contract_link_controls = {
			customer: this.make_link_control(
				"[data-contract-customer-field]",
				"contract_customer",
				"Customer",
				__("Select Customer")
			),
			company: this.make_link_control(
				"[data-contract-company-field]",
				"contract_company",
				"Company",
				__("Select Company")
			),
			currency: this.make_link_control(
				"[data-contract-currency-field]",
				"contract_currency",
				"Currency",
				__("Select Currency")
			),
		};
	}

	make_link_control(parent_selector, fieldname, options, placeholder) {
		return frappe.ui.form.make_control({
			parent: this.$root.find(parent_selector),
			df: {
				fieldname,
				fieldtype: "Link",
				options,
				placeholder,
			},
			render_input: true,
		});
	}

	bind_events() {
		this.$root.on("click", "[data-close-modal]", (event) =>
			this.close($(event.currentTarget).data("close-modal"))
		);
		this.$root.on("click", "[data-add-boq-row]", () => this.add_boq_row());
		this.$root.on("click", "[data-remove-boq-row]", (event) => {
			$(event.currentTarget).closest("tr").remove();
			this.update_contract_summary();
		});
		this.$root.on("click", "[data-boq-uom-field] .btn-clear", (event) => {
			const control = $(event.currentTarget).closest("tr").data("uom_control");
			if (control) control.set_value("");
		});
		this.$root.on("click", "[data-save-contract]", () => this.save_contract());
		this.$root.on("click", "[data-submit-contract]", () => this.submit_contract());
		this.$root.on("input change", "[data-contract-currency-field] input", () =>
			this.update_boq_currency_labels()
		);
		this.$root.on("click", "[data-create-sales-order]", () => {
			this.close("cc-contract-modal");
			this.open_sales_order(this.active_contract);
		});
		this.$root.on("click", "[data-so-break-irpo]", async () => {
			const contract_name = this.active_contract ? this.active_contract.name : "";
			const so_name = this.active_sales_order ? this.active_sales_order.name : null;
			this.close("cc-sales-order-modal");
			await this.view.planner.open(contract_name, so_name);
			this.view.planner._open_break_irpo_dialog();
		});
		this.$root.on("click", "[data-save-sales-order]", () => this.save_sales_order());
		this.$root.on("click", "[data-so-send-approval]", () =>
			this.apply_sales_order_workflow("Send for Approval")
		);
		this.$root.on("click", "[data-so-approve]", () =>
			this.apply_sales_order_workflow("Approve")
		);
		this.$root.on("click", "[data-so-reject]", () =>
			this.apply_sales_order_workflow("Reject")
		);
		this.$root.on(
			"input",
			"[data-boq-field='qty'], [data-boq-field='rate'], [data-boq-field='cost_budget']",
			(event) => this.update_boq_row_amount($(event.currentTarget).closest("tr"))
		);
		// Money cells are displayed currency-formatted ("SAR 1,234.56"); show
		// the raw number while editing, then format again on blur.
		this.$root.on(
			"focus",
			"[data-boq-field='rate'], [data-boq-field='cost_budget']",
			(event) => {
				const $input = $(event.currentTarget);
				if ($input.val()) $input.val(this.money_value($input));
				$input.data("moneyEditing", true);
			}
		);
		this.$root.on(
			"blur",
			"[data-boq-field='rate'], [data-boq-field='cost_budget'], [data-boq-field='amount']",
			(event) =>
				this.format_money_input(
					$(event.currentTarget),
					this.contract_link_controls.currency.get_value() || "SAR"
				)
		);
		this.$root.on(
			"focus",
			"[data-boq-field='rate'], [data-boq-field='cost_budget']",
			() => this.show_contract_summary()
		);
		this.$root.on("click", ".cc-modal", (event) => {
			if (event.target === event.currentTarget) this.close(event.currentTarget.id);
		});
		// The Sales Order dialog switches between the Details form and the
		// Progress tab (the workflow's State Change log table).
		this.$root.on("click", "[data-so-tab]", (event) => {
			this.set_so_tab($(event.currentTarget).data("so-tab"));
		});
	}

	open_contract() {
		const $modal = this.$root.find("#cc-contract-modal");
		// A stale reference would make the next Save update the previous contract
		// instead of inserting a new one.
		this.active_contract = null;
		$modal.find("input").val("");
		this.set_contract_editable(true);
		$modal.find("[data-save-contract]").prop("disabled", false).removeClass("hide");
		$modal.find("[data-submit-contract]").prop("disabled", false).addClass("hide");
		$modal.find("[data-create-sales-order]").addClass("hide");
		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
		this.contract_link_controls.customer.set_value("");
		this.contract_link_controls.company.set_value(frappe.defaults.get_default("company") || "");
		this.contract_link_controls.currency.set_value(
			frappe.defaults.get_default("currency") || "SAR"
		);
		this.clear_state_card($modal, "[data-contract-state]", __("Draft Entry"));
		this.clear_state_card($modal, "[data-project-state]", __("Waiting"));
		this.clear_state_card($modal, "[data-boq-state]", __("Editable"));
		$modal.find("[data-field='ownership']").val("Own");
		$modal.find("[data-field='contract_nature']").val("Remeasurement / BOQ");
		$modal.find("[data-field='contract_date'], [data-field='start_date']").val("");
		$modal.find("[data-field='end_date']").val("");
		$modal.find("[data-field='advance_percent'], [data-field='retention_percent']").val("");
		$modal.find("[data-boq-rows]").empty();
		$modal.find("[data-contract-summary]").addClass("hide");
		$modal.find("[data-summary-field='base_value'], [data-summary-field='total_cost_budget'], [data-summary-field='target_margin'], [data-summary-field='target_margin_percent']").val("");
		this.show("cc-contract-modal");
	}

	// Fills the contract dialog with an existing Draft Construction Contract so
	// it can be edited, saved and submitted — the same "Open" behaviour that
	// Draft Sales Orders get with their Open SO button.
	async open_existing_contract(doc) {
		const $modal = this.$root.find("#cc-contract-modal");
		this.active_contract = doc;
		this.active_sales_order = null;
		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
		$modal.find("input").val("");
		$modal.find("[data-boq-rows]").empty();
		$modal.find("[data-contract-summary]").addClass("hide");
		$modal
			.find(
				"[data-summary-field='base_value'], [data-summary-field='total_cost_budget'], [data-summary-field='target_margin'], [data-summary-field='target_margin_percent']"
			)
			.val("");

		this.contract_link_controls.customer.set_value(doc.customer || "");
		this.contract_link_controls.company.set_value(
			doc.company || frappe.defaults.get_default("company") || ""
		);
		this.contract_link_controls.currency.set_value(doc.currency || "SAR");
		const set_field = (field, value) =>
			$modal.find(`[data-field='${field}']`).val(value ?? "");
		set_field("contract_title", doc.contract_title);
		set_field("ownership", doc.ownership);
		set_field("contract_nature", doc.contract_nature);
		set_field("contract_date", doc.contract_date);
		set_field("start_date", doc.start_date);
		set_field("end_date", doc.end_date);
		set_field("advance_percent", doc.advance_percent);
		set_field("retention_percent", doc.retention_percent);

		const currency = doc.currency || "SAR";
		(doc.boq_items || []).forEach((item) => {
			const $row = this.add_boq_row();
			$row.find("[data-boq-field='boq_code']").val(item.boq_code || "");
			$row.find("[data-boq-field='description']").val(item.description || "");
			$row.find("[data-boq-field='qty']").val(item.qty ?? "");
			const uom_control = $row.data("uom_control");
			if (uom_control) uom_control.set_value(item.uom || null);
			[{ field: "rate", value: item.rate }, { field: "cost_budget", value: item.cost_budget }, { field: "amount", value: item.amount }].forEach(
				({ field, value }) => {
					if (value != null && value !== "") {
						$row
							.find(`[data-boq-field='${field}']`)
							.val(format_currency(flt(value), currency));
					}
				}
			);
		});

		this.set_state_card($modal, "[data-contract-state]", "Construction Contract", doc.name);
		if (doc.project) {
			this.set_state_card($modal, "[data-project-state]", "Project", doc.project);
		} else {
			this.clear_state_card($modal, "[data-project-state]", __("Waiting for submit"));
		}
		this.clear_state_card(
			$modal,
			"[data-boq-state]",
			__("Editable · {0} BOQ items", [(doc.boq_items || []).length])
		);
		$modal.find(".cc-state-strip > div").addClass("cc-saved");

		this.set_contract_editable(true);
		$modal.find("[data-save-contract]").prop("disabled", false).removeClass("hide");
		$modal.find("[data-submit-contract]").prop("disabled", false).removeClass("hide");
		$modal.find("[data-create-sales-order]").addClass("hide");
		this.show_contract_summary();
		this.show("cc-contract-modal");
	}

	// The state strip at the top of the dialog doubles as the Construction
	// Contract / Project cards: once the document exists its ID is rendered as a
	// button that navigates to the form, otherwise the label is plain text.
	clear_state_card($modal, selector, label) {
		$modal.find(selector).text(label);
	}

	set_state_card($modal, selector, doctype, name) {
		const action =
			doctype === "Project"
				? "open-project"
				: doctype === "Sales Order"
				? "open-sales-order"
				: "open-contract";
		$modal
			.find(selector)
			.html(
				`<button type="button" class="cc-state-id" data-action="${action}" data-name="${this.view.escape(
					name
				)}">${this.view.escape(name)}</button>`
			);
	}

	// Only the enterable Sales Order fields are editable in Draft state; the
	// contract/project/customer/currency identity fields stay read-only.
	set_sales_order_editable(editable) {
		this.$root
			.find("#cc-sales-order-modal")
			.find(
				"[data-field='delivery_date'], [data-field='customer_po'], [data-field='advance_payment'], [data-field='retention']"
			)
			.prop("readonly", !editable);
	}

	// Switches the Sales Order dialog between the Details form and the Progress
	// tab. The Progress tab renders the Sales Order's State Change log (the
	// workflow history table the Sales Order form shows on its own Progress
	// tab), loaded fresh from the saved document.
	set_so_tab(tab) {
		if (this._so_tab === tab) return;
		this._so_tab = tab;
		const $modal = this.$root.find("#cc-sales-order-modal");
		$modal.find("[data-so-tab]").each((_, el) => {
			$(el).toggleClass("is-active", $(el).data("so-tab") === tab);
		});
		$modal.find("[data-so-form-view]").toggleClass("hide", tab !== "details");
		$modal.find("[data-so-progress-view]").toggleClass("hide", tab !== "progress");
		if (tab === "progress") this.load_so_state_change();
	}

	async load_so_state_change() {
		const $modal = this.$root.find("#cc-sales-order-modal");
		const $tbody = $modal.find("[data-sales-order-state-change]");
		const so_name = this.active_sales_order ? this.active_sales_order.name : null;
		if (!so_name) {
			$tbody.html(
				`<tr><td colspan="4" class="cc-modal-loading">${__(
					"Save the Sales Order to see its state changes."
				)}</td></tr>`
			);
			return;
		}
		$tbody.html(
			`<tr><td colspan="4" class="cc-modal-loading">${__("Loading…")}</td></tr>`
		);
		this.load_so_approval_summary(so_name);
		try {
			const doc = await frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Sales Order", name: so_name },
			});
			const rows = (doc.message && doc.message.state_change) || [];
			if (!rows.length) {
				$tbody.html(
					`<tr><td colspan="4" class="cc-modal-loading">${__(
						"No state changes yet."
					)}</td></tr>`
				);
				return;
			}
			$tbody.html(
				rows
					.map(
						(row) => `
					<tr>
						<td>${this.view.escape(row.username)}</td>
						<td>${this.view.escape(row.role)}</td>
						<td><strong>${this.view.escape(row.workflow_state)}</strong></td>
						<td>${this.view.escape(
							row.modification_time
								? frappe.datetime.str_to_user(row.modification_time)
								: ""
						)}</td>
					</tr>`
					)
					.join("")
			);
		} catch (error) {
			$tbody.html(
				`<tr><td colspan="4" class="cc-modal-loading">${__(
					"Could not load state changes."
				)}</td></tr>`
			);
		}
	}

	format_waiting(seconds) {
		const total = Math.max(0, Math.floor(seconds || 0));
		const days = Math.floor(total / 86400);
		const hours = Math.floor((total % 86400) / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		if (days) return __("{0}d {1}h", [days, hours]);
		if (hours) return __("{0}h {1}m", [hours, minutes]);
		return __("{0}m", [minutes]);
	}

	// Approval summary above the State Change Log: who completed each step,
	// who the order is pending with, who may act next, and how long it has
	// been waiting at the current stage.
	async load_so_approval_summary(so_name) {
		const $box = this.$root.find("[data-so-approval-summary]");
		$box.html(`<div class="cc-modal-loading">${__("Loading…")}</div>`);
		try {
			const r = await frappe.call({
				method:
					"cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_approval_progress",
				args: { name: so_name },
			});
			const d = r.message || {};
			const esc = (v) => this.view.escape(v);
			const completed = (d.completed || [])
				.map(
					(s) =>
						`<li><strong>${esc(s.state)}</strong> — ${esc(s.user)} <small>${esc(
							s.at ? frappe.datetime.str_to_user(s.at) : ""
						)}</small></li>`
				)
				.join("");
			const next = (d.next_actions || [])
				.map((a) => {
					const names = (a.users || []).slice(0, 5).map(esc).join(", ");
					const more = a.user_count > 5 ? ` +${a.user_count - 5}` : "";
					return `<li><strong>${esc(a.action)}</strong> → ${esc(a.next_state)}<br><small>${esc(
						a.role
					)} (${a.user_count} ${__("users")}): ${names}${more}</small></li>`;
				})
				.join("");
			const waiting = d.is_final
				? ""
				: `<div class="${d.is_bottleneck ? "cc-summary-warn" : ""}"><label>${__(
						"Waiting"
				  )}</label><strong>${this.format_waiting(d.waiting_seconds)}</strong>${
						d.is_bottleneck ? `<small>${__("Possible bottleneck")}</small>` : ""
				  }</div>`;
			$box.html(`
				<div class="cc-approval-cards">
					<div><label>${__("Current Stage")}</label><strong>${esc(d.current_state)}</strong>
						<small>${esc(d.last_user || "")} ${esc(
				d.last_at ? frappe.datetime.str_to_user(d.last_at) : ""
			)}</small></div>
					<div><label>${__("Pending With")}</label><strong>${
						d.is_final ? __("Nobody — complete") : esc(d.pending_with || "—")
					}</strong></div>
					${waiting}
				</div>
				${completed ? `<h4>${__("Completed Steps")}</h4><ul>${completed}</ul>` : ""}
				${next ? `<h4>${__("Next Allowed Action")}</h4><ul>${next}</ul>` : ""}`);
		} catch (error) {
			$box.empty();
		}
	}

	// Every open starts on the Details tab (the form); the Progress tab only
	// shows the State Change log once it is requested.
	reset_so_tabs($modal) {
		this._so_tab = "details";
		$modal.find("[data-so-tab]").removeClass("is-active");
		$modal.find("[data-so-tab='details']").addClass("is-active");
		$modal.find("[data-so-form-view]").removeClass("hide");
		$modal.find("[data-so-progress-view]").addClass("hide");
	}

	async open_sales_order(contract) {
		this.active_contract = contract;
		this.active_sales_order = null;
		const $modal = this.$root.find("#cc-sales-order-modal");
		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
		$modal.find("[data-so-contract-state]").text(__("Ready"));
		$modal.find("[data-so-boq-state]").text(__("Loaded"));
		$modal.find("input").prop("readonly", true);
		this.set_sales_order_editable(true);
		this.set_sales_order_save_state("draft");
		$modal.find("[data-field='contract']").val(contract.name);
		$modal.find("[data-field='customer']").val(contract.customer);
		$modal.find("[data-field='project']").val(contract.project);
		$modal
			.find("[data-field='delivery_date']")
			.val(contract.end_date || frappe.datetime.add_days(frappe.datetime.get_today(), 7));
		$modal.find("[data-field='customer_po']").val("");
		$modal.find("[data-field='currency']").val(contract.currency || "SAR");
		$modal.find("[data-field='advance_payment'], [data-field='retention']").val("");
		$modal.find("[data-sales-order-state]").text(__("Not Saved"));
		$modal
			.find("[data-sales-order-items]")
			.html(
				`<tr><td colspan="5" class="cc-modal-loading">${__(
					"Loading BOQ items…"
				)}</td></tr>`
			);
		this.show("cc-sales-order-modal");
		this.reset_so_tabs($modal);

		try {
			const document = await frappe.db.get_doc("Construction Contract", contract.name);
			this.render_sales_order_items(document.boq_items || [], contract.currency);
			$modal
				.find("[data-field='advance_payment']")
				.val(document.advance_percent || "");
			$modal.find("[data-field='retention']").val(document.retention_percent || "");
		} catch (error) {
			$modal
				.find("[data-sales-order-items]")
				.html(
					`<tr><td colspan="5" class="cc-modal-loading">${__(
						"Could not load BOQ items."
					)}</td></tr>`
				);
		}
	}

	async open_existing_sales_order(contract, so_doc) {
		this.active_contract = contract;
		this.active_sales_order = so_doc;
		const approved = so_doc.docstatus === 1;
		// The dialog's mode must mirror the workflow state, not just docstatus:
		// a Sales Order in "Pending Approval" is still docstatus 0 but can no
		// longer be edited or re-sent for approval — it can only be Approved or
		// Rejected. Deriving the mode only from docstatus would wrongly show the
		// "Send for Approval" button again on an already-submitted-for-approval
		// order, and the workflow engine then raises "Not a valid Workflow Action".
		const pending_approval = so_doc.workflow_state === "Pending Approval";
		const $modal = this.$root.find("#cc-sales-order-modal");
		$modal.find(".cc-state-strip > div").removeClass("cc-saved");
		$modal.find("[data-so-boq-state]").text(__("{0} Items Loaded", [so_doc.items.length]));
		$modal.find("input").prop("readonly", true);
		this.set_sales_order_editable(!approved && !pending_approval);
		$modal.find("[data-field='contract']").val(so_doc.cpc_contract || contract.name);
		$modal.find("[data-field='customer']").val(so_doc.customer || contract.customer);
		$modal.find("[data-field='project']").val(so_doc.project || contract.project);
		$modal.find("[data-field='delivery_date']").val(so_doc.delivery_date || "");
		$modal.find("[data-field='customer_po']").val(so_doc.po_no || "");
		$modal.find("[data-field='currency']").val(so_doc.currency || contract.currency || "SAR");
		$modal.find("[data-field='advance_payment']").val(so_doc.advance_payment || "");
		$modal.find("[data-field='retention']").val(so_doc.retention || "");
		this.render_sales_order_items(so_doc.items || [], so_doc.currency || contract.currency || "SAR");
		this.set_state_card(
			$modal,
			"[data-so-contract-state]",
			"Construction Contract",
			so_doc.cpc_contract || contract.name
		);
		this.set_state_card($modal, "[data-sales-order-state]", "Sales Order", so_doc.name);
		$modal.find(".cc-state-strip > div").addClass("cc-saved");
		this.set_sales_order_save_state(
			approved ? "approved" : pending_approval ? "review" : "editable"
		);
		this.show("cc-sales-order-modal");
		this.reset_so_tabs($modal);
	}

	// Plain editable money field. Its displayed value is formatted with the
	// contract currency (e.g. "SAR 1,234.56") exactly like the summary fields
	// below the BOQ table, so Rate, Cost Budget and Amount (Value) read the
	// same way. While the input is focused it shows the raw number for typing.
	money_input(field, attributes) {
		return `<input class="cc-cell-input cc-number" data-boq-field="${field}" type="text" inputmode="decimal" ${attributes}>`;
	}

	// Focused fields use a plain decimal point. Displayed fields use the
	// selected currency's decimal and grouping separators.
	money_value($input) {
		const text = String($input.val() || "").trim();
		if (!text) return 0;
		if ($input.data("moneyEditing")) return flt(text, undefined, "#,###.##");
		const number = text.match(/-?\d[\d.,' ]*/)?.[0].trim();
		const currency =
			$input.data("moneyCurrency") || this.contract_link_controls.currency.get_value() || "SAR";
		return number ? flt(number, undefined, get_number_format(currency)) : 0;
	}

	// Reformats the current value of a money input with the currency sign.
	format_money_input($input, currency) {
		const text = String($input.val() || "").trim();
		if (!text) {
			$input.removeData("moneyEditing");
			return;
		}
		const value = this.money_value($input);
		$input.val(format_currency(value, currency));
		$input.removeData("moneyEditing").data("moneyCurrency", currency);
	}

	// Called whenever the Currency field changes (and per new BOQ row) so the
	// money cells' displayed values stay in the chosen currency.
	update_boq_currency_labels($scope) {
		const currency = this.contract_link_controls.currency.get_value() || "SAR";
		const $inputs = ($scope || this.$root.find("[data-boq-rows]")).find(
			"[data-boq-field='rate'], [data-boq-field='cost_budget'], [data-boq-field='amount']"
		);
		$inputs.each((_, input) => this.format_money_input($(input), currency));
	}

	add_boq_row() {
		const $row = $(`
			<tr>
				<td><input class="cc-cell-input" data-boq-field="boq_code"></td>
				<td><input class="cc-cell-input" data-boq-field="description" placeholder="${__("Work description")}"></td>
				<td><div data-boq-uom-field></div></td>
				<td><input class="cc-cell-input cc-number" data-boq-field="qty" type="number" min="0"></td>
				<td>${this.money_input("rate")}</td>
				<td>${this.money_input("cost_budget")}</td>
				<td>${this.money_input("amount", "readonly")}</td>
				<td><button class="cc-row-remove" data-remove-boq-row aria-label="${__("Remove row")}">×</button></td>
			</tr>`);
		this.$root.find("[data-boq-rows]").append($row);
		const uom_control = frappe.ui.form.make_control({
			parent: $row.find("[data-boq-uom-field]"),
			df: {
				fieldname: "uom",
				fieldtype: "Link",
				options: "UOM",
				placeholder: __("UOM"),
			},
			render_input: true,
		});
		$row.data("uom_control", uom_control);
		this.update_boq_currency_labels($row);
		if (this.$root.find("#cc-contract-modal").is(":visible")) {
			$row[0]?.scrollIntoView({ block: "nearest" });
		}
		return $row;
	}

	update_boq_row_amount($row) {
		const qty = flt($row.find("[data-boq-field='qty']").val());
		const rate = this.money_value($row.find("[data-boq-field='rate']"));
		const currency = this.contract_link_controls.currency.get_value() || "SAR";
		const $amount = $row.find("[data-boq-field='amount']");
		const amount = qty * rate;
		$amount.val(amount || qty || rate ? format_currency(amount, currency) : "");
		this.update_contract_summary();
	}

	show_contract_summary() {
		this.$root.find("[data-contract-summary]").removeClass("hide");
		this.update_contract_summary();
	}

	calculate_target_margin_percent() {
		let base_value = 0;
		let total_cost_budget = 0;
		this.$root.find("[data-boq-rows] tr").each((_, row) => {
			const $row = $(row);
			base_value += this.money_value($row.find("[data-boq-field='amount']"));
			total_cost_budget += this.money_value($row.find("[data-boq-field='cost_budget']"));
		});
		if (!base_value) return 0;
		return flt(((base_value - total_cost_budget) / base_value) * 100, 2);
	}

	update_contract_summary() {
		const currency = this.contract_link_controls.currency.get_value() || "SAR";
		let base_value = 0;
		let total_cost_budget = 0;
		this.$root.find("[data-boq-rows] tr").each((_, row) => {
			const $row = $(row);
			base_value += this.money_value($row.find("[data-boq-field='amount']"));
			total_cost_budget += this.money_value($row.find("[data-boq-field='cost_budget']"));
		});
		const target_margin = flt(base_value) - flt(total_cost_budget);
		const target_margin_percent = base_value
			? (target_margin / base_value) * 100
			: 0;
		const set_summary = (fieldname, value) =>
			this.$root.find(`[data-summary-field='${fieldname}']`).val(value);
		set_summary("base_value", this.view.money(base_value, currency));
		set_summary("total_cost_budget", this.view.money(total_cost_budget, currency));
		set_summary("target_margin", this.view.money(target_margin, currency));
		set_summary("target_margin_percent", `${target_margin_percent.toFixed(2)}%`);
	}

	render_sales_order_items(rows, currency) {
		const html = rows
			.map(
				(row) => `
			<tr data-so-item data-item-code="${this.view.escape(row.item_code)}" data-qty="${flt(
					row.qty
				)}" data-rate="${flt(row.rate)}">
				<td><strong>${this.view.escape(row.item_code || row.boq_code)}</strong></td>
				<td>${this.view.escape(row.description)}</td>
				<td class="cc-number">${format_number(row.qty)}</td>
				<td class="cc-number">${this.view.money(row.rate, currency)}</td>
				<td class="cc-number">${this.view.money(row.amount, currency)}</td>
			</tr>`
			)
			.join("");
		this.$root
			.find("[data-sales-order-items]")
			.html(
				html ||
					`<tr><td colspan="5" class="cc-modal-loading">${__(
						"No BOQ items found."
					)}</td></tr>`
			);
	}

	read_contract_form($modal) {
		const field = (name) => $modal.find(`[data-field='${name}']`).val();
		return {
			contract_title: field("contract_title"),
			customer: this.contract_link_controls.customer.get_value(),
			ownership: field("ownership"),
			contract_nature: field("contract_nature"),
			company: this.contract_link_controls.company.get_value(),
			currency: this.contract_link_controls.currency.get_value(),
			contract_date: field("contract_date"),
			start_date: field("start_date"),
			end_date: field("end_date"),
			advance_percent: field("advance_percent"),
			retention_percent: field("retention_percent"),
			// E-01: persist the same Target Margin % the summary card shows.
			target_margin_: this.calculate_target_margin_percent(),
			boq_items: $modal
				.find("[data-boq-rows] tr")
				.map((_, row) => this.read_boq_row($(row)))
				.get(),
		};
	}

	validate_contract_payload(payload) {
		if (
			!payload.contract_title ||
			!payload.customer ||
			!payload.company ||
			!payload.currency ||
			!payload.ownership ||
			!payload.contract_nature ||
			!payload.contract_date ||
			!payload.boq_items.length ||
			payload.boq_items.some((row) => !row.description || !row.uom)
		) {
			frappe.msgprint(
				__("Complete all required contract fields and BOQ descriptions and UOM.")
			);
			return false;
		}
		return true;
	}

	// Insert on the first Save, update the draft on every Save after that.
	// frappe.client.save rebuilds the document from whatever it is given, so the
	// draft is re-read first — otherwise fields not on the form would be wiped.
	async persist_contract(payload) {
		let doc;
		if (this.active_contract && this.active_contract.docstatus === 0) {
			const current = await frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Construction Contract",
					name: this.active_contract.name,
				},
			});
			doc = Object.assign({}, current.message, payload);
		} else {
			doc = Object.assign({ doctype: "Construction Contract" }, payload);
			// Stamp the first workflow state so a workflow Server Script does not
			// raise "No workflow state found" when the document is inserted here.
			const wf_response = await frappe.call({
				method:
					"cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_initial_workflow_state",
				args: { doctype: doc.doctype },
			});
			if (wf_response && wf_response.message) {
				doc.workflow_state = wf_response.message;
			}
		}

		const saved = await frappe.call({ method: "frappe.client.save", args: { doc } });
		return saved.message;
	}

	// Saves the Construction Contract only — it stays a draft, stays editable
	// and does not create the Project or the Item Master rows.
	async save_contract() {
		const $modal = this.$root.find("#cc-contract-modal");
		const payload = this.read_contract_form($modal);
		if (!this.validate_contract_payload(payload)) return;

		const $button = $modal.find("[data-save-contract]");
		$button.prop("disabled", true).text(__("Saving…"));
		try {
			const saved = await this.persist_contract(payload);
			this.after_contract_saved(saved);
			frappe.show_alert({
				message: __("Construction Contract saved as Draft"),
				indicator: "blue",
			});
			try {
				await this.view.refresh();
			} catch (error) {
				console.warn("Could not refresh register after saving the contract:", error);
			}
		} catch (error) {
			frappe.show_alert({
				message: __("Could not save the Construction Contract"),
				indicator: "red",
			});
		} finally {
			$button.prop("disabled", false).text(__("Save"));
		}
	}

	// Persists whatever was edited since the last Save, then submits. Submit is
	// what runs ConstructionContract.on_submit → Item Master rows + Project.
	async submit_contract() {
		const $modal = this.$root.find("#cc-contract-modal");
		const payload = this.read_contract_form($modal);
		if (!this.validate_contract_payload(payload)) return;

		const $save = $modal.find("[data-save-contract]");
		const $submit = $modal.find("[data-submit-contract]");
		$save.prop("disabled", true);
		$submit.prop("disabled", true).text(__("Submitting…"));
		try {
			const saved = await this.persist_contract(payload);
			this.active_contract = saved;

			const response = await frappe.call({
				method: "frappe.client.submit",
				args: { doc: saved },
			});
			const created = response.message;

			await this.after_contract_submitted(created);
			frappe.show_alert({
				message: __("Construction Contract submitted"),
				indicator: "green",
			});
			try {
				await this.view.refresh();
			} catch (error) {
				console.warn("Could not refresh register after submitting the contract:", error);
			}

			// If Add Contract was opened from the IRPO planner, hand the new
			// contract straight back to it.
			const planner_callback = this._planner_add_contract_callback || null;
			this._planner_add_contract_callback = null;
			if (planner_callback) await planner_callback(created.name);
		} catch (error) {
			frappe.show_alert({
				message: __("Could not submit the Construction Contract"),
				indicator: "red",
			});
		} finally {
			$save.prop("disabled", false);
			$submit.prop("disabled", false).text(__("Submit"));
		}
	}

	// Draft state: the contract exists, so its ID goes on the card, but nothing
	// is locked yet and the Project has not been created.
	after_contract_saved(saved) {
		this.active_contract = saved;
		const $modal = this.$root.find("#cc-contract-modal");
		const boq_count = $modal.find("[data-boq-rows] tr").length;

		this.set_state_card($modal, "[data-contract-state]", "Construction Contract", saved.name);
		this.clear_state_card($modal, "[data-project-state]", __("Waiting for submit"));
		this.clear_state_card(
			$modal,
			"[data-boq-state]",
			__("{0} BOQ items", [boq_count])
		);

		$modal.find("[data-contract-state]").closest("div").addClass("cc-saved");
		$modal
			.find("[data-project-state], [data-boq-state]")
			.closest("div")
			.removeClass("cc-saved");

		this.set_contract_editable(true);
		$modal.find("[data-save-contract]").removeClass("hide");
		$modal.find("[data-submit-contract]").removeClass("hide");
		$modal.find("[data-create-sales-order]").addClass("hide");
	}

	// Submitted state: everything locks and both IDs become navigable.
	async after_contract_submitted(created) {
		this.active_contract = created;
		const $modal = this.$root.find("#cc-contract-modal");
		const boq_count = $modal.find("[data-boq-rows] tr").length;

		let project = created.project;
		if (!project) {
			const r = await frappe.db.get_value(
				"Construction Contract",
				created.name,
				"project"
			);
			project = r && r.message ? r.message.project : null;
		}

		this.set_state_card($modal, "[data-contract-state]", "Construction Contract", created.name);
		if (project) {
			this.set_state_card($modal, "[data-project-state]", "Project", project);
		} else {
			this.clear_state_card($modal, "[data-project-state]", __("Not created"));
		}
		this.clear_state_card(
			$modal,
			"[data-boq-state]",
			__("{0} BOQ items created", [boq_count])
		);
		$modal.find(".cc-state-strip > div").addClass("cc-saved");

		this.set_contract_editable(false);
		$modal.find("[data-save-contract], [data-submit-contract]").addClass("hide");
		$modal.find("[data-create-sales-order]").removeClass("hide");

		try {
			await frappe.call({
				method:
					"cpc_construction_management.cpc_construction_management.doc_events.task.create_boq_nodes_for_contract",
				args: { contract_name: created.name },
			});
		} catch (err) {
			console.warn("Could not create BOQ Node tasks:", err);
		}
	}

	// Draft keeps every form field writable. The Amount (Value) column and the
	// summary strip are derived, so they stay read-only in both states.
	set_contract_editable(editable) {
		const $modal = this.$root.find("#cc-contract-modal");
		$modal
			.find("input")
			.not("[data-boq-field='amount'], [data-summary-field]")
			.prop("readonly", !editable);
		$modal.find("[data-boq-field='amount'], [data-summary-field]").prop("readonly", true);
		$modal.find("select").prop("disabled", !editable);
		$modal.find("[data-add-boq-row], [data-remove-boq-row]").prop("disabled", !editable);
		this.set_link_controls_read_only(!editable);
		this.set_boq_uom_read_only(!editable);
	}

	set_boq_uom_read_only(read_only) {
		this.$root.find("[data-boq-rows] tr").each((_, row) => {
			const control = $(row).data("uom_control");
			if (!control) return;
			control.df.read_only = read_only;
			control.refresh();
		});
	}

	set_link_controls_read_only(read_only) {
		Object.values(this.contract_link_controls).forEach((control) => {
			control.df.read_only = read_only;
			control.refresh();
		});
	}

	read_boq_row($row) {
		const value = (name) => $row.find(`[data-boq-field='${name}']`).val();
		const uom_control = $row.data("uom_control");
		return {
			boq_code: value("boq_code"),
			description: value("description"),
			uom: uom_control ? uom_control.get_value() : null,
			qty: flt(value("qty")),
			rate: this.money_value($row.find("[data-boq-field='rate']")),
			cost_budget: this.money_value($row.find("[data-boq-field='cost_budget']")),
		};
	}

	async save_sales_order() {
		const $modal = this.$root.find("#cc-sales-order-modal");
		const delivery_date = $modal.find("[data-field='delivery_date']").val();
		const items = $modal
			.find("[data-so-item]")
			.map((_, row) => ({
				item_code: $(row).data("item-code"),
				qty: flt($(row).data("qty")),
				rate: flt($(row).data("rate")),
				delivery_date,
			}))
			.get();
		if (!delivery_date || !items.length || items.some((row) => !row.item_code)) {
			return frappe.msgprint(
				__("Enter a delivery date and ensure BOQ items have item codes.")
			);
		}

		const doc = {
			doctype: "Sales Order",
			customer: this.active_contract.customer,
			cpc_contract: this.active_contract.name,
			project: this.active_contract.project,
			delivery_date,
			po_no: $modal.find("[data-field='customer_po']").val(),
			advance_payment: $modal.find("[data-field='advance_payment']").val(),
			retention: $modal.find("[data-field='retention']").val(),
			items,
		};
		const wf_response = await frappe.call({
			method:
				"cpc_construction_management.cpc_construction_management.doc_events.sales_order.get_initial_workflow_state",
			args: { doctype: doc.doctype },
		});
		const initial_workflow_state = wf_response && wf_response.message;
		if (initial_workflow_state) {
			doc.workflow_state = initial_workflow_state;
		}

		const $button = $modal.find("[data-save-sales-order]");
		$button.prop("disabled", true).text(__("Saving…"));
		try {
			let created;
			// An existing Draft Sales Order keeps its items and only the
			// enterable fields are updated, so it is re-read before saving.
			if (this.active_sales_order && this.active_sales_order.docstatus === 0) {
				const current = await frappe.call({
					method: "frappe.client.get",
					args: {
						doctype: "Sales Order",
						name: this.active_sales_order.name,
					},
				});
				const merged = Object.assign({}, current.message, {
					delivery_date,
					po_no: doc.po_no,
					advance_payment: doc.advance_payment,
					retention: doc.retention,
				});
				const updated = await frappe.call({
					method: "frappe.client.save",
					args: { doc: merged },
				});
				created = updated.message;
			} else {
				created = (
					await frappe.call({ method: "frappe.client.insert", args: { doc } })
				).message;
			}
			const item_count = created.items ? created.items.length : items.length;
			await this.after_sales_order_draft_saved(created, item_count);
			frappe.show_alert({
				message: __("Sales Order saved as Draft"),
				indicator: "blue",
			});
		} catch (error) {
			frappe.show_alert({
				message: __("Could not save the Sales Order"),
				indicator: "red",
			});
		} finally {
			$button.prop("disabled", false).text(__("Save"));
		}
		try {
			await this.view.refresh();
		} catch (error) {
			console.warn("Could not refresh register after saving Sales Order:", error);
		}
	}

	after_sales_order_draft_saved(created, item_count) {
		this.active_sales_order = created;
		const $modal = this.$root.find("#cc-sales-order-modal");
		this.set_state_card(
			$modal,
			"[data-so-contract-state]",
			"Construction Contract",
			this.active_contract.name
		);
		$modal.find("[data-so-boq-state]").text(__("{0} Items Loaded", [item_count]));
		this.set_state_card($modal, "[data-sales-order-state]", "Sales Order", created.name);
		$modal.find(".cc-state-strip > div").addClass("cc-saved");
		// Draft Sales Orders stay editable until they are sent for approval.
		$modal.find("input").prop("readonly", true);
		this.set_sales_order_editable(true);
		this.set_sales_order_save_state("editable");
	}

	set_sales_order_save_state(mode) {
		const $modal = this.$root.find("#cc-sales-order-modal");
		const editable_modes = ["draft", "editable"];
		$modal
			.find("[data-save-sales-order]")
			.toggleClass("hide", !editable_modes.includes(mode));
		$modal
			.find("[data-so-send-approval]")
			.toggleClass("hide", !["editable", "send"].includes(mode));
		$modal.find("[data-so-approve], [data-so-reject]").toggleClass("hide", mode !== "review");
		$modal.find("[data-so-break-irpo]").toggleClass("hide", mode !== "approved");
		const notes = {
			review: __("Pending approval. Approve or Reject to continue."),
			approved: __("Sales Order is approved. Break IRPO from here, or use Cancel → Amend on the Sales Order for changes."),
		};
		$modal
			.find("[data-so-footer-note]")
			.text(notes[mode] || __("Sales Order is saved as Draft, then sent for approval."));
	}

	async apply_sales_order_workflow(action) {
		if (!this.active_sales_order) return;
		const $modal = this.$root.find("#cc-sales-order-modal");
		const $action_buttons = $modal.find(
			"[data-so-send-approval], [data-so-approve], [data-so-reject]"
		);
		const outcome = {
			"Send for Approval": { editable: false, state: __("Pending Approval"), mode: "review", alert: __("Sent for Approval") },
			Approve: { editable: false, state: __("Approved"), mode: "approved", alert: __("Sales Order Approved") },
			Reject: { editable: true, state: __("Draft"), mode: "editable", alert: __("Sales Order Rejected") },
		}[action];
		if (!outcome) return;
		try {
			$action_buttons.prop("disabled", true);
			const r = await frappe.call({
				method:
					"cpc_construction_management.cpc_construction_management.doc_events.sales_order.apply_workflow_action",
				args: { name: this.active_sales_order.name, action },
			});
			this.active_sales_order = r.message;
			this.set_state_card(
				$modal,
				"[data-sales-order-state]",
				"Sales Order",
				this.active_sales_order.name
			);
			this.set_sales_order_editable(outcome.editable);
			this.set_sales_order_save_state(outcome.mode);
			frappe.show_alert({
				message: outcome.alert,
				indicator: action === "Approve" ? "green" : action === "Reject" ? "orange" : "blue",
			});
		} catch (error) {
			frappe.show_alert({
				message: __("Could not apply the workflow action"),
				indicator: "red",
			});
		} finally {
			$action_buttons.prop("disabled", false);
		}
		try {
			await this.view.refresh();
		} catch (error) {
			console.warn("Could not refresh register after workflow action:", error);
		}
	}

	show(id) {
		this.$root.find(`#${id}`).removeClass("hide").attr("aria-hidden", "false");
		document.body.classList.add("cc-modal-open");
	}

	close(id) {
		this.$root.find(`#${id}`).addClass("hide").attr("aria-hidden", "true");
		document.body.classList.remove("cc-modal-open");
	}
};