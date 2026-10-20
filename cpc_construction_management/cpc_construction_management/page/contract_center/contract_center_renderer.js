// Object.assign(cpc_construction_management.contract_center.View.prototype, {
// 	render_register() {
// 		const contracts = this.filtered_contracts();
// 		const total_pages = Math.max(1, Math.ceil(contracts.length / this.page_length));
// 		this.current_page = Math.min(this.current_page, total_pages);
// 		const start = (this.current_page - 1) * this.page_length;
// 		const visible_contracts = contracts.slice(start, start + this.page_length);
// 		this.$root
// 			.find("[data-result-count]")
// 			.text(this.result_label(start, visible_contracts.length, contracts.length));
// 		const empty = `<tr><td colspan="7"><div class="cc-empty">${__(
// 			"No contracts match these filters."
// 		)}</div></td></tr>`;
// 		this.$root
// 			.find("[data-contract-rows]")
// 			.html(
// 				visible_contracts.length
// 					? visible_contracts.map((contract) => this.contract_rows(contract)).join("")
// 					: empty
// 			);
// 		this.render_pagination(total_pages, contracts.length);
// 	},

// 	result_label(start, visible_count, total_count) {
// 		if (!total_count) return __("0 contracts");
// 		return __("{0}–{1} of {2} contracts", [start + 1, start + visible_count, total_count]);
// 	},

// 	render_pagination(total_pages, total_count) {
// 		const $pagination = this.$root.find("[data-pagination]");
// 		if (total_count <= this.page_length) {
// 			$pagination.empty().addClass("hide");
// 			return;
// 		}

// 		const pages = this.pagination_items(total_pages);
// 		const buttons = pages
// 			.map((page) => {
// 				if (page === "…") return '<span class="cc-page-gap">…</span>';
// 				const active = page === this.current_page ? " is-active" : "";
// 				return `<button class="cc-page-button${active}" data-action="paginate" data-page="${page}" aria-label="${__(
// 					"Page {0}",
// 					[page]
// 				)}" ${active ? 'aria-current="page"' : ""}>${page}</button>`;
// 			})
// 			.join("");
// 		$pagination
// 			.removeClass("hide")
// 			.html(
// 				`<span>${__("10 contracts per page")}</span><nav><button class="cc-page-button" data-action="paginate" data-page="${
// 					this.current_page - 1
// 				}" ${this.current_page === 1 ? "disabled" : ""}>${__(
// 					"Previous"
// 				)}</button>${buttons}<button class="cc-page-button" data-action="paginate" data-page="${
// 					this.current_page + 1
// 				}" ${this.current_page === total_pages ? "disabled" : ""}>${__("Next")}</button></nav>`
// 			);
// 	},

// 	pagination_items(total_pages) {
// 		if (total_pages <= 7) return Array.from({ length: total_pages }, (_, index) => index + 1);
// 		const pages = new Set([1, total_pages, this.current_page - 1, this.current_page, this.current_page + 1]);
// 		const ordered = [...pages].filter((page) => page > 0 && page <= total_pages).sort((a, b) => a - b);
// 		return ordered.flatMap((page, index) => (index && page - ordered[index - 1] > 1 ? ["…", page] : [page]));
// 	},

// 	filtered_contracts() {
// 		const value = (selector) => this.$root.find(`[data-filter='${selector}']`).val();
// 		const search = value("search").trim().toLowerCase();
// 		const customer = this.customer_control.get_value();
// 		return this.contracts.filter((contract) => {
// 			const text = [
// 				contract.name,
// 				contract.contract_title,
// 				contract.customer,
// 				contract.project,
// 			]
// 				.join(" ")
// 				.toLowerCase();
// 			const date = contract.contract_date || "";
// 			return (
// 				(!search || text.includes(search)) &&
// 				(!customer || contract.customer === customer) &&
// 				(!value("month") || date.startsWith(value("month"))) &&
// 				(!value("from") || date >= value("from")) &&
// 				(!value("to") || date <= value("to"))
// 			);
// 		});
// 	},

