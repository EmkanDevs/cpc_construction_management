

// frappe.ui.form.on('Task', {
// 	refresh(frm) {
// 		if (frm.doc.cpc_is_irpo && !frm.doc.is_group && !frm.is_new()) {
// 			frm.add_custom_button(__('Material Request'), () => {
// 				create_mr_from_irpo(frm);
// 			}, __('Create'));

// 			frm.add_custom_button(__('Purchase Order'), () => {
// 				create_po_from_irpo(frm);
// 			}, __('Create'));

// 			// NEW: only shown when the Task already has unplanned rows
// 			if ((frm.doc.custom_irpo_unplanned_item || []).length) {
// 				frm.add_custom_button(__('Material Request (Unplanned)'), () => {
// 					create_mr_from_unplanned(frm);
// 				}, __('Create'));
// 			}
// 		}
// 	}
// });

// function create_mr_from_irpo(frm) {
// 	frappe.call({
// 		method: "cpc_construction_management.cpc_construction_management.budget.irpo_budget.make_material_request",
// 		args: { irpo: frm.doc.name },
// 		callback: (r) => {
// 			if (r.message) {
// 				frappe.model.sync(r.message);
// 				frappe.set_route("Form", r.message.doctype, r.message.name);
// 			}
// 		}
// 	});
// }

// function create_po_from_irpo(frm) {
// 	frappe.call({
// 		method: "cpc_construction_management.cpc_construction_management.budget.irpo_budget.make_purchase_order",
// 		args: { irpo: frm.doc.name },
// 		callback: (r) => {
// 			if (r.message) {
// 				frappe.model.sync(r.message);
// 				frappe.set_route("Form", r.message.doctype, r.message.name);
// 			}
// 		}
// 	});
// }

// // NEW: Create Material Request from the Unplanned Items / Services table
// function create_mr_from_unplanned(frm) {
// 	if (frm.is_dirty()) {
// 		frappe.msgprint(__('Save the Task first so every unplanned row has its reference.'));
// 		return;
// 	}
// 	const rows = frm.fields_dict.custom_irpo_unplanned_item.grid
// 		.get_selected_children().map((r) => r.name);
// 	frappe.call({
// 		method: "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.make_material_request_from_unplanned",
// 		args: { task: frm.doc.name, rows: rows.length ? rows : null },
// 		callback: (r) => {
// 			if (r.message) {
// 				frappe.model.sync(r.message);
// 				frappe.set_route("Form", r.message.doctype, r.message.name);
// 			}
// 		}
// 	});
// }

// frappe.provide("frappe.treeview_settings");

// // CPC Construction Management Python Module Reference
// const CPC_TASK_TREE_MODULE = "cpc_construction_management.cpc_construction_management.doc_events.task_tree";

// frappe.treeview_settings["Task"] = {
// 	get_tree_nodes: CPC_TASK_TREE_MODULE + ".get_children",
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
// 				var project = me.page ? me.page.fields_dict.project.get_value() : null;
// 				var args = [["Task", "is_group", "=", 1]];
// 				if (project) {
// 					args.push(["Task", "project", "=", project]);
// 				}
// 				return { filters: args };
// 			},
// 		},
// 		{
// 			fieldname: "search_term",
// 			fieldtype: "Data",
// 			label: __("Search"),
// 			placeholder: __("Search task, BOQ, IRPO..."),
// 			disable_onchange: true,
// 		},
// 		{
// 			fieldname: "status_filter",
// 			fieldtype: "Select",
// 			label: __("Filter Status"),
// 			disable_onchange: true,
// 			options: [
// 				{ value: "", label: __("All Statuses") },
// 				{ value: "critical", label: "🔴 " + __("Critical (0 Float)") },
// 				{ value: "overdue", label: "⚠️ " + __("Overdue") },
// 				{ value: "boq", label: "📁 " + __("BOQ Nodes Only") },
// 				{ value: "open", label: "⏳ " + __("Open / Working") },
// 				{ value: "completed", label: "✅ " + __("Completed") },
// 			],
// 		},
// 	],

// 	breadcrumb: "Projects",
// 	get_tree_root: false,
// 	root_label: "All Tasks",
// 	ignore_fields: ["parent_task"],

// 	// Ordered rightmost-first (each column is offset by the cumulative width of preceding ones):
// 	// Left-to-Right on screen: Status | Progress | Start Date | End Date | UOM | Qty | Budget Amount | Total Float | Free Float
// 	columns: [
// 		{ key: "cpc_free_float", label: "Free Float", width: 85, align: "right" },
// 		{ key: "cpc_total_float", label: "Total Float", width: 90, align: "right" },
// 		{ key: "cpc_budget_amount", label: "Amount", width: 110, align: "right" },
// 		{ key: "cpc_budget_qty", label: "Qty", width: 65, align: "right" },
// 		{ key: "cpc_uom", label: "UOM", width: 60, align: "center" },
// 		{ key: "exp_end_date", label: "End", width: 90, align: "center" },
// 		{ key: "exp_start_date", label: "Start", width: 90, align: "center" },
// 		{ key: "progress", label: "Progress", width: 100, align: "center" },
// 		{ key: "status", label: "Status", width: 80, align: "center" },
// 	],

// 	onload: function (me) {
// 		frappe.treeview_settings["Task"].page = {};
// 		$.extend(frappe.treeview_settings["Task"].page, me.page);

// 		frappe.treeview_settings["Task"].inject_styles();
// 		me.make_tree();
// 		frappe.treeview_settings["Task"].setup_page_actions(me);
// 	},

// 	setup_page_actions: function (me) {
// 		// Add "Expand BOQ Only" button next to native Expand All / Collapse All buttons
// 		me.page.add_inner_button(__("Expand BOQ Only"), function () {
// 			frappe.treeview_settings["Task"].expand_boq_only(me);
// 		});

// 		// Attach live real-time listeners on the Search filter input
// 		if (me.page.fields_dict.search_term) {
// 			me.page.fields_dict.search_term.$input.on("input keyup paste change", function () {
// 				frappe.treeview_settings["Task"].apply_live_filter(me);
// 			});
// 		}

// 		// Attach listener on the Status filter dropdown
// 		if (me.page.fields_dict.status_filter) {
// 			me.page.fields_dict.status_filter.$input.on("change", function () {
// 				frappe.treeview_settings["Task"].apply_live_filter(me);
// 			});
// 		}
// 	},

// 	expand_boq_only: function (me) {
// 		if (!me.tree || !me.tree.root_node) return;
// 		// Re-fetch direct children of root (Level 1 BOQ nodes) with deep=false
// 		me.tree.load_children(me.tree.root_node, false);
// 	},

