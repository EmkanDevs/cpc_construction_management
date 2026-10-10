// const WP_API = "cpc_construction_management.cpc_construction_management.progress.";
// const WP_SCREENS = WP_API + "screens.";
// const WP_RETURN = "cpc_construction_management.cpc_construction_management.doctype.irpo_progress.irpo_progress.return_for_correction";

// frappe.pages["weekly-progress"].on_page_load = function (wrapper) {
// 	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Weekly Progress"), single_column: true });
// 	new WeeklyProgress(page);
// };

// class WeeklyProgress {
// 	constructor(page) {
// 		this.page = page;
// 		this.rows = [];
// 		this.edited = {};
// 		this.results = [];
// 		this.make_layout();
// 		this.make_filters();
// 		this.set_default_week();
// 	}

// 	// ------------------------------------------------------------ setup
// 	make_filters() {
// 		const reload = () => this.refresh_active();
// 		const $row = this.$main.find(".wp-filters");
// 		const mk = (width, df) => {
// 			const $col = $(`<div class="col-sm-${width}"></div>`).appendTo($row);
// 			return frappe.ui.form.make_control({ parent: $col, df: Object.assign({ change: reload }, df), render_input: true });
// 		};
// 		this.f_project = mk(3, { fieldname: "project", label: __("Project"), fieldtype: "Link", options: "Project" });
// 		this.f_week = mk(2, { fieldname: "calendar_week", label: __("Reporting Week"), fieldtype: "Link", options: "CPC Calendar Week" });
// 		this.f_boq = mk(2, { fieldname: "boq_parent", label: __("BOQ Parent"), fieldtype: "Link", options: "Task" });
// 		this.f_search = mk(3, { fieldname: "search", label: __("IRPO Search"), fieldtype: "Data" });
// 		this.f_status = mk(2, {
// 			fieldname: "status", label: __("Task Status"), fieldtype: "Select",
// 			options: ["", "Open", "Working", "Pending Review", "Overdue", "Completed"].join("\n"),
// 		});
// 	}

// 	make_layout() {
// 		this.$main = $(this.page.main);
// 		this.$main.html(`
// 			<div class="row wp-filters" style="margin-top:10px"></div>
// 			<div class="wp-tabs" style="margin:10px 0;">
// 				<button class="btn btn-sm btn-primary" data-tab="entry">${__("Weekly Entry")}</button>
// 				<button class="btn btn-sm btn-default" data-tab="needs">${__("Needs Action")}</button>
// 				<button class="btn btn-sm btn-default" data-tab="approvals">${__("Approvals")}</button>
// 				<button class="btn btn-sm btn-default" data-tab="details">${__("IRPO Details / Cancellation")}</button>
// 			</div>
// 			<div class="wp-panel" data-panel="entry"></div>
// 			<div class="wp-panel" data-panel="needs" style="display:none"></div>
// 			<div class="wp-panel" data-panel="approvals" style="display:none"></div>
// 			<div class="wp-panel" data-panel="details" style="display:none"></div>
// 		`);
// 		this.tab = "entry";
// 		this.$main.find("[data-tab]").on("click", (e) => this.show_tab($(e.currentTarget).data("tab")));
// 	}

// 	show_tab(tab) {
// 		this.tab = tab;
// 		this.results = [];
// 		this.$main.find("[data-tab]").each((i, el) => {
// 			const on = $(el).data("tab") === tab;
// 			$(el).toggleClass("btn-primary", on).toggleClass("btn-default", !on);
// 		});
// 		this.$main.find("[data-panel]").each((i, el) => $(el).toggle($(el).data("panel") === tab));
// 		this.refresh_active();
// 	}

// 	refresh_active() {
// 		if (this.tab === "entry") this.load_entry();
// 		else if (this.tab === "needs") this.load_needs();
// 		else if (this.tab === "approvals") this.load_approvals();
// 		else this.render_details_shell();
// 	}

// 	apply_route_options() {
// 		// Deep links from the reports: /app/weekly-progress?project=..&calendar_week=..&search=..
// 		const o = frappe.route_options || {};
// 		if (!Object.keys(o).length) return false;
// 		if (o.project) this.f_project.set_value(o.project);
// 		if (o.search) this.f_search.set_value(o.search);
// 		if (o.calendar_week) this.f_week.set_value(o.calendar_week);
// 		frappe.route_options = null;
// 		return !!o.calendar_week;
// 	}

// 	set_default_week() {
// 		if (this.apply_route_options()) return;
// 		const today = frappe.datetime.get_today();
// 		frappe.db
// 			.get_value("CPC Calendar Week", { start_date: ["<=", today], end_date: [">=", today] }, "name")
// 			.then((r) => {
// 				if (r && r.message && r.message.name) this.f_week.set_value(r.message.name);
// 			});
// 	}

// 	call(method, args, freeze = true) {
// 		return frappe.call({ method, args, freeze }).then((r) => r.message);
// 	}

// 	get filters() {
// 		return {
// 			project: this.f_project.get_value(),
// 			calendar_week: this.f_week.get_value(),
// 			boq_parent: this.f_boq.get_value() || null,
// 			search: this.f_search.get_value() || null,
// 			status: this.f_status.get_value() || null,
// 		};
// 	}

// 	fmt(n, digits = 3) {
// 		return n === null || n === undefined || n === "" ? "" : flt(n, digits);
// 	}

// 	// ------------------------------------------------------------ entry tab
// 	load_entry() {
// 		const f = this.filters;
// 		const $p = this.panel("entry");
// 		if (!f.project || !f.calendar_week) {
// 			$p.html(`<div class="text-muted" style="padding:20px">${__("Select a Project and a Reporting Week.")}</div>`);
// 			return;
// 		}
// 		this.call(WP_SCREENS + "get_entry_rows", f).then((data) => {
// 			if (!data) return;
// 			this.week = data.week;
// 			this.rows = data.rows;
// 			this.instruction = data.instruction;
// 			this.render_entry();
// 		});
// 	}

// 	panel(name) {
// 		return this.$main.find(`[data-panel="${name}"]`);
// 	}

// 	render_entry() {
// 		const $p = this.panel("entry");
// 		const w = this.week;
// 		const body = this.rows.map((r) => this.row_html(r)).join("");
// 		$p.html(`
// 			<div class="alert alert-info" style="margin-bottom:10px">
// 				<b>${__("Week")}: ${frappe.utils.escape_html(w.name)}</b> (${w.start} → ${w.end}).
// 				${frappe.utils.escape_html(this.instruction)}
// 			</div>
// 			<div style="margin-bottom:10px">
// 				<button class="btn btn-sm btn-default wp-save">${__("Save Draft")}</button>
// 				<button class="btn btn-sm btn-primary wp-send">${__("Send for Approval")}</button>
// 				<span class="text-muted" style="margin-left:10px">${__("    ")}</span>
// 			</div>
// 			<div style="overflow-x:auto">
// 			<table class="table table-bordered table-sm" style="min-width:1250px">
// 				<thead><tr>
// 					<th>${__("IRPO")}</th><th>${__("BOQ Parent")}</th><th>${__("Status")}</th>
// 					<th>${__("Base Qty")}</th><th>${__("Previous Approved")}</th>
// 					<th>${__("Cum. Completed Qty")}</th><th>${__("Cum. %")}</th>
// 					<th>${__("Increase (preview)")}</th><th>${__("Remaining")}</th>
// 					<th>${__("No Change")}</th><th>${__("Measured Through")}</th><th>${__("Remarks")}</th><th></th>
// 				</tr></thead>
// 				<tbody>${body || `<tr><td colspan="13" class="text-muted">${__("No IRPOs found.")}</td></tr>`}</tbody>
// 			</table></div>
// 			<div class="wp-results" style="margin-top:15px"></div>
// 		`);
// 		$p.find(".wp-save").on("click", () => this.save(0));
// 		$p.find(".wp-send").on("click", () => this.save(1));
// 		$p.find("input[data-field]").on("input change", (e) => this.on_edit($(e.currentTarget)));
// 		$p.find("[data-history]").on("click", (e) => this.open_details($(e.currentTarget).data("history")));
// 		$p.find("[data-open]").on("click", (e) => frappe.set_route("Form", "Task", $(e.currentTarget).data("open")));
// 		this.render_results();
// 	}

