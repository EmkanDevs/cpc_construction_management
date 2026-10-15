cpc_construction_management.contract_center.Planner = class IRPOPlanner {
	constructor(view) {
		this.view = view;
		this.$root = view.$root;
		this.$modal = this.$root.find("#cc-planner-modal");
		this.tasks = [];
		this.collapsed = new Set();
		this.pending_date_changes = {};
		this.active_contract = null;
		this.active_so = null;
		this._init_tooltip();
		this._bind_modal_events();
	}

	async open(contract_name, sales_order_name = null) {
		this.active_contract = contract_name;
		this.active_so = sales_order_name;
		this.pending_date_changes = {};
		this._show_modal();
		this._set_context_bar("Loading...", "", "");
		await this._populate_filter_dropdowns();
		await this._load();
	}

	async preview_inline(_use_inline = true) {
		// preview_inline() is kept for backwards-compat but is a no-op:
		// the planner now always renders inside the page (position:absolute
		// within .cpc-control-center) and never takes over the full screen.
		frappe.show_alert({ message: __("Planner is now always page-embedded."), indicator: "blue" });
	}

	async _load() {
		this._render_loading();
		try {
			const r = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_planner_data",
				args: {
					cpc_contract: this.$modal.find("[data-planner-filter='contract']").val() || null,
					project: this.$modal.find("[data-planner-filter='project']").val() || null,
					sales_order: this.$modal.find("[data-planner-filter='sales_order']").val() || null,
				},
			});
			this.tasks = r.message || [];
			this._render();
		} catch (err) {
			this._render_error();
			console.error("IRPO Planner load error", err);
		}
	}

	async _populate_filter_dropdowns() {
		const scope = this.active_contract || null;
		try {
			const r = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_planner_filters",
				args: { cpc_contract: scope },
			});
			const data = r.message || {};
			const contract = this.$modal.find("[data-planner-filter='contract']");
			contract.html(
				`<option value="">${__("All Contracts")}</option>` +
				(data.contracts || [])
					.map(
						(c) =>
							`<option value="${frappe.utils.escape_html(c)}">${frappe.utils.escape_html(c)}</option>`
					)
					.join("")
			);
			contract.val(scope && (data.contracts || []).includes(scope) ? scope : "");
			// A contract maps to exactly one project; auto-fill it so the
			// scope bar shows full context when the planner is opened from a row.
			const default_project = scope && (data.projects || []).length ? data.projects[0] : "";
			this._fill_scoped_selects(data, default_project, this.active_so || "");
		} catch (err) {
			console.error("IRPO Planner filter load error", err);
		}
		this._update_context_bar();
	}

	_fill_scoped_selects(data, preselect_project = "", preselect_so = "") {
		const $project = this.$modal.find("[data-planner-filter='project']");
		$project.html(
			`<option value="">${__("All Projects")}</option>` +
			(data.projects || [])
				.map(
					(p) =>
						`<option value="${frappe.utils.escape_html(p)}">${frappe.utils.escape_html(p)}</option>`
				)
				.join("")
		);
		$project.val(
			preselect_project && (data.projects || []).includes(preselect_project)
				? preselect_project
				: ""
		);
		const $sales_orders = this.$modal.find("[data-planner-filter='sales_order']");
		$sales_orders.html(
			`<option value="">${__("All Sales Orders")}</option>` +
			(data.sales_orders || [])
				.map(
					(so) =>
						`<option value="${frappe.utils.escape_html(so.name)}"` +
						` data-contract="${frappe.utils.escape_html(so.cpc_contract || "")}">` +
						`${frappe.utils.escape_html(so.name)}` +
						(so.cpc_contract ? ` \u2022 ${frappe.utils.escape_html(so.cpc_contract)}` : "") +
						"</option>"
				)
				.join("")
		);
		$sales_orders.val(
			preselect_so && (data.sales_orders || []).some((so) => so.name === preselect_so)
				? preselect_so
				: ""
		);
	}

	_update_context_bar() {
		const contract = this.$modal.find("[data-planner-filter='contract']").val() || this.active_contract || "";
		const project = this.$modal.find("[data-planner-filter='project']").val() || "";
		const so = this.$modal.find("[data-planner-filter='sales_order']").val() || this.active_so || "";
		this._set_context_bar(contract, project, so);
	}

	_set_context_bar(contract, project, so) {
		this.$modal.find("[data-planner-context]").text([contract, project, so].filter(Boolean).join(" \u2022 "));
	}

	_render() {
		const tasks = this._apply_sort(this.tasks);
		this._update_context_bar();
		this._render_wbs(tasks);
		this._render_timeline(tasks);
	}

	_apply_sort(tasks) {
		const sort_key = this.$modal.find("[data-planner-sort]").val();
		if (!sort_key) return tasks;
		const sorted = [...tasks];
		const compare = (a, b) => {
			let va = this._sort_value(a, sort_key);
			let vb = this._sort_value(b, sort_key);
			if (typeof va === "string") return va.localeCompare(vb);
			return (va || 0) - (vb || 0);
		};
		sorted.sort(compare);
		return sorted;
	}

	_sort_value(task, key) {
		switch (key) {
			case "modified":
			case "creation":
			case "exp_start_date":
			case "exp_end_date":
				return task[key] || "";
			case "subject":
			case "name":
			case "project":
			case "status":
			case "priority":
			case "parent_task":
			case "cpc_node_type":
				return (task[key] || "").toLowerCase();
			case "is_group":
				return task.is_group ? 1 : 0;
			case "most_used":
				return task.modified || task.creation || "";
			case "progress":
				return flt(task.consumed_pct || task.progress || 0);
			case "duration":
				if (task.exp_start_date && task.exp_end_date) {
					const s = frappe.datetime.str_to_obj(task.exp_start_date);
					const e = frappe.datetime.str_to_obj(task.exp_end_date);
					return Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
				}
				return 0;
			default:
				return task[key] || "";
		}
	}

	_render_loading() {
		this.$modal.find("[data-planner-wbs-body]").html(`<tr><td colspan="8" class="planner-empty">${__("Loading...")}</td></tr>`);
		this.$modal.find("[data-planner-timeline-body]").html("");
	}

	_render_error() {
		this.$modal.find("[data-planner-wbs-body]").html(`<tr><td colspan="8" class="planner-empty planner-error">${__("Could not load planner data.")}</td></tr>`);
	}

	_render_wbs(tasks) {
		const boq_nodes = tasks.filter((t) => t.cpc_node_type === "BOQ Node");
		const irpo_map = new Map();
		tasks.filter((t) => t.cpc_node_type === "IRPO").forEach((t) => {
			const ch = irpo_map.get(t.parent_task) || [];
			ch.push(t);
			irpo_map.set(t.parent_task, ch);
		});
		if (!tasks.length) {
			this.$modal.find("[data-planner-wbs-body]").html(`<tr><td colspan="8" class="planner-empty">${__("No IRPO tasks found for this contract.")}</td></tr>`);
			return;
		}
		let html = "";
		for (const node of boq_nodes) html += this._group_row(node, irpo_map);
		tasks
			.filter((t) => t.cpc_node_type === "IRPO" && !boq_nodes.find((n) => n.name === t.parent_task))
			.forEach((irpo) => { html += this._leaf_row(irpo); });
		this.$modal.find("[data-planner-wbs-body]").html(html);
	}

	// Progress cell for the WBS table. Shows a bar + % from the Task's
	// `progress` field; rows without progress render an em dash.
	_progress_cell(pcnt) {
		const p = flt(pcnt || 0);
		const label = +p.toFixed(2);
		return `
		<span class="planner-progress-cell">
			<div class="planner-progress-wrap"><div class="planner-progress-bar" style="width:${p}%"></div></div>
			<span class="planner-pct-label">${label}%</span>
		</span>`;
	}

	// Renders a WBS label as "<subject>" plus a muted "<name>" (task ID) when the
	// subject differs from the ID; otherwise just the ID.
	_label_with_id(subject, name) {
		const esc = (v) => frappe.utils.escape_html(v || "");
		if (subject && subject !== name) {
			return `<span class="planner-name-text" title="${esc(subject)}">${esc(subject)}</span> <small class="planner-id">${esc(name)}</small>`;
		}
		return `<span class="planner-name-text" title="${esc(name)}">${esc(name)}</span>`;
	}

	_group_row(node, irpo_map) {
		const children = irpo_map.get(node.name) || [];
		const is_collapsed = this.collapsed.has(node.name);
		const allocated = flt(node.cpc_boq_budget_allocated);
		const budget = flt(node.cpc_boq_cost_budget);
		const remaining = flt(node.cpc_boq_budget_remaining);
		const progress = flt(node.progress || 0);
		const consumed_of_budget = budget > 0 ? Math.round((allocated / budget) * 100) : 0;
		const chevron = is_collapsed ? "&#9654;" : "&#9660;";
		let html = `
<tr class="planner-group-row" data-node-name="${frappe.utils.escape_html(node.name)}">
	<td class="planner-wbs-label">
		<button class="planner-chevron" data-toggle-node="${frappe.utils.escape_html(node.name)}">${chevron}</button>
		<strong>${this._label_with_id(node.subject, node.name)}</strong>
	</td>
	<td>Lot</td>
	<td class="planner-num">1</td>
	<td class="planner-num">${format_currency(budget, "SAR")}</td>
	<td class="planner-pending">${format_currency(remaining, "SAR")}</td>
	<td class="planner-consumed"><div class="planner-consumed-cell"><span>${format_currency(allocated, "SAR")}</span>${budget > 0 ? `<span class="planner-consumed-pct${consumed_of_budget >= 100 ? " planner-consumed-pct-full" : ""}">${consumed_of_budget}% ${__("allocated")}</span>` : ""}</div></td>
	<td class="planner-progress">${this._progress_cell(progress)}</td>
	<td class="planner-actions"><button class="planner-menu-btn" data-menu-node="${frappe.utils.escape_html(node.name)}">...</button></td>
</tr>`;
		if (!is_collapsed) {
			for (const irpo of children) html += this._leaf_row(irpo);
		}
		return html;
	}

	_leaf_row(irpo) {
		const pct = flt(irpo.consumed_pct || irpo.progress || 0);
		const predecessors = irpo.depends_on_tasks || "";
		const pred_html = predecessors ? `<small class="planner-pred">FS: ${frappe.utils.escape_html(predecessors)}</small>` : "";
		return `
<tr class="planner-leaf-row" data-irpo-name="${frappe.utils.escape_html(irpo.name)}">
	<td class="planner-wbs-label planner-leaf-indent">
		<span class="planner-leaf-icon">&#10003;</span>
		${this._label_with_id(irpo.subject, irpo.name)}
		${pred_html}
	</td>
	<td>${frappe.utils.escape_html(irpo.cpc_uom || "Percent")}</td>
	<td class="planner-num">${flt(irpo.cpc_budget_qty) || "&mdash;"}</td>
	<td class="planner-num">${format_currency(flt(irpo.cpc_budget_amount), "SAR")}</td>
	<td class="planner-pending">&mdash;</td>
	<td class="planner-consumed">&mdash;</td>
	<td class="planner-progress">${this._progress_cell(pct)}</td>
	<td class="planner-actions">
		<button class="planner-eye-btn" data-open-task="${frappe.utils.escape_html(irpo.name)}" title="${__("View")}">&#128065;</button>
	</td>
</tr>`;
	}

	_render_timeline(tasks) {
		const irpos = tasks.filter((t) => t.cpc_node_type === "IRPO");
		const boq_nodes = tasks.filter((t) => t.cpc_node_type === "BOQ Node");
		const all_dates = tasks
			.flatMap((t) => [t.exp_start_date, t.exp_end_date])
			.filter(Boolean)
			.map((d) => frappe.datetime.str_to_obj(d));
		let range_start, range_end;
		if (all_dates.length) {
			range_start = new Date(Math.min(...all_dates));
			range_end = new Date(Math.max(...all_dates));
		} else {
			range_start = frappe.datetime.str_to_obj(frappe.datetime.get_today());
			range_end = new Date(range_start);
			range_end.setDate(range_end.getDate() + 27);
		}
		range_start.setDate(range_start.getDate() - 2);
		range_end.setDate(range_end.getDate() + 14);
		const days = this._date_range(range_start, range_end);
		const date_header = days
			.map((d) => {
				const day = d.getDate();
				const mon = d.toLocaleString("default", { month: "short" });
				const label = day === 1 ? (mon + " " + day) : String(day);
				const is_weekend = d.getDay() === 0 || d.getDay() === 6;
				return `<th class="planner-date-cell${is_weekend ? " planner-weekend" : ""}">${label}</th>`;
			})
			.join("");
		const boq_node_map = new Map(boq_nodes.map((n) => [n.name, n]));
		let body_rows = "";
		for (const node of boq_nodes) {
			const children = irpos.filter((t) => t.parent_task === node.name);
			const is_collapsed = this.collapsed.has(node.name);
			body_rows += this._gantt_group_row(node, children, days);
			if (!is_collapsed) {
				for (const irpo of children) body_rows += this._gantt_row(irpo, days);
			}
		}
		irpos
			.filter((t) => !boq_node_map.has(t.parent_task))
			.forEach((irpo) => { body_rows += this._gantt_row(irpo, days); });
		this.$modal.find("[data-planner-timeline-header]").html(date_header);
		this.$modal.find("[data-planner-timeline-body]").html(
			body_rows || `<tr><td colspan="${days.length}" class="planner-empty">${__("No schedule data.")}</td></tr>`
		);
		// Size the continuous bar divs after the DOM has laid out, then draw arrows.
		requestAnimationFrame(() => {
			this._size_bar_divs();
			this._render_gantt_arrows(boq_nodes, irpos);
		});
	}

	// Sets each .planner-bar-div width so it spans its full date range.
	// Called once after layout; the data-bar-cols attribute stores the count.
	_size_bar_divs() {
		const $body = this.$modal.find("[data-planner-timeline-body]");
		$body.find("[data-bar-start]").each(function () {
			const $td = $(this);
			const cols = parseInt($td.data("bar-cols") || 1, 10);
			const cell_w = $td[0].getBoundingClientRect().width;
			$td.find(".planner-bar-div").css("width", (cell_w * cols - 6) + "px");
		});
	}

	// ── Gantt arrows ─────────────────────────────────────────────────────────
	// Draws two sets of SVG connectors on a single overlay positioned over the
	// timeline scroll area:
	//
	//  1. Parent → children fan-out  (new)
	//     A vertical stem drops from the bottom-centre of every BOQ Node group
	//     bar, then horizontal branches fan out with arrowheads to the left-
	//     middle of each visible child IRPO bar.  Uses a softer stroke so it
	//     reads as "hierarchy" rather than "dependency".
	//
	//  2. Sibling dependency chain  (existing, kept intact)
	//     Rounded-elbow arrows between sequential IRPO siblings.
	//
		_render_gantt_arrows(boq_nodes, irpos) {
		const $body = this.$modal.find("[data-planner-timeline-body]");
		const $table = $body.closest(".planner-timeline-table");
		if (!$table.length) return;
		const $scroll = $table.closest(".planner-timeline-scroll");
		$scroll.find(".planner-deps-svg").remove();

		const table_el = $table[0];
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "planner-deps-svg");
		svg.setAttribute("width", table_el.scrollWidth);
		svg.setAttribute("height", table_el.scrollHeight);
		svg.style.width = table_el.scrollWidth + "px";
		svg.style.height = table_el.scrollHeight + "px";
		svg.style.overflow = "visible";
		$scroll.append(svg);

		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const make_marker = (id, fill) => {
			const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
			marker.setAttribute("id", id);
			marker.setAttribute("markerWidth", "6");
			marker.setAttribute("markerHeight", "6");
			marker.setAttribute("refX", "5");
			marker.setAttribute("refY", "3");
			marker.setAttribute("orient", "auto");
			const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
			arrow.setAttribute("d", "M0,0 L6,3 L0,6 Z");
			arrow.setAttribute("fill", fill);
			arrow.setAttribute("stroke", "none");
			marker.appendChild(arrow);
			return marker;
		};
		defs.appendChild(make_marker("planner-arrowhead", "#64748b"));
		defs.appendChild(make_marker("planner-arrowhead-fan", "#94a3b8"));
		svg.appendChild(defs);

		const make_path = (d, stroke, width, marker_id) => {
			const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
			p.setAttribute("d", d);
			p.setAttribute("fill", "none");
			p.setAttribute("stroke", stroke);
			p.setAttribute("stroke-width", width);
			p.setAttribute("stroke-linecap", "round");
			p.setAttribute("stroke-linejoin", "round");
			if (marker_id) p.setAttribute("marker-end", `url(#${marker_id})`);
			return p;
		};

		requestAnimationFrame(() => {
			const svg_rect = svg.getBoundingClientRect();

			// ── 1. Parent → children arrows ──────────────────────────
			// Start at the parent bar's left edge, go left into a gutter,
			// run down, then turn right into each child's left edge.
			const GUTTER = 10;
			const CORNER = 5;

			for (const node of boq_nodes) {
				if (this.collapsed.has(node.name)) continue;

				const $group_row = $body.find(`[data-boq-tl="${node.name}"]`);
				if (!$group_row.length) continue;
				const $group_bar = $group_row.find(".planner-bar-div");
				if (!$group_bar.length) continue;

				const gb = $group_bar[0].getBoundingClientRect();
				if (!gb.width) continue;

				const px = gb.left - svg_rect.left;
				const py = gb.top + gb.height / 2 - svg_rect.top;

				const child_pts = [];
				for (const child of irpos.filter((t) => t.parent_task === node.name)) {
					const $cbar = $body.find(`[data-irpo-tl="${child.name}"]`).find(".planner-bar-div");
					if (!$cbar.length) continue;
					const cb = $cbar[0].getBoundingClientRect();
					if (!cb.width) continue;
					child_pts.push({
						x: cb.left - svg_rect.left,
						y: cb.top + cb.height / 2 - svg_rect.top,
					});
				}
				if (!child_pts.length) continue;

				const tx = Math.min(px, ...child_pts.map((p) => p.x)) - GUTTER;

				for (const { x: bx, y: by } of child_pts) {
					const r = Math.max(0, Math.min(CORNER, (bx - tx) / 2, (by - py) / 2));
					const d = [
						`M ${px} ${py}`,
						`H ${tx + r}`,
						`Q ${tx} ${py} ${tx} ${py + r}`,
						`V ${by - r}`,
						`Q ${tx} ${by} ${tx + r} ${by}`,
						`H ${bx}`,
					].join(" ");
					svg.appendChild(make_path(d, "#94a3b8", "1.5", "planner-arrowhead-fan"));
				}
			}

			// ── 2. Sibling dependency arrows (only for real "depends on") ──
			const groups = new Map();
			irpos.forEach((t) => {
				if (!t.parent_task) return;
				if (!groups.has(t.parent_task)) groups.set(t.parent_task, []);
				groups.get(t.parent_task).push(t);
			});

			const deps_map = new Map();
			for (const group of groups.values()) {
				const by_name = new Set(group.map((t) => t.name));
				group.forEach((t) => {
					const pred = (t.depends_on_tasks || "")
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
						.find((name) => by_name.has(name) && name !== t.name);
					if (pred) deps_map.set(t.name, pred);
				});
			}

			const R = 6;
			for (const [child_name, parent_name] of deps_map) {
				const $pbar = $body.find(`[data-irpo-tl="${parent_name}"]`).find(".planner-bar-div");
				const $cbar = $body.find(`[data-irpo-tl="${child_name}"]`).find(".planner-bar-div");
				if (!$pbar.length || !$cbar.length) continue;

				const pb = $pbar[0].getBoundingClientRect();
				const cb = $cbar[0].getBoundingClientRect();

				const x1 = pb.right - svg_rect.left;
				const y1 = pb.top + pb.height / 2 - svg_rect.top;
				const x2 = cb.left - svg_rect.left;
				const y2 = cb.top + cb.height / 2 - svg_rect.top;

				const mid_x = Math.max(x1 + 14, x2 - 14);
				const ry = y2 > y1 ? R : -R;

				const d = [
					`M ${x1} ${y1}`,
					`H ${mid_x - R}`,
					`Q ${mid_x} ${y1} ${mid_x} ${y1 + ry}`,
					`V ${y2 - ry}`,
					`Q ${mid_x} ${y2} ${mid_x + R} ${y2}`,
					`H ${x2}`,
				].join(" ");
				svg.appendChild(make_path(d, "#64748b", "1.5", "planner-arrowhead"));
			}
		});
	}


	_gantt_row(irpo, days) {
		const start_obj = irpo.exp_start_date ? frappe.datetime.str_to_obj(irpo.exp_start_date) : null;
		const end_obj = irpo.exp_end_date ? frappe.datetime.str_to_obj(irpo.exp_end_date) : null;
		const label = frappe.utils.escape_html(irpo.subject || irpo.name);
		const pct = flt(irpo.consumed_pct || irpo.progress || 0);
		const bar_style = irpo.color
			? ` style="background:${frappe.utils.escape_html(irpo.color)};box-shadow:0 1px 3px ${frappe.utils.escape_html(irpo.color)}80"`
			: "";
		let bar_start_idx = -1;
		let bar_span = 0;
		days.forEach((day, i) => {
			const in_range = start_obj && end_obj && day >= start_obj && day <= end_obj;
			if (in_range) {
				if (bar_start_idx === -1) bar_start_idx = i;
				bar_span++;
			}
		});
		// Tooltip data attributes — all HTML-escaped and stored on the bar div.
		const tt_start = irpo.exp_start_date || "";
		const tt_end   = irpo.exp_end_date   || "";
		const tt_pct   = pct;
		const cells = days
			.map((day, i) => {
				const is_bar_start = i === bar_start_idx;
				const is_weekend = day.getDay() === 0 || day.getDay() === 6;
				const base_cls = is_weekend ? "planner-gantt-cell planner-gantt-weekend" : "planner-gantt-cell";
				if (is_bar_start && bar_span > 0) {
					// The bar is a single div spanning bar_span cells via JS-computed width.
					// We store the span count as a data attribute so post-render JS can
					// compute the exact pixel width after layout.
					return `<td class="${base_cls} planner-gantt-start" data-bar-start data-bar-cols="${bar_span}">` +
						`<div class="planner-bar-div"${bar_style}` +
						` data-tt-title="${label}"` +
						` data-tt-start="${frappe.utils.escape_html(tt_start)}"` +
						` data-tt-end="${frappe.utils.escape_html(tt_end)}"` +
						` data-tt-pct="${tt_pct}"` +
						`><span class="planner-bar-label">${label}</span></div></td>`;
				}
				return `<td class="${base_cls}"></td>`;
			})
			.join("");
		return `<tr class="planner-tl-leaf-row" data-irpo-tl="${frappe.utils.escape_html(irpo.name)}">${cells}</tr>`;
	}

	// Renders a BOQ Node group row as a date-spanning bar in the timeline.
	// Uses node.color when set; falls back to the default grey CSS rule.
	// Start and end are derived from the earliest/latest dates among children.
	_gantt_group_row(node, children, days) {
		const label = frappe.utils.escape_html(node.subject || node.name);
		// Apply color inline when set — mirrors _gantt_row for leaf bars.
		const bar_style = node.color
			? ` style="background:${frappe.utils.escape_html(node.color)};box-shadow:0 1px 3px ${frappe.utils.escape_html(node.color)}80"`
			: "";

		// Compute bar span from children's date range.
		const child_starts = children.map((c) => c.exp_start_date).filter(Boolean);
		const child_ends   = children.map((c) => c.exp_end_date).filter(Boolean);
		const bar_start_date = child_starts.length
			? child_starts.reduce((a, b) => (a < b ? a : b))
			: null;
		const bar_end_date = child_ends.length
			? child_ends.reduce((a, b) => (a > b ? a : b))
			: null;
		const start_obj = bar_start_date ? frappe.datetime.str_to_obj(bar_start_date) : null;
		const end_obj   = bar_end_date   ? frappe.datetime.str_to_obj(bar_end_date)   : null;

		let bar_start_idx = -1;
		let bar_span = 0;
		days.forEach((day, i) => {
			const in_range = start_obj && end_obj && day >= start_obj && day <= end_obj;
			if (in_range) {
				if (bar_start_idx === -1) bar_start_idx = i;
				bar_span++;
			}
		});

		// Average progress across children.
		const avg_pct = children.length
			? Math.round(children.reduce((s, c) => s + flt(c.consumed_pct || c.progress || 0), 0) / children.length)
			: 0;

		const cells = days
			.map((day, i) => {
				const is_bar_start = i === bar_start_idx;
				const is_weekend = day.getDay() === 0 || day.getDay() === 6;
				const base_cls = is_weekend ? "planner-gantt-cell planner-gantt-weekend" : "planner-gantt-cell";
				if (is_bar_start && bar_span > 0) {
					return `<td class="${base_cls} planner-gantt-start" data-bar-start data-bar-cols="${bar_span}">` +
						`<div class="planner-bar-div planner-bar-div--group"${bar_style}` +
						` data-tt-title="${label}"` +
						` data-tt-start="${frappe.utils.escape_html(bar_start_date || "")}"` +
						` data-tt-end="${frappe.utils.escape_html(bar_end_date || "")}"` +
						` data-tt-pct="${avg_pct}"` +
						`><span class="planner-bar-label">${label}</span></div></td>`;
				}
				return `<td class="${base_cls}"></td>`;
			})
			.join("");
		// The <tr> carries data-boq-tl so the arrow renderer can find this row's bar.
		return `<tr class="planner-tl-group-row" data-boq-tl="${frappe.utils.escape_html(node.name)}">${cells}</tr>`;
	}


	expand_all() {
		this.collapsed.clear();
		this._render();
	}

	collapse_all() {
		this.tasks.filter((t) => t.cpc_node_type === "BOQ Node").forEach((t) => this.collapsed.add(t.name));
		this._render();
	}

	_toggle_node(name) {
		if (this.collapsed.has(name)) {
			this.collapsed.delete(name);
		} else {
			this.collapsed.add(name);
		}
		this._render();
	}

	async save_plan() {
		const payload = Object.entries(this.pending_date_changes).map(([name, dates]) => ({ name, ...dates }));
		if (!payload.length) {
			frappe.show_alert({ message: __("No date changes to save."), indicator: "blue" });
			return;
		}
		const $btn = this.$modal.find("[data-planner-save]");
		$btn.prop("disabled", true).text(__("Saving..."));
		try {
			await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_planner_dates",
				args: { tasks_json: JSON.stringify(payload) },
			});
			this.pending_date_changes = {};
			frappe.show_alert({ message: __("Plan saved."), indicator: "green" });
		} catch (err) {
			frappe.show_alert({ message: __("Could not save plan."), indicator: "red" });
		} finally {
			$btn.prop("disabled", false).text(__("Save Plan"));
		}
	}

	_show_modal() {
		this.$modal.removeClass("hide").attr("aria-hidden", "false");
	}

	close() {
		this.$modal.addClass("hide").attr("aria-hidden", "true");
	}

	// Creates the shared floating tooltip element for Gantt bar hovers.
	_init_tooltip() {
		this.$tooltip = $(`
			<div class="planner-bar-tooltip hide">
				<div class="pbt-title"></div>
				<div class="pbt-row">
					<span class="pbt-icon">📅</span>
					<span class="pbt-dates"></span>
				</div>
				<div class="pbt-row">
					<span class="pbt-icon">📊</span>
					<span class="pbt-progress"></span>
				</div>
				<div class="pbt-progress-track">
					<div class="pbt-progress-fill"></div>
				</div>
			</div>
		`).appendTo(document.body);
	}

	// Positions the tooltip near the cursor, clamped inside the viewport.
	_position_tooltip(e) {
		const tt = this.$tooltip[0];
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let x = e.clientX + 14;
		let y = e.clientY - 10;
		// Flip left if too close to right edge
		if (x + tt.offsetWidth + 10 > vw) x = e.clientX - tt.offsetWidth - 10;
		// Flip below if too close to top edge
		if (y - tt.offsetHeight < 8) y = e.clientY + 20;
		this.$tooltip.css({ left: x, top: y });
	}

	_bind_modal_events() {
		const $m = this.$modal;
		$m.on("click", "[data-planner-close]", () => this.close());
		$(document).on("keydown.planner", (e) => {
			if (e.key === "Escape" && !$m.hasClass("hide")) this.close();
		});
		// Keep the WBS table and the Gantt timeline scrolled to the same
		// vertical offset so their rows stay aligned.
		const $wbs_scroll = $m.find(".planner-wbs-scroll");
		const $tl_scroll = $m.find(".planner-timeline-scroll");
		let syncing_scroll = false;
		const sync_vertical_scroll = (src) => {
			if (syncing_scroll) return;
			syncing_scroll = true;
			$wbs_scroll.scrollTop(src.scrollTop());
			$tl_scroll.scrollTop(src.scrollTop());
			syncing_scroll = false;
		};
		$wbs_scroll.on("scroll", () => sync_vertical_scroll($wbs_scroll));
		$tl_scroll.on("scroll", () => sync_vertical_scroll($tl_scroll));
		$m.on("click", "[data-planner-expand-all]", () => this.expand_all());
		$m.on("click", "[data-planner-collapse-all]", () => this.collapse_all());
		$m.on("click", "[data-toggle-node]", (e) => {
			this._toggle_node($(e.currentTarget).data("toggle-node"));
		});
		$m.on("change", "[data-planner-filter]", async (e) => {
			const $target = $(e.currentTarget);
			if ($target.is("[data-planner-filter='contract']")) {
				const scope = $target.val() || null;
				const keep_project = this.$modal.find("[data-planner-filter='project']").val();
				const keep_so = this.$modal.find("[data-planner-filter='sales_order']").val();
				try {
					const r = await frappe.call({
						method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_planner_filters",
						args: { cpc_contract: scope },
					});
					const data = r.message || {};
					const fallback_project = (data.projects || [])[0] || "";
					const project =
						keep_project && (data.projects || []).includes(keep_project)
							? keep_project
							: fallback_project;
					this._fill_scoped_selects(data, project, keep_so);
				} catch (err) {
					console.warn("IRPO Planner filter load error", err);
				}
			}
			this._update_context_bar();
			await this._load();
		});
		$m.on("change", "[data-planner-sort]", () => this._render());
		$m.on("click", "[data-planner-save]", () => this.save_plan());
		$m.on("click", "[data-open-task]", (e) => {
			this.view.irpo_viewer.open($(e.currentTarget).data("open-task"));
		});
		// Gantt bar hover tooltip
		$m.on("mouseenter", ".planner-bar-div", (e) => {
			const $bar = $(e.currentTarget);
			const title  = $bar.data("tt-title") || "";
			const start  = $bar.data("tt-start") || "";
			const end    = $bar.data("tt-end")   || "";
			const pct    = parseFloat($bar.data("tt-pct") || 0);
			const dates  = (start && end) ? `${start} → ${end}` : start || end || __("No dates set");
			this.$tooltip.find(".pbt-title").text(title);
			this.$tooltip.find(".pbt-dates").text(dates);
			this.$tooltip.find(".pbt-progress").text(`${pct}% ${__("Completed")}`);
			this.$tooltip.find(".pbt-progress-fill").css("width", Math.min(pct, 100) + "%");
			this.$tooltip.removeClass("hide");
			this._position_tooltip(e);
		});
		$m.on("mousemove", ".planner-bar-div", (e) => this._position_tooltip(e));
		$m.on("mouseleave", ".planner-bar-div", () => this.$tooltip.addClass("hide"));
		// "Break IRPO" button (topbar) opens the dialog with no pre-selection
		$m.on("click", "[data-planner-break-irpo]", () => this._open_break_irpo_dialog());
		// "..." menu button on a Group RPO row opens the dialog pre-selected on that node
		$m.on("click", "[data-menu-node]", (e) => {
			const node_name = $(e.currentTarget).data("menu-node");
			this._open_break_irpo_dialog(node_name);
		});
		// Break IRPO dialog events (modal sits at root level)
		const $r = this.$root;
		$r.on("click", "[data-close-break-irpo]", () => this._close_break_irpo_dialog());
		$r.on("click", "[data-break-add-row]", () => this._add_break_irpo_row());
		$r.on("input change", "[data-break-boq-select]", () => this._on_boq_select_change());
		$r.on("input", "[data-break-irpo-rows] input[data-irpo-field='budget_amount']",
			() => this._update_break_budget_summary());
		$r.on("click", "[data-break-fetch-prev]", () => this._fetch_previous_irpos());
		$r.on("click", "[data-break-save]", () => this._save_break_irpo());
		$r.on("click", "[data-break-download]", () => this._download_break_irpo_rows());
		$r.on("click", "[data-break-upload]", () => this._upload_break_irpo_rows());
		$r.on("click", "[data-break-remove-row]", (e) => {
			$(e.currentTarget).closest("tr").remove();
			this._update_break_budget_summary();
		});
		// "Add Contract" button inside the planner opens the contract modal
		// and, on success, creates BOQ Node Tasks then reloads the planner.
		$m.on("click", "[data-action='add-contract']", (e) => {
			e.stopPropagation();
			this.view.dialogs._planner_add_contract_callback = async (contract_name) => {
				try {
					await frappe.call({
						method: "cpc_construction_management.cpc_construction_management.doc_events.task.create_boq_nodes_for_contract",
						args: { contract_name },
					});
				} catch (err) {
					console.warn("Could not create BOQ Node tasks:", err);
				}
				this.open(contract_name);
			};
			this.view.dialogs.open_contract();
		});
	}

	// ---- Break IRPO dialog ----

	_open_break_irpo_dialog(preselect_name = null) {
		const $dlg = this.$root.find("#cc-break-irpo-modal");
		const boq_nodes = this.tasks.filter((t) => t.cpc_node_type === "BOQ Node");
		if (!boq_nodes.length) {
			frappe.show_alert({ message: __("No BOQ Group Nodes found. Add a contract with BOQ lines first."), indicator: "orange" });
			return;
		}
		$dlg.find("[data-break-boq-select]").html(
			boq_nodes.map((n) =>
				`<option value="${frappe.utils.escape_html(n.name)}"
					data-budget="${flt(n.cpc_boq_cost_budget)}"
					data-allocated="${flt(n.cpc_boq_budget_allocated)}"
					data-color="${frappe.utils.escape_html(n.color || "")}">
					${frappe.utils.escape_html(n.subject || n.name)}
				</option>`
			).join("")
		);
		// Pre-select the node that was clicked (row ... menu), if supplied
		if (preselect_name) {
			$dlg.find("[data-break-boq-select]").val(preselect_name);
		}
		$dlg.find("[data-break-irpo-rows]").empty();
		// Reset to create mode every time the dialog opens fresh
		this._set_break_irpo_mode("create");
		this._on_boq_select_change();
		this._add_break_irpo_row();
		$dlg.removeClass("hide").attr("aria-hidden", "false");
	}

	// Fetch existing Leaf IRPO tasks for the currently selected BOQ node
	// and repopulate the dialog table so the user can edit them in-place.
	async _fetch_previous_irpos() {
		const $dlg = this.$root.find("#cc-break-irpo-modal");
		const boq_node_name = $dlg.find("[data-break-boq-select]").val();
		if (!boq_node_name) {
			return frappe.show_alert({ message: __("Select a BOQ Line first."), indicator: "orange" });
		}
		const $btn = $dlg.find("[data-break-fetch-prev]");
		$btn.prop("disabled", true);
		try {
			const r = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.get_irpos_for_boq_node",
				args: { boq_node_name },
			});
			const irpos = r.message || [];
			if (!irpos.length) {
				frappe.show_alert({ message: __("No previous IRPO tasks found for this BOQ line."), indicator: "blue" });
				return;
			}
			// Clear existing rows and fill with fetched task data
			$dlg.find("[data-break-irpo-rows]").empty();
			for (const irpo of irpos) {
				this._add_break_irpo_row(irpo);
			}
			// Switch to update mode: "Update IRPO Tasks" button, no budget block
			this._set_break_irpo_mode("update");
			this._update_break_budget_summary();
			frappe.show_alert({ message: __("{0} IRPO task(s) loaded.", [irpos.length]), indicator: "green" });
		} catch (err) {
			frappe.show_alert({ message: __("Could not fetch previous IRPO tasks."), indicator: "red" });
		} finally {
			$btn.prop("disabled", false);
		}
	}

	// Switch between create mode ("Save IRPO Tasks") and update mode ("Update IRPO Tasks").
	// Update mode also lifts the remaining-budget validation block.
	_set_break_irpo_mode(mode) {
		this._break_irpo_mode = mode;
		const $dlg = this.$root.find("#cc-break-irpo-modal");
		const label = mode === "update" ? __("Update IRPO Tasks") : __("Save IRPO Tasks");
		$dlg.find("[data-break-save]").text(label).prop("disabled", false);
	}

	_close_break_irpo_dialog() {
		this.$root.find("#cc-break-irpo-modal").addClass("hide").attr("aria-hidden", "true");
		this._break_irpo_mode = "create";
	}

	_on_boq_select_change() {
		// Sync header color picker to the selected BOQ node's stored color
		const $dlg = this.$root.find("#cc-break-irpo-modal");
		const $opt = $dlg.find("[data-break-boq-select] option:selected");
		const node_color = $opt.data("color") || "#2490ef";
		$dlg.find("[data-break-header-color]").val(node_color);
		// Reset to create mode whenever a different BOQ line is selected
		this._set_break_irpo_mode("create");
		this._update_break_budget_summary();
	}

	_add_break_irpo_row(prefill = null) {
		const today = frappe.datetime.get_today();
		// Default color from the header color picker; prefilled rows use their stored color
		const header_color = this.$root.find("[data-break-header-color]").val() || "#2490ef";
		const color = prefill ? (prefill.color || header_color) : header_color;
		const task_name = prefill ? (prefill.name || "") : "";
		const $row = $(`
			<tr${task_name ? ` data-task-name="${frappe.utils.escape_html(task_name)}"` : ""}>
				<td><input class="cc-cell-input" data-irpo-field="subject" placeholder="${__("Subject")}" value="${frappe.utils.escape_html((prefill && prefill.subject) || "")}" /></td>
				<td data-irpo-field="uom" class="cc-break-uom-cell"></td>
				<td><input class="cc-cell-input" type="date" data-irpo-field="exp_start_date" value="${(prefill && prefill.exp_start_date) || today}" /></td>
				<td><input class="cc-cell-input" type="date" data-irpo-field="exp_end_date" value="${(prefill && prefill.exp_end_date) || today}" /></td>
				<td data-irpo-field="account" class="cc-break-account-cell"></td>
				<td><input class="cc-cell-input cc-number" type="number" min="0" value="${(prefill && flt(prefill.cpc_budget_qty)) || 1}" data-irpo-field="budget_qty" /></td>
				<td><input class="cc-cell-input cc-number" type="number" min="0" value="${(prefill && flt(prefill.cpc_budget_amount)) || 0}" data-irpo-field="budget_amount" /></td>
				<td><input class="cc-color-input" type="color" data-irpo-field="color" value="${frappe.utils.escape_html(color)}" /></td>
				<td><button class="cc-row-remove" data-break-remove-row aria-label="${__("Remove")}">×</button></td>
			</tr>`);
		const uom_control = frappe.ui.form.make_control({
			parent: $row.find("td[data-irpo-field='uom']"),
			df: {
				fieldname: "uom",
				fieldtype: "Link",
				options: "UOM",
				label: __("UOM"),
				placeholder: __("UOM"),
			},
			render_input: true,
			only_input: true,
		});
		uom_control.set_value((prefill && prefill.cpc_uom) || "");
		$row.data("uom-control", uom_control);
		const account_control = frappe.ui.form.make_control({
			parent: $row.find("td[data-irpo-field='account']"),
			df: {
				fieldname: "account",
				fieldtype: "Link",
				options: "Account",
				label: __("Account"),
				placeholder: __("Account"),
			},
			render_input: true,
			only_input: true,
		});
		if (prefill && prefill.account) account_control.set_value(prefill.account);
		$row.data("account-control", account_control);
		this.$root.find("[data-break-irpo-rows]").append($row);
		this._update_break_budget_summary();
	}

	async _save_break_irpo() {
		const $dlg = this.$root.find("#cc-break-irpo-modal");
		const boq_node_name = $dlg.find("[data-break-boq-select]").val();
		if (!boq_node_name) {
			return frappe.show_alert({ message: __("Select a BOQ Line first."), indicator: "orange" });
		}
		const rows = [];
		let valid = true;
		$dlg.find("[data-break-irpo-rows] tr").each((_, tr) => {
			const val = (field) => $(tr).find(`[data-irpo-field='${field}']`).val();
			if (!val("subject")) { valid = false; return; }
			const uom_control = $(tr).data("uom-control");
			const account_control = $(tr).data("account-control");
			rows.push({
				name: $(tr).data("task-name") || null,
				subject: val("subject"),
				cpc_uom: uom_control ? (uom_control.get_value() || "Percent") : "Percent",
				exp_start_date: val("exp_start_date") || null,
				exp_end_date: val("exp_end_date") || null,
				account: account_control ? account_control.get_value() : "",
				cpc_budget_qty: flt(val("budget_qty")),
				cpc_budget_amount: flt(val("budget_amount")),
				color: val("color") || "",
			});
		});
		if (!valid || !rows.length) {
			return frappe.msgprint(__("Every row needs a Subject."));
		}
		const $btn = $dlg.find("[data-break-save]");
		$btn.prop("disabled", true).text(__("Saving\u2026"));
		try {
			const boq_node_color = $dlg.find("[data-break-header-color]").val() || "";
			await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.save_irpo_tasks",
				args: { boq_node_name, irpos_json: JSON.stringify(rows), boq_node_color },
			});
			this._close_break_irpo_dialog();
			const is_update = this._break_irpo_mode === "update";
			frappe.show_alert({ message: is_update ? __("IRPO Tasks updated.") : __("IRPO Tasks saved."), indicator: "green" });
			await this._load();
		} catch (err) {
			frappe.show_alert({ message: __("Could not save IRPO tasks."), indicator: "red" });
		} finally {
			const label = this._break_irpo_mode === "update" ? __("Update IRPO Tasks") : __("Save IRPO Tasks");
			$btn.prop("disabled", false).text(label);
		}
	}

	_update_break_budget_summary() {
		const $dlg = this.$root.find("#cc-break-irpo-modal");
		const $opt = $dlg.find("[data-break-boq-select] option:selected");
		const boq_budget = flt($opt.data("budget"));
		const allocated = flt($opt.data("allocated"));
		let new_total = 0;
		$dlg.find("[data-irpo-field='budget_amount']").each((_, el) => { new_total += flt($(el).val()); });
		const remaining = boq_budget - allocated - new_total;
		const overrun = remaining < 0 ? -remaining : 0;
		const remaining_str =
			`${__("Remaining")}: <span class="${remaining < 0 ? "cc-break-summary-over" : ""}">${format_currency(remaining, "SAR")}</span>`;
		const overrun_str = overrun > 0
			? `<span class="cc-break-summary-over">${__("Exceeds BOQ Budget")}</span>`
			: "";
		$dlg.find("[data-break-budget-summary]").html(
			`${__("BOQ Cost Budget")}: ${format_currency(boq_budget, "SAR")} | ` +
			`${__("Already Allocated (existing IRPOs)")}: ${format_currency(allocated, "SAR")} | ` +
			`${__("Net Change (This Dialog)")}: ${format_currency(new_total, "SAR")} | ` +
			remaining_str +
			(overrun_str ? ` ${overrun_str}` : "")
		);
		// In update mode the remaining-budget block is lifted so edits always save
		if (this._break_irpo_mode !== "update") {
			$dlg.find("[data-break-save]").prop("disabled", remaining < 0);
		}
	}

	// Collect the current dialog rows into plain data objects.
	_collect_break_rows() {
		const rows = [];
		this.$root.find("[data-break-irpo-rows] tr").each((_, tr) => {
			const $tr = $(tr);
			const val = (f) => $tr.find(`[data-irpo-field='${f}']`).val();
			const uom_control = $tr.data("uom-control");
			const account_control = $tr.data("account-control");
			rows.push({
				subject: val("subject"),
				cpc_uom: uom_control ? (uom_control.get_value() || "Percent") : "Percent",
				exp_start_date: val("exp_start_date") || "",
				exp_end_date: val("exp_end_date") || "",
				account: account_control ? account_control.get_value() : "",
				cpc_budget_qty: val("budget_qty"),
				cpc_budget_amount: val("budget_amount"),
				color: val("color") || "",
			});
		});
		return rows;
	}

	// Build an .xlsx from the dialog rows and trigger a client-side download.
	async _download_break_irpo_rows() {
		const $btn = this.$root.find("[data-break-download]");
		$btn.prop("disabled", true);
		try {
			const resp = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.doc_events.task.cpc_make_irpo_import_workbook",
				args: { rows_json: JSON.stringify(this._collect_break_rows()) },
			});
			const { b64, filename } = resp.message || {};
			if (!b64) throw new Error("empty workbook");
			const binary = atob(b64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename || "IRPO_Tasks.xlsx";
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				URL.revokeObjectURL(url);
				a.remove();
			}, 1000);
		} catch (err) {
			frappe.show_alert({ message: __("Could not create the Excel file."), indicator: "red" });
		} finally {
			$btn.prop("disabled", false);
		}
	}

	// Upload an .xlsx/.xls and append its rows to the dialog table.
	_upload_break_irpo_rows() {
		const $dlg = this.$root.find("#cc-break-irpo-modal");

		// Keep the Frappe FileUploader dialog on top of our custom modal no
		// matter the stacking/z-index of the environment: drop our overlay
		// below bootstrap's modal (1040) while the picker is open and restore
		// it once the picker dialog is dismissed.
		$dlg.addClass("cc-uploader-open");
		$(document).one("hidden.bs.modal", () => {
			$dlg.removeClass("cc-uploader-open");
		});
		$(document).one("shown.bs.modal", (e) => {
			const $modal = $(e.target);
			if ($modal.hasClass("modal")) {
				$modal.css("z-index", 1400);
				$(".modal-backdrop").css("z-index", 1350);
			}
		});

		new frappe.ui.FileUploader({
			folder: "Home",
			is_private: 1,
			restrictions: { allowed_file_types: [".xlsx", ".xls"] },
			show_file_selector: true,
			on_success: async (file_doc) => {
				try {
					const resp = await frappe.call({
						method: "cpc_construction_management.cpc_construction_management.doc_events.task.cpc_parse_irpo_import_file",
						args: { file_url: file_doc.file_url },
					});
					const imported = resp.message || [];
					if (!imported.length) {
						frappe.show_alert({ message: __("No data rows found in the file."), indicator: "orange" });
						return;
					}
					imported.forEach((r) => {
						this._add_break_irpo_row();
						const $tr = $dlg.find("[data-break-irpo-rows] tr").last();
						$tr.find("[data-irpo-field='subject']").val(r.subject || "");
						if (r.exp_start_date) $tr.find("[data-irpo-field='exp_start_date']").val(r.exp_start_date);
						if (r.exp_end_date) $tr.find("[data-irpo-field='exp_end_date']").val(r.exp_end_date);
						if (r.cpc_budget_qty !== null && r.cpc_budget_qty !== undefined) {
							$tr.find("[data-irpo-field='budget_qty']").val(r.cpc_budget_qty);
						}
						if (r.cpc_budget_amount !== null && r.cpc_budget_amount !== undefined) {
							$tr.find("[data-irpo-field='budget_amount']").val(r.cpc_budget_amount);
						}
						if (r.color) $tr.find("[data-irpo-field='color']").val(r.color);
						const uom_control = $tr.data("uom-control");
						if (uom_control && r.uom) uom_control.set_value(r.uom);
						const account_control = $tr.data("account-control");
						if (account_control && r.account) account_control.set_value(r.account);
					});
					this._update_break_budget_summary();
					frappe.show_alert({ message: `${__("Imported")} ${imported.length} ${__("rows")}.`, indicator: "green" });
				} catch (err) {
					frappe.show_alert({ message: __("Could not read the uploaded file."), indicator: "red" });
				}
			},
		});
	}


	_date_range(start, end) {
		const days = [];
		const cur = new Date(start);
		while (cur <= end) {
			days.push(new Date(cur));
			cur.setDate(cur.getDate() + 1);
		}
		return days;
	}

	_same_day(a, b) {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}
};