// 	apply_live_filter: function (me) {
// 		const search_query = me.page.fields_dict.search_term
// 			? (me.page.fields_dict.search_term.get_value() || "").toLowerCase().trim()
// 			: "";
// 		const status_filter = me.page.fields_dict.status_filter
// 			? (me.page.fields_dict.status_filter.get_value() || "").toLowerCase().trim()
// 			: "";

// 		const $nodes = me.page.main.find(".tree-node");

// 		if (!search_query && !status_filter) {
// 			$nodes.show();
// 			return;
// 		}

// 		// If filtering, expand tree first so all matching sub-nodes become visible
// 		if (me.tree && me.tree.root_node && !me.tree.root_node.loaded) {
// 			me.tree.load_children(me.tree.root_node, true);
// 		}

// 		$nodes.each(function () {
// 			const $node = $(this);
// 			const $link = $node.children(".tree-link");
// 			const node_text = $link.text().toLowerCase();

// 			let match_search = true;
// 			if (search_query) {
// 				match_search = node_text.includes(search_query);
// 			}

// 			let match_status = true;
// 			if (status_filter) {
// 				if (status_filter === "critical") {
// 					match_status = $link.find(".cpc-float-critical").length > 0;
// 				} else if (status_filter === "overdue") {
// 					match_status = $link.find(".cpc-status-overdue").length > 0;
// 				} else if (status_filter === "boq") {
// 					match_status = $link.find(".cpc-pill-boq").length > 0;
// 				} else if (status_filter === "open") {
// 					match_status = $link.find(".cpc-status-open, .cpc-status-working").length > 0;
// 				} else if (status_filter === "completed") {
// 					match_status = $link.find(".cpc-status-completed").length > 0;
// 				}
// 			}

// 			if (match_search && match_status) {
// 				$node.show();
// 				$node.parents(".tree-node").show();
// 				$node.parents(".tree-children").show();
// 			} else {
// 				$node.hide();
// 			}
// 		});

// 		// Second pass: Ensure any parent node that contains a visible child is visible
// 		$nodes.each(function () {
// 			const $node = $(this);
// 			if ($node.find(".tree-node:visible").length > 0) {
// 				$node.show();
// 				$node.children(".tree-children").show();
// 			}
// 		});
// 	},

// 	inject_styles: function () {
// 		if (document.getElementById("cpc-task-tree-style")) return;

// 		const cols = frappe.treeview_settings["Task"].columns;
// 		let total_width = 0;
// 		const rules = cols
// 			.map((c, i) => {
// 				const rule = `.cpc-col-${i} { right: ${total_width}px; width: ${c.width}px; text-align: ${c.align || 'right'}; justify-content: ${c.align === 'center' ? 'center' : (c.align === 'left' ? 'flex-start' : 'flex-end')}; }`;
// 				total_width += c.width;
// 				return rule;
// 			})
// 			.join("\n");

// 		const style = document.createElement("style");
// 		style.id = "cpc-task-tree-style";
// 		style.innerHTML = `
// 			/* Tree structure & spacing */
// 			.tree-node { position: relative; }
// 			.tree-node .tree-link {
// 				display: flex !important;
// 				align-items: center;
// 				position: relative;
// 				padding-top: 5px !important;
// 				padding-bottom: 5px !important;
// 				padding-right: ${total_width + 25}px !important;
// 				min-height: 34px;
// 				border-radius: 6px;
// 				transition: background-color 0.15s ease;
// 			}
// 			.tree-node .tree-link:hover {
// 				background-color: var(--subtle-accent-color, #f8fafc) !important;
// 			}

// 			/* Sticky Header Row: z-index kept lower than Frappe's .page-head (z-index: 6) so page menu dropdowns float cleanly above */
// 			.cpc-header-row {
// 				position: sticky;
// 				top: 0;
// 				left: 0;
// 				right: 0;
// 				display: block;
// 				height: 34px;
// 				background: var(--card-bg, #ffffff);
// 				z-index: 2;
// 				border-bottom: 1.5px solid var(--border-color, #e2e8f0);
// 				margin-bottom: 6px;
// 				box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
// 			}
// 			.cpc-header-row .cpc-task-info {
// 				position: absolute;
// 				top: 0;
// 				right: 15px;
// 				height: 34px;
// 				pointer-events: none;
// 			}
// 			.cpc-header-row .cpc-col-label {
// 				font-size: 10.5px;
// 				font-weight: 700;
// 				color: var(--text-muted, #64748b);
// 				text-transform: uppercase;
// 				letter-spacing: 0.4px;
// 				display: block;
// 				overflow: hidden;
// 				text-overflow: ellipsis;
// 				white-space: nowrap;
// 			}

// 			/* Suggestion dropdowns (Project / Task filters) must float above tree elements */
// 			.awesomplete > ul,
// 			.awesomplete-list,
// 			ul.awesomplete-list {
// 				z-index: 1050 !important;
// 			}

// 			/* Column Value Insets */
// 			.cpc-task-info {
// 				position: absolute;
// 				top: 0;
// 				right: 15px;
// 				height: 100%;
// 				pointer-events: none;
// 				overflow: visible;
// 			}
// 			.cpc-tree-column {
// 				position: absolute;
// 				top: 50%;
// 				transform: translateY(-50%);
// 				display: flex;
// 				align-items: center;
// 				white-space: nowrap;
// 				padding: 0 4px;
// 				box-sizing: border-box;
// 				overflow: hidden;
// 			}
// 			${rules}

// 			.cpc-col-value {
// 				font-size: 11.5px;
// 				font-weight: 500;
// 				color: var(--text-color, #1e293b);
// 				display: block;
// 				width: 100%;
// 			}
// 			.cpc-group-val {
// 				font-weight: 600;
// 				color: var(--heading-color, #0f172a);
// 			}

// 			/* Status Badges */
// 			.cpc-status-badge {
// 				display: inline-block;
// 				padding: 2px 7px;
// 				border-radius: 12px;
// 				font-size: 10.5px;
// 				font-weight: 600;
// 				line-height: 1.2;
// 				text-transform: capitalize;
// 			}
// 			.cpc-status-open { background: #eff6ff; color: #2563eb; border: 1px solid #dbeafe; }
// 			.cpc-status-working { background: #fffbeb; color: #d97706; border: 1px solid #fef3c7; }
// 			.cpc-status-completed { background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; }
// 			.cpc-status-overdue { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
// 			.cpc-status-pending { background: #faf5ff; color: #9333ea; border: 1px solid #f3e8ff; }
// 			.cpc-status-default { background: #f1f5f9; color: #475569; }