// 	row_html(r) {
// 		const esc = frappe.utils.escape_html;
// 		const rec = r.record || {};
// 		const dis = r.editable ? "" : "disabled";
// 		const e = this.edited[r.irpo_task] || {};
// 		const qty = e.cum_completed_qty !== undefined ? e.cum_completed_qty : rec.cum_completed_qty;
// 		const pct = e.cum_percent !== undefined ? e.cum_percent : rec.cum_percent;
// 		const cutoff = e.measurement_cutoff_date || rec.measurement_cutoff_date || this.week.cutoff_default;
// 		const noChange = e.no_change !== undefined ? e.no_change : rec.no_change;
// 		const prev = r.previous ? `${esc(r.previous.week)}: ${this.fmt(r.previous.qty)} (${this.fmt(r.previous.percent, 2)}%)` : "—";
// 		const notes = [r.base_notice, r.closure_note, r.hold_note, rec.return_reason ? __("Returned: ") + rec.return_reason : null]
// 			.filter(Boolean).map((n) => `<div class="small text-warning">${esc(n)}</div>`).join("");
// 		const holdBox = r.partial_hold
// 			? `<div class="small"><label><input type="checkbox" data-field="partial_hold_exception" ${e.partial_hold_exception ?? rec.partial_hold_exception ? "checked" : ""} ${dis}> ${__("Hold exception")}</label>
// 			   <input class="form-control input-xs" data-field="hold_exception_reason" placeholder="${__("Reason")}" value="${esc(e.hold_exception_reason ?? rec.hold_exception_reason ?? "")}" ${dis}></div>`
// 			: "";
// 		const increase = this.increase_preview(r, qty);
// 		return `<tr data-task="${esc(r.irpo_task)}">
// 			<td><b>${esc(r.irpo_task)}</b><div class="small text-muted">${esc(r.subject || "")}</div>${notes}</td>
// 			<td>${esc(r.boq_parent || "")}</td>
// 			<td>${esc(r.label)}${rec.name ? `<div class="small text-muted">${esc(rec.name)}</div>` : ""}</td>
// 			<td>${this.fmt(r.base)}${r.base_revision_ref ? `<div class="small text-muted">${esc(r.base_revision_ref)}</div>` : ""}</td>
// 			<td>${prev}</td>
// 			<td><input type="number" step="any" class="form-control input-sm" data-field="cum_completed_qty" value="${this.fmt(qty) }" ${dis}></td>
// 			<td><input type="number" step="any" class="form-control input-sm" data-field="cum_percent" value="${this.fmt(pct, 4)}" ${dis}></td>
// 			<td class="wp-inc">${increase}</td>
// 			<td class="wp-rem">${r.base != null && qty !== undefined && qty !== null && qty !== "" ? this.fmt(flt(r.base) - flt(qty)) : this.fmt(rec.remaining_qty)}</td>
// 			<td class="text-center"><input type="checkbox" data-field="no_change" ${noChange ? "checked" : ""} ${dis}></td>
// 			<td><input type="date" class="form-control input-sm" data-field="measurement_cutoff_date" value="${cutoff || ""}"
// 				min="${this.week.start}" max="${this.week.cutoff_default}" ${dis}></td>
// 			<td><input class="form-control input-sm" data-field="remarks" value="${esc(e.remarks ?? rec.remarks ?? "")}" ${dis}>${holdBox}</td>
// 			<td style="white-space:nowrap">
// 				<a data-open="${esc(r.irpo_task)}" style="cursor:pointer">${__("Task")}</a> ·
// 				<a data-history="${esc(r.irpo_task)}" style="cursor:pointer">${__("History")}</a>
// 			</td>
// 		</tr>`;
// 	}

// 	increase_preview(r, qty) {
// 		if (qty === undefined || qty === null || qty === "") return this.fmt((r.record || {}).period_completed_qty_snapshot);
// 		const prevQty = r.previous ? flt(r.previous.qty) : 0;
// 		return this.fmt(flt(qty) - prevQty);
// 	}

// 	on_edit($el) {
// 		const $tr = $el.closest("tr");
// 		const task = $tr.data("task");
// 		const row = this.rows.find((x) => x.irpo_task === task);
// 		const rec = row.record || {};
// 		if (!this.edited[task]) {
// 			this.edited[task] = {
// 				irpo_task: task, input_mode: rec.input_mode || "Quantity",
// 				cum_completed_qty: rec.cum_completed_qty, cum_percent: rec.cum_percent,
// 				measurement_cutoff_date: rec.measurement_cutoff_date || this.week.cutoff_default,
// 				no_change: rec.no_change || 0, remarks: rec.remarks,
// 				partial_hold_exception: rec.partial_hold_exception || 0, hold_exception_reason: rec.hold_exception_reason,
// 			};
// 		}
// 		const e = this.edited[task];
// 		const field = $el.data("field");
// 		const base = flt(row.base);
// 		if (field === "cum_completed_qty") {
// 			e.input_mode = "Quantity";
// 			e.cum_completed_qty = $el.val();
// 			e.cum_percent = base ? flt(($el.val() * 100) / base, 4) : e.cum_percent;
// 			$tr.find('[data-field="cum_percent"]').val(this.fmt(e.cum_percent, 4));
// 		} else if (field === "cum_percent") {
// 			e.input_mode = "Percentage";
// 			e.cum_percent = $el.val();
// 			e.cum_completed_qty = base ? flt((base * $el.val()) / 100, 6) : e.cum_completed_qty;
// 			$tr.find('[data-field="cum_completed_qty"]').val(this.fmt(e.cum_completed_qty, 6));
// 		} else if (field === "no_change") {
// 			e.no_change = $el.is(":checked") ? 1 : 0;
// 			if (e.no_change && row.previous) {
// 				e.input_mode = "Quantity";
// 				e.cum_completed_qty = row.previous.qty;
// 				e.cum_percent = base ? flt((flt(row.previous.qty) * 100) / base, 4) : row.previous.percent;
// 				$tr.find('[data-field="cum_completed_qty"]').val(this.fmt(e.cum_completed_qty, 6));
// 				$tr.find('[data-field="cum_percent"]').val(this.fmt(e.cum_percent, 4));
// 			}
// 		} else if (field === "partial_hold_exception") {
// 			e.partial_hold_exception = $el.is(":checked") ? 1 : 0;
// 		} else {
// 			e[field] = $el.val();
// 		}
// 		const q = e.cum_completed_qty;
// 		$tr.find(".wp-inc").text(this.increase_preview(row, q));
// 		$tr.find(".wp-rem").text(base && q !== "" && q != null ? this.fmt(base - flt(q)) : "");
// 		$tr.css("background", "#fffbe6");
// 	}

// 	save(send) {
// 		const rows = Object.values(this.edited);
// 		if (!rows.length) {
// 			frappe.msgprint(__("No rows were edited."));
// 			return;
// 		}
// 		const run = () =>
// 			this.call(WP_SCREENS + "save_rows", {
// 				calendar_week: this.f_week.get_value(),
// 				rows: JSON.stringify(rows),
// 				send_for_approval: send ? 1 : 0,
// 			}).then((results) => {
// 				this.results = results || [];
// 				this.results.filter((x) => x.ok).forEach((x) => delete this.edited[x.irpo_task]);
// 				this.load_entry();
// 			});
// 		if (send) frappe.confirm(__("Send {0} edited row(s) for approval?", [rows.length]), run);
// 		else run();
// 	}

// 	render_results() {
// 		const $r = this.panel("entry").find(".wp-results");
// 		if (!this.results.length) return;
// 		const ok = this.results.filter((x) => x.ok).length;
// 		const esc = frappe.utils.escape_html;
// 		$r.html(`
// 			<h6>${__("Result")}: ${ok} ${__("succeeded")}, ${this.results.length - ok} ${__("failed")}</h6>
// 			<table class="table table-bordered table-sm"><tbody>
// 			${this.results.map((x) => `<tr>
// 				<td>${esc(x.irpo_task)}</td>
// 				<td class="${x.ok ? "text-success" : "text-danger"}">${x.ok ? "✓ " + esc(x.name) + " — " + esc(x.state) : "✗ " + esc(x.error)}</td></tr>`).join("")}
// 			</tbody></table>
// 			${ok < this.results.length ? `<div class="text-muted small">${__("Failed rows keep your edits. Fix them and press the button again; saved rows are not duplicated.")}</div>` : ""}
// 		`);
// 	}

