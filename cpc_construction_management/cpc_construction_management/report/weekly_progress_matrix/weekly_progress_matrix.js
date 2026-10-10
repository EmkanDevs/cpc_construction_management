frappe.query_reports["Weekly Progress Matrix"] = {
	filters: [
	{ fieldname: "project", label: __("Project"), fieldtype: "Link", options: "Project", reqd: 1 },
	{ fieldname: "boq_parent", label: __("BOQ Parent"), fieldtype: "Link", options: "Task" },
	{ fieldname: "irpo_task", label: __("IRPO"), fieldtype: "Link", options: "Task" },
	{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -56) },
	{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
	{ fieldname: "task_status", label: __("Task Status"), fieldtype: "Select", options: "\nOpen\nWorking\nPending Review\nOverdue\nCompleted\nCancelled" },
	],
	formatter(value, row, column, data, default_formatter) {
		const html = default_formatter(value, row, column, data);
		if (!data || !column.fieldname.startsWith("w_")) {
			return data && data.is_parent ? `<b>${html}</b>` : html;
		}
		const m = data["m_" + column.fieldname];
		const text = frappe.utils.escape_html(value || "");
		let out = text;
		if (m && m.rec) out = `<a href="/app/irpo-progress/${encodeURIComponent(m.rec)}">${text}</a>`;
		else if (m && m.missing) out = `<a href="/app/weekly-progress?project=${encodeURIComponent(m.project)}&calendar_week=${encodeURIComponent(m.week)}&search=${encodeURIComponent(m.task)}" class="text-danger">${text}</a>`;
		return data.is_parent ? `<b>${out}</b>` : out;
	},
};