// 			/* Progress Bar */
// 			.cpc-progress-container {
// 				display: flex;
// 				align-items: center;
// 				gap: 6px;
// 				width: 100%;
// 				justify-content: center;
// 			}
// 			.cpc-progress-track {
// 				width: 44px;
// 				height: 6px;
// 				background: var(--border-color, #e2e8f0);
// 				border-radius: 3px;
// 				overflow: hidden;
// 				display: inline-block;
// 			}
// 			.cpc-progress-fill {
// 				height: 100%;
// 				background: #3b82f6;
// 				border-radius: 3px;
// 				transition: width 0.3s ease;
// 			}
// 			.cpc-progress-fill.completed { background: #16a34a; }
// 			.cpc-progress-fill.overdue { background: #dc2626; }
// 			.cpc-progress-text {
// 				font-size: 11px;
// 				font-weight: 600;
// 				color: var(--text-color, #334155);
// 				min-width: 26px;
// 				text-align: right;
// 			}

// 			/* Badges on Task Subject */
// 			.cpc-node-pill {
// 				font-size: 9.5px;
// 				font-weight: 700;
// 				padding: 1px 6px;
// 				border-radius: 4px;
// 				margin-right: 6px;
// 				text-transform: uppercase;
// 				letter-spacing: 0.3px;
// 				display: inline-flex;
// 				align-items: center;
// 				white-space: nowrap;
// 				flex-shrink: 0;
// 			}
// 			.cpc-pill-boq {
// 				background: #e0f2fe;
// 				color: #0369a1;
// 				border: 1px solid #bae6fd;
// 			}
// 			.cpc-pill-irpo {
// 				background: #f1f5f9;
// 				color: #475569;
// 				border: 1px solid #e2e8f0;
// 			}
// 			.cpc-pill-milestone {
// 				background: #fef3c7;
// 				color: #b45309;
// 				border: 1px solid #fde68a;
// 			}
// 			.cpc-child-count {
// 				font-size: 10px;
// 				font-weight: 600;
// 				color: #64748b;
// 				background: #f8fafc;
// 				border: 1px solid #e2e8f0;
// 				border-radius: 10px;
// 				padding: 1px 6px;
// 				margin-left: 6px;
// 				display: inline-flex;
// 				align-items: center;
// 				white-space: nowrap;
// 				flex-shrink: 0;
// 			}

// 			.tree-node .tree-label {
// 				display: inline-block;
// 				vertical-align: middle;
// 				max-width: 500px;
// 				overflow: hidden;
// 				text-overflow: ellipsis;
// 				white-space: nowrap;
// 			}

// 			/* Float Highlighting */
// 			.cpc-float-critical {
// 				color: #dc2626 !important;
// 				font-weight: 700 !important;
// 			}
// 			.cpc-float-positive {
// 				color: #16a34a;
// 			}

// 			/* UOM Tag */
// 			.cpc-uom-tag {
// 				font-size: 10px;
// 				font-weight: 600;
// 				background: var(--control-bg, #f1f5f9);
// 				color: var(--text-muted, #475569);
// 				padding: 1px 5px;
// 				border-radius: 3px;
// 			}

// 			/* Toolbar Buttons on Node Hover */
// 			.tree-node-toolbar {
// 				margin-left: 8px;
// 			}
// 			.tree-node-toolbar .btn {
// 				padding: 1px 6px !important;
// 				font-size: 10.5px !important;
// 				border-radius: 4px !important;
// 			}

// 			/* Activity Details Modal Styling */
// 			.cpc-modal-grid {
// 				display: grid;
// 				grid-template-columns: 1fr 1fr;
// 				gap: 12px;
// 				margin-bottom: 12px;
// 			}
// 			.cpc-modal-item {
// 				background: var(--fg-color, #f8fafc);
// 				padding: 8px 12px;
// 				border-radius: 6px;
// 				border: 1px solid var(--border-color, #e2e8f0);
// 			}
// 			.cpc-modal-label {
// 				font-size: 10.5px;
// 				font-weight: 600;
// 				color: var(--text-muted, #64748b);
// 				text-transform: uppercase;
// 				margin-bottom: 2px;
// 			}
// 			.cpc-modal-value {
// 				font-size: 13px;
// 				font-weight: 600;
// 				color: var(--text-color, #0f172a);
// 			}
// 		`;
// 		document.head.appendChild(style);
// 	},

// 	add_header_row: function ($tree_wrapper) {
// 		if (!$tree_wrapper || !$tree_wrapper.length) return;
// 		if ($tree_wrapper.find(".cpc-header-row").length) return;

// 		$tree_wrapper.css("position", "relative");

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

// 		$tree_wrapper.prepend(
// 			`<div class="cpc-header-row"><div class="cpc-task-info">${header_cols}</div></div>`
// 		);
// 	},

// 	onrender: function (node) {
// 		if (!node.data) return;
// 		if (!node.$tree_link || !node.$tree_link.length) return;

// 		const $current_wrapper = node.$tree_link.closest(".tree");
// 		frappe.treeview_settings["Task"].add_header_row($current_wrapper);

// 		const data = node.data;
// 		const cols = frappe.treeview_settings["Task"].columns;
// 		const is_group = !!data.expandable;
// 		const is_overdue = !!data.is_overdue;

// 		// Decorate Title with Badges (BOQ Node / IRPO / Milestone)
// 		const $label = node.$tree_link.find(".tree-label");
// 		if ($label.length && !node.$tree_link.hasClass("cpc-labeled")) {
// 			node.$tree_link.addClass("cpc-labeled");

// 			let prefix_badge = "";
// 			let suffix_badge = "";

// 			if (data.is_milestone) {
// 				prefix_badge = `<span class="cpc-node-pill cpc-pill-milestone">💎 Milestone</span>`;
// 			} else if (data.cpc_node_type === "BOQ Node" || (is_group && data.cpc_boq_code)) {
// 				prefix_badge = `<span class="cpc-node-pill cpc-pill-boq">BOQ</span>`;
// 				if (data.child_count) {
// 					suffix_badge = `<span class="cpc-child-count" title="${__('Sub-activities')}">${data.completed_child_count || 0}/${data.child_count} IRPOs</span>`;
// 				}
// 			} else if (data.cpc_node_type === "IRPO" || data.cpc_is_irpo) {
// 				prefix_badge = `<span class="cpc-node-pill cpc-pill-irpo">IRPO</span>`;
// 			}

// 			if (prefix_badge) {
// 				$label.before(prefix_badge);
// 			}
// 			if (suffix_badge) {
// 				$label.after(suffix_badge);
// 			}
// 		}

// 		// Value formatters
// 		const fmt_amount = (val) => {
// 			if (val === null || val === undefined || val === "" || isNaN(val)) return "-";
// 			const num = Number(val);
// 			if (num === 0) return "-";
// 			return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// 		};

