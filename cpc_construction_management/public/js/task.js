// frappe.provide("frappe.treeview_settings");

// frappe.treeview_settings["Task"] = {
// 	get_tree_nodes: "cpc_construction_management.cpc_construction_management.doc_events.task_tree.get_children",
// 	add_tree_node: "erpnext.projects.doctype.task.task.add_node",

// 	filters: [
// 		{
// 			fieldname: "project",
// 			fieldtype: "Link",
// 			options: "Project",
// 			label: __("Project"),
// 		},
// 		{
// 			fieldname: "task",
// 			fieldtype: "Link",
// 			options: "Task",
// 			label: __("Task"),
// 			get_query: function () {
// 				var me = frappe.treeview_settings["Task"];
// 				var project = me.page.fields_dict.project.get_value();
// 				var args = [["Task", "is_group", "=", 1]];
// 				if (project) {
// 					args.push(["Task", "project", "=", project]);
// 				}
// 				return { filters: args };
// 			},
// 		},
// 	],

// 	breadcrumb: "Projects",
// 	get_tree_root: false,
// 	root_label: "All Tasks",
// 	ignore_fields: ["parent_task"],

// 	columns: [
// 		{ key: "cpc_uom", label: "UOM", width: 90 },
// 		{ key: "cpc_budget_qty", label: "Qty", width: 70 },
// 		{ key: "cpc_budget_amount", label: "Amount", width: 110 },
// 		{ key: "exp_start_date", label: "Start", width: 100 },
// 		{ key: "exp_end_date", label: "End", width: 100 },
// 		{ key: "progress", label: "Progress", width: 80 },
// 	],

// 	onload: function (me) {
// 		frappe.treeview_settings["Task"].page = {};
// 		$.extend(frappe.treeview_settings["Task"].page, me.page);
// 		me.make_tree();
// 		frappe.treeview_settings["Task"].inject_styles();
// 		frappe.treeview_settings["Task"].add_header_row(me);
// 	},

// 	inject_styles: function () {
// 		if (document.getElementById("cpc-task-tree-style")) return;

// 		const cols = frappe.treeview_settings["Task"].columns;
// 		let total_width = 0;
// 		const rules = cols
// 			.map((c, i) => {
// 				const rule = `.cpc-col-${i} { right: ${total_width}px; width: ${c.width}px; }`;
// 				total_width += c.width;
// 				return rule;
// 			})
// 			.join("\n");

// 		const style = document.createElement("style");
// 		style.id = "cpc-task-tree-style";
// 		style.innerHTML = `
// 			.tree-node { position: relative; }
// 			.tree-node .tree-link {
// 				display: block;
// 				position: relative;
// 				padding-right: ${total_width + 20}px !important;
// 			}
// 			.cpc-task-info {
// 				position: absolute;
// 				top: 0;
// 				right: 20px;
// 				height: 30px; /* fixed to one row's height so hover/toolbar wrap can't push this down */
// 				pointer-events: none;
// 				overflow: visible;
// 			}
// 			.tree-node:hover .tree-link,
// 			.tree-node .tree-link:hover {
// 				overflow: visible;
// 			}
// 			.cpc-tree-column {
// 				position: absolute;
// 				top: 50%;
// 				transform: translateY(-50%);
// 				display: flex;
// 				flex-direction: column;
// 				line-height: 1.2;
// 				text-align: right;
// 				white-space: nowrap;
// 			}
// 			${rules}
// 			.cpc-col-label {
// 				font-size: 10px;
// 				color: var(--text-light);
// 				text-transform: uppercase;
// 			}
// 			.cpc-col-value {
// 				font-size: 12px;
// 				font-weight: 500;
// 				color: var(--text-color);
// 			}