// 	// ------------------------------------------------------------ needs action tab
// 	load_needs() {
// 		const f = this.filters;
// 		this.call(WP_SCREENS + "get_outstanding_weeks", { project: f.project, boq_parent: f.boq_parent }).then((list) => {
// 			const esc = frappe.utils.escape_html;
// 			const $p = this.panel("needs");
// 			list = list || [];
// 			$p.html(`
// 				<div class="text-muted" style="margin-bottom:8px">${__("Missing is not zero progress and not 'no change'. The latest approved value is only a reference.")}</div>
// 				<table class="table table-bordered table-sm"><thead><tr>
// 					<th>${__("IRPO")}</th><th>${__("BOQ Parent")}</th><th>${__("Week")}</th><th>${__("Status")}</th><th></th></tr></thead>
// 				<tbody>${list.map((x, i) => `<tr><td>${esc(x.irpo_task)}<div class="small text-muted">${esc(x.subject || "")}</div></td>
// 					<td>${esc(x.boq_parent || "")}</td><td>${esc(x.calendar_week)} (${x.week_start} → ${x.week_end})</td>
// 					<td>${esc(x.label)}</td><td><button class="btn btn-xs btn-primary" data-i="${i}">${__("Update")}</button></td></tr>`).join("") ||
// 					`<tr><td colspan="5" class="text-muted">${__("Nothing needs action.")}</td></tr>`}</tbody></table>`);
// 			$p.find("[data-i]").on("click", (e) => {
// 				const x = list[$(e.currentTarget).data("i")];
// 				frappe.db.get_value("Task", x.irpo_task, "project").then((r) => {
// 					this.f_project.set_value(r.message.project);
// 					this.f_boq.set_value("");
// 					this.f_search.set_value(x.irpo_task);
// 					this.f_week.set_value(x.calendar_week);
// 					this.show_tab("entry");
// 				});
// 			});
// 		});
// 	}

// 	// ------------------------------------------------------------ approvals tab
// 	load_approvals() {
// 		this.call(WP_SCREENS + "get_approval_queue", { project: this.filters.project }).then((list) => {
// 			const esc = frappe.utils.escape_html;
// 			const $p = this.panel("approvals");
// 			list = list || [];
// 			$p.html(`
// 				<div class="text-muted" style="margin-bottom:8px">${__("Pending values are proposals; official progress changes only on approval. You cannot approve what you created or last edited.")}</div>
// 				<table class="table table-bordered table-sm"><thead><tr>
// 					<th>${__("Record")}</th><th>${__("Week")}</th><th>${__("Previous")}</th><th>${__("Proposed")}</th>
// 					<th>${__("Base")}</th><th>${__("Increase")}</th><th>${__("Prepared By")}</th><th>${__("Impact / Flags")}</th><th></th></tr></thead>
// 				<tbody>${list.map((r, i) => `<tr>
// 					<td><a href="/app/irpo-progress/${encodeURIComponent(r.name)}">${esc(r.name)}</a><div class="small">${esc(r.irpo_task)}</div><div class="small text-muted">${esc(r.workflow_state || "Draft")}</div></td>
// 					<td>${esc(r.calendar_week)}<div class="small text-muted">${esc(String(r.measurement_cutoff_date || ""))}</div></td>
// 					<td>${this.fmt(r.prev_completed_qty_snapshot)}</td>
// 					<td><b>${this.fmt(r.cum_completed_qty)}</b> (${this.fmt(r.cum_percent, 2)}%)</td>
// 					<td>${this.fmt(r.base_qty_snapshot)}</td>
// 					<td>${this.fmt(r.period_completed_qty_snapshot)}</td>
// 					<td>${esc(r.preparer || "")}</td>
// 					<td>${(r.flags || []).map((f) => `<div class="small text-warning">${esc(f)}</div>`).join("")}</td>
// 					<td style="white-space:nowrap">
// 						<button class="btn btn-xs btn-success" data-approve="${i}" ${r.can_approve ? "" : "disabled"} title="${esc(r.block_reason || "")}">${__("Approve")}</button>
// 						<button class="btn btn-xs btn-warning" data-return="${i}">${__("Return")}</button>
// 						${r.can_approve ? "" : `<div class="small text-danger">${__("Workflow does not allow you to approve")}</div>`}
// 					</td></tr>`).join("") || `<tr><td colspan="9" class="text-muted">${__("Nothing is waiting for approval.")}</td></tr>`}</tbody></table>`);
// 			$p.find("[data-approve]").on("click", (e) => {
// 				const r = list[$(e.currentTarget).data("approve")];
// 				frappe.confirm(__("Approve {0}? This updates official progress.", [r.name]), () =>
// 					this.call(WP_SCREENS + "approve_record", { name: r.name }).then(() => {
// 						this.results = [];
// 						frappe.show_alert({ message: __("Approved {0}", [r.name]), indicator: "green" });
// 						this.load_approvals();
// 					}));
// 			});
// 			$p.find("[data-return]").on("click", (e) => {
// 				const r = list[$(e.currentTarget).data("return")];
// 				frappe.prompt([{ fieldname: "reason", label: __("Return Reason"), fieldtype: "Small Text", reqd: 1 }], (v) =>
// 					this.call(WP_RETURN, { name: r.name, reason: v.reason }).then(() => {
// 						frappe.show_alert({ message: __("Returned {0}", [r.name]), indicator: "orange" });
// 						this.load_approvals();
// 					}), __("Return with Reason"));
// 			});
// 		});
// 	}

// 	// ------------------------------------------------------------ details / cancellation tab
// 	open_details(irpo) {
// 		this.show_tab("details");
// 		this.details_irpo.set_value(irpo);
// 		this.load_details(irpo);
// 	}

// 	render_details_shell() {
// 		const $p = this.panel("details");
// 		if (!this.details_irpo) {
// 			$p.html(`<div class="wp-details-picker" style="max-width:420px"></div><div class="wp-details-body" style="margin-top:12px"></div>`);
// 			this.details_irpo = frappe.ui.form.make_control({
// 				parent: $p.find(".wp-details-picker"),
// 				df: { fieldtype: "Link", options: "Task", label: __("IRPO"), fieldname: "irpo", change: () => this.load_details(this.details_irpo.get_value()) },
// 				render_input: true,
// 			});
// 		}
// 		if (this.details_irpo.get_value()) this.load_details(this.details_irpo.get_value());
// 	}