// 		const fmt_qty = (val) => {
// 			if (val === null || val === undefined || val === "" || isNaN(val)) return "-";
// 			const num = Number(val);
// 			if (num === 0) return "-";
// 			return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
// 		};

// 		const fmt_date = (val) => {
// 			if (!val) return "-";
// 			return frappe.datetime.str_to_user(val);
// 		};

// 		const fmt_float = (val) => {
// 			if (val === null || val === undefined || val === "" || isNaN(val)) return { text: "-", cls: "" };
// 			const num = Number(val);
// 			const text = `${num.toFixed(1)} d`;
// 			if (num <= 0) return { text: text, cls: "cpc-float-critical" };
// 			return { text: `+${text}`, cls: "cpc-float-positive" };
// 		};

// 		// Format Status
// 		const status_val = data.status || "Open";
// 		let status_class = "cpc-status-default";
// 		if (is_overdue) status_class = "cpc-status-overdue";
// 		else if (status_val === "Open") status_class = "cpc-status-open";
// 		else if (status_val === "Working") status_class = "cpc-status-working";
// 		else if (status_val === "Completed") status_class = "cpc-status-completed";
// 		else if (status_val === "Pending Review") status_class = "cpc-status-pending";

// 		const status_html = `<span class="cpc-status-badge ${status_class}">${is_overdue ? __('Overdue') : __(status_val)}</span>`;

// 		// Format Progress
// 		const prog_pct = Math.min(100, Math.max(0, Math.round(Number(data.progress || 0))));
// 		let fill_cls = "";
// 		if (prog_pct === 100 || status_val === "Completed") fill_cls = "completed";
// 		else if (is_overdue) fill_cls = "overdue";

// 		const progress_html = `
// 			<div class="cpc-progress-container">
// 				<div class="cpc-progress-track">
// 					<div class="cpc-progress-fill ${fill_cls}" style="width: ${prog_pct}%"></div>
// 				</div>
// 				<span class="cpc-progress-text">${prog_pct}%</span>
// 			</div>
// 		`;

// 		// Format UOM
// 		const uom_html = data.cpc_uom ? `<span class="cpc-uom-tag">${data.cpc_uom}</span>` : "-";

// 		// Format Float
// 		const free_float = is_group ? { text: "-", cls: "" } : fmt_float(data.cpc_free_float);
// 		const total_float = is_group ? { text: "-", cls: "" } : fmt_float(data.cpc_total_float);

// 		const display_amount = data.cpc_budget_amount || data.rollup_budget_amount;
// 		const display_qty = data.cpc_budget_qty || data.rollup_budget_qty;

// 		const values = {
// 			status: status_html,
// 			progress: progress_html,
// 			exp_start_date: fmt_date(data.exp_start_date),
// 			exp_end_date: fmt_date(data.exp_end_date),
// 			cpc_uom: uom_html,
// 			cpc_budget_qty: fmt_qty(display_qty),
// 			cpc_budget_amount: `<span class="${is_group ? 'cpc-group-val' : ''}">${fmt_amount(display_amount)}</span>`,
// 			cpc_total_float: `<span class="${total_float.cls}">${total_float.text}</span>`,
// 			cpc_free_float: `<span class="${free_float.cls}">${free_float.text}</span>`,
// 		};

// 		const info_html = cols
// 			.map(
// 				(c, i) => `
// 				<span class="cpc-tree-column cpc-col-${i}">
// 					<span class="cpc-col-value">${values[c.key]}</span>
// 				</span>
// 			`
// 			)
// 			.join("");

// 		node.$tree_link.children(".cpc-task-info").remove();
// 		node.$tree_link.append(`<span class="cpc-task-info">${info_html}</span>`);
// 	},

// 	show_activity_inspector: function (task_name) {
// 		if (!task_name) return;

// 		frappe.call({
// 			method: CPC_TASK_TREE_MODULE + ".get_task_details",
// 			args: { task_name: task_name },
// 			callback: function (r) {
// 				if (!r.message) return;
// 				const res = r.message;
// 				const t = res.task;
// 				const evm = res.evm || {};

// 				const fmt = (v) => v || "-";
// 				const fmt_curr = (v) => v ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";

// 				const dialog = new frappe.ui.Dialog({
// 					title: `<span style="font-weight:700;">${t.subject || t.name}</span> <span class="text-muted">(${t.name})</span>`,
// 					fields: [
// 						{
// 							fieldname: "details_html",
// 							fieldtype: "HTML",
// 						}
// 					],
// 					primary_action_label: __("Open Full Form"),
// 					primary_action: function () {
// 						frappe.set_route("Form", "Task", t.name);
// 					}
// 				});

// 				const predecessors_html = (res.predecessors && res.predecessors.length)
// 					? res.predecessors.map(p => `<li><b>${p.name}</b>: ${p.subject} (${p.status}, End: ${p.exp_end_date || '-'})</li>`).join("")
// 					: `<span class="text-muted">${__('No Predecessors')}</span>`;

// 				const successors_html = (res.successors && res.successors.length)
// 					? res.successors.map(s => `<li><b>${s.name}</b>: ${s.subject} (${s.status}, Start: ${s.exp_start_date || '-'})</li>`).join("")
// 					: `<span class="text-muted">${__('No Successors')}</span>`;

// 				const emp_html = (res.assigned_employees && res.assigned_employees.length)
// 					? res.assigned_employees.join(", ")
// 					: `<span class="text-muted">${__('None')}</span>`;

// 				const html = `
// 					<div class="cpc-modal-grid">
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Status & Progress')}</div>
// 							<div class="cpc-modal-value">${t.status} · ${t.progress || 0}%</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Node Type / BOQ Code')}</div>
// 							<div class="cpc-modal-value">${fmt(t.cpc_node_type)} ${t.cpc_boq_code ? '· ' + t.cpc_boq_code : ''}</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Planned Dates & Duration')}</div>
// 							<div class="cpc-modal-value">${fmt(t.exp_start_date)} to ${fmt(t.exp_end_date)} (${t.duration || 0} days)</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Actual Dates')}</div>
// 							<div class="cpc-modal-value">${fmt(t.act_start_date)} to ${fmt(t.act_end_date)}</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Budget Quantity & UOM')}</div>
// 							<div class="cpc-modal-value">${fmt(t.cpc_budget_qty)} ${fmt(t.cpc_uom)}</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Budget Amount')}</div>
// 							<div class="cpc-modal-value">${fmt_curr(evm.budget_amount)}</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Earned Value (EV)')}</div>
// 							<div class="cpc-modal-value">${fmt_curr(evm.earned_value)}</div>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Actual Cost (AC)')}</div>
// 							<div class="cpc-modal-value">${fmt_curr(evm.actual_cost)}</div>
// 						</div>
// 					</div>