// 	contract_rows(contract) {
// 		const expanded = this.expanded.has(contract.name);
// 		const row = `<tr class="cc-contract-row${expanded ? " is-expanded" : ""}">
// 			<td><button class="cc-chevron" data-action="toggle-contract" data-name="${this.escape(
// 				contract.name
// 			)}" aria-label="${__("Toggle Sales Orders")}">${this.icon(
// 			"chevron"
// 		)}</button><span><strong>${this.escape(contract.name)}</strong><small>${this.escape(
// 			contract.contract_title
// 		)}</small></span></td>
// 			<td>${this.customer_link(contract.customer, contract.customer_name)}</td><td>${this.date(contract.contract_date)}</td>
// 			<td class="cc-number"><strong>${this.money(contract.base_value, contract.currency)}</strong></td>
// 			<td>${contract.project ? this.link_pill(contract.project, "open-project") : "—"}</td>
// 			<td>${this.count_pill(`${contract.sales_orders.length} SO`, "green")}${this.count_pill(
// 			`${contract.irpo_tasks.length} IRPO`,
// 			"blue"
// 		)}</td>
// 			<td class="cc-actions">${
// 				contract.docstatus === 0
// 					? `<button class="btn btn-xs btn-default" data-action="open-contract-dialog" data-name="${this.escape(
// 							contract.name
// 					  )}">${__("Open Contract")}</button>`
// 					: ""
// 			}<button class="btn btn-xs btn-default" data-action="open-contract" data-name="${this.escape(
// 				contract.name
// 			)}">${__(
// 			"Open"
// 		)}</button><button class="btn btn-xs btn-default" data-action="add-sales-order" data-name="${this.escape(
// 			contract.name
// 		)}">${__(
// 			"Add SO"
// 		)}</button><button class="btn btn-xs btn-default cc-planner-btn" data-action="open-planner" data-name="${this.escape(
// 			contract.name
// 		)}">${this.icon("chart")}${__("Planner")}</button></td>
// 		</tr>`;
// 		if (!expanded) return row;
// 		if (!contract.sales_orders.length)
// 			return `${row}<tr class="cc-child-row"><td colspan="7"><div class="cc-no-orders">${__(
// 				"No Sales Orders are linked to this contract yet."
// 			)}</div></td></tr>`;
// 		return (
// 			row +
// 			contract.sales_orders.map((order) => this.sales_order_row(order, contract)).join("")
// 		);
// 	},

// 	sales_order_row(order, contract) {
// 		const irpo_count = order.irpo_count || contract.irpo_tasks.length;
// 		const open_so_dialog_button =
// 			order.docstatus === 0
// 				? `<button class="btn btn-xs btn-default" data-action="open-sales-order-dialog" data-name="${this.escape(
// 						order.name
// 				  )}">${__("Open SO")}</button>`
// 				: "";
// 		const planner_button =
// 			order.docstatus === 1
// 				? `<button class="btn btn-xs btn-default cc-planner-btn" data-action="open-planner" data-name="${this.escape(
// 						contract.name
// 				  )}">${this.icon("chart")}${__("Planner")}</button>`
// 				: "";
// 		return `<tr class="cc-child-row"><td><span class="cc-child-indent"></span><span><strong>${this.escape(
// 			order.name
// 		)}</strong><small>${__("{0} BOQ lines, {1} IRPO tasks", [
// 			order.item_count,
// 			irpo_count,
// 		]		)}</small></span></td><td>${this.customer_link(
// 			order.customer || contract.customer,
// 			order.customer_name || contract.customer_name
// 		)}</td><td>${__("Delivery {0}", [
// 			this.date(order.delivery_date),
// 		])}</td><td class="cc-number"><strong>${this.money(
// 			order.grand_total,
// 			order.currency
// 		)}</strong></td><td>${
// 			order.project ? this.link_pill(order.project, "open-project") : "—"
// 		}</td><td>${this.status_pill(order)}${this.count_pill(
// 			`${irpo_count} IRPO`,
// 			"blue"
// 		)}</td><td class="cc-actions">${open_so_dialog_button}<button class="btn btn-xs btn-default" data-action="open-sales-order" data-name="${this.escape(
// 			order.name
// 		)}">${__(
// 			"Open"
// 		)}</button>${planner_button}</td></tr>`;
// 	},