// 	load_details(irpo) {
// 		if (!irpo) return;
// 		this.call(WP_SCREENS + "get_irpo_history", { irpo_task: irpo }).then((d) => {
// 			if (!d) return;
// 			const esc = frappe.utils.escape_html;
// 			const $b = this.panel("details").find(".wp-details-body");
// 			const states = { 0: __("Draft/Pending"), 1: __("Approved"), 2: __("Cancelled") };
// 			const skip = ["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "parent", "parenttype", "parentfield"];
// 			$b.html(`
// 				<h5>${esc(d.irpo)} <small class="text-muted">${esc(d.subject || "")}</small></h5>
// 				<div>${__("Task status")}: <b>${esc(d.task_status)}</b> · ${__("Official progress")}: <b>${this.fmt(d.progress, 2)}%</b> · ${__("Current base")}: <b>${this.fmt(d.live_base)}</b></div>
// 				<div style="margin:6px 0">${d.reporting_closed_now
// 					? `<span class="indicator-pill green">${__("Reporting closed after approved completion")}</span>`
// 					: `<span class="indicator-pill blue">${__("Reporting open")}</span>`}
// 					${d.closed_windows.map((w) => `<span class="text-muted small"> ${__("closed")} ${w.from} → ${w.to || __("now")}</span>`).join("")}</div>
// 				${d.revisions.length ? `<div class="alert alert-warning">${__("Quantity revisions")}: ${d.revisions.map((r) =>
// 					`${r.posting_date}: ${this.fmt(r.before)} → ${this.fmt(r.after)}`).join("; ")}. ${__("Approved weeks keep the base they were measured on; live progress uses the current base.")}</div>` : ""}
// 				<h6>${__("Progress records")}</h6>
// 				<table class="table table-bordered table-sm"><thead><tr><th>${__("Record")}</th><th>${__("Week")}</th><th>${__("State")}</th>
// 					<th>${__("Cum. Qty")}</th><th>${__("Cum. %")}</th><th>${__("Base (snapshot)")}</th><th>${__("Increase")}</th><th>${__("Approved")}</th><th></th></tr></thead>
// 				<tbody>${d.records.map((r, i) => `<tr><td><a href="/app/irpo-progress/${encodeURIComponent(r.name)}">${esc(r.name)}</a>
// 					${r.amended_from ? `<div class="small text-muted">${__("amends")} ${esc(r.amended_from)}</div>` : ""}</td>
// 					<td>${esc(r.calendar_week)}</td><td>${esc(r.docstatus === 0 ? r.workflow_state || "Draft" : states[r.docstatus])}
// 					${r.cancellation_reason ? `<div class="small text-muted">${esc(r.cancellation_reason)}</div>` : ""}</td>
// 					<td>${this.fmt(r.cum_completed_qty)}</td><td>${this.fmt(r.cum_percent, 2)}</td><td>${this.fmt(r.base_qty_snapshot)}</td>
// 					<td>${this.fmt(r.period_completed_qty_snapshot)}</td><td>${esc(r.approved_by || "")}</td>
// 					<td>${r.docstatus === 1 ? `<button class="btn btn-xs btn-default" data-correct="${i}">${__("Correct")}</button>` : ""}</td></tr>`).join("") ||
// 					`<tr><td colspan="9" class="text-muted">${__("No records yet.")}</td></tr>`}</tbody></table>
// 				<h6>${__("Reporting status history")}</h6>
// 				<table class="table table-bordered table-sm"><tbody>${d.status_events.map((ev) => `<tr><td class="small">${esc(
// 					Object.keys(ev).filter((k) => !skip.includes(k) && ev[k] !== null && ev[k] !== "").map((k) => k + ": " + ev[k]).join(" · "))}</td></tr>`).join("") ||
// 					`<tr><td class="text-muted">${__("No Hold/Resume/Completed/Reopened events.")}</td></tr>`}</tbody></table>
// 				<h6>${__("Cancellation / scope review")}</h6>
// 				<div style="margin-bottom:6px"><button class="btn btn-sm btn-danger" data-request-cancel>${__("Request Cancellation Review")}</button>
// 					<span class="text-muted small">${__("The IRPO stays included in the parent average until a review is approved and finalised.")}</span></div>
// 				<table class="table table-bordered table-sm"><tbody>${d.scope_reviews.map((s, i) => `<tr>
// 					<td><a href="/app/cpc-irpo-scope-review/${encodeURIComponent(s.name)}">${esc(s.name)}</a></td>
// 					<td>${esc(s.status)}${s.effective_date ? ` (${s.effective_date})` : ""}</td>
// 					<td class="small">${esc(s.reason || "")}${s.review_notes ? `<div>${__("Review")}: ${esc(s.review_notes)}</div>` : ""}
// 						${s.commercial_change_required ? `<div class="text-warning">${__("Commercial change required")}${s.commercial_change_approved ? " — " + __("approved") + " " + esc(s.commercial_change_reference || "") : " — " + __("pending")}</div>` : ""}</td>
// 					<td style="white-space:nowrap">
// 						${s.status === "Pending Review" ? `<button class="btn btn-xs btn-success" data-sr-approve="${i}">${__("Approve")}</button> <button class="btn btn-xs btn-warning" data-sr-reject="${i}">${__("Reject")}</button>` : ""}
// 						${s.status === "Approved" && s.commercial_change_required && !s.commercial_change_approved ? `<button class="btn btn-xs btn-default" data-sr-comm="${i}">${__("Record Commercial Approval")}</button>` : ""}
// 						${s.status === "Approved" ? `<button class="btn btn-xs btn-danger" data-sr-final="${i}">${__("Finalise Cancellation")}</button>` : ""}</td></tr>`).join("") ||
// 					`<tr><td class="text-muted">${__("No scope reviews.")}</td></tr>`}</tbody></table>`);
// 			this.bind_details($b, d);
// 		});
// 	}

// 	bind_details($b, d) {
// 		const reload = () => this.load_details(d.irpo);
// 		const CORR = WP_API + "corrections.";
// 		const SR = WP_API + "scope_review.";
// 		$b.find("[data-correct]").on("click", (e) => {
// 			const rec = d.records[$(e.currentTarget).data("correct")];
// 			this.call(CORR + "get_correction_impact", { name: rec.name }).then((imp) => {
// 				const lines = [
// 					`${__("Latest approved record")}: ${imp.is_latest_approved ? __("yes") : __("no — later approved measurements stay")}`,
// 					`${__("Completion after correction")}: ${typeof imp.completion_after_correction === "string" ? imp.completion_after_correction : this.fmt(imp.completion_after_correction.cum_percent, 2) + "%"}`,
// 					imp.restored_reporting_weeks.length ? `${__("Reporting weeks restored")}: ${imp.restored_reporting_weeks.join(", ")}` : null,
// 					imp.next_record_period_may_change ? `${__("Next record's period increase may change")}: ${imp.next_record_period_may_change}` : null,
// 					imp.commercial_blockers.length ? `<b class="text-danger">${__("Blocked by submitted documents")}: ${imp.commercial_blockers.map((b) => b.doctype + " " + b.name).join(", ")}</b>` : null,
// 				].filter(Boolean).join("<br>");
// 				frappe.prompt([
// 					{ fieldname: "impact", fieldtype: "HTML", options: `<div class="small">${lines}</div>` },
// 					{ fieldname: "reason", label: __("Correction Reason"), fieldtype: "Small Text", reqd: 1 },
// 				], (v) => this.call(CORR + "cancel_and_amend", { name: rec.name, reason: v.reason }).then((res) => {
// 					frappe.show_alert({ message: __("Created amendment {0}. It needs independent approval.", [res.amendment]), indicator: "green" });
// 					reload();
// 				}), __("Correct {0}", [rec.name]), __("Cancel and Create Amendment"));
// 			});
// 		});
// 		$b.find("[data-request-cancel]").on("click", () => {
// 			this.call(SR + "get_cancellation_impact", { irpo_task: d.irpo }).then((imp) => {
// 				const lines = [
// 					`${__("Parent progress now")}: ${this.fmt(imp.current_parent_progress, 2)}% → ${__("without this IRPO")}: ${this.fmt(imp.hypothetical_parent_progress_without_irpo, 2)}%`,
// 					`<span class="text-warning">${frappe.utils.escape_html(imp.warning)}</span>`,
// 					`${__("Progress records")}: ${imp.progress_history.length} · ${__("Procurement ledger rows")}: ${imp.procurement_ledger_rows}`,
// 					imp.commercial_blockers.length ? `<b class="text-danger">${__("Submitted documents depend on its progress")}: ${imp.commercial_blockers.map((b) => b.doctype + " " + b.name).join(", ")}</b>` : null,
// 					frappe.utils.escape_html(imp.scope_impact),
// 				].filter(Boolean).join("<br>");
// 				frappe.prompt([
// 					{ fieldname: "impact", fieldtype: "HTML", options: `<div class="small">${lines}</div>` },
// 					{ fieldname: "reason", label: __("Cancellation Reason"), fieldtype: "Small Text", reqd: 1 },
// 				], (v) => this.call(SR + "request_scope_review", { irpo_task: d.irpo, reason: v.reason }).then(reload),
// 				__("Request Cancellation / Scope Review"), __("Submit Request"));
// 			});
// 		});
// 		const review = (i, decision) => {
// 			const s = d.scope_reviews[i];
// 			frappe.prompt([
// 				{ fieldname: "notes", label: __("Review Notes"), fieldtype: "Small Text", reqd: 1 },
// 				{ fieldname: "commercial_change_required", label: __("BOQ quantity/price/commercial change required"), fieldtype: "Check" },
// 				{ fieldname: "commercial_change_reference", label: __("Commercial Change Reference"), fieldtype: "Data", depends_on: "commercial_change_required" },
// 			], (v) => this.call(SR + "review_scope_request", {
// 				name: s.name, decision, notes: v.notes,
// 				commercial_change_required: v.commercial_change_required ? 1 : 0, commercial_change_reference: v.commercial_change_reference,
// 			}).then(reload), __("{0} Scope Review", [decision]));
// 		};
// 		$b.find("[data-sr-approve]").on("click", (e) => review($(e.currentTarget).data("sr-approve"), "Approve"));
// 		$b.find("[data-sr-reject]").on("click", (e) => review($(e.currentTarget).data("sr-reject"), "Reject"));
// 		$b.find("[data-sr-comm]").on("click", (e) => {
// 			const s = d.scope_reviews[$(e.currentTarget).data("sr-comm")];
// 			frappe.prompt([{ fieldname: "reference", label: __("Commercial Change Reference"), fieldtype: "Data", reqd: 1 }],
// 				(v) => this.call(SR + "record_commercial_approval", { name: s.name, reference: v.reference }).then(reload),
// 				__("Record Commercial Approval"));
// 		});
// 		$b.find("[data-sr-final]").on("click", (e) => {
// 			const s = d.scope_reviews[$(e.currentTarget).data("sr-final")];
// 			frappe.prompt([{ fieldname: "effective_date", label: __("Effective Date"), fieldtype: "Date", default: frappe.datetime.get_today(), reqd: 1 }],
// 				(v) => this.call(SR + "finalize_cancellation", { name: s.name, effective_date: v.effective_date }).then(() => {
// 					frappe.show_alert({ message: __("IRPO cancelled effective {0}", [v.effective_date]), indicator: "orange" });
// 					reload();
// 				}), __("Finalise Cancellation"));
// 		});
// 	}