// 					<div style="margin-top: 10px;">
// 						<div class="cpc-modal-label" style="font-weight:700; margin-bottom:4px;">${__('Assigned Employees')}: ${emp_html}</div>
// 					</div>

// 					<div style="margin-top: 12px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Predecessors')}</div>
// 							<ul style="padding-left:15px; margin:4px 0 0 0; font-size:12px;">${predecessors_html}</ul>
// 						</div>
// 						<div class="cpc-modal-item">
// 							<div class="cpc-modal-label">${__('Successors')}</div>
// 							<ul style="padding-left:15px; margin:4px 0 0 0; font-size:12px;">${successors_html}</ul>
// 						</div>
// 					</div>
// 				`;

// 				dialog.fields_dict.details_html.$wrapper.html(html);
// 				dialog.show();
// 			}
// 		});
// 	},

// 	toolbar: [
// 		{
// 			label: __("Activity Details"),
// 			click: function (node) {
// 				frappe.treeview_settings["Task"].show_activity_inspector(node.data.value);
// 			},
// 		},
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
// 							callback: function () { },
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


























const CPC_HOLD_CONTROLS = "cpc_construction_management.cpc_construction_management.progress.hold_controls.";

frappe.ui.form.on('Task', {
	refresh(frm) {
		if (frm.doc.cpc_is_irpo && !frm.doc.is_group && !frm.is_new()) {
			frm.add_custom_button(__('Material Request'), () => {
				create_mr_from_irpo(frm);
			}, __('Create'));

			frm.add_custom_button(__('Purchase Order'), () => {
				create_po_from_irpo(frm);
			}, __('Create'));

			// NEW: only shown when the Task already has unplanned rows
			if ((frm.doc.custom_irpo_unplanned_item || []).length) {
				frm.add_custom_button(__('Material Request (Unplanned)'), () => {
					create_mr_from_unplanned(frm);
				}, __('Create'));
			}

			// Hold / Resume (reporting status). Shows "Hold" when active, "Resume" when on Hold.
			add_hold_resume_button(frm);
		}
	}
});

function add_hold_resume_button(frm) {
	frappe.call({
		method: CPC_HOLD_CONTROLS + "get_current_state",
		args: { task: frm.doc.name },
	}).then((r) => {
		const event = r.message === "Hold" ? "Resume" : "Hold";
		frm.add_custom_button(__(event), () => {
			frappe.prompt([
				{
					fieldname: "effective_date",
					label: __("Effective Date"),
					fieldtype: "Date",
					default: frappe.datetime.get_today(),
					reqd: 1,
				},
				{
					fieldname: "reason",
					label: __("Reason"),
					fieldtype: "Small Text",
					reqd: 1,
				},
			], (v) => {
				frappe.call({
					method: CPC_HOLD_CONTROLS + "record_status_event",
					args: {
						task: frm.doc.name,
						event: event,
						effective_date: v.effective_date,
						reason: v.reason,
					},
				}).then(() => {
					frappe.show_alert({
						message: event === "Hold" ? __("IRPO put on Hold") : __("IRPO resumed"),
						indicator: event === "Hold" ? "orange" : "green",
					});
					frm.reload_doc();
				});
			}, __("{0} IRPO", [event]), __(event));
		}, __("Reporting Status"));
	});
}

function create_mr_from_irpo(frm) {
	frappe.call({
		method: "cpc_construction_management.cpc_construction_management.budget.irpo_budget.make_material_request",
		args: { irpo: frm.doc.name },
		callback: (r) => {
			if (r.message) {
				frappe.model.sync(r.message);
				frappe.set_route("Form", r.message.doctype, r.message.name);
			}
		}
	});
}

function create_po_from_irpo(frm) {
	frappe.call({
		method: "cpc_construction_management.cpc_construction_management.budget.irpo_budget.make_purchase_order",
		args: { irpo: frm.doc.name },
		callback: (r) => {
			if (r.message) {
				frappe.model.sync(r.message);
				frappe.set_route("Form", r.message.doctype, r.message.name);
			}
		}
	});
}

// NEW: Create Material Request from the Unplanned Items / Services table
function create_mr_from_unplanned(frm) {
	if (frm.is_dirty()) {
		frappe.msgprint(__('Save the Task first so every unplanned row has its reference.'));
		return;
	}
	const rows = frm.fields_dict.custom_irpo_unplanned_item.grid
		.get_selected_children().map((r) => r.name);
	frappe.call({
		method: "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.make_material_request_from_unplanned",
		args: { task: frm.doc.name, rows: rows.length ? rows : null },
		callback: (r) => {
			if (r.message) {
				frappe.model.sync(r.message);
				frappe.set_route("Form", r.message.doctype, r.message.name);
			}
		}
	});
}

frappe.provide("frappe.treeview_settings");

// CPC Construction Management Python Module Reference
const CPC_TASK_TREE_MODULE = "cpc_construction_management.cpc_construction_management.doc_events.task_tree";