// 			.cpc-task-info.cpc-header-row {
// 				position: sticky;
// 				top: 0;
// 				right: 0;
// 				left: 0;
// 				transform: none;
// 				display: block;
// 				background: var(--fg-color);
// 				z-index: 10;
// 				padding: 10px 20px;
// 				border-bottom: 1px solid var(--border-color);
// 				margin-bottom: 4px;
// 				pointer-events: auto;
// 			}
// 			.cpc-header-row .cpc-tree-column {
// 				position: absolute;
// 				top: 50%;
// 				transform: translateY(-50%);
// 			}
// 			.cpc-header-row .cpc-col-label {
// 				font-size: 11px;
// 				font-weight: 600;
// 				color: var(--text-color);
// 			}
// 			.cpc-header-row .cpc-col-value { display: none; }
// 		`;
// 		document.head.appendChild(style);
// 	},

// 	add_header_row: function (me) {
// 		if (me.page.main.hasClass("cpc-header-added")) return;
// 		me.page.main.addClass("cpc-header-added");

// 		const cols = frappe.treeview_settings["Task"].columns;
// 		const header_cols = cols
// 			.map(
// 				(c, i) => `
// 				<span class="cpc-tree-column cpc-col-${i}">
// 					<span class="cpc-col-label">${c.label}</span>
// 				</span>
// 			`
// 			)
// 			.join("");

// 		me.page.main.prepend(
// 			`<div class="cpc-task-info cpc-header-row">${header_cols}</div>`
// 		);
// 	},

// 	onrender: function (node) {
// 		if (!node.data) return;
// 		if (!node.$tree_link || !node.$tree_link.length) return;

// 		const cols = frappe.treeview_settings["Task"].columns;
// 		const is_group = !!node.data.expandable;

// 		const fmt_amount = (val) => {
// 			if (val === null || val === undefined || val === "") return "-";
// 			return Number(val).toLocaleString(undefined, {
// 				minimumFractionDigits: 2,
// 				maximumFractionDigits: 2,
// 			});
// 		};
// 		const fmt_date = (val) => (val ? frappe.datetime.str_to_user(val) : "-");
// 		const fmt_plain = (val) => (val === null || val === undefined || val === "" ? "-" : val);

// 		const values = {
// 			cpc_uom: is_group ? "-" : fmt_plain(node.data.cpc_uom),
// 			cpc_budget_qty: is_group ? "-" : fmt_plain(node.data.cpc_budget_qty),
// 			cpc_budget_amount: is_group ? "-" : fmt_amount(node.data.cpc_budget_amount),
// 			exp_start_date: fmt_date(node.data.exp_start_date),
// 			exp_end_date: fmt_date(node.data.exp_end_date),
// 			progress: `${node.data.progress || 0}%`,
// 		};

// 		const info_html = cols
// 			.map(
// 				(c, i) => `
// 				<span class="cpc-tree-column cpc-col-${i}">
// 					<span class="cpc-col-label">${c.label}</span>
// 					<span class="cpc-col-value">${values[c.key]}</span>
// 				</span>
// 			`
// 			)
// 			.join("");

// 		// Idempotent: remove any info block already sitting on this node's
// 		// tree-link before adding the new one, synchronously, so the browser
// 		// never has two overlapping copies to paint at once.
// 		node.$tree_link.children(".cpc-task-info").remove();

// 		const $info = $(`<span class="cpc-task-info">${info_html}</span>`);
// 		node.$tree_link.append($info);
// 	},

// 	toolbar: [
// 		{
// 			label: __("Add Multiple"),
// 			condition: function (node) {
// 				return node.expandable;
// 			},
// 			click: function (node) {
// 				this.data = [];
// 				const dialog = new frappe.ui.Dialog({
// 					title: __("Add Multiple Tasks"),
// 					fields: [
// 						{
// 							fieldname: "multiple_tasks",
// 							fieldtype: "Table",
// 							in_place_edit: true,
// 							data: this.data,
// 							get_data: () => this.data,
// 							fields: [
// 								{
// 									fieldtype: "Data",
// 									fieldname: "subject",
// 									in_list_view: 1,
// 									reqd: 1,
// 									label: __("Subject"),
// 								},
// 							],
// 						},
// 					],
// 					primary_action: function () {
// 						dialog.hide();
// 						return frappe.call({
// 							method: "erpnext.projects.doctype.task.task.add_multiple_tasks",
// 							args: {
// 								data: dialog.get_values()["multiple_tasks"],
// 								parent: node.data.value,
// 							},
// 							callback: function () {},
// 						});
// 					},
// 					primary_action_label: __("Create"),
// 				});
// 				dialog.show();
// 			},
// 		},
// 	],