const WP_API = "cpc_construction_management.cpc_construction_management.progress.";
const WP_SCREENS = WP_API + "screens.";
const WP_RETURN = "cpc_construction_management.cpc_construction_management.doctype.irpo_progress.irpo_progress.return_for_correction";

frappe.pages["weekly-progress"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Weekly Progress"), single_column: true });
	new WeeklyProgress(page);
};

class WeeklyProgress {
	constructor(page) {
		this.page = page;
		this.rows = [];
		this.edited = {};
		this.results = [];
		this.make_layout();
		this.make_filters();
		this.set_default_week();
	}

	// ------------------------------------------------------------ setup
	make_filters() {
		const reload = () => this.refresh_active();
		const $row = this.$main.find(".wp-filters");
		const mk = (width, df) => {
			const $col = $(`<div class="col-sm-${width}"></div>`).appendTo($row);
			return frappe.ui.form.make_control({ parent: $col, df: Object.assign({ change: reload }, df), render_input: true });
		};
		this.f_project = mk(3, { fieldname: "project", label: __("Project"), fieldtype: "Link", options: "Project" });
		this.f_week = mk(2, { fieldname: "calendar_week", label: __("Reporting Week"), fieldtype: "Link", options: "CPC Calendar Week" });
		this.f_boq = mk(2, { fieldname: "boq_parent", label: __("BOQ Parent"), fieldtype: "Link", options: "Task" });
		this.f_search = mk(3, { fieldname: "search", label: __("IRPO Search"), fieldtype: "Data" });
		this.f_status = mk(2, {
			fieldname: "status", label: __("Task Status"), fieldtype: "Select",
			options: ["", "Open", "Working", "Pending Review", "Overdue", "Completed"].join("\n"),
		});
	}

	make_layout() {
		this.$main = $(this.page.main);
		this.$main.html(`
			<style>
				[data-page-route="weekly-progress"] .container { max-width: 100%; }
				[data-page-route="weekly-progress"] .wp-filters .control-label { font-weight: 700; color: var(--text-color); }
				[data-page-route="weekly-progress"] .wp-filters .form-control,
				[data-page-route="weekly-progress"] .wp-filters .like-disabled-input { font-weight: 700; }
				[data-page-route="weekly-progress"] .wp-tabs { display: flex; gap: 8px; margin: 12px 0; }
				[data-page-route="weekly-progress"] .wp-tabs .btn { flex: 0 0 auto; font-size: 15px; font-weight: 600; padding: 0 24px; height: 42px; }
				[data-page-route="weekly-progress"] .wp-actions .btn { font-size: 14px; font-weight: 600; padding: 7px 22px; margin-right: 8px; }
			</style>
			<div class="row wp-filters" style="margin-top:10px"></div>
			<div class="wp-tabs">
				<button class="btn btn-primary" data-tab="entry">${__("Weekly Entry")}</button>
				<button class="btn btn-default" data-tab="needs">${__("Needs Action")}</button>
				<button class="btn btn-default" data-tab="approvals">${__("Approvals")}</button>
				<button class="btn btn-default" data-tab="details">${__("IRPO Details / Cancellation")}</button>
			</div>
			<div class="wp-panel" data-panel="entry"></div>
			<div class="wp-panel" data-panel="needs" style="display:none"></div>
			<div class="wp-panel" data-panel="approvals" style="display:none"></div>
			<div class="wp-panel" data-panel="details" style="display:none"></div>
		`);
		this.tab = "entry";
		this.$main.find("[data-tab]").on("click", (e) => this.show_tab($(e.currentTarget).data("tab")));
	}

	show_tab(tab) {
		this.tab = tab;
		this.results = []; // clear the last save/send result when switching tabs
		this.$main.find("[data-tab]").each((i, el) => {
			const on = $(el).data("tab") === tab;
			$(el).toggleClass("btn-primary", on).toggleClass("btn-default", !on);
		});
		this.$main.find("[data-panel]").each((i, el) => $(el).toggle($(el).data("panel") === tab));
		this.refresh_active();
	}

	refresh_active() {
		if (this.tab === "entry") this.load_entry();
		else if (this.tab === "needs") this.load_needs();
		else if (this.tab === "approvals") this.load_approvals();
		else this.render_details_shell();
	}

	apply_route_options() {
		// Deep links from the reports: /app/weekly-progress?project=..&calendar_week=..&search=..
		const o = frappe.route_options || {};
		if (!Object.keys(o).length) return false;
		if (o.project) this.f_project.set_value(o.project);
		if (o.search) this.f_search.set_value(o.search);
		if (o.calendar_week) this.f_week.set_value(o.calendar_week);
		frappe.route_options = null;
		return !!o.calendar_week;
	}

	set_default_week() {
		if (this.apply_route_options()) return;
		const today = frappe.datetime.get_today();
		frappe.db
			.get_value("CPC Calendar Week", { start_date: ["<=", today], end_date: [">=", today] }, "name")
			.then((r) => {
				if (r && r.message && r.message.name) this.f_week.set_value(r.message.name);
			});
	}

	call(method, args, freeze = true) {
		return frappe.call({ method, args, freeze }).then((r) => r.message);
	}

	get filters() {
		return {
			project: this.f_project.get_value(),
			calendar_week: this.f_week.get_value(),
			boq_parent: this.f_boq.get_value() || null,
			search: this.f_search.get_value() || null,
			status: this.f_status.get_value() || null,
		};
	}

	fmt(n, digits = 3) {
		return n === null || n === undefined || n === "" ? "" : flt(n, digits);
	}

	// ------------------------------------------------------------ entry tab
	load_entry() {
		const f = this.filters;
		const $p = this.panel("entry");
		if (!f.project || !f.calendar_week) {
			$p.html(`<div class="text-muted" style="padding:20px">${__("Select a Project and a Reporting Week.")}</div>`);
			return;
		}
		this.call(WP_SCREENS + "get_entry_rows", f).then((data) => {
			if (!data) return;
			this.week = data.week;
			this.rows = data.rows;
			this.instruction = data.instruction;
			this.render_entry();
		});
	}

	panel(name) {
		return this.$main.find(`[data-panel="${name}"]`);
	}

	render_entry() {
		const $p = this.panel("entry");
		const body = this.rows.map((r) => this.row_html(r)).join("");
		$p.html(`
			<div class="wp-actions" style="margin:15px 0">
				<button class="btn btn-default wp-save">${__("Save Draft")}</button>
				<button class="btn btn-primary wp-send">${__("Send for Approval")}</button>
			</div>
			<div style="overflow-x:auto">
			<table class="table table-bordered table-sm" style="width:100%; min-width:1250px">
				<thead><tr>
					<th>${__("IRPO")}</th><th>${__("BOQ Parent")}</th><th>${__("Status")}</th>
					<th>${__("Base Qty")}</th><th>${__("Previous Approved")}</th>
					<th>${__("Cum. Completed Qty")}</th><th>${__("Cum. %")}</th>
					<th>${__("Increase (preview)")}</th><th>${__("Remaining")}</th>
					<th>${__("No Change")}</th><th>${__("Measured Through")}</th><th>${__("Remarks")}</th><th></th>
				</tr></thead>
				<tbody>${body || `<tr><td colspan="13" class="text-muted">${__("No IRPOs found.")}</td></tr>`}</tbody>
			</table></div>
			<div class="wp-results" style="margin-top:15px"></div>
		`);
		$p.find(".wp-save").on("click", () => this.save(0));
		$p.find(".wp-send").on("click", () => this.save(1));
		$p.find("input[data-field]").on("input change", (e) => this.on_edit($(e.currentTarget)));
		$p.find("[data-history]").on("click", (e) => this.open_details($(e.currentTarget).data("history")));
		$p.find("[data-open]").on("click", (e) => frappe.set_route("Form", "Task", $(e.currentTarget).data("open")));
		this.render_results();
	}

