// cpc_construction_management.contract_center.View = class ContractCenterView {
// 	constructor(page) {
// 		this.page = page;
// 		this.$root = page.main.find(".cpc-control-center");
// 		this.contracts = [];
// 		this.sales_orders = [];
// 		this.irpo_tasks = [];
// 		this.sales_order_items = [];
// 		this.expanded = new Set();
// 		this.selected_name = null;
// 		this.page_length = 10;
// 		this.current_page = 1;
// 		this.dialogs = new cpc_construction_management.contract_center.Dialogs(this);
// 		this.planner = new cpc_construction_management.contract_center.Planner(this);
// 		this.irpo_viewer = new cpc_construction_management.contract_center.IRPOViewer(this);
// 		this.mr_dialog = new cpc_construction_management.contract_center.MRDialog(this);
// 		this.setup_customer_filter();
// 		this.bind_events();
// 	}

// 	async refresh() {
// 		this.render_loading();
// 		try {
// 			[this.contracts, this.sales_orders, this.irpo_tasks] = await Promise.all([
// 				this.get_contracts(),
// 				this.get_sales_orders(),
// 				this.get_irpo_tasks(),
// 			]);
// 			this.sales_order_items = await this.get_sales_order_items();
// 			await this.attach_customer_names();
// 			this.build_relationships();
// 			this.selected_name = this.find_selected_name();
// 			if (!this.expanded.size && this.selected_name) this.expanded.add(this.selected_name);
// 			this.render_register();
// 		} catch (error) {
// 			this.render_error();
// 			console.error("Unable to load Construction Control Center", error);
// 		}
// 	}

// 	get_contracts() {
// 		return frappe.db.get_list("Construction Contract", {
// 			fields: [
// 				"name",
// 				"contract_title",
// 				"customer",
// 				"contract_date",
// 				"end_date",
// 				"base_value",
// 				"project",
// 				"currency",
// 				"docstatus",
// 			],
// 			order_by: "contract_date desc, modified desc",
// 			limit: 500,
// 		});
// 	}

// 	// Construction Contract stores only the Customer link; resolve the display
// 	// name (Customer.customer_name) in bulk for the register's Customer column.
// 	attach_customer_names() {
// 		const ids = [
// 			...new Set(
// 				[...this.contracts, ...this.sales_orders]
// 					.map((row) => row.customer)
// 					.filter(Boolean)
// 			),
// 		];
// 		if (!ids.length) return Promise.resolve();
// 		return frappe.db
// 			.get_list("Customer", {
// 				fields: ["name", "customer_name"],
// 				filters: { name: ["in", ids] },
// 				limit: 0,
// 			})
// 			.then((rows) => {
// 				const names = {};
// 				rows.forEach((r) => {
// 					names[r.name] = r.customer_name || r.name;
// 				});
// 				[...this.contracts, ...this.sales_orders].forEach((row) => {
// 					row.customer_name = names[row.customer] || row.customer;
// 				});
// 			})
// 			.catch(() => {
// 				/* fall back to Customer IDs if names can't be read */
// 			});
// 	}

// 	get_sales_orders() {
// 		return frappe.db.get_list("Sales Order", {
// 			fields: [
// 				"name",
// 				"cpc_contract",
// 				"customer",
// 				"project",
// 				"delivery_date",
// 				"grand_total",
// 				"currency",
// 				"status",
// 				"docstatus",
// 			],
// 			filters: [["cpc_contract", "is", "set"]],
// 			order_by: "modified desc",
// 			limit: 2000,
// 		});
// 	}

// 	get_irpo_tasks() {
// 		return frappe.db.get_list("Task", {
// 			fields: ["name", "cpc_contract", "cpc_sales_order", "status"],
// 			filters: { cpc_is_irpo: 1 },
// 			limit: 5000,
// 		});
// 	}

// 	get_sales_order_items() {
// 		const names = this.sales_orders.map((order) => order.name);
// 		if (!names.length) return Promise.resolve([]);
// 		return frappe
// 			.call({
// 				method: "frappe.client.get_list",
// 				args: {
// 					doctype: "Sales Order Item",
// 					fields: ["name", "parent"],
// 					filters: { parent: ["in", names] },
// 					limit_page_length: 10000,
// 					parent: "Sales Order",
// 				},
// 			})
// 			.then((r) => r.message);
// 	}