// 	link_pill(value, action) {
// 		return `<button class="cc-pill cc-pill-blue" data-action="${action}" data-name="${this.escape(
// 			value
// 		)}">${this.escape(value)}</button>`;
// 	},

// 	customer_link(customer, customer_name) {
// 		if (!customer) return "—";
// 		return `<button class="cc-text-link" data-action="open-customer" data-name="${this.escape(
// 			customer
// 		)}">${this.escape(customer_name || customer)}</button>`;
// 	},

// 	count_pill(value, tone) {
// 		return `<span class="cc-pill cc-pill-${tone}">${this.escape(value)}</span>`;
// 	},

// 	status_pill(order) {
// 		const approved = order.docstatus === 1;
// 		return `<span class="cc-pill cc-pill-${approved ? "green" : "gray"}">${
// 			approved ? __("Approved") : __("Draft")
// 		}</span>`;
// 	},

// 	icon(name) {
// 		if (name === "chart")
// 			return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13V8m5 5V3m5 10V6"/></svg>';
// 		return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg>';
// 	},

// 	money(value, currency = "SAR") {
// 		return format_currency(flt(value), currency || "SAR");
// 	},

// 	date(value) {
// 		return value ? frappe.datetime.str_to_user(value) : "—";
// 	},

// 	escape(value) {
// 		return frappe.utils.escape_html(String(value || ""));
// 	},

// 	render_loading() {
// 		this.$root
// 			.find("[data-contract-rows]")
// 			.html(
// 				`<tr><td colspan="7"><div class="cc-loading">${__(
// 					"Loading contracts…"
// 				)}</div></td></tr>`
// 			);
// 	},

// 	render_error() {
// 		this.$root
// 			.find("[data-contract-rows]")
// 			.html(
// 				`<tr><td colspan="7"><div class="cc-empty">${__(
// 					"Contracts could not be loaded. Check your permissions, then refresh."
// 				)}</div></td></tr>`
// 			);
// 	},
// });

