	row_html(r) {
		const esc = frappe.utils.escape_html;
		const rec = r.record || {};
		const dis = r.editable ? "" : "disabled";
		const e = this.edited[r.irpo_task] || {};
		const qty = e.cum_completed_qty !== undefined ? e.cum_completed_qty : rec.cum_completed_qty;
		const pct = e.cum_percent !== undefined ? e.cum_percent : rec.cum_percent;
		const cutoff = e.measurement_cutoff_date || rec.measurement_cutoff_date || this.week.cutoff_default;
		const noChange = e.no_change !== undefined ? e.no_change : rec.no_change;
		const prev = r.previous ? `${esc(r.previous.week)}: ${this.fmt(r.previous.qty)} (${this.fmt(r.previous.percent, 2)}%)` : "—";
		const notes = [r.base_notice, r.closure_note, r.hold_note, rec.return_reason ? __("Returned: ") + rec.return_reason : null]
			.filter(Boolean).map((n) => `<div class="small text-warning">${esc(n)}</div>`).join("");
		const holdBox = r.partial_hold
			? `<div class="small"><label><input type="checkbox" data-field="partial_hold_exception" ${e.partial_hold_exception ?? rec.partial_hold_exception ? "checked" : ""} ${dis}> ${__("Hold exception")}</label>
			   <input class="form-control input-xs" data-field="hold_exception_reason" placeholder="${__("Reason")}" value="${esc(e.hold_exception_reason ?? rec.hold_exception_reason ?? "")}" ${dis}></div>`
			: "";
		const increase = this.increase_preview(r, qty);
		return `<tr data-task="${esc(r.irpo_task)}">
			<td><b>${esc(r.irpo_task)}</b><div class="small text-muted">${esc(r.subject || "")}</div>${notes}</td>
			<td>${esc(r.boq_parent || "")}</td>
			<td>${esc(r.label)}${rec.name ? `<div class="small text-muted">${esc(rec.name)}</div>` : ""}</td>
			<td>${this.fmt(r.base)}${r.base_revision_ref ? `<div class="small text-muted">${esc(r.base_revision_ref)}</div>` : ""}</td>
			<td>${prev}</td>
			<td><input type="number" step="any" class="form-control input-sm" data-field="cum_completed_qty" value="${this.fmt(qty) }" ${dis}></td>
			<td><input type="number" step="any" class="form-control input-sm" data-field="cum_percent" value="${this.fmt(pct, 4)}" ${dis}></td>
			<td class="wp-inc">${increase}</td>
			<td class="wp-rem">${r.base != null && qty !== undefined && qty !== null && qty !== "" ? this.fmt(flt(r.base) - flt(qty)) : this.fmt(rec.remaining_qty)}</td>
			<td class="text-center"><input type="checkbox" data-field="no_change" ${noChange ? "checked" : ""} ${dis}></td>
			<td><input type="date" class="form-control input-sm" data-field="measurement_cutoff_date" value="${cutoff || ""}"
				min="${this.week.start}" max="${this.week.cutoff_default}" ${dis}></td>
			<td><input class="form-control input-sm" data-field="remarks" value="${esc(e.remarks ?? rec.remarks ?? "")}" ${dis}>${holdBox}</td>
			<td style="white-space:nowrap">
				<a data-open="${esc(r.irpo_task)}" style="cursor:pointer">${__("Task")}</a> ·
				<a data-history="${esc(r.irpo_task)}" style="cursor:pointer">${__("History")}</a>
			</td>
		</tr>`;
	}

	increase_preview(r, qty) {
		if (qty === undefined || qty === null || qty === "") return this.fmt((r.record || {}).period_completed_qty_snapshot);
		const prevQty = r.previous ? flt(r.previous.qty) : 0;
		return this.fmt(flt(qty) - prevQty);
	}

	on_edit($el) {
		const $tr = $el.closest("tr");
		const task = $tr.data("task");
		const row = this.rows.find((x) => x.irpo_task === task);
		const rec = row.record || {};
		if (!this.edited[task]) {
			this.edited[task] = {
				irpo_task: task, input_mode: rec.input_mode || "Quantity",
				cum_completed_qty: rec.cum_completed_qty, cum_percent: rec.cum_percent,
				measurement_cutoff_date: rec.measurement_cutoff_date || this.week.cutoff_default,
				no_change: rec.no_change || 0, remarks: rec.remarks,
				partial_hold_exception: rec.partial_hold_exception || 0, hold_exception_reason: rec.hold_exception_reason,
			};
		}
		const e = this.edited[task];
		const field = $el.data("field");
		const base = flt(row.base);
		if (field === "cum_completed_qty") {
			e.input_mode = "Quantity";
			e.cum_completed_qty = $el.val();
			e.cum_percent = base ? flt(($el.val() * 100) / base, 4) : e.cum_percent;
			$tr.find('[data-field="cum_percent"]').val(this.fmt(e.cum_percent, 4));
		} else if (field === "cum_percent") {
			e.input_mode = "Percentage";
			e.cum_percent = $el.val();
			e.cum_completed_qty = base ? flt((base * $el.val()) / 100, 6) : e.cum_completed_qty;
			$tr.find('[data-field="cum_completed_qty"]').val(this.fmt(e.cum_completed_qty, 6));
		} else if (field === "no_change") {
			e.no_change = $el.is(":checked") ? 1 : 0;
			if (e.no_change && row.previous) {
				e.input_mode = "Quantity";
				e.cum_completed_qty = row.previous.qty;
				e.cum_percent = base ? flt((flt(row.previous.qty) * 100) / base, 4) : row.previous.percent;
				$tr.find('[data-field="cum_completed_qty"]').val(this.fmt(e.cum_completed_qty, 6));
				$tr.find('[data-field="cum_percent"]').val(this.fmt(e.cum_percent, 4));
			}
		} else if (field === "partial_hold_exception") {
			e.partial_hold_exception = $el.is(":checked") ? 1 : 0;
		} else {
			e[field] = $el.val();
		}
		const q = e.cum_completed_qty;
		$tr.find(".wp-inc").text(this.increase_preview(row, q));
		$tr.find(".wp-rem").text(base && q !== "" && q != null ? this.fmt(base - flt(q)) : "");
		$tr.css("background", "#fffbe6");
	}

	save(send) {
		const rows = Object.values(this.edited);
		if (send) {
			// Also send rows that were saved earlier as drafts and not edited since.
			this.rows.forEach((r) => {
				const rec = r.record;
				if (!rec || this.edited[r.irpo_task] || !r.editable || rec.docstatus !== 0) return;
				const hasValue = [rec.cum_completed_qty, rec.cum_percent].some((v) => v !== null && v !== undefined && v !== "");
				if (!hasValue) return;
				rows.push({
					irpo_task: r.irpo_task, input_mode: rec.input_mode || "Quantity",
					cum_completed_qty: rec.cum_completed_qty, cum_percent: rec.cum_percent,
					measurement_cutoff_date: rec.measurement_cutoff_date, no_change: rec.no_change || 0,
					remarks: rec.remarks, partial_hold_exception: rec.partial_hold_exception || 0,
					hold_exception_reason: rec.hold_exception_reason,
				});
			});
		}
		if (!rows.length) {
			frappe.msgprint(send ? __("Nothing to send. Enter values or save a draft first.") : __("No rows were edited."));
			return;
		}
		const run = () =>
			this.call(WP_SCREENS + "save_rows", {
				calendar_week: this.f_week.get_value(),
				rows: JSON.stringify(rows),
				send_for_approval: send ? 1 : 0,
			}).then((results) => {
				this.results = results || [];
				this.results.filter((x) => x.ok).forEach((x) => delete this.edited[x.irpo_task]);
				this.load_entry();
			});
		if (send) frappe.confirm(__("Send {0} row(s) for approval?", [rows.length]), run);
		else run();
	}

	render_results() {
		const $r = this.panel("entry").find(".wp-results");
		if (!this.results.length) return;
		const ok = this.results.filter((x) => x.ok).length;
		const esc = frappe.utils.escape_html;
		$r.html(`
			<h6>${__("Result")}: ${ok} ${__("succeeded")}, ${this.results.length - ok} ${__("failed")}</h6>
			<table class="table table-bordered table-sm"><tbody>
			${this.results.map((x) => `<tr>
				<td>${esc(x.irpo_task)}</td>
				<td class="${x.ok ? "text-success" : "text-danger"}">${x.ok ? "✓ " + esc(x.name) + " — " + esc(x.state) : "✗ " + esc(x.error)}</td></tr>`).join("")}
			</tbody></table>
			${ok < this.results.length ? `<div class="text-muted small">${__("Failed rows keep your edits. Fix them and press the button again; saved rows are not duplicated.")}</div>` : ""}
		`);
	}