// 	build_relationships() {
// 		const orders = this.group_by(this.sales_orders, "cpc_contract");
// 		const tasks = this.group_by(this.irpo_tasks, "cpc_contract");
// 		const items = this.group_by(this.sales_order_items, "parent");
// 		this.sales_orders.forEach((order) => {
// 			order.item_count = (items.get(order.name) || []).length;
// 			order.irpo_count = this.irpo_tasks.filter(
// 				(task) => task.cpc_sales_order === order.name
// 			).length;
// 		});
// 		this.contracts = this.contracts.map((contract) => ({
// 			...contract,
// 			sales_orders: orders.get(contract.name) || [],
// 			irpo_tasks: tasks.get(contract.name) || [],
// 		}));
// 	}

// 	group_by(rows, key) {
// 		return rows.reduce((groups, row) => {
// 			if (!row[key]) return groups;
// 			const values = groups.get(row[key]) || [];
// 			values.push(row);
// 			groups.set(row[key], values);
// 			return groups;
// 		}, new Map());
// 	}

// 	bind_events() {
// 		this.$root.on("input change", ".cc-filter", () => this.apply_filters());
// 		this.$root.on("click", "[data-action]", (event) => this.handle_action(event));
// 		this.$root.on("click", ".cc-tweak-trigger", () => this.$root.toggleClass("cc-tweak-open"));
// 		this.$root.on("click", "[data-density]", (event) =>
// 			this.set_density($(event.currentTarget))
// 		);
// 	}

// 	set_density($button) {
// 		const compact = $button.data("density") === "compact";
// 		this.$root.toggleClass("cc-compact", compact);
// 		this.$root.find("[data-density]").removeClass("is-active");
// 		$button.addClass("is-active");
// 	}

// 	handle_action(event) {
// 		event.stopPropagation();
// 		const $target = $(event.currentTarget);
// 		const action = $target.data("action");
// 		const name = $target.data("name");
// 		if (action === "clear-filters") this.clear_filters();
// 		if (action === "toggle-contract") this.toggle_contract(name);
// 		if (action === "open-contract") this.open_document("Construction Contract", name);
// 		if (action === "open-project") this.open_document("Project", name);
// 		if (action === "open-customer") frappe.set_route("Form", "Customer", name);
// 		if (action === "open-sales-order") {
// 			this.dialogs.close("cc-sales-order-modal");
// 			frappe.set_route("Form", "Sales Order", name);
// 		}
// 		if (action === "open-sales-order-dialog") this.open_sales_order_dialog_for(name);
// 		if (action === "open-contract-dialog") this.open_contract_dialog_for(name);
// 		if (action === "add-contract") this.dialogs.open_contract();
// 		if (action === "add-sales-order") this.open_sales_order_dialog(name);
// 		if (action === "open-planner") this.open_planner(name);
// 		if (action === "paginate") this.go_to_page(Number($target.data("page")));
// 	}

// 	setup_customer_filter() {
// 		this.customer_control = frappe.ui.form.make_control({
// 			parent: this.$root.find("[data-customer-filter]"),
// 			df: {
// 				fieldname: "customer",
// 				fieldtype: "Link",
// 				options: "Customer",
// 				placeholder: __("All Customers"),
// 				change: () => this.apply_filters(),
// 			},
// 			render_input: true,
// 		});
// 	}

// 	apply_filters() {
// 		this.current_page = 1;
// 		this.render_register();
// 	}

// 	go_to_page(page_number) {
// 		if (!page_number || page_number === this.current_page) return;
// 		this.current_page = page_number;
// 		this.render_register();
// 		this.$root.find(".cc-register")[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
// 	}

// 	toggle_contract(name) {
// 		const is_expanded = this.expanded.has(name);
// 		this.expanded.clear();
// 		if (!is_expanded) this.expanded.add(name);
// 		this.selected_name = name;
// 		this.render_register();
// 	}