frappe.treeview_settings["Task"] = {
	get_tree_nodes: CPC_TASK_TREE_MODULE + ".get_children",
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
				var project = me.page ? me.page.fields_dict.project.get_value() : null;
				var args = [["Task", "is_group", "=", 1]];
				if (project) {
					args.push(["Task", "project", "=", project]);
				}
				return { filters: args };
			},
		},
		{
			fieldname: "search_term",
			fieldtype: "Data",
			label: __("Search"),
			placeholder: __("Search task, BOQ, IRPO..."),
			disable_onchange: true,
		},
		{
			fieldname: "status_filter",
			fieldtype: "Select",
			label: __("Filter Status"),
			disable_onchange: true,
			options: [
				{ value: "", label: __("All Statuses") },
				{ value: "critical", label: "🔴 " + __("Critical (0 Float)") },
				{ value: "overdue", label: "⚠️ " + __("Overdue") },
				{ value: "boq", label: "📁 " + __("BOQ Nodes Only") },
				{ value: "open", label: "⏳ " + __("Open / Working") },
				{ value: "completed", label: "✅ " + __("Completed") },
			],
		},
	],

	breadcrumb: "Projects",
	get_tree_root: false,
	root_label: "All Tasks",
	ignore_fields: ["parent_task"],

	// Ordered rightmost-first (each column is offset by the cumulative width of preceding ones):
	// Left-to-Right on screen: Status | Progress | Start Date | End Date | UOM | Qty | Budget Amount | Total Float | Free Float
	columns: [
		{ key: "cpc_free_float", label: "Free Float", width: 85, align: "right" },
		{ key: "cpc_total_float", label: "Total Float", width: 90, align: "right" },
		{ key: "cpc_budget_amount", label: "Amount", width: 110, align: "right" },
		{ key: "cpc_budget_qty", label: "Qty", width: 65, align: "right" },
		{ key: "cpc_uom", label: "UOM", width: 60, align: "center" },
		{ key: "exp_end_date", label: "End", width: 90, align: "center" },
		{ key: "exp_start_date", label: "Start", width: 90, align: "center" },
		{ key: "progress", label: "Progress", width: 100, align: "center" },
		{ key: "status", label: "Status", width: 80, align: "center" },
	],

	onload: function (me) {
		frappe.treeview_settings["Task"].page = {};
		$.extend(frappe.treeview_settings["Task"].page, me.page);

		frappe.treeview_settings["Task"].inject_styles();
		me.make_tree();
		frappe.treeview_settings["Task"].setup_page_actions(me);
	},

	setup_page_actions: function (me) {
		// Add "Expand BOQ Only" button next to native Expand All / Collapse All buttons
		me.page.add_inner_button(__("Expand BOQ Only"), function () {
			frappe.treeview_settings["Task"].expand_boq_only(me);
		});

		// Attach live real-time listeners on the Search filter input
		if (me.page.fields_dict.search_term) {
			me.page.fields_dict.search_term.$input.on("input keyup paste change", function () {
				frappe.treeview_settings["Task"].apply_live_filter(me);
			});
		}

		// Attach listener on the Status filter dropdown
		if (me.page.fields_dict.status_filter) {
			me.page.fields_dict.status_filter.$input.on("change", function () {
				frappe.treeview_settings["Task"].apply_live_filter(me);
			});
		}
	},

	expand_boq_only: function (me) {
		if (!me.tree || !me.tree.root_node) return;
		// Re-fetch direct children of root (Level 1 BOQ nodes) with deep=false
		me.tree.load_children(me.tree.root_node, false);
	},

	apply_live_filter: function (me) {
		const search_query = me.page.fields_dict.search_term
			? (me.page.fields_dict.search_term.get_value() || "").toLowerCase().trim()
			: "";
		const status_filter = me.page.fields_dict.status_filter
			? (me.page.fields_dict.status_filter.get_value() || "").toLowerCase().trim()
			: "";

		const $nodes = me.page.main.find(".tree-node");

		if (!search_query && !status_filter) {
			$nodes.show();
			return;
		}

		// If filtering, expand tree first so all matching sub-nodes become visible
		if (me.tree && me.tree.root_node && !me.tree.root_node.loaded) {
			me.tree.load_children(me.tree.root_node, true);
		}

		$nodes.each(function () {
			const $node = $(this);
			const $link = $node.children(".tree-link");
			const node_text = $link.text().toLowerCase();

			let match_search = true;
			if (search_query) {
				match_search = node_text.includes(search_query);
			}

			let match_status = true;
			if (status_filter) {
				if (status_filter === "critical") {
					match_status = $link.find(".cpc-float-critical").length > 0;
				} else if (status_filter === "overdue") {
					match_status = $link.find(".cpc-status-overdue").length > 0;
				} else if (status_filter === "boq") {
					match_status = $link.find(".cpc-pill-boq").length > 0;
				} else if (status_filter === "open") {
					match_status = $link.find(".cpc-status-open, .cpc-status-working").length > 0;
				} else if (status_filter === "completed") {
					match_status = $link.find(".cpc-status-completed").length > 0;
				}
			}

			if (match_search && match_status) {
				$node.show();
				$node.parents(".tree-node").show();
				$node.parents(".tree-children").show();
			} else {
				$node.hide();
			}
		});

		// Second pass: Ensure any parent node that contains a visible child is visible
		$nodes.each(function () {
			const $node = $(this);
			if ($node.find(".tree-node:visible").length > 0) {
				$node.show();
				$node.children(".tree-children").show();
			}
		});
	},

	inject_styles: function () {
		if (document.getElementById("cpc-task-tree-style")) return;

		const cols = frappe.treeview_settings["Task"].columns;
		let total_width = 0;
		const rules = cols
			.map((c, i) => {
				const rule = `.cpc-col-${i} { right: ${total_width}px; width: ${c.width}px; text-align: ${c.align || 'right'}; justify-content: ${c.align === 'center' ? 'center' : (c.align === 'left' ? 'flex-start' : 'flex-end')}; }`;
				total_width += c.width;
				return rule;
			})
			.join("\n");

		const style = document.createElement("style");
		style.id = "cpc-task-tree-style";
		style.innerHTML = `
			/* Tree structure & spacing */
			.tree-node { position: relative; }
			.tree-node .tree-link {
				display: flex !important;
				align-items: center;
				position: relative;
				padding-top: 5px !important;
				padding-bottom: 5px !important;
				padding-right: ${total_width + 25}px !important;
				min-height: 34px;
				border-radius: 6px;
				transition: background-color 0.15s ease;
			}
			.tree-node .tree-link:hover {
				background-color: var(--subtle-accent-color, #f8fafc) !important;
			}

			/* Sticky Header Row: z-index kept lower than Frappe's .page-head (z-index: 6) so page menu dropdowns float cleanly above */
			.cpc-header-row {
				position: sticky;
				top: 0;
				left: 0;
				right: 0;
				display: block;
				height: 34px;
				background: var(--card-bg, #ffffff);
				z-index: 2;
				border-bottom: 1.5px solid var(--border-color, #e2e8f0);
				margin-bottom: 6px;
				box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
			}
			.cpc-header-row .cpc-task-info {
				position: absolute;
				top: 0;
				right: 15px;
				height: 34px;
				pointer-events: none;
			}
			.cpc-header-row .cpc-col-label {
				font-size: 10.5px;
				font-weight: 700;
				color: var(--text-muted, #64748b);
				text-transform: uppercase;
				letter-spacing: 0.4px;
				display: block;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			/* Suggestion dropdowns (Project / Task filters) must float above tree elements */
			.awesomplete > ul,
			.awesomplete-list,
			ul.awesomplete-list {
				z-index: 1050 !important;
			}

			/* Column Value Insets */
			.cpc-task-info {
				position: absolute;
				top: 0;
				right: 15px;
				height: 100%;
				pointer-events: none;
				overflow: visible;
			}
			.cpc-tree-column {
				position: absolute;
				top: 50%;
				transform: translateY(-50%);
				display: flex;
				align-items: center;
				white-space: nowrap;
				padding: 0 4px;
				box-sizing: border-box;
				overflow: hidden;
			}
			${rules}

			.cpc-col-value {
				font-size: 11.5px;
				font-weight: 500;
				color: var(--text-color, #1e293b);
				display: block;
				width: 100%;
			}
			.cpc-group-val {
				font-weight: 600;
				color: var(--heading-color, #0f172a);
			}

			/* Status Badges */
			.cpc-status-badge {
				display: inline-block;
				padding: 2px 7px;
				border-radius: 12px;
				font-size: 10.5px;
				font-weight: 600;
				line-height: 1.2;
				text-transform: capitalize;
			}
			.cpc-status-open { background: #eff6ff; color: #2563eb; border: 1px solid #dbeafe; }
			.cpc-status-working { background: #fffbeb; color: #d97706; border: 1px solid #fef3c7; }
			.cpc-status-completed { background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; }
			.cpc-status-overdue { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
			.cpc-status-pending { background: #faf5ff; color: #9333ea; border: 1px solid #f3e8ff; }
			.cpc-status-default { background: #f1f5f9; color: #475569; }

			/* Progress Bar */
			.cpc-progress-container {
				display: flex;
				align-items: center;
				gap: 6px;
				width: 100%;
				justify-content: center;
			}
			.cpc-progress-track {
				width: 44px;
				height: 6px;
				background: var(--border-color, #e2e8f0);
				border-radius: 3px;
				overflow: hidden;
				display: inline-block;
			}
			.cpc-progress-fill {
				height: 100%;
				background: #3b82f6;
				border-radius: 3px;
				transition: width 0.3s ease;
			}
			.cpc-progress-fill.completed { background: #16a34a; }
			.cpc-progress-fill.overdue { background: #dc2626; }
			.cpc-progress-text {
				font-size: 11px;
				font-weight: 600;
				color: var(--text-color, #334155);
				min-width: 26px;
				text-align: right;
			}

			/* Badges on Task Subject */
			.cpc-node-pill {
				font-size: 9.5px;
				font-weight: 700;
				padding: 1px 6px;
				border-radius: 4px;
				margin-right: 6px;
				text-transform: uppercase;
				letter-spacing: 0.3px;
				display: inline-flex;
				align-items: center;
				white-space: nowrap;
				flex-shrink: 0;
			}
			.cpc-pill-boq {
				background: #e0f2fe;
				color: #0369a1;
				border: 1px solid #bae6fd;
			}
			.cpc-pill-irpo {
				background: #f1f5f9;
				color: #475569;
				border: 1px solid #e2e8f0;
			}
			.cpc-pill-milestone {
				background: #fef3c7;
				color: #b45309;
				border: 1px solid #fde68a;
			}
			.cpc-child-count {
				font-size: 10px;
				font-weight: 600;
				color: #64748b;
				background: #f8fafc;
				border: 1px solid #e2e8f0;
				border-radius: 10px;
				padding: 1px 6px;
				margin-left: 6px;
				display: inline-flex;
				align-items: center;
				white-space: nowrap;
				flex-shrink: 0;
			}

			.tree-node .tree-label {
				display: inline-block;
				vertical-align: middle;
				max-width: 500px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			/* Float Highlighting */
			.cpc-float-critical {
				color: #dc2626 !important;
				font-weight: 700 !important;
			}
			.cpc-float-positive {
				color: #16a34a;
			}

			/* UOM Tag */
			.cpc-uom-tag {
				font-size: 10px;
				font-weight: 600;
				background: var(--control-bg, #f1f5f9);
				color: var(--text-muted, #475569);
				padding: 1px 5px;
				border-radius: 3px;
			}

			/* Toolbar Buttons on Node Hover */
			.tree-node-toolbar {
				margin-left: 8px;
			}
			.tree-node-toolbar .btn {
				padding: 1px 6px !important;
				font-size: 10.5px !important;
				border-radius: 4px !important;
			}

			/* Activity Details Modal Styling */
			.cpc-modal-grid {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 12px;
				margin-bottom: 12px;
			}
			.cpc-modal-item {
				background: var(--fg-color, #f8fafc);
				padding: 8px 12px;
				border-radius: 6px;
				border: 1px solid var(--border-color, #e2e8f0);
			}
			.cpc-modal-label {
				font-size: 10.5px;
				font-weight: 600;
				color: var(--text-muted, #64748b);
				text-transform: uppercase;
				margin-bottom: 2px;
			}
			.cpc-modal-value {
				font-size: 13px;
				font-weight: 600;
				color: var(--text-color, #0f172a);
			}
		`;
		document.head.appendChild(style);
	},

	add_header_row: function ($tree_wrapper) {
		if (!$tree_wrapper || !$tree_wrapper.length) return;
		if ($tree_wrapper.find(".cpc-header-row").length) return;

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

		$tree_wrapper.prepend(
			`<div class="cpc-header-row"><div class="cpc-task-info">${header_cols}</div></div>`
		);
	},

	onrender: function (node) {
		if (!node.data) return;
		if (!node.$tree_link || !node.$tree_link.length) return;

		const $current_wrapper = node.$tree_link.closest(".tree");
		frappe.treeview_settings["Task"].add_header_row($current_wrapper);

		const data = node.data;
		const cols = frappe.treeview_settings["Task"].columns;
		const is_group = !!data.expandable;
		const is_overdue = !!data.is_overdue;

		// Decorate Title with Badges (BOQ Node / IRPO / Milestone)
		const $label = node.$tree_link.find(".tree-label");
		if ($label.length && !node.$tree_link.hasClass("cpc-labeled")) {
			node.$tree_link.addClass("cpc-labeled");

			let prefix_badge = "";
			let suffix_badge = "";

			if (data.is_milestone) {
				prefix_badge = `<span class="cpc-node-pill cpc-pill-milestone">💎 Milestone</span>`;
			} else if (data.cpc_node_type === "BOQ Node" || (is_group && data.cpc_boq_code)) {
				prefix_badge = `<span class="cpc-node-pill cpc-pill-boq">BOQ</span>`;
				if (data.child_count) {
					suffix_badge = `<span class="cpc-child-count" title="${__('Sub-activities')}">${data.completed_child_count || 0}/${data.child_count} IRPOs</span>`;
				}
			} else if (data.cpc_node_type === "IRPO" || data.cpc_is_irpo) {
				prefix_badge = `<span class="cpc-node-pill cpc-pill-irpo">IRPO</span>`;
			}

			if (prefix_badge) {
				$label.before(prefix_badge);
			}
			if (suffix_badge) {
				$label.after(suffix_badge);
			}
		}

		// Value formatters
		const fmt_amount = (val) => {
			if (val === null || val === undefined || val === "" || isNaN(val)) return "-";
			const num = Number(val);
			if (num === 0) return "-";
			return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		};

		const fmt_qty = (val) => {
			if (val === null || val === undefined || val === "" || isNaN(val)) return "-";
			const num = Number(val);
			if (num === 0) return "-";
			return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
		};

		const fmt_date = (val) => {
			if (!val) return "-";
			return frappe.datetime.str_to_user(val);
		};

		const fmt_float = (val) => {
			if (val === null || val === undefined || val === "" || isNaN(val)) return { text: "-", cls: "" };
			const num = Number(val);
			const text = `${num.toFixed(1)} d`;
			if (num <= 0) return { text: text, cls: "cpc-float-critical" };
			return { text: `+${text}`, cls: "cpc-float-positive" };
		};

		// Format Status
		const status_val = data.status || "Open";
		let status_class = "cpc-status-default";
		if (is_overdue) status_class = "cpc-status-overdue";
		else if (status_val === "Open") status_class = "cpc-status-open";
		else if (status_val === "Working") status_class = "cpc-status-working";
		else if (status_val === "Completed") status_class = "cpc-status-completed";
		else if (status_val === "Pending Review") status_class = "cpc-status-pending";

		const status_html = `<span class="cpc-status-badge ${status_class}">${is_overdue ? __('Overdue') : __(status_val)}</span>`;

		// Format Progress
		const prog_pct = Math.min(100, Math.max(0, Math.round(Number(data.progress || 0))));
		let fill_cls = "";
		if (prog_pct === 100 || status_val === "Completed") fill_cls = "completed";
		else if (is_overdue) fill_cls = "overdue";

		const progress_html = `
			<div class="cpc-progress-container">
				<div class="cpc-progress-track">
					<div class="cpc-progress-fill ${fill_cls}" style="width: ${prog_pct}%"></div>
				</div>
				<span class="cpc-progress-text">${prog_pct}%</span>
			</div>
		`;

		// Format UOM
		const uom_html = data.cpc_uom ? `<span class="cpc-uom-tag">${data.cpc_uom}</span>` : "-";

		// Format Float
		const free_float = is_group ? { text: "-", cls: "" } : fmt_float(data.cpc_free_float);
		const total_float = is_group ? { text: "-", cls: "" } : fmt_float(data.cpc_total_float);

		const display_amount = data.cpc_budget_amount || data.rollup_budget_amount;
		const display_qty = data.cpc_budget_qty || data.rollup_budget_qty;

		const values = {
			status: status_html,
			progress: progress_html,
			exp_start_date: fmt_date(data.exp_start_date),
			exp_end_date: fmt_date(data.exp_end_date),
			cpc_uom: uom_html,
			cpc_budget_qty: fmt_qty(display_qty),
			cpc_budget_amount: `<span class="${is_group ? 'cpc-group-val' : ''}">${fmt_amount(display_amount)}</span>`,
			cpc_total_float: `<span class="${total_float.cls}">${total_float.text}</span>`,
			cpc_free_float: `<span class="${free_float.cls}">${free_float.text}</span>`,
		};

		const info_html = cols
			.map(
				(c, i) => `
				<span class="cpc-tree-column cpc-col-${i}">
					<span class="cpc-col-value">${values[c.key]}</span>
				</span>
			`
			)
			.join("");

		node.$tree_link.children(".cpc-task-info").remove();
		node.$tree_link.append(`<span class="cpc-task-info">${info_html}</span>`);
	},

	show_activity_inspector: function (task_name) {
		if (!task_name) return;

		frappe.call({
			method: CPC_TASK_TREE_MODULE + ".get_task_details",
			args: { task_name: task_name },
			callback: function (r) {
				if (!r.message) return;
				const res = r.message;
				const t = res.task;
				const evm = res.evm || {};

				const fmt = (v) => v || "-";
				const fmt_curr = (v) => v ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";

				const dialog = new frappe.ui.Dialog({
					title: `<span style="font-weight:700;">${t.subject || t.name}</span> <span class="text-muted">(${t.name})</span>`,
					fields: [
						{
							fieldname: "details_html",
							fieldtype: "HTML",
						}
					],
					primary_action_label: __("Open Full Form"),
					primary_action: function () {
						frappe.set_route("Form", "Task", t.name);
					}
				});

				const predecessors_html = (res.predecessors && res.predecessors.length)
					? res.predecessors.map(p => `<li><b>${p.name}</b>: ${p.subject} (${p.status}, End: ${p.exp_end_date || '-'})</li>`).join("")
					: `<span class="text-muted">${__('No Predecessors')}</span>`;

				const successors_html = (res.successors && res.successors.length)
					? res.successors.map(s => `<li><b>${s.name}</b>: ${s.subject} (${s.status}, Start: ${s.exp_start_date || '-'})</li>`).join("")
					: `<span class="text-muted">${__('No Successors')}</span>`;

				const emp_html = (res.assigned_employees && res.assigned_employees.length)
					? res.assigned_employees.join(", ")
					: `<span class="text-muted">${__('None')}</span>`;

				const html = `
					<div class="cpc-modal-grid">
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Status & Progress')}</div>
							<div class="cpc-modal-value">${t.status} · ${t.progress || 0}%</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Node Type / BOQ Code')}</div>
							<div class="cpc-modal-value">${fmt(t.cpc_node_type)} ${t.cpc_boq_code ? '· ' + t.cpc_boq_code : ''}</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Planned Dates & Duration')}</div>
							<div class="cpc-modal-value">${fmt(t.exp_start_date)} to ${fmt(t.exp_end_date)} (${t.duration || 0} days)</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Actual Dates')}</div>
							<div class="cpc-modal-value">${fmt(t.act_start_date)} to ${fmt(t.act_end_date)}</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Budget Quantity & UOM')}</div>
							<div class="cpc-modal-value">${fmt(t.cpc_budget_qty)} ${fmt(t.cpc_uom)}</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Budget Amount')}</div>
							<div class="cpc-modal-value">${fmt_curr(evm.budget_amount)}</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Earned Value (EV)')}</div>
							<div class="cpc-modal-value">${fmt_curr(evm.earned_value)}</div>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Actual Cost (AC)')}</div>
							<div class="cpc-modal-value">${fmt_curr(evm.actual_cost)}</div>
						</div>
					</div>

					<div style="margin-top: 10px;">
						<div class="cpc-modal-label" style="font-weight:700; margin-bottom:4px;">${__('Assigned Employees')}: ${emp_html}</div>
					</div>

					<div style="margin-top: 12px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Predecessors')}</div>
							<ul style="padding-left:15px; margin:4px 0 0 0; font-size:12px;">${predecessors_html}</ul>
						</div>
						<div class="cpc-modal-item">
							<div class="cpc-modal-label">${__('Successors')}</div>
							<ul style="padding-left:15px; margin:4px 0 0 0; font-size:12px;">${successors_html}</ul>
						</div>
					</div>
				`;

				dialog.fields_dict.details_html.$wrapper.html(html);
				dialog.show();
			}
		});
	},

	toolbar: [
		{
			label: __("Activity Details"),
			click: function (node) {
				frappe.treeview_settings["Task"].show_activity_inspector(node.data.value);
			},
		},
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
							callback: function () { },
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