	// ------------------------------------------------------------ needs action tab
	load_needs() {
		const f = this.filters;
		this.call(WP_SCREENS + "get_outstanding_weeks", { project: f.project, boq_parent: f.boq_parent }).then((list) => {
			const esc = frappe.utils.escape_html;
			const $p = this.panel("needs");
			list = list || [];
			$p.html(`
				<div class="text-muted" style="margin-bottom:8px">${__("Missing is not zero progress and not 'no change'. The latest approved value is only a reference.")}</div>
				<table class="table table-bordered table-sm"><thead><tr>
					<th>${__("IRPO")}</th><th>${__("BOQ Parent")}</th><th>${__("Week")}</th><th>${__("Status")}</th><th></th></tr></thead>
				<tbody>${list.map((x, i) => `<tr><td>${esc(x.irpo_task)}<div class="small text-muted">${esc(x.subject || "")}</div></td>
					<td>${esc(x.boq_parent || "")}</td><td>${esc(x.calendar_week)} (${x.week_start} → ${x.week_end})</td>
					<td>${esc(x.label)}</td><td><button class="btn btn-xs btn-primary" data-i="${i}">${__("Update")}</button></td></tr>`).join("") ||
					`<tr><td colspan="5" class="text-muted">${__("Nothing needs action.")}</td></tr>`}</tbody></table>`);
			$p.find("[data-i]").on("click", (e) => {
				const x = list[$(e.currentTarget).data("i")];
				frappe.db.get_value("Task", x.irpo_task, "project").then((r) => {
					this.f_project.set_value(r.message.project);
					this.f_boq.set_value("");
					this.f_search.set_value(x.irpo_task);
					this.f_week.set_value(x.calendar_week);
					this.show_tab("entry");
				});
			});
		});
	}

	// ------------------------------------------------------------ approvals tab
	load_approvals() {
		this.call(WP_SCREENS + "get_approval_queue", { project: this.filters.project }).then((list) => {
			const esc = frappe.utils.escape_html;
			const $p = this.panel("approvals");
			list = list || [];
			$p.html(`
				<div class="text-muted" style="margin-bottom:8px">${__("Pending values are proposals; official progress changes only on approval. You cannot approve what you created or last edited.")}</div>
				<table class="table table-bordered table-sm"><thead><tr>
					<th>${__("Record")}</th><th>${__("Week")}</th><th>${__("Previous")}</th><th>${__("Proposed")}</th>
					<th>${__("Base")}</th><th>${__("Increase")}</th><th>${__("Prepared By")}</th><th>${__("Impact / Flags")}</th><th></th></tr></thead>
				<tbody>${list.map((r, i) => `<tr>
					<td><a href="/app/irpo-progress/${encodeURIComponent(r.name)}">${esc(r.name)}</a><div class="small">${esc(r.irpo_task)}</div><div class="small text-muted">${esc(r.workflow_state || (r.sent_for_approval_on ? "Pending Approval" : "Draft"))}</div></td>
					<td>${esc(r.calendar_week)}<div class="small text-muted">${esc(String(r.measurement_cutoff_date || ""))}</div></td>
					<td>${this.fmt(r.prev_completed_qty_snapshot)}</td>
					<td><b>${this.fmt(r.cum_completed_qty)}</b> (${this.fmt(r.cum_percent, 2)}%)</td>
					<td>${this.fmt(r.base_qty_snapshot)}</td>
					<td>${this.fmt(r.period_completed_qty_snapshot)}</td>
					<td>${esc(r.preparer || "")}</td>
					<td>${(r.flags || []).map((f) => `<div class="small text-warning">${esc(f)}</div>`).join("")}</td>
					<td style="white-space:nowrap">
						<button class="btn btn-xs btn-success" data-approve="${i}" ${r.can_approve ? "" : "disabled"} title="${esc(r.block_reason || "")}">${__("Approve")}</button>
						<button class="btn btn-xs btn-warning" data-return="${i}">${__("Return")}</button>
						${r.can_approve ? "" : `<div class="small text-danger">${__("Workflow does not allow you to approve")}</div>`}
					</td></tr>`).join("") || `<tr><td colspan="9" class="text-muted">${__("Nothing is waiting for approval.")}</td></tr>`}</tbody></table>`);
			$p.find("[data-approve]").on("click", (e) => {
				const r = list[$(e.currentTarget).data("approve")];
				frappe.confirm(__("Approve {0}? This updates official progress.", [r.name]), () =>
					this.call(WP_SCREENS + "approve_record", { name: r.name }).then(() => {
						this.results = [];
						frappe.show_alert({ message: __("Approved {0}", [r.name]), indicator: "green" });
						this.load_approvals();
					}));
			});
			$p.find("[data-return]").on("click", (e) => {
				const r = list[$(e.currentTarget).data("return")];
				frappe.prompt([{ fieldname: "reason", label: __("Return Reason"), fieldtype: "Small Text", reqd: 1 }], (v) =>
					this.call(WP_RETURN, { name: r.name, reason: v.reason }).then(() => {
						this.results = [];
						frappe.show_alert({ message: __("Returned {0}", [r.name]), indicator: "orange" });
						this.load_approvals();
					}), __("Return with Reason"));
			});
		});
	}

	// ------------------------------------------------------------ details / cancellation tab
	open_details(irpo) {
		this.show_tab("details");
		this.details_irpo.set_value(irpo);
		this.load_details(irpo);
	}

	render_details_shell() {
		const $p = this.panel("details");
		if (!this.details_irpo) {
			$p.html(`<div class="wp-details-picker" style="max-width:420px"></div><div class="wp-details-body" style="margin-top:12px"></div>`);
			this.details_irpo = frappe.ui.form.make_control({
				parent: $p.find(".wp-details-picker"),
				df: { fieldtype: "Link", options: "Task", label: __("IRPO"), fieldname: "irpo", change: () => this.load_details(this.details_irpo.get_value()) },
				render_input: true,
			});
		}
		if (this.details_irpo.get_value()) this.load_details(this.details_irpo.get_value());
	}