Object.assign(cpc_construction_management.contract_center.View.prototype, {
	render_register() {
		const contracts = this.filtered_contracts();
		const total_pages = Math.max(1, Math.ceil(contracts.length / this.page_length));
		this.current_page = Math.min(this.current_page, total_pages);
		const start = (this.current_page - 1) * this.page_length;
		const visible_contracts = contracts.slice(start, start + this.page_length);
		this.$root
			.find("[data-result-count]")
			.text(this.result_label(start, visible_contracts.length, contracts.length));
		const empty = `<tr><td colspan="7"><div class="cc-empty">${__(
			"No contracts match these filters."
		)}</div></td></tr>`;
		this.$root
			.find("[data-contract-rows]")
			.html(
				visible_contracts.length
					? visible_contracts.map((contract) => this.contract_rows(contract)).join("")
					: empty
			);
		this.render_pagination(total_pages, contracts.length);
	},

	result_label(start, visible_count, total_count) {
		if (!total_count) return __("0 contracts");
		return __("{0}–{1} of {2} contracts", [start + 1, start + visible_count, total_count]);
	},

	render_pagination(total_pages, total_count) {
		const $pagination = this.$root.find("[data-pagination]");
		if (total_count <= this.page_length) {
			$pagination.empty().addClass("hide");
			return;
		}

		const pages = this.pagination_items(total_pages);
		const buttons = pages
			.map((page) => {
				if (page === "…") return '<span class="cc-page-gap">…</span>';
				const active = page === this.current_page ? " is-active" : "";
				return `<button class="cc-page-button${active}" data-action="paginate" data-page="${page}" aria-label="${__(
					"Page {0}",
					[page]
				)}" ${active ? 'aria-current="page"' : ""}>${page}</button>`;
			})
			.join("");
		$pagination
			.removeClass("hide")
			.html(
				`<span>${__("10 contracts per page")}</span><nav><button class="cc-page-button" data-action="paginate" data-page="${
					this.current_page - 1
				}" ${this.current_page === 1 ? "disabled" : ""}>${__(
					"Previous"
				)}</button>${buttons}<button class="cc-page-button" data-action="paginate" data-page="${
					this.current_page + 1
				}" ${this.current_page === total_pages ? "disabled" : ""}>${__("Next")}</button></nav>`
			);
	},

	pagination_items(total_pages) {
		if (total_pages <= 7) return Array.from({ length: total_pages }, (_, index) => index + 1);
		const pages = new Set([1, total_pages, this.current_page - 1, this.current_page, this.current_page + 1]);
		const ordered = [...pages].filter((page) => page > 0 && page <= total_pages).sort((a, b) => a - b);
		return ordered.flatMap((page, index) => (index && page - ordered[index - 1] > 1 ? ["…", page] : [page]));
	},

	filtered_contracts() {
		const value = (selector) => this.$root.find(`[data-filter='${selector}']`).val();
		const search = value("search").trim().toLowerCase();
		const customer = this.customer_control.get_value();
		return this.contracts.filter((contract) => {
			const text = [
				contract.name,
				contract.contract_title,
				contract.customer,
				contract.project,
			]
				.join(" ")
				.toLowerCase();
			const date = contract.contract_date || "";
			return (
				(!search || text.includes(search)) &&
				(!customer || contract.customer === customer) &&
				(!value("month") || date.startsWith(value("month"))) &&
				(!value("from") || date >= value("from")) &&
				(!value("to") || date <= value("to"))
			);
		});
	},

	contract_rows(contract) {
		const expanded = this.expanded.has(contract.name);
		const row = `<tr class="cc-contract-row${expanded ? " is-expanded" : ""}">
			<td><button class="cc-chevron" data-action="toggle-contract" data-name="${this.escape(
				contract.name
			)}" aria-label="${__("Toggle Sales Orders")}">${this.icon(
			"chevron"
		)}</button><span><strong>${this.escape(contract.name)}</strong><small>${this.escape(
			contract.contract_title
		)}</small></span></td>
			<td>${this.customer_link(contract.customer, contract.customer_name)}</td><td>${this.date(contract.contract_date)}</td>
			<td class="cc-number"><strong>${this.money(contract.base_value, contract.currency)}</strong></td>
			<td>${contract.project ? this.link_pill(contract.project, "open-project") : "—"}</td>
			<td>${this.count_pill(`${contract.sales_orders.length} SO`, "green")}${this.count_pill(
			`${contract.irpo_tasks.length} IRPO`,
			"blue"
		)}</td>
			<td class="cc-actions">${
				contract.docstatus === 0
					? `<button class="btn btn-xs btn-default" data-action="open-contract-dialog" data-name="${this.escape(
							contract.name
					  )}">${__("Open Contract")}</button>`
					: ""
			}<button class="btn btn-xs btn-default" data-action="open-contract" data-name="${this.escape(
				contract.name
			)}">${__(
			"Open"
		)}</button><button class="btn btn-xs btn-default${
			contract.docstatus === 1 ? "" : " is-disabled"
		}" data-action="add-sales-order" data-name="${this.escape(contract.name)}" ${
			contract.docstatus === 1
				? ""
				: `aria-disabled="true" title="${__(
						"Submit the Construction Contract first. Project and BOQ Item Codes are created on submission."
				  )}"`
		}>${__(
			"Add SO"
		)}</button><button class="btn btn-xs btn-default cc-planner-btn" data-action="open-planner" data-name="${this.escape(
			contract.name
		)}">${this.icon("chart")}${__("Planner")}</button></td>
		</tr>`;
		if (!expanded) return row;
		if (!contract.sales_orders.length)
			return `${row}<tr class="cc-child-row"><td colspan="7"><div class="cc-no-orders">${__(
				"No Sales Orders are linked to this contract yet."
			)}</div></td></tr>`;
		return (
			row +
			contract.sales_orders.map((order) => this.sales_order_row(order, contract)).join("")
		);
	},

	sales_order_row(order, contract) {
		const irpo_count = order.irpo_count || contract.irpo_tasks.length;
		const open_so_dialog_button =
			order.docstatus === 0
				? `<button class="btn btn-xs btn-default" data-action="open-sales-order-dialog" data-name="${this.escape(
						order.name
				  )}">${__("Open SO")}</button>`
				: "";
		const planner_button =
			order.docstatus === 1
				? `<button class="btn btn-xs btn-default cc-planner-btn" data-action="open-planner" data-name="${this.escape(
						contract.name
				  )}">${this.icon("chart")}${__("Planner")}</button>`
				: "";
		return `<tr class="cc-child-row"><td><span class="cc-child-indent"></span><span><strong>${this.escape(
			order.name
		)}</strong><small>${__("{0} BOQ lines, {1} IRPO tasks", [
			order.item_count,
			irpo_count,
		]		)}</small></span></td><td>${this.customer_link(
			order.customer || contract.customer,
			order.customer_name || contract.customer_name
		)}</td><td>${__("Delivery {0}", [
			this.date(order.delivery_date),
		])}</td><td class="cc-number"><strong>${this.money(
			order.grand_total,
			order.currency
		)}</strong></td><td>${
			order.project ? this.link_pill(order.project, "open-project") : "—"
		}</td><td>${this.status_pill(order)}${this.count_pill(
			`${irpo_count} IRPO`,
			"blue"
		)}</td><td class="cc-actions">${open_so_dialog_button}<button class="btn btn-xs btn-default" data-action="open-sales-order" data-name="${this.escape(
			order.name
		)}">${__(
			"Open"
		)}</button>${planner_button}</td></tr>`;
	},

	link_pill(value, action) {
		return `<button class="cc-pill cc-pill-blue" data-action="${action}" data-name="${this.escape(
			value
		)}">${this.escape(value)}</button>`;
	},

	customer_link(customer, customer_name) {
		if (!customer) return "—";
		return `<button class="cc-text-link" data-action="open-customer" data-name="${this.escape(
			customer
		)}">${this.escape(customer_name || customer)}</button>`;
	},

	count_pill(value, tone) {
		return `<span class="cc-pill cc-pill-${tone}">${this.escape(value)}</span>`;
	},

	status_pill(order) {
		const approved = order.docstatus === 1;
		return `<span class="cc-pill cc-pill-${approved ? "green" : "gray"}">${
			approved ? __("Approved") : __("Draft")
		}</span>`;
	},

	icon(name) {
		if (name === "chart")
			return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13V8m5 5V3m5 10V6"/></svg>';
		return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg>';
	},

	money(value, currency = "SAR") {
		return format_currency(flt(value), currency || "SAR");
	},

	date(value) {
		return value ? frappe.datetime.str_to_user(value) : "—";
	},

	escape(value) {
		return frappe.utils.escape_html(String(value || ""));
	},

	render_loading() {
		this.$root
			.find("[data-contract-rows]")
			.html(
				`<tr><td colspan="7"><div class="cc-loading">${__(
					"Loading contracts…"
				)}</div></td></tr>`
			);
	},

	render_error() {
		this.$root
			.find("[data-contract-rows]")
			.html(
				`<tr><td colspan="7"><div class="cc-empty">${__(
					"Contracts could not be loaded. Check your permissions, then refresh."
				)}</div></td></tr>`
			);
	},
});