// 	extend_toolbar: true,
// };













frappe.provide("frappe.treeview_settings");

frappe.treeview_settings["Task"] = {
	get_tree_nodes: "cpc_construction_management.cpc_construction_management.doc_events.task_tree.get_children",
	add_tree_node: "erpnext.projects.doctype.task.task.add_node",

	filters: [
		{
			fieldname: "project",
			fieldtype: "Link",
			options: "Project",
			label: __("Project"),
		},
		{
			fieldname: "task",
			fieldtype: "Link",
			options: "Task",
			label: __("Task"),
			get_query: function () {
				var me = frappe.treeview_settings["Task"];
				var project = me.page.fields_dict.project.get_value();
				var args = [["Task", "is_group", "=", 1]];
				if (project) {
					args.push(["Task", "project", "=", project]);
				}
				return { filters: args };
			},
		},
	],

	breadcrumb: "Projects",
	get_tree_root: false,
	root_label: "All Tasks",
	ignore_fields: ["parent_task"],

	// Columns are listed rightmost-first (each one is positioned by adding
	// up the widths of the ones before it, from the right edge inward), so
	// this order renders left-to-right on screen as:
	// PROGRESS, UOM, START, END, QTY, AMOUNT
	columns: [
		{ key: "cpc_free_float", label: "Free Float", width: 80 },
		{ key: "cpc_total_float", label: "Total Float", width: 90 },
		{ key: "cpc_budget_amount", label: "Amount", width: 110 },
		{ key: "cpc_budget_qty", label: "Qty", width: 70 },
		{ key: "exp_end_date", label: "End", width: 100 },
		{ key: "exp_start_date", label: "Start", width: 100 },
		{ key: "cpc_uom", label: "UOM", width: 90 },
		{ key: "progress", label: "Progress", width: 80 },
	],

	onload: function (me) {
		frappe.treeview_settings["Task"].page = {};
		$.extend(frappe.treeview_settings["Task"].page, me.page);
		me.make_tree();
		frappe.treeview_settings["Task"].inject_styles();
		frappe.treeview_settings["Task"].add_header_row(me.tree.wrapper);
	},

	inject_styles: function () {
		if (document.getElementById("cpc-task-tree-style")) return;

		const cols = frappe.treeview_settings["Task"].columns;
		let total_width = 0;
		const rules = cols
			.map((c, i) => {
				const rule = `.cpc-col-${i} { right: ${total_width}px; width: ${c.width}px; }`;
				total_width += c.width;
				return rule;
			})
			.join("\n");

		const style = document.createElement("style");
		style.id = "cpc-task-tree-style";
		style.innerHTML = `
			.tree-node { position: relative; }
			.tree-node .tree-link {
				display: block;
				position: relative;
				padding-right: ${total_width + 20}px !important;
			}
			.cpc-task-info {
				position: absolute;
				top: 0;
				right: 20px;
				height: 30px; /* fixed to one row's height so hover/toolbar wrap can't push this down */
				pointer-events: none;
				overflow: visible;
			}
			.tree-node:hover .tree-link,
			.tree-node .tree-link:hover {
				overflow: visible;
			}
			.cpc-tree-column {
				position: absolute;
				top: 50%;
				transform: translateY(-50%);
				display: flex;
				flex-direction: column;
				justify-content: center;
				line-height: 1.2;
				text-align: right;
				white-space: nowrap;
			}
			${rules}
			.cpc-col-label {
				font-size: 10px;
				color: var(--text-light);
				text-transform: uppercase;
			}
			.cpc-col-value {
				font-size: 12px;
				font-weight: 500;
				color: var(--text-color);
			}

			/* The header is a plain sticky bar (background/border/stacking
			   only). It does NOT set its own padding-based inset for the
			   columns — that previously drifted from the rows' inset
			   because "right: Npx" on an absolutely positioned column
			   resolves against the ancestor's padding box, so the header's
			   "padding: 10px 20px" and the rows' "right: 20px" (with no
			   padding) were two different insets even though both looked
			   like "20px from the edge". Instead the header nests a plain
			   .cpc-task-info span inside it (same markup shape as a row),
			   so both header and row columns are inset identically.
			*/
			.cpc-header-row {
				position: sticky;
				top: 0;
				left: 0;
				right: 0;
				display: block;
				height: 30px;
				background: var(--fg-color);
				z-index: 2;
				border-bottom: 1px solid var(--border-color);
				margin-bottom: 4px;
			}
			/* Link-field (Project/Task filter) suggestion dropdowns must float
			   above our sticky header, not under it. Our header previously
			   used z-index: 10, which beat awesomplete's own stacking and
			   made the header render on top of the open suggestion list. */
			.awesomplete > ul,
			.awesomplete-list,
			ul.awesomplete-list {
				z-index: 50 !important;
			}
			.cpc-header-row .cpc-col-label {
				font-size: 11px;
				font-weight: 600;
				color: var(--text-color);
			}

			/* Critical Path highlighting — red text, bold, subtle background */
			.tree-link.cpc-critical-path {
				background: rgba(255, 68, 68, 0.06);
			}
			.tree-link.cpc-critical-path .tree-label {
				color: #dc2626 !important;
				font-weight: 600;
			}
			.tree-link.cpc-critical-path .tree-label::before {
				content: "● ";
				color: #dc2626;
				font-size: 10px;
				margin-right: 4px;
				vertical-align: middle;
			}
			.tree-link.cpc-critical-path:hover {
				background: rgba(255, 68, 68, 0.12);
			}

			/* Float value coloring — zero float (critical) in red, positive in green */
			.cpc-col-value.cpc-float-zero {
				color: #dc2626;
				font-weight: 600;
			}
			.cpc-col-value.cpc-float-positive {
				color: #16a34a;
			}
			.cpc-col-value.cpc-float-negative {
				color: #dc2626;
			}
		`;
		document.head.appendChild(style);
	},

	add_header_row: function ($tree_wrapper) {
		// IMPORTANT: the header must live inside the *same* box that each
		// row's .tree-link right-aligns against — the ".tree" element that
		// directly contains every .tree-node. me.page.main is a wider
		// container with different left/right padding, so "right: 0" on the
		// header used to resolve against a different edge than "right: Npx"
		// on the row values — that's why the header labels used to drift
		// away from their columns.
		if (!$tree_wrapper || !$tree_wrapper.length) return;

		// Re-insert whenever it's actually missing, rather than trusting a
		// one-time "already added" class flag: filtering by Project/Task
		// makes Frappe reload the tree and wipe out this wrapper's children,
		// but the wrapper element (and any class we'd set on it) survives —
		// so a class-based check would wrongly skip re-adding the header
		// forever after the first filter/reload.
		if ($tree_wrapper.find(".cpc-header-row").length) return;

		// Give the header a positioned box of its own to stick/right-align
		// against, matching the ancestor rows use (.tree-node).
		$tree_wrapper.css("position", "relative");

		const cols = frappe.treeview_settings["Task"].columns;
		const header_cols = cols
			.map(
				(c, i) => `
				<span class="cpc-tree-column cpc-col-${i}">
					<span class="cpc-col-label">${c.label}</span>
				</span>
			`
			)
			.join("");

		// The inner span is a plain .cpc-task-info — the exact same class
		// (and therefore the exact same "right: 20px" inset) that each
		// row's value block uses, so the column positions computed by
		// .cpc-col-${i} land in identical places for header and rows.
		$tree_wrapper.prepend(
			`<div class="cpc-header-row"><span class="cpc-task-info">${header_cols}</span></div>`
		);
	},

	onrender: function (node) {
		if (!node.data) return;
		if (!node.$tree_link || !node.$tree_link.length) return;

		// Selecting the Project/Task filter doesn't just clear the tree
		// wrapper's children — Frappe rebuilds the whole tree object
		// (a brand-new .tree element), so any wrapper reference cached
		// earlier (e.g. at onload) points at a now-detached DOM node and
		// appending to it does nothing visible. Instead, walk up from the
		// node that's actually on screen right now to find whichever
		// ".tree" wrapper currently holds it, so we always target the live
		// one.
		const $current_wrapper = node.$tree_link.closest(".tree");
		frappe.treeview_settings["Task"].add_header_row($current_wrapper);

		const cols = frappe.treeview_settings["Task"].columns;
		const is_group = !!node.data.expandable;
		const is_critical = !!node.data.cpc_is_critical;

		// Apply critical path highlighting to the tree link (task row)
		if (is_critical && !is_group) {
			node.$tree_link.addClass("cpc-critical-path");
		} else {
			node.$tree_link.removeClass("cpc-critical-path");
		}

		const fmt_amount = (val) => {
			if (val === null || val === undefined || val === "") return "-";
			return Number(val).toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		};
		const fmt_float = (val) => {
			if (val === null || val === undefined || val === "") return { text: "-", cls: "" };
			const num = Number(val);
			let cls = "";
			if (num === 0) cls = "cpc-float-zero";
			else if (num > 0) cls = "cpc-float-positive";
			else cls = "cpc-float-negative";
			return {
				text: num === 0 ? "0.00" : num.toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}),
				cls: cls
			};
		};
		const fmt_date = (val) => (val ? frappe.datetime.str_to_user(val) : "-");
		const fmt_plain = (val) => (val === null || val === undefined || val === "" ? "-" : val);

		const free_float = is_group ? { text: "-", cls: "" } : fmt_float(node.data.cpc_free_float);
		const total_float = is_group ? { text: "-", cls: "" } : fmt_float(node.data.cpc_total_float);

		const values = {
			cpc_free_float: free_float.text,
			cpc_total_float: total_float.text,
			cpc_uom: is_group ? "-" : fmt_plain(node.data.cpc_uom),
			cpc_budget_qty: is_group ? "-" : fmt_plain(node.data.cpc_budget_qty),
			cpc_budget_amount: is_group ? "-" : fmt_amount(node.data.cpc_budget_amount),
			exp_start_date: fmt_date(node.data.exp_start_date),
			exp_end_date: fmt_date(node.data.exp_end_date),
			progress: `${node.data.progress || 0}%`,
		};

		const float_classes = {
			cpc_free_float: free_float.cls,
			cpc_total_float: total_float.cls,
		};

		// Per-row cells now show only the value; column labels live solely
		// in the sticky header row (see add_header_row).
		const info_html = cols
			.map(
				(c, i) => {
					const float_cls = float_classes[c.key] || "";
					return `
					<span class="cpc-tree-column cpc-col-${i}">
						<span class="cpc-col-value ${float_cls}">${values[c.key]}</span>
					</span>
				`;
				}
			)
			.join("");

		// Idempotent: remove any info block already sitting on this node's
		// tree-link before adding the new one, synchronously, so the browser
		// never has two overlapping copies to paint at once.
		node.$tree_link.children(".cpc-task-info").remove();

		const $info = $(`<span class="cpc-task-info">${info_html}</span>`);
		node.$tree_link.append($info);
	},

	toolbar: [
		{
			label: __("Add Multiple"),
			condition: function (node) {
				return node.expandable;
			},
			click: function (node) {
				this.data = [];
				const dialog = new frappe.ui.Dialog({
					title: __("Add Multiple Tasks"),
					fields: [
						{
							fieldname: "multiple_tasks",
							fieldtype: "Table",
							in_place_edit: true,
							data: this.data,
							get_data: () => this.data,
							fields: [
								{
									fieldtype: "Data",
									fieldname: "subject",
									in_list_view: 1,
									reqd: 1,
									label: __("Subject"),
								},
							],
						},
					],
					primary_action: function () {
						dialog.hide();
						return frappe.call({
							method: "erpnext.projects.doctype.task.task.add_multiple_tasks",
							args: {
								data: dialog.get_values()["multiple_tasks"],
								parent: node.data.value,
							},
							callback: function () {},
						});
					},
					primary_action_label: __("Create"),
				});
				dialog.show();
			},
		},
	],

	extend_toolbar: true,
};