// 	open_sales_order_dialog(name) {
// 		const contract =
// 			this.contracts.find((row) => row.name === name) || this.get_selected_contract();
// 		if (!contract)
// 			return frappe.show_alert({
// 				message: __("Select a contract first"),
// 				indicator: "orange",
// 			});
// 		this.selected_name = contract.name;
// 		this.dialogs.open_sales_order(contract);
// 	}

// 	async open_sales_order_dialog_for(so_name) {
// 		const order = await frappe.db.get_doc("Sales Order", so_name);
// 		const contract =
// 			this.contracts.find((row) => row.name === order.cpc_contract) || this.get_selected_contract();
// 		if (!contract)
// 			return frappe.show_alert({
// 				message: __("Contract not found for this Sales Order"),
// 				indicator: "orange",
// 			});
// 		this.selected_name = contract.name;
// 		await this.dialogs.open_existing_sales_order(contract, order);
// 	}

// 	// "Open Contract" on the register: a Draft Construction Contract is loaded
// 	// into the contract dialog so it can be edited, saved and submitted.
// 	async open_contract_dialog_for(contract_name) {
// 		const doc = await frappe.db.get_doc("Construction Contract", contract_name);
// 		this.selected_name = contract_name;
// 		await this.dialogs.open_existing_contract(doc);
// 	}

// 	open_planner(contract_name, sales_order_name = null) {
// 		const target_contract = contract_name || this.selected_name;
// 		if (!target_contract) {
// 			return frappe.show_alert({
// 				message: __("Select a contract first"),
// 				indicator: "orange",
// 			});
// 		}
// 		this.planner.open(target_contract, sales_order_name);
// 	}

// 	clear_filters() {
// 		this.$root.find(".cc-filter").val("");
// 		this.customer_control.set_value("");
// 		this.apply_filters();
// 	}

// 	get_selected_contract() {
// 		return this.contracts.find((row) => row.name === this.selected_name) || this.contracts[0];
// 	}

// 	// The Construction Contract / Project / Sales Order ID buttons on the
// 	// dialogs' state-strip cards use the same data-action as the register's Open
// 	// buttons. Any open modal has to be closed first so its body scroll-lock
// 	// does not stick to the form.
// 	open_document(doctype, name) {
// 		this.dialogs.close("cc-contract-modal");
// 		this.dialogs.close("cc-sales-order-modal");
// 		frappe.set_route("Form", doctype, name);
// 	}

// 	find_selected_name() {
// 		return this.contracts.some((row) => row.name === this.selected_name)
// 			? this.selected_name
// 			: this.contracts[0]?.name;
// 	}
// };