	load_details(irpo) {
		if (!irpo) return;
		this.call(WP_SCREENS + "get_irpo_history", { irpo_task: irpo }).then((d) => {
			if (!d) return;
			const esc = frappe.utils.escape_html;
			const $b = this.panel("details").find(".wp-details-body");
			const states = { 0: __("Draft/Pending"), 1: __("Approved"), 2: __("Cancelled") };
			const skip = ["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "parent", "parenttype", "parentfield"];
			$b.html(`
				<h5>${esc(d.irpo)} <small class="text-muted">${esc(d.subject || "")}</small></h5>
				<div>${__("Task status")}: <b>${esc(d.task_status)}</b> · ${__("Official progress")}: <b>${this.fmt(d.progress, 2)}%</b> · ${__("Current base")}: <b>${this.fmt(d.live_base)}</b></div>
				<div style="margin:6px 0">${d.reporting_closed_now
					? `<span class="indicator-pill green">${__("Reporting closed after approved completion")}</span>`
					: `<span class="indicator-pill blue">${__("Reporting open")}</span>`}
					${d.closed_windows.map((w) => `<span class="text-muted small"> ${__("closed")} ${w.from} → ${w.to || __("now")}</span>`).join("")}</div>
				${d.revisions.length ? `<div class="alert alert-warning">${__("Quantity revisions")}: ${d.revisions.map((r) =>
					`${r.posting_date}: ${this.fmt(r.before)} → ${this.fmt(r.after)}`).join("; ")}. ${__("Approved weeks keep the base they were measured on; live progress uses the current base.")}</div>` : ""}
				<h6>${__("Progress records")}</h6>
				<table class="table table-bordered table-sm"><thead><tr><th>${__("Record")}</th><th>${__("Week")}</th><th>${__("State")}</th>
					<th>${__("Cum. Qty")}</th><th>${__("Cum. %")}</th><th>${__("Base (snapshot)")}</th><th>${__("Increase")}</th><th>${__("Approved")}</th><th></th></tr></thead>
				<tbody>${d.records.map((r, i) => `<tr><td><a href="/app/irpo-progress/${encodeURIComponent(r.name)}">${esc(r.name)}</a>
					${r.amended_from ? `<div class="small text-muted">${__("amends")} ${esc(r.amended_from)}</div>` : ""}</td>
					<td>${esc(r.calendar_week)}</td><td>${esc(r.docstatus === 0 ? r.workflow_state || "Draft" : states[r.docstatus])}
					${r.cancellation_reason ? `<div class="small text-muted">${esc(r.cancellation_reason)}</div>` : ""}</td>
					<td>${this.fmt(r.cum_completed_qty)}</td><td>${this.fmt(r.cum_percent, 2)}</td><td>${this.fmt(r.base_qty_snapshot)}</td>
					<td>${this.fmt(r.period_completed_qty_snapshot)}</td><td>${esc(r.approved_by || "")}</td>
					<td>${r.docstatus === 1 ? `<button class="btn btn-xs btn-default" data-correct="${i}">${__("Correct")}</button>` : ""}</td></tr>`).join("") ||
					`<tr><td colspan="9" class="text-muted">${__("No records yet.")}</td></tr>`}</tbody></table>
				<h6>${__("Reporting status history")}</h6>
				<table class="table table-bordered table-sm"><tbody>${d.status_events.map((ev) => `<tr><td class="small">${esc(
					Object.keys(ev).filter((k) => !skip.includes(k) && ev[k] !== null && ev[k] !== "").map((k) => k + ": " + ev[k]).join(" · "))}</td></tr>`).join("") ||
					`<tr><td class="text-muted">${__("No Hold/Resume/Completed/Reopened events.")}</td></tr>`}</tbody></table>
				<h6>${__("Cancellation / scope review")}</h6>
				<div style="margin-bottom:6px"><button class="btn btn-sm btn-danger" data-request-cancel>${__("Request Cancellation Review")}</button>
					<span class="text-muted small">${__("The IRPO stays included in the parent average until a review is approved and finalised.")}</span></div>
				<table class="table table-bordered table-sm"><tbody>${d.scope_reviews.map((s, i) => `<tr>
					<td><a href="/app/cpc-irpo-scope-review/${encodeURIComponent(s.name)}">${esc(s.name)}</a></td>
					<td>${esc(s.status)}${s.effective_date ? ` (${s.effective_date})` : ""}</td>
					<td class="small">${esc(s.reason || "")}${s.review_notes ? `<div>${__("Review")}: ${esc(s.review_notes)}</div>` : ""}
						${s.commercial_change_required ? `<div class="text-warning">${__("Commercial change required")}${s.commercial_change_approved ? " — " + __("approved") + " " + esc(s.commercial_change_reference || "") : " — " + __("pending")}</div>` : ""}</td>
					<td style="white-space:nowrap">
						${s.status === "Pending Review" ? `<button class="btn btn-xs btn-success" data-sr-approve="${i}">${__("Approve")}</button> <button class="btn btn-xs btn-warning" data-sr-reject="${i}">${__("Reject")}</button>` : ""}
						${s.status === "Approved" && s.commercial_change_required && !s.commercial_change_approved ? `<button class="btn btn-xs btn-default" data-sr-comm="${i}">${__("Record Commercial Approval")}</button>` : ""}
						${s.status === "Approved" ? `<button class="btn btn-xs btn-danger" data-sr-final="${i}">${__("Finalise Cancellation")}</button>` : ""}</td></tr>`).join("") ||
					`<tr><td class="text-muted">${__("No scope reviews.")}</td></tr>`}</tbody></table>`);
			this.bind_details($b, d);
		});
	}

	bind_details($b, d) {
		const reload = () => this.load_details(d.irpo);
		const CORR = WP_API + "corrections.";
		const SR = WP_API + "scope_review.";
		$b.find("[data-correct]").on("click", (e) => {
			const rec = d.records[$(e.currentTarget).data("correct")];
			this.call(CORR + "get_correction_impact", { name: rec.name }).then((imp) => {
				const lines = [
					`${__("Latest approved record")}: ${imp.is_latest_approved ? __("yes") : __("no — later approved measurements stay")}`,
					`${__("Completion after correction")}: ${typeof imp.completion_after_correction === "string" ? imp.completion_after_correction : this.fmt(imp.completion_after_correction.cum_percent, 2) + "%"}`,
					imp.restored_reporting_weeks.length ? `${__("Reporting weeks restored")}: ${imp.restored_reporting_weeks.join(", ")}` : null,
					imp.next_record_period_may_change ? `${__("Next record's period increase may change")}: ${imp.next_record_period_may_change}` : null,
					imp.commercial_blockers.length ? `<b class="text-danger">${__("Blocked by submitted documents")}: ${imp.commercial_blockers.map((b) => b.doctype + " " + b.name).join(", ")}</b>` : null,
				].filter(Boolean).join("<br>");
				frappe.prompt([
					{ fieldname: "impact", fieldtype: "HTML", options: `<div class="small">${lines}</div>` },
					{ fieldname: "reason", label: __("Correction Reason"), fieldtype: "Small Text", reqd: 1 },
				], (v) => this.call(CORR + "cancel_and_amend", { name: rec.name, reason: v.reason }).then((res) => {
					frappe.show_alert({ message: __("Created amendment {0}. It needs independent approval.", [res.amendment]), indicator: "green" });
					reload();
				}), __("Correct {0}", [rec.name]), __("Cancel and Create Amendment"));
			});
		});
		$b.find("[data-request-cancel]").on("click", () => {
			this.call(SR + "get_cancellation_impact", { irpo_task: d.irpo }).then((imp) => {
				const lines = [
					`${__("Parent progress now")}: ${this.fmt(imp.current_parent_progress, 2)}% → ${__("without this IRPO")}: ${this.fmt(imp.hypothetical_parent_progress_without_irpo, 2)}%`,
					`<span class="text-warning">${frappe.utils.escape_html(imp.warning)}</span>`,
					`${__("Progress records")}: ${imp.progress_history.length} · ${__("Procurement ledger rows")}: ${imp.procurement_ledger_rows}`,
					imp.commercial_blockers.length ? `<b class="text-danger">${__("Submitted documents depend on its progress")}: ${imp.commercial_blockers.map((b) => b.doctype + " " + b.name).join(", ")}</b>` : null,
					frappe.utils.escape_html(imp.scope_impact),
				].filter(Boolean).join("<br>");
				frappe.prompt([
					{ fieldname: "impact", fieldtype: "HTML", options: `<div class="small">${lines}</div>` },
					{ fieldname: "reason", label: __("Cancellation Reason"), fieldtype: "Small Text", reqd: 1 },
				], (v) => this.call(SR + "request_scope_review", { irpo_task: d.irpo, reason: v.reason }).then(reload),
				__("Request Cancellation / Scope Review"), __("Submit Request"));
			});
		});
		const review = (i, decision) => {
			const s = d.scope_reviews[i];
			frappe.prompt([
				{ fieldname: "notes", label: __("Review Notes"), fieldtype: "Small Text", reqd: 1 },
				{ fieldname: "commercial_change_required", label: __("BOQ quantity/price/commercial change required"), fieldtype: "Check" },
				{ fieldname: "commercial_change_reference", label: __("Commercial Change Reference"), fieldtype: "Data", depends_on: "commercial_change_required" },
			], (v) => this.call(SR + "review_scope_request", {
				name: s.name, decision, notes: v.notes,
				commercial_change_required: v.commercial_change_required ? 1 : 0, commercial_change_reference: v.commercial_change_reference,
			}).then(reload), __("{0} Scope Review", [decision]));
		};
		$b.find("[data-sr-approve]").on("click", (e) => review($(e.currentTarget).data("sr-approve"), "Approve"));
		$b.find("[data-sr-reject]").on("click", (e) => review($(e.currentTarget).data("sr-reject"), "Reject"));
		$b.find("[data-sr-comm]").on("click", (e) => {
			const s = d.scope_reviews[$(e.currentTarget).data("sr-comm")];
			frappe.prompt([{ fieldname: "reference", label: __("Commercial Change Reference"), fieldtype: "Data", reqd: 1 }],
				(v) => this.call(SR + "record_commercial_approval", { name: s.name, reference: v.reference }).then(reload),
				__("Record Commercial Approval"));
		});
		$b.find("[data-sr-final]").on("click", (e) => {
			const s = d.scope_reviews[$(e.currentTarget).data("sr-final")];
			frappe.prompt([{ fieldname: "effective_date", label: __("Effective Date"), fieldtype: "Date", default: frappe.datetime.get_today(), reqd: 1 }],
				(v) => this.call(SR + "finalize_cancellation", { name: s.name, effective_date: v.effective_date }).then(() => {
					frappe.show_alert({ message: __("IRPO cancelled effective {0}", [v.effective_date]), indicator: "orange" });
					reload();
				}), __("Finalise Cancellation"));
		});
	}
}