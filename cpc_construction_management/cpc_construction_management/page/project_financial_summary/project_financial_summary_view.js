frappe.provide("cpc_construction_management.project_financial_summary");

cpc_construction_management.project_financial_summary.View = class ProjectFinancialSummaryView {
	constructor(page) {
		this.page = page;
		this.$wrapper = $(page.body);
		this.data = null;
		this.selected_project = frappe.route_options?.project || null;
		this.from_date = null;
		this.to_date = null;
		this.pnl_expanded = false;
		this.active_purchase_type = null;
		this.purchase_docs_page = 1;
		this.is_setting_filter_values = false;
		this.last_valid_from_date = null;
		this.last_valid_to_date = null;
		this.active_dialog = null;

		this.init_dom();
		this.init_filters();
		if (this.selected_project) {
			this.load_summary();
		} else {
			this.render_empty(__("Please select a project to view its summary."));
		}
	}

	init_dom() {
		this.$wrapper.html(`
			<div class="pfs-container">
				<!-- Header -->
				<header class="pfs-header">
					<div class="pfs-header-top">
						<div class="pfs-title-area">
							<h1 class="pfs-title">
								${__("Project Financial Summary")} · <span class="pfs-project-id" data-field="header-project-id">—</span>
							</h1>
							<div class="pfs-header-meta">
								<span>${__("Company")}: <strong data-field="header-company">—</strong></span>
								<span class="pfs-meta-sep">·</span>
								<span>${__("Currency")}: <strong data-field="header-currency">—</strong></span>
								<span class="pfs-meta-sep">·</span>
								<span>${__("Finance Book")}: <strong data-field="header-finance-book">—</strong></span>
								<span class="pfs-meta-sep">·</span>
								<span class="pfs-last-refreshed-wrap">${__("Last refreshed")}: <strong data-field="header-last-refreshed">—</strong></span>
							</div>
						</div>
						<div class="pfs-header-actions">
							<button class="btn btn-default btn-sm pfs-refresh-btn" data-action="refresh" title="${__("Refresh financial summary")}">
								<i class="fa fa-refresh"></i> ${__("Refresh")}
							</button>
							<button class="btn btn-default btn-sm planner-topbar-btn pfs-back-btn" data-action="back">
								${__("Back to Construction Control")}
							</button>
						</div>
					</div>

					<!-- Filter bar: All in a single horizontal row -->
					<div class="pfs-filterbar">
						<div class="pfs-filter-ctrl-wrap pfs-project-field-wrap" data-filter="project-link"></div>
						<div class="pfs-filter-ctrl-wrap pfs-year-field-wrap" data-filter="year-select-wrap"></div>
						<div class="pfs-filter-ctrl-wrap pfs-month-field-wrap" data-filter="month-select-wrap"></div>
						<div class="pfs-filter-ctrl-wrap pfs-date-field-wrap" data-filter="from-date-wrap"></div>
						<div class="pfs-filter-ctrl-wrap pfs-date-field-wrap" data-filter="to-date-wrap"></div>
					</div>
				</header>

				<!-- Body Content Container -->
				<div class="pfs-body-content">
					<div class="pfs-loading-state">
						<div class="pfs-spinner"></div>
						<div>${__("Loading project financial summary...")}</div>
					</div>
				</div>
			</div>
		`);

		this.$wrapper.on("click", '[data-action="refresh"]', () => {
			this.load_summary();
		});

		this.$wrapper.on("click", '[data-action="back"]', () => {
			if (frappe.get_prev_route() && frappe.get_prev_route()[0] === "contract-center") {
				window.history.back();
			} else {
				frappe.set_route("contract-center");
			}
		});

		this.$wrapper.on("click", '[data-action="view-pnl"]', (e) => {
			e.preventDefault();
			this.pnl_expanded = !this.pnl_expanded;
			const $panel = this.$wrapper.find('[data-pnl-panel]');
			const $btn = this.$wrapper.find('[data-action="view-pnl"]');
			if (this.pnl_expanded) {
				$panel.removeClass("hide");
				$btn.addClass("is-active");
			} else {
				$panel.addClass("hide");
				$btn.removeClass("is-active");
			}
		});

		this.$wrapper.on("click", '[data-action="open-full-pnl-report"]', (e) => {
			e.preventDefault();
			this.open_pnl_report();
		});

		this.$wrapper.on("click", '[data-action="drilldown-sales"]', () => {
			this.show_sales_drilldown();
		});

		this.$wrapper.on("click", '[data-action="drilldown-budget"]', () => {
			this.show_budget_drilldown();
		});


		this.$wrapper.on("click", '[data-filter-cat]', (e) => {
			const cat = $(e.currentTarget).data("filter-cat");
			this.show_expense_details(cat);
		});

		this.$wrapper.on("click", '[data-purch-card]', (e) => {
			const type = $(e.currentTarget).data("purch-card");
			if (this.active_purchase_type === type) {
				this.active_purchase_type = null;
			} else {
				this.active_purchase_type = type;
				this.purchase_docs_page = 1;
			}
			this.render_purchase_docs_panel();
		});

		this.$wrapper.on("click", '[data-action="purch-docs-prev"]', (e) => {
			e.preventDefault();
			if (this.purchase_docs_page > 1) {
				this.purchase_docs_page--;
				this.render_purchase_docs_panel();
			}
		});

		this.$wrapper.on("click", '[data-action="purch-docs-next"]', (e) => {
			e.preventDefault();
			const docs = (this.data?.purchase_status[this.active_purchase_type]?.documents) || [];
			const total_pages = Math.ceil(docs.length / 10) || 1;
			if (this.purchase_docs_page < total_pages) {
				this.purchase_docs_page++;
				this.render_purchase_docs_panel();
			}
		});

		this.$wrapper.on("click", '[data-action="purch-docs-page"]', (e) => {
			e.preventDefault();
			const p = parseInt($(e.currentTarget).data("page"), 10);
			if (p && p !== this.purchase_docs_page) {
				this.purchase_docs_page = p;
				this.render_purchase_docs_panel();
			}
		});
	}

	close_active_dialog() {
		if (this.active_dialog) {
			try {
				this.active_dialog.hide();
			} catch (e) {
				// ignore
			}
			this.active_dialog = null;
		}
	}

	init_filters() {
		const me = this;

		this.project_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "Project",
				fieldname: "project",
				label: __("Project"),
				placeholder: __("Select Project"),
				change: () => {
					if (me.is_setting_filter_values) return;
					const val = me.project_field.get_value();
					if (val && val !== me.selected_project) {
						me.close_active_dialog();
						me.selected_project = val;
						me.from_date = null;
						me.to_date = null;
						me.is_setting_filter_values = true;
						if (me.year_field) me.year_field.set_value("");
						if (me.month_field) me.month_field.set_value("");
						me.is_setting_filter_values = false;
						me.load_summary();
					}
				},
			},
			parent: this.$wrapper.find('[data-filter="project-link"]'),
			render_input: true,
		});

		const curr_y = (typeof moment !== "undefined" ? moment().year() : new Date().getFullYear()) || 2026;
		const year_options = [{ value: "", label: __("Select Year") }];
		for (let y = curr_y + 2; y >= curr_y - 4; y--) {
			year_options.push({ value: String(y), label: String(y) });
		}

		this.year_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Select",
				fieldname: "year_select",
				label: __("Year"),
				options: year_options,
				change: () => {
					if (me.is_setting_filter_values) return;
					const year_val = me.year_field.get_value();
					if (!year_val) return;

					const y = parseInt(year_val, 10);
					const month_val = me.month_field ? me.month_field.get_value() : "";
					const pad = (n) => String(n).padStart(2, "0");

					let start_date, end_date;
					if (month_val) {
						const month_names = [
							"January", "February", "March", "April", "May", "June",
							"July", "August", "September", "October", "November", "December"
						];
						const m_idx = month_names.indexOf(month_val);
						if (m_idx !== -1) {
							start_date = `${y}-${pad(m_idx + 1)}-01`;
							const last_day = new Date(y, m_idx + 1, 0).getDate();
							end_date = `${y}-${pad(m_idx + 1)}-${pad(last_day)}`;
						} else {
							start_date = `${y}-01-01`;
							end_date = `${y}-12-31`;
						}
					} else {
						start_date = `${y}-01-01`;
						end_date = `${y}-12-31`;
					}

					const today_str = frappe.datetime.now_date();
					if (start_date > today_str) {
						frappe.msgprint(__("Cannot query future periods. Please select the current year or an earlier period."));
						return;
					}
					if (end_date > today_str) {
						end_date = today_str;
					}

					me.is_setting_filter_values = true;
					me.close_active_dialog();
					me.from_date = start_date;
					me.to_date = end_date;
					me.from_date_field.set_value(start_date);
					me.to_date_field.set_value(end_date);
					me.is_setting_filter_values = false;

					me.load_summary();
				},
			},
			parent: this.$wrapper.find('[data-filter="year-select-wrap"]'),
			render_input: true,
		});

		const month_options = [
			{ value: "", label: __("Select Month") },
			{ value: "January", label: __("January") },
			{ value: "February", label: __("February") },
			{ value: "March", label: __("March") },
			{ value: "April", label: __("April") },
			{ value: "May", label: __("May") },
			{ value: "June", label: __("June") },
			{ value: "July", label: __("July") },
			{ value: "August", label: __("August") },
			{ value: "September", label: __("September") },
			{ value: "October", label: __("October") },
			{ value: "November", label: __("November") },
			{ value: "December", label: __("December") },
		];

		this.month_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Select",
				fieldname: "month_select",
				label: __("Month"),
				options: month_options,
				change: () => {
					if (me.is_setting_filter_values) return;
					const month_val = me.month_field.get_value();
					if (!month_val) return;

					const month_names = [
						"January", "February", "March", "April", "May", "June",
						"July", "August", "September", "October", "November", "December"
					];
					const month_index = month_names.indexOf(month_val);
					if (month_index === -1) return;

					let year = null;
					if (me.year_field && me.year_field.get_value()) {
						year = parseInt(me.year_field.get_value(), 10);
					} else if (me.to_date) {
						year = parseInt(me.to_date.split("-")[0], 10);
					} else if (me.from_date) {
						year = parseInt(me.from_date.split("-")[0], 10);
					} else if (me.data?.period?.to_date) {
						year = parseInt(me.data.period.to_date.split("-")[0], 10);
					} else if (me.data?.project_info?.expected_start_date) {
						year = parseInt(me.data.project_info.expected_start_date.split("-")[0], 10);
					} else {
						year = parseInt(frappe.datetime.now_date().split("-")[0], 10);
					}

					const pad = (n) => String(n).padStart(2, "0");
					const start_date = `${year}-${pad(month_index + 1)}-01`;
					const last_day = new Date(year, month_index + 1, 0).getDate();
					let end_date = `${year}-${pad(month_index + 1)}-${pad(last_day)}`;

					const today_str = frappe.datetime.now_date();
					if (start_date > today_str) {
						frappe.msgprint(__("Cannot query future periods. Please select the current month or an earlier period."));
						return;
					}
					if (end_date > today_str) {
						end_date = today_str;
					}

					me.is_setting_filter_values = true;
					if (me.year_field && me.year_field.get_value() !== String(year)) {
						me.year_field.set_value(String(year));
					}
					me.close_active_dialog();
					me.from_date = start_date;
					me.to_date = end_date;
					me.from_date_field.set_value(start_date);
					me.to_date_field.set_value(end_date);
					me.is_setting_filter_values = false;

					me.load_summary();
				},
			},
			parent: this.$wrapper.find('[data-filter="month-select-wrap"]'),
			render_input: true,
		});

		this.from_date_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Date",
				fieldname: "from_date",
				label: __("Period From"),
				placeholder: __("From Date"),
				change: () => {
					if (me.is_setting_filter_values) return;
					const val = me.from_date_field.get_value();
					if (val && val !== me.from_date) {
						const today_str = frappe.datetime.now_date();
						if (val > today_str) {
							frappe.msgprint(__("Future Period From date ({0}) is not permitted. Please select today ({1}) or an earlier date.", [val, today_str]));
							me.is_setting_filter_values = true;
							me.from_date_field.set_value(me.last_valid_from_date || me.from_date || "");
							me.is_setting_filter_values = false;
							return;
						}
						const current_to = me.to_date_field ? (me.to_date_field.get_value() || me.to_date) : me.to_date;
						if (current_to && val > current_to) {
							frappe.msgprint(__("Period From ({0}) cannot be after Period To ({1}).", [val, current_to]));
							me.is_setting_filter_values = true;
							me.from_date_field.set_value(me.last_valid_from_date || me.from_date || "");
							me.is_setting_filter_values = false;
							return;
						}
						me.close_active_dialog();
						me.from_date = val;
						me.is_setting_filter_values = true;
						me.sync_period_filters(me.from_date, me.to_date);
						me.is_setting_filter_values = false;
						me.load_summary();
					}
				},
			},
			parent: this.$wrapper.find('[data-filter="from-date-wrap"]'),
			render_input: true,
		});

		this.to_date_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Date",
				fieldname: "to_date",
				label: __("Period To"),
				placeholder: __("To Date"),
				change: () => {
					if (me.is_setting_filter_values) return;
					const val = me.to_date_field.get_value();
					if (val && val !== me.to_date) {
						const today_str = frappe.datetime.now_date();
						if (val > today_str) {
							frappe.msgprint(__("Future Period To date ({0}) is not permitted. Please select today ({1}) or an earlier date.", [val, today_str]));
							me.is_setting_filter_values = true;
							me.to_date_field.set_value(me.last_valid_to_date || me.to_date || today_str);
							me.is_setting_filter_values = false;
							return;
						}
						const current_from = me.from_date_field ? (me.from_date_field.get_value() || me.from_date) : me.from_date;
						if (current_from && current_from > val) {
							frappe.msgprint(__("Period From ({0}) cannot be after Period To ({1}).", [current_from, val]));
							me.is_setting_filter_values = true;
							me.to_date_field.set_value(me.last_valid_to_date || me.to_date || "");
							me.is_setting_filter_values = false;
							return;
						}
						me.close_active_dialog();
						me.to_date = val;
						me.is_setting_filter_values = true;
						me.sync_period_filters(me.from_date, me.to_date);
						me.is_setting_filter_values = false;
						me.load_summary();
					}
				},
			},
			parent: this.$wrapper.find('[data-filter="to-date-wrap"]'),
			render_input: true,
		});

		if (this.selected_project) {
			this.is_setting_filter_values = true;
			this.project_field.set_value(this.selected_project);
			this.is_setting_filter_values = false;
		}
	}

	sync_period_filters(from_date, to_date) {
		if (!from_date || !to_date) return;
		const parts_from = String(from_date).split("-");
		const parts_to = String(to_date).split("-");
		if (parts_from.length !== 3 || parts_to.length !== 3) return;

		const y_from = parseInt(parts_from[0], 10);
		const m_from = parseInt(parts_from[1], 10);
		const d_from = parseInt(parts_from[2], 10);

		const y_to = parseInt(parts_to[0], 10);
		const m_to = parseInt(parts_to[1], 10);
		const d_to = parseInt(parts_to[2], 10);

		// Sync Year field
		if (this.year_field) {
			const str_y = String(y_to || y_from);
			if (this.year_field.get_value() !== str_y) {
				this.year_field.set_value(str_y);
			}
		}

		// Sync Month field
		if (this.month_field) {
			if (y_from === y_to && m_from === m_to && d_from === 1) {
				const last_day = new Date(y_from, m_from, 0).getDate();
				if (d_to === last_day) {
					const month_names = [
						"January", "February", "March", "April", "May", "June",
						"July", "August", "September", "October", "November", "December"
					];
					const match = month_names[m_from - 1];
					if (this.month_field.get_value() !== match) {
						this.month_field.set_value(match);
					}
					return;
				}
			}
			if (this.month_field.get_value() !== "") {
				this.month_field.set_value("");
			}
		}
	}

	async load_summary() {
		if (!this.selected_project) {
			this.render_empty(__("Please select a project to view its summary."));
			return;
		}

		this.close_active_dialog();

		const $refreshBtn = this.$wrapper.find('[data-action="refresh"]');
		$refreshBtn.addClass("is-loading");

		if (!this.data) {
			this.$wrapper.find(".pfs-body-content").html(`
				<div class="pfs-loading-state">
					<div class="pfs-spinner"></div>
					<div>${__("Fetching reconciled financial and procurement data...")}</div>
				</div>
			`);
		}

		try {
			const res = await frappe.call({
				method: "cpc_construction_management.cpc_construction_management.page.project_financial_summary.project_financial_summary.get_project_financial_summary",
				args: {
					project: this.selected_project,
					from_date: this.from_date || undefined,
					to_date: this.to_date || undefined,
				},
			});

			this.data = res.message;
			this.last_valid_from_date = this.data.period?.from_date || this.from_date;
			this.last_valid_to_date = this.data.period?.to_date || this.to_date;
			this.render_data();
		} catch (err) {
			console.error("Project Financial Summary error:", err);
			if (this.data) {
				const msg = err.messages ? err.messages.join("<br>") : (err.message || __("Validation Error"));
				frappe.msgprint({
					title: __("Validation Error"),
					indicator: "orange",
					message: msg,
				});
				this.is_setting_filter_values = true;
				if (this.last_valid_from_date && this.from_date_field) {
					this.from_date_field.set_value(this.last_valid_from_date);
					this.from_date = this.last_valid_from_date;
				}
				if (this.last_valid_to_date && this.to_date_field) {
					this.to_date_field.set_value(this.last_valid_to_date);
					this.to_date = this.last_valid_to_date;
				}
				this.is_setting_filter_values = false;
			} else {
				this.render_error(err);
			}
		} finally {
			$refreshBtn.removeClass("is-loading");
		}
	}

	render_data() {
		const d = this.data;
		if (!d) return;

		const curr = d.project_info.currency || "";

		// Update Header metadata
		this.$wrapper.find('[data-field="header-project-id"]').text(d.project_info.name + (d.project_info.project_name ? ` (${d.project_info.project_name})` : ""));
		this.$wrapper.find('[data-field="header-company"]').text(d.project_info.company);
		this.$wrapper.find('[data-field="header-currency"]').text(curr);

		const fb_info = d.finance_book_settings || {};
		const fb_label = fb_info.finance_book_label || (d.period?.finance_book ? `${d.period.finance_book} (${__("Includes default FB entries")})` : `${__("Default Book")} (${__("Includes default FB entries")})`);
		this.$wrapper.find('[data-field="header-finance-book"]').text(fb_label);

		const refreshed_str = d.refreshed_at 
			? (frappe.datetime.str_to_user ? frappe.datetime.str_to_user(d.refreshed_at) : d.refreshed_at)
			: frappe.datetime.now_datetime();
		this.$wrapper.find('[data-field="header-last-refreshed"]').text(refreshed_str);

		// Update date filter controls without triggering auto-refresh loop
		this.is_setting_filter_values = true;
		if (this.from_date_field && d.period.from_date && this.from_date_field.get_value() !== d.period.from_date) {
			this.from_date_field.set_value(d.period.from_date);
		}
		if (this.to_date_field && d.period.to_date && this.to_date_field.get_value() !== d.period.to_date) {
			this.to_date_field.set_value(d.period.to_date);
		}
		this.from_date = d.period.from_date;
		this.to_date = d.period.to_date;
		this.sync_period_filters(d.period.from_date, d.period.to_date);
		this.is_setting_filter_values = false;

		const is_profit = d.financial_result.profit_loss >= 0;
		const profit_class = is_profit ? "pfs-card-profit" : "pfs-card-loss";
		const profit_label = is_profit ? __("Current profit") : __("Current loss");

		const is_budget_available = d.approved_cost_budget.is_available;
		const budget = d.approved_cost_budget.approved_budget;
		const is_zero_budget = is_budget_available && budget === 0;
		const ptd_expense = d.budget_comparison.ptd_expense || 0;
		const is_over = d.budget_comparison.is_over_budget;
		const expense_bar_percent = is_budget_available && budget > 0 ? Math.min(100, (ptd_expense / budget) * 100) : (is_budget_available ? 100 : 0);

		const flags_html = (d.quality_flags && d.quality_flags.length > 0) ? `
			<div class="pfs-flags-wrap">
				${d.quality_flags.map(f => `
					<div class="pfs-flag-item pfs-flag-${f.type}">
						<span class="pfs-flag-icon">${f.type === 'danger' ? '⚠️' : (f.type === 'warning' ? '⚠️' : 'ℹ️')}</span>
						<span class="pfs-flag-text"><strong>${f.label}:</strong> ${f.message}</span>
					</div>
				`).join('')}
			</div>
		` : '';

		const html = `
			${flags_html}

			<!-- Top 2 Cards: Sales Order Value & Approved Cost Budget -->
			<div class="pfs-top-grid">
				<div class="pfs-card">
					<div class="pfs-card-label">
						<span>${__("Sales Order value · before VAT")}</span>
					</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${this.format_number(d.sales_order_summary.value)}</span>
						<span class="pfs-card-curr">${curr}</span>
					</div>
					<div class="pfs-card-sub">
						<a class="pfs-action-link" data-action="drilldown-sales">
							${d.sales_order_summary.contract_count} ${__("Contract(s)")} · ${d.sales_order_summary.sales_order_count} ${__("Sales Order(s)")}
						</a>
					</div>
				</div>

				<div class="pfs-card">
					<div class="pfs-card-label">
						<span>${__("Approved cost budget")}</span>
					</div>
					<div class="pfs-card-value-row">
						${is_budget_available ? `
							<span class="pfs-card-value">${this.format_number(budget)}</span>
							<span class="pfs-card-curr">${curr}</span>
						` : `
							<span class="pfs-card-value pfs-text-muted" style="font-size: 20px;">${__("Budget unavailable")}</span>
						`}
					</div>
					<div class="pfs-card-sub">
						${is_budget_available ? `
							<a class="pfs-action-link" data-action="drilldown-budget">
								${is_zero_budget ? __("Zero budget approved") : __("Project budget · View contracts")}
							</a>
						` : `
							<span class="pfs-text-muted">${__("No approved budget found")}</span>
						`}
					</div>
				</div>
			</div>

			<!-- Financial Result Section -->
			<div class="pfs-section-title-wrap">
				<h2 class="pfs-section-title">${__("Financial result")}</h2>
				<a class="pfs-action-link ${this.pnl_expanded ? 'is-active' : ''}" data-action="view-pnl">
					${__("View P&L breakdown")} ↗
				</a>
			</div>

			<div class="pfs-financial-grid">
				<div class="pfs-card">
					<div class="pfs-card-label">${__("Income booked")}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${this.format_number(d.financial_result.income)}</span>
						<span class="pfs-card-curr">${curr}</span>
					</div>
					<div class="pfs-card-sub">${__("Posted income")}</div>
				</div>

				<div class="pfs-card">
					<div class="pfs-card-label">${__("Actual expense")}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${this.format_number(d.financial_result.expense)}</span>
						<span class="pfs-card-curr">${curr}</span>
					</div>
					<div class="pfs-card-sub">${__("Posted expense")}</div>
				</div>

				<div class="pfs-card ${profit_class}">
					<div class="pfs-card-label">${profit_label}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${this.format_number(d.financial_result.profit_loss)}</span>
						<span class="pfs-card-curr">${curr}</span>
					</div>
					<div class="pfs-card-sub">${__("For the selected period")}</div>
				</div>
			</div>

			<!-- Inline P&L Breakdown Panel -->
			<div class="pfs-pnl-panel ${this.pnl_expanded ? '' : 'hide'}" data-pnl-panel>
				<div class="pfs-pnl-panel-header">
							<div>
								<span class="pfs-pnl-panel-title">${__("P&L · selected Project and period")}</span>
								<span class="pfs-pnl-fb-badge">${__("FB")}: <strong>${fb_label}</strong></span>
							</div>
							<a class="pfs-pnl-report-link" data-action="open-full-pnl-report">
								${__("Open standard P&L report")} ↗
							</a>
						</div>
				<div class="pfs-pnl-row">
					<span class="pfs-pnl-row-label">${__("Income")}</span>
					<span class="pfs-pnl-row-val">${curr} ${this.format_number(d.financial_result.income)}</span>
				</div>
				${(d.financial_result.income_lines && d.financial_result.income_lines.length > 0) ? `
					<div class="pfs-pnl-sublines">
						${d.financial_result.income_lines.map(l => `
							<div class="pfs-pnl-subline-item">
								<span>${l.account}</span>
								<span>${curr} ${this.format_number(l.amount)}</span>
							</div>
						`).join('')}
					</div>
				` : ''}
				<div class="pfs-pnl-row">
					<span class="pfs-pnl-row-label">${__("Expense")}</span>
					<span class="pfs-pnl-row-val">${curr} ${this.format_number(d.financial_result.expense)}</span>
				</div>
				${(d.financial_result.expense_lines && d.financial_result.expense_lines.length > 0) ? `
					<div class="pfs-pnl-sublines">
						${d.financial_result.expense_lines.map(l => `
							<div class="pfs-pnl-subline-item">
								<span>${l.account}</span>
								<span>${curr} ${this.format_number(l.amount)}</span>
							</div>
						`).join('')}
					</div>
				` : ''}
				<div class="pfs-pnl-row pfs-pnl-row-net ${is_profit ? 'is-profit' : 'is-loss'}">
					<span class="pfs-pnl-row-label">${is_profit ? __("Net profit") : __("Net loss")}</span>
					<span class="pfs-pnl-row-val">${curr} ${this.format_number(d.financial_result.profit_loss)}</span>
				</div>
			</div>

			<!-- Middle Grid: Budget vs Actual Expense & Breakdown -->
			<div class="pfs-middle-grid">
				<!-- Left: Budget vs Actual Bar Chart -->
				<div class="pfs-card">
					<div class="pfs-card-label">
						<span>${__("Budget vs actual expense")}</span>
					</div>

					<div class="pfs-progress-block">
						<div class="pfs-progress-row">
							<span>${__("Approved budget")}</span>
							<strong>${is_budget_available ? this.format_number(budget) : `<span class="pfs-text-muted">${__("Unavailable")}</span>`}</strong>
						</div>
						<div class="pfs-bar-track">
							<div class="pfs-bar-fill-budget" style="width: ${is_budget_available ? '100%' : '0%'};"></div>
						</div>

						<div class="pfs-progress-row">
							<span>${__("Actual expense (Project to date)")}</span>
							<strong>${this.format_number(ptd_expense)}</strong>
						</div>
						<div class="pfs-bar-track">
							<div class="pfs-bar-fill-expense ${is_over ? 'is-over' : ''}" style="width: ${expense_bar_percent}%;"></div>
						</div>
					</div>

					<div class="pfs-budget-diff-box ${is_over ? 'is-over' : ''} ${!is_budget_available ? 'is-unavailable' : ''}">
						<span class="pfs-budget-diff-label">${d.budget_comparison.label}</span>
						<span class="pfs-budget-diff-val">${is_budget_available ? (this.format_number(d.budget_comparison.difference) + ' ' + curr) : '—'}</span>
					</div>

					<div class="pfs-budget-foot-note">
						${!is_budget_available ? __("Budget unavailable · Pending purchases are shown separately below.") : (is_zero_budget ? __("N/A used (Zero budget) · Pending purchases are shown separately below.") : `${d.budget_comparison.usage_percent}% ${__("used · Pending purchases are shown separately below.")}`)}
					</div>
				</div>

				<!-- Right: Actual Expense Breakdown -->
				<div class="pfs-card">
					<div class="pfs-card-label">
						${__("Actual expense breakdown")}
					</div>

					${this.render_breakdown_visual(d.expense_classification)}
				</div>
			</div>

			<!-- Current Purchase Status Section -->
			<div class="pfs-section-title-wrap">
				<h2 class="pfs-section-title">${__("Current purchase status")}</h2>
			</div>

			<div class="pfs-purchase-grid">
				<div class="pfs-card pfs-purchase-card" data-purch-card="material_requests">
					<div class="pfs-card-label">${__("Material Requests")}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${d.purchase_status.material_requests.submitted}</span>
						${d.purchase_status.material_requests.draft > 0 ? `
							<span class="pfs-purch-badge-draft">+ ${d.purchase_status.material_requests.draft} ${__("draft")}</span>
						` : ''}
					</div>
				</div>

				<div class="pfs-card pfs-purchase-card" data-purch-card="purchase_orders">
					<div class="pfs-card-label">${__("Purchase Orders")}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${d.purchase_status.purchase_orders.submitted}</span>
						${d.purchase_status.purchase_orders.draft > 0 ? `
							<span class="pfs-purch-badge-draft">+ ${d.purchase_status.purchase_orders.draft} ${__("draft")}</span>
						` : ''}
					</div>
				</div>

				<div class="pfs-card pfs-purchase-card" data-purch-card="purchase_receipts">
					<div class="pfs-card-label">${__("Purchase Receipts")}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${d.purchase_status.purchase_receipts.submitted}</span>
						${d.purchase_status.purchase_receipts.draft > 0 ? `
							<span class="pfs-purch-badge-draft">+ ${d.purchase_status.purchase_receipts.draft} ${__("draft")}</span>
						` : ''}
					</div>
				</div>

				<div class="pfs-card pfs-purchase-card" data-purch-card="purchase_invoices">
					<div class="pfs-card-label">${__("Purchase Invoices")}</div>
					<div class="pfs-card-value-row">
						<span class="pfs-card-value">${d.purchase_status.purchase_invoices.submitted}</span>
						${d.purchase_status.purchase_invoices.draft > 0 ? `
							<span class="pfs-purch-badge-draft">+ ${d.purchase_status.purchase_invoices.draft} ${__("draft")}</span>
						` : ''}
					</div>
				</div>
			</div>

			<div class="pfs-purchase-footer-strip">
				<div class="pfs-open-po-strip">
					<div class="pfs-open-po-main">
						<span>${__("Open PO · not yet billed")}:</span>
						<strong>${this.format_number(d.purchase_status.open_po_amount)} ${curr}</strong>
						${(d.purchase_status.open_po_summary && d.purchase_status.open_po_summary.received_unbilled_amount > 0) ? `
							<span class="pfs-received-unbilled-badge">· ${this.format_number(d.purchase_status.open_po_summary.received_unbilled_amount)} ${curr} ${__("received unbilled")}</span>
						` : ''}
						${(d.purchase_status.open_po_summary && d.purchase_status.open_po_summary.overbilled_amount > 0) ? `
							<span class="pfs-overbilled-badge">· ${this.format_number(d.purchase_status.open_po_summary.overbilled_amount)} ${curr} ${__("overbilled")}</span>
						` : ''}
					</div>
				</div>
			</div>

			<!-- Expanded Purchase Documents List Panel -->
			<div class="pfs-purchase-docs-panel hide" data-purchase-docs-panel></div>
		`;

		this.$wrapper.find(".pfs-body-content").html(html);
		this.render_purchase_docs_panel();
	}

	render_purchase_docs_panel() {
		const d = this.data;
		if (!d) return;

		const curr = d.project_info.currency || "";
		const $panel = this.$wrapper.find("[data-purchase-docs-panel]");

		// Update active classes on cards
		this.$wrapper.find("[data-purch-card]").removeClass("is-active");

		if (!this.active_purchase_type) {
			$panel.addClass("hide").empty();
			return;
		}

		this.$wrapper.find(`[data-purch-card="${this.active_purchase_type}"]`).addClass("is-active");

		const config = {
			material_requests: {
				title: __("Material Requests"),
				col_label: __("Quantity / Items"),
				slug: "material-request",
				val_fn: (doc) => `${doc.qty || 0} (${doc.item_count || 1} items)`,
			},
			purchase_orders: {
				title: `${__("Purchase Orders")} · ${curr}`,
				col_label: __("Order value"),
				slug: "purchase-order",
				val_fn: (doc) => this.format_number(doc.amount),
			},
			purchase_receipts: {
				title: `${__("Purchase Receipts")} · ${curr}`,
				col_label: __("Receipt value"),
				slug: "purchase-receipt",
				val_fn: (doc) => this.format_number(doc.amount),
			},
			purchase_invoices: {
				title: `${__("Purchase Invoices")} · ${curr}`,
				col_label: __("Invoice value"),
				slug: "purchase-invoice",
				val_fn: (doc) => this.format_number(doc.amount),
			},
		};

		const meta = config[this.active_purchase_type];
		if (!meta) {
			$panel.addClass("hide").empty();
			return;
		}

		const docs = (d.purchase_status[this.active_purchase_type]?.documents) || [];
		const total_docs = docs.length;
		const page_size = 10;
		const total_pages = Math.ceil(total_docs / page_size) || 1;

		if (this.purchase_docs_page > total_pages) this.purchase_docs_page = total_pages;
		if (this.purchase_docs_page < 1) this.purchase_docs_page = 1;

		const start_idx = (this.purchase_docs_page - 1) * page_size;
		const end_idx = Math.min(start_idx + page_size, total_docs);
		const paged_docs = docs.slice(start_idx, end_idx);

		const rows = paged_docs.length ? paged_docs.map((doc) => {
			const is_split = doc.total_document_amount && Math.abs(doc.total_document_amount - doc.amount) > 0.01;
			const split_info = is_split ? ` <span class="pfs-text-muted" style="font-size: 11px;">(${__("of")} ${this.format_number(doc.total_document_amount)})</span>` : '';
			
			const is_draft = doc.docstatus === 0 || (doc.status && doc.status.toLowerCase() === "draft");
			const status_text = is_draft ? __("Draft") : (doc.status || __("Submitted"));
			const status_class = is_draft ? "is-draft" : "is-submitted";
			const status_badge = `<span class="pfs-doc-badge ${status_class}">${status_text}</span>`;

			return `
				<tr>
					<td>
						<div class="pfs-doc-name-cell">
							<a class="pfs-doc-link" href="/app/${meta.slug}/${doc.name}" target="_blank">
								${doc.name}
							</a>
							${status_badge}
						</div>
					</td>
					<td class="pfs-doc-val">
						${meta.val_fn(doc)}
						${split_info}
					</td>
				</tr>
			`;
		}).join("") : `<tr><td colspan="2" style="color: var(--pfs-muted); padding: 12px 6px;">${__("No documents found.")}</td></tr>`;

		let pagination_html = "";
		if (total_docs > page_size) {
			let page_buttons = "";
			const max_visible = 5;
			let start_page = Math.max(1, this.purchase_docs_page - Math.floor(max_visible / 2));
			let end_page = Math.min(total_pages, start_page + max_visible - 1);
			if (end_page - start_page + 1 < max_visible) {
				start_page = Math.max(1, end_page - max_visible + 1);
			}

			if (start_page > 1) {
				page_buttons += `
					<button class="btn btn-xs btn-default pfs-page-btn" data-action="purch-docs-page" data-page="1">1</button>
				`;
				if (start_page > 2) {
					page_buttons += `<span class="pfs-page-ellipsis">…</span>`;
				}
			}

			for (let p = start_page; p <= end_page; p++) {
				const is_curr = p === this.purchase_docs_page;
				page_buttons += `
					<button class="btn btn-xs ${is_curr ? 'btn-primary' : 'btn-default'} pfs-page-btn" data-action="purch-docs-page" data-page="${p}">
						${p}
					</button>
				`;
			}

			if (end_page < total_pages) {
				if (end_page < total_pages - 1) {
					page_buttons += `<span class="pfs-page-ellipsis">…</span>`;
				}
				page_buttons += `
					<button class="btn btn-xs btn-default pfs-page-btn" data-action="purch-docs-page" data-page="${total_pages}">${total_pages}</button>
				`;
			}

			pagination_html = `
				<div class="pfs-purchase-docs-pagination">
					<span class="pfs-pagination-info">
						${__("Showing {0}–{1} of {2} records", [start_idx + 1, end_idx, total_docs])}
					</span>
					<div class="pfs-pagination-controls">
						<button class="btn btn-xs btn-default pfs-page-nav-btn" data-action="purch-docs-prev" ${this.purchase_docs_page <= 1 ? 'disabled' : ''}>
							${__("« Previous")}
						</button>
						${page_buttons}
						<button class="btn btn-xs btn-default pfs-page-nav-btn" data-action="purch-docs-next" ${this.purchase_docs_page >= total_pages ? 'disabled' : ''}>
							${__("Next »")}
						</button>
					</div>
				</div>
			`;
		} else if (total_docs > 0) {
			pagination_html = `
				<div class="pfs-purchase-docs-pagination">
					<span class="pfs-pagination-info">
						${__("Showing all {0} records", [total_docs])}
					</span>
				</div>
			`;
		}

		$panel.html(`
			<div class="pfs-purchase-docs-header">
				<span class="pfs-purchase-docs-title">${meta.title} (${total_docs})</span>
			</div>
			<table class="pfs-doc-table">
				<thead>
					<tr>
						<th style="text-align: left;">${__("Document")}</th>
						<th style="text-align: right;">${meta.col_label}</th>
					</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>
			${pagination_html}
		`).removeClass("hide");
	}

	render_breakdown_visual(classification) {
		const total = classification?.total_expense || 0;
		const has_negative = total < 0 || (classification?.planned || 0) < 0 || (classification?.unplanned || 0) < 0 || (classification?.unclassified || 0) < 0;

		if (has_negative || total === 0) {
			return this.render_signed_bars(classification);
		}
		return `
			<div class="pfs-donut-wrap">
				<div class="pfs-donut-svg-container">
					${this.render_donut_svg(classification)}
					<div class="pfs-donut-center-text">
						<div class="pfs-donut-center-amt">${this.format_number(classification.total_expense)}</div>
						<div class="pfs-donut-center-label">${this.data?.project_info?.currency || ''} ${__("expense")}</div>
					</div>
				</div>

				<div class="pfs-donut-legend">
					<div class="pfs-legend-item" data-filter-cat="planned" style="cursor: pointer;" title="${__("Click to filter details")}">
						<span class="pfs-legend-label">
							<span class="pfs-legend-dot" style="background: var(--pfs-blue);"></span>
							${__("Planned")}
						</span>
						<span class="pfs-legend-val">${this.format_number(classification.planned)}</span>
					</div>

					<div class="pfs-legend-item" data-filter-cat="unplanned" style="cursor: pointer;" title="${__("Click to filter details")}">
						<span class="pfs-legend-label">
							<span class="pfs-legend-dot" style="background: var(--pfs-amber);"></span>
							${__("Unplanned")}
						</span>
						<span class="pfs-legend-val">${this.format_number(classification.unplanned)}</span>
					</div>

					${Math.abs(classification.unclassified || 0) > 0.001 ? `
						<div class="pfs-legend-item" data-filter-cat="unclassified" style="cursor: pointer;" title="${__("Click to filter details")}">
							<span class="pfs-legend-label">
								<span class="pfs-legend-dot" style="background: #94a3b8;"></span>
								${__("Unclassified")}
							</span>
							<span class="pfs-legend-val">${this.format_number(classification.unclassified)}</span>
						</div>
					` : ''}
				</div>
			</div>
		`;
	}

	render_signed_bars(classification) {
		const curr = this.data?.project_info?.currency || '';
		const total = classification?.total_expense || 0;
		const max_val = Math.max(
			1,
			Math.abs(classification?.planned || 0),
			Math.abs(classification?.unplanned || 0),
			Math.abs(classification?.unclassified || 0),
			Math.abs(total)
		);

		const get_width = (v) => Math.min(100, Math.round((Math.abs(v || 0) / max_val) * 100));

		return `
			<div class="pfs-signed-bars-wrap">
				<div class="pfs-signed-header">
					<span class="pfs-signed-total-label">${__("Net Expense")}:</span>
					<strong class="pfs-signed-total-val ${total < 0 ? 'is-credit' : ''}">
						${this.format_number(total)} ${curr}
					</strong>
					${total < 0 ? `<span class="pfs-badge-review">⚠️ ${__("Credit / Reversal")}</span>` : ''}
				</div>
				<div class="pfs-signed-bars">
					<div class="pfs-signed-row" data-filter-cat="planned" style="cursor: pointer;" title="${__("Click to filter details")}">
						<span class="pfs-signed-label">
							<span class="pfs-legend-dot" style="background: var(--pfs-blue);"></span>
							<span>${__("Planned")}</span>
						</span>
						<div class="pfs-signed-track">
							<div class="pfs-signed-fill" style="width: ${get_width(classification?.planned)}%; background: var(--pfs-blue);"></div>
						</div>
						<span class="pfs-signed-val">${this.format_number(classification?.planned)}</span>
					</div>

					<div class="pfs-signed-row" data-filter-cat="unplanned" style="cursor: pointer;" title="${__("Click to filter details")}">
						<span class="pfs-signed-label">
							<span class="pfs-legend-dot" style="background: var(--pfs-amber);"></span>
							<span>${__("Unplanned")}</span>
						</span>
						<div class="pfs-signed-track">
							<div class="pfs-signed-fill" style="width: ${get_width(classification?.unplanned)}%; background: var(--pfs-amber);"></div>
						</div>
						<span class="pfs-signed-val">${this.format_number(classification?.unplanned)}</span>
					</div>

					<div class="pfs-signed-row" data-filter-cat="unclassified" style="cursor: pointer;" title="${__("Click to filter details")}">
						<span class="pfs-signed-label">
							<span class="pfs-legend-dot" style="background: #94a3b8;"></span>
							<span>${__("Unclassified")}</span>
						</span>
						<div class="pfs-signed-track">
							<div class="pfs-signed-fill" style="width: ${get_width(classification?.unclassified)}%; background: #94a3b8;"></div>
						</div>
						<span class="pfs-signed-val">${this.format_number(classification?.unclassified)}</span>
					</div>
				</div>
			</div>
		`;
	}

	render_donut_svg(classification) {
		const total = classification.total_expense || 0;
		if (total <= 0) {
			return `
				<svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
					<circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" stroke-width="3.8"/>
				</svg>
			`;
		}

		const planned = Math.max(0, classification.planned || 0);
		const unplanned = Math.max(0, classification.unplanned || 0);
		const unclassified = Math.max(0, classification.unclassified || 0);

		const p1 = (planned / total) * 100;
		const p2 = (unplanned / total) * 100;
		const p3 = (unclassified / total) * 100;

		const offset1 = 0;
		const offset2 = 100 - p1;
		const offset3 = 100 - (p1 + p2);

		return `
			<svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
				<circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" stroke-width="3.8"/>
				${p1 > 0 ? `
					<circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--pfs-blue)" stroke-width="3.8"
						stroke-dasharray="${p1} ${100 - p1}" stroke-dashoffset="${offset1}"/>
				` : ''}
				${p2 > 0 ? `
					<circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--pfs-amber)" stroke-width="3.8"
						stroke-dasharray="${p2} ${100 - p2}" stroke-dashoffset="${offset2}"/>
				` : ''}
				${p3 > 0 ? `
					<circle cx="18" cy="18" r="15.915" fill="none" stroke="#94a3b8" stroke-width="3.8"
						stroke-dasharray="${p3} ${100 - p3}" stroke-dashoffset="${offset3}"/>
				` : ''}
			</svg>
		`;
	}

	show_expense_details(category = null) {
		const d = this.data?.expense_classification;
		if (!d || !d.details) return;

		const curr = this.data?.project_info?.currency || "";
		let details = d.details;
		if (category) {
			details = details.filter(it => it.category === category);
		}

		const rows = details.length ? details.map(it => {
			const cat_badge = it.category === "planned"
				? `<span class="pfs-cat-badge is-planned">${__("Planned")}</span>`
				: (it.category === "unplanned"
					? `<span class="pfs-cat-badge is-unplanned">${__("Unplanned")}</span>`
					: `<span class="pfs-cat-badge is-unclassified">${__("Unclassified")}</span>`);

			const v_link = it.voucher_type && it.voucher_no
				? `<a href="/app/${frappe.router.slug(it.voucher_type)}/${it.voucher_no}" target="_blank"><strong>${it.voucher_no}</strong></a>`
				: (it.voucher_no || "—");

			return `
				<tr>
					<td>${it.posting_date || "—"}</td>
					<td>${it.voucher_type || "—"}<br>${v_link}</td>
					<td>${it.account || "—"}<br><small class="pfs-text-muted">${it.remarks || it.item_code || ""}</small></td>
					<td>${cat_badge}</td>
					<td style="text-align: right; font-weight: 600;">${this.format_number(it.amount)} ${curr}</td>
				</tr>
			`;
		}).join("") : `<tr><td colspan="5" style="text-align: center; color: var(--pfs-muted); padding: 16px;">${__("No expense records found.")}</td></tr>`;

		const dialog = new frappe.ui.Dialog({
			title: __("Expense Classification Source Details"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
		});

		dialog.fields_dict.html.$wrapper.html(`
			<div style="padding: 10px;">
				<div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
					<span style="font-size: 13px; color: var(--pfs-muted);">
						${__("Total Reconciled Expense")}: <strong>${this.format_number(d.total_expense)} ${curr}</strong>
					</span>
				</div>
				<table class="pfs-dialog-table">
					<thead>
						<tr>
							<th>${__("Date")}</th>
							<th>${__("Source Voucher")}</th>
							<th>${__("Account / Remarks")}</th>
							<th>${__("Category")}</th>
							<th style="text-align: right;">${__("Amount")}</th>
						</tr>
					</thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
		`);

		this.active_dialog = dialog;
		dialog.onhide = () => {
			if (this.active_dialog === dialog) {
				this.active_dialog = null;
			}
		};
		dialog.show();
	}

	open_pnl_report() {
		const d = this.data;
		if (!d) return;

		const report_args = {
			company: d.project_info.company,
			project: JSON.stringify([d.project_info.name]),
			filter_based_on: "Date Range",
			period_start_date: d.period.from_date,
			period_end_date: d.period.to_date,
			periodicity: "Yearly",
			include_default_book_entries: 1,
		};

		if (d.period?.finance_book) {
			report_args.finance_book = d.period.finance_book;
		}

		frappe.set_route("query-report", "Profit and Loss Statement", report_args);
	}

	show_sales_drilldown() {
		this.close_active_dialog();
		const d = this.data?.sales_order_summary;
		if (!d) return;

		const rows = (d.sales_orders || []).map(so => `
			<tr>
				<td><a href="/app/sales-order/${so}" target="_blank"><strong>${so}</strong></a></td>
				<td>${__("Submitted")}</td>
			</tr>
		`).join("");

		const contractRows = (d.contracts || []).map(c => `
			<tr>
				<td><a href="/app/construction-contract/${c}" target="_blank"><strong>${c}</strong></a></td>
				<td>${__("Approved")}</td>
			</tr>
		`).join("");

		const dialog = new frappe.ui.Dialog({
			title: __("Contributing Contracts & Sales Orders"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
		});

		dialog.fields_dict.html.$wrapper.html(`
			<div style="padding: 10px;">
				<h4 style="margin: 0 0 10px; font-size: 14px;">${__("Construction Contracts ({0})", [d.contract_count])}</h4>
				<table class="pfs-dialog-table" style="margin-bottom: 20px;">
					<thead><tr><th>${__("Contract")}</th><th>${__("Status")}</th></tr></thead>
					<tbody>${contractRows || '<tr><td colspan="2">—</td></tr>'}</tbody>
				</table>

				<h4 style="margin: 0 0 10px; font-size: 14px;">${__("Sales Orders ({0})", [d.sales_order_count])}</h4>
				<table class="pfs-dialog-table">
					<thead><tr><th>${__("Sales Order")}</th><th>${__("Status")}</th></tr></thead>
					<tbody>${rows || '<tr><td colspan="2">—</td></tr>'}</tbody>
				</table>
			</div>
		`);

		this.active_dialog = dialog;
		dialog.onhide = () => {
			if (this.active_dialog === dialog) {
				this.active_dialog = null;
			}
		};
		dialog.show();
	}

	show_budget_drilldown() {
		const d = this.data?.approved_cost_budget;
		if (!d) return;

		const curr = this.data?.project_info?.currency || "";
		const rows = (d.contracts || []).map(c => `
			<tr>
				<td><a href="/app/construction-contract/${c.contract}" target="_blank"><strong>${c.contract}</strong></a></td>
				<td style="text-align: right; font-weight: 700;">${this.format_number(c.budget)} ${curr}</td>
			</tr>
		`).join("");

		const dialog = new frappe.ui.Dialog({
			title: __("Approved Contract Budgets"),
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
		});

		dialog.fields_dict.html.$wrapper.html(`
			<div style="padding: 10px;">
				<table class="pfs-dialog-table">
					<thead><tr><th>${__("Contract")}</th><th style="text-align: right;">${__("Budget")}</th></tr></thead>
					<tbody>${rows || '<tr><td colspan="2">—</td></tr>'}</tbody>
				</table>
			</div>
		`);

		this.active_dialog = dialog;
		dialog.onhide = () => {
			if (this.active_dialog === dialog) {
				this.active_dialog = null;
			}
		};
		dialog.show();
	}

	format_number(num) {
		if (num === null || num === undefined || isNaN(num)) return "0";
		return Number(num).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
	}

	render_empty(msg) {
		this.$wrapper.find(".pfs-body-content").html(`
			<div class="pfs-empty-state">
				<p>${msg}</p>
			</div>
		`);
	}

	render_error(err) {
		const is_perm = (err && err.exc_type === "PermissionError") || (err && String(err.message || "").includes("Not permitted"));
		if (is_perm) {
			this.$wrapper.find(".pfs-body-content").html(`
				<div class="pfs-empty-state pfs-perm-state">
					<div class="pfs-perm-icon">🔒</div>
					<h3>${__("Financial Access Required")}</h3>
					<p>${__("You do not have permission to view ledger entries and financial reports for this company. Please contact your system administrator for Accounts or Financial Reporting role permissions.")}</p>
				</div>
			`);
			return;
		}
		this.$wrapper.find(".pfs-body-content").html(`
			<div class="pfs-empty-state" style="color: var(--pfs-red);">
				<h4>${__("Unable to load summary")}</h4>
				<p>${frappe.get_error_message(err) || __("An error occurred while fetching project financial data.")}</p>
			</div>
		`);
	}
};