cpc_construction_management.contract_center.View = class ContractCenterView {
	constructor(page) {
		this.page = page;
		this.$root = page.main.find(".cpc-control-center");
		this.contracts = [];
		this.sales_orders = [];
		this.irpo_tasks = [];
		this.sales_order_items = [];
		this.expanded = new Set();
		this.selected_name = null;
		this.page_length = 10;
		this.current_page = 1;
		this.dialogs = new cpc_construction_management.contract_center.Dialogs(this);
		this.planner = new cpc_construction_management.contract_center.Planner(this);
		this.irpo_viewer = new cpc_construction_management.contract_center.IRPOViewer(this);
		this.mr_dialog = new cpc_construction_management.contract_center.MRDialog(this);
		this.setup_customer_filter();
		this.bind_events();
	}

	async refresh() {
		this.render_loading();
		try {
			[this.contracts, this.sales_orders, this.irpo_tasks] = await Promise.all([
				this.get_contracts(),
				this.get_sales_orders(),
				this.get_irpo_tasks(),
			]);
			this.sales_order_items = await this.get_sales_order_items();
			await this.attach_customer_names();
			this.build_relationships();
			this.selected_name = this.find_selected_name();
			if (!this.expanded.size && this.selected_name) this.expanded.add(this.selected_name);
			this.render_register();
		} catch (error) {
			this.render_error();
			console.error("Unable to load Construction Control Center", error);
		}
	}

	get_contracts() {
		return frappe.db.get_list("Construction Contract", {
			fields: [
				"name",
				"contract_title",
				"customer",
				"contract_date",
				"end_date",
				"base_value",
				"project",
				"currency",
				"docstatus",
			],
			order_by: "contract_date desc, modified desc",
			limit: 500,
		});
	}

	// Construction Contract stores only the Customer link; resolve the display
	// name (Customer.customer_name) in bulk for the register's Customer column.
	attach_customer_names() {
		const ids = [
			...new Set(
				[...this.contracts, ...this.sales_orders]
					.map((row) => row.customer)
					.filter(Boolean)
			),
		];
		if (!ids.length) return Promise.resolve();
		return frappe.db
			.get_list("Customer", {
				fields: ["name", "customer_name"],
				filters: { name: ["in", ids] },
				limit: 0,
			})
			.then((rows) => {
				const names = {};
				rows.forEach((r) => {
					names[r.name] = r.customer_name || r.name;
				});
				[...this.contracts, ...this.sales_orders].forEach((row) => {
					row.customer_name = names[row.customer] || row.customer;
				});
			})
			.catch(() => {
				/* fall back to Customer IDs if names can't be read */
			});
	}

	get_sales_orders() {
		return frappe.db.get_list("Sales Order", {
			fields: [
				"name",
				"cpc_contract",
				"customer",
				"project",
				"delivery_date",
				"grand_total",
				"currency",
				"status",
				"docstatus",
			],
			filters: [["cpc_contract", "is", "set"]],
			order_by: "modified desc",
			limit: 2000,
		});
	}

	get_irpo_tasks() {
		return frappe.db.get_list("Task", {
			fields: ["name", "cpc_contract", "cpc_sales_order", "status"],
			filters: { cpc_is_irpo: 1 },
			limit: 5000,
		});
	}

	get_sales_order_items() {
		const names = this.sales_orders.map((order) => order.name);
		if (!names.length) return Promise.resolve([]);
		return frappe
			.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Sales Order Item",
					fields: ["name", "parent"],
					filters: { parent: ["in", names] },
					limit_page_length: 10000,
					parent: "Sales Order",
				},
			})
			.then((r) => r.message);
	}

	build_relationships() {
		const orders = this.group_by(this.sales_orders, "cpc_contract");
		const tasks = this.group_by(this.irpo_tasks, "cpc_contract");
		const items = this.group_by(this.sales_order_items, "parent");
		this.sales_orders.forEach((order) => {
			order.item_count = (items.get(order.name) || []).length;
			order.irpo_count = this.irpo_tasks.filter(
				(task) => task.cpc_sales_order === order.name
			).length;
		});
		this.contracts = this.contracts.map((contract) => ({
			...contract,
			sales_orders: orders.get(contract.name) || [],
			irpo_tasks: tasks.get(contract.name) || [],
		}));
	}

	group_by(rows, key) {
		return rows.reduce((groups, row) => {
			if (!row[key]) return groups;
			const values = groups.get(row[key]) || [];
			values.push(row);
			groups.set(row[key], values);
			return groups;
		}, new Map());
	}

	bind_events() {
		this.$root.on("input change", ".cc-filter", () => this.apply_filters());
		this.$root.on("click", "[data-action]", (event) => this.handle_action(event));
		this.$root.on("click", ".cc-tweak-trigger", () => this.$root.toggleClass("cc-tweak-open"));
		this.$root.on("click", "[data-density]", (event) =>
			this.set_density($(event.currentTarget))
		);
	}

	set_density($button) {
		const compact = $button.data("density") === "compact";
		this.$root.toggleClass("cc-compact", compact);
		this.$root.find("[data-density]").removeClass("is-active");
		$button.addClass("is-active");
	}

	handle_action(event) {
		event.stopPropagation();
		const $target = $(event.currentTarget);
		const action = $target.data("action");
		const name = $target.data("name");
		if (action === "clear-filters") this.clear_filters();
		if (action === "toggle-contract") this.toggle_contract(name);
		if (action === "open-contract") this.open_document("Construction Contract", name);
		if (action === "open-project") this.open_document("Project", name);
		if (action === "open-customer") frappe.set_route("Form", "Customer", name);
		if (action === "open-sales-order") {
			this.dialogs.close("cc-sales-order-modal");
			frappe.set_route("Form", "Sales Order", name);
		}
		if (action === "open-sales-order-dialog") this.open_sales_order_dialog_for(name);
		if (action === "open-contract-dialog") this.open_contract_dialog_for(name);
		if (action === "add-contract") this.dialogs.open_contract();
		if (action === "add-sales-order") this.open_sales_order_dialog(name);
		if (action === "open-planner") this.open_planner(name);
		if (action === "paginate") this.go_to_page(Number($target.data("page")));
	}

	setup_customer_filter() {
		this.customer_control = frappe.ui.form.make_control({
			parent: this.$root.find("[data-customer-filter]"),
			df: {
				fieldname: "customer",
				fieldtype: "Link",
				options: "Customer",
				placeholder: __("All Customers"),
				change: () => this.apply_filters(),
			},
			render_input: true,
		});
	}

	apply_filters() {
		this.current_page = 1;
		this.render_register();
	}

	go_to_page(page_number) {
		if (!page_number || page_number === this.current_page) return;
		this.current_page = page_number;
		this.render_register();
		this.$root.find(".cc-register")[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	toggle_contract(name) {
		const is_expanded = this.expanded.has(name);
		this.expanded.clear();
		if (!is_expanded) this.expanded.add(name);
		this.selected_name = name;
		this.render_register();
	}

	open_sales_order_dialog(name) {
		const contract =
			this.contracts.find((row) => row.name === name) || this.get_selected_contract();
		if (!contract)
			return frappe.show_alert({
				message: __("Select a contract first"),
				indicator: "orange",
			});
		if (contract.docstatus !== 1)
			return frappe.msgprint({
				title: __("Contract Not Submitted"),
				indicator: "orange",
				message: __(
					"Please submit the Construction Contract first. Project and BOQ Item Codes are created on submission."
				),
			});
		this.selected_name = contract.name;
		this.dialogs.open_sales_order(contract);
	}

	async open_sales_order_dialog_for(so_name) {
		const order = await frappe.db.get_doc("Sales Order", so_name);
		const contract =
			this.contracts.find((row) => row.name === order.cpc_contract) || this.get_selected_contract();
		if (!contract)
			return frappe.show_alert({
				message: __("Contract not found for this Sales Order"),
				indicator: "orange",
			});
		this.selected_name = contract.name;
		await this.dialogs.open_existing_sales_order(contract, order);
	}

	// "Open Contract" on the register: a Draft Construction Contract is loaded
	// into the contract dialog so it can be edited, saved and submitted.
	async open_contract_dialog_for(contract_name) {
		const doc = await frappe.db.get_doc("Construction Contract", contract_name);
		this.selected_name = contract_name;
		await this.dialogs.open_existing_contract(doc);
	}

	open_planner(contract_name, sales_order_name = null) {
		const target_contract = contract_name || this.selected_name;
		if (!target_contract) {
			return frappe.show_alert({
				message: __("Select a contract first"),
				indicator: "orange",
			});
		}
		this.planner.open(target_contract, sales_order_name);
	}

	clear_filters() {
		this.$root.find(".cc-filter").val("");
		this.customer_control.set_value("");
		this.apply_filters();
	}

	get_selected_contract() {
		return this.contracts.find((row) => row.name === this.selected_name) || this.contracts[0];
	}

	// The Construction Contract / Project / Sales Order ID buttons on the
	// dialogs' state-strip cards use the same data-action as the register's Open
	// buttons. Any open modal has to be closed first so its body scroll-lock
	// does not stick to the form.
	open_document(doctype, name) {
		this.dialogs.close("cc-contract-modal");
		this.dialogs.close("cc-sales-order-modal");
		frappe.set_route("Form", doctype, name);
	}

	find_selected_name() {
		return this.contracts.some((row) => row.name === this.selected_name)
			? this.selected_name
			: this.contracts[0]?.name;
	}
};