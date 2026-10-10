// // Material Request: Task filtered by Project + informational "Unplanned" message.
// // MERGE with any existing Material Request client script (later set_query wins).
// const IRPO_UNPLANNED_METHOD =
//   "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.check_item_planned";

// frappe.ui.form.on("Material Request", {
//   setup(frm) {
//     frm.set_query("task", "items", (doc, cdt, cdn) => {
//       const row = locals[cdt][cdn];
//       const project = row.project || doc.custom_project;  // MR keeps its project on custom_project
//       if (!project) {
//         frappe.show_alert({ message: __("Select Project first"), indicator: "orange" });
//         return { filters: { name: "__select_project_first__" } };
//       }
//       return { filters: { project: project, cpc_is_irpo: 1, is_group: 0 } };
//     });
//   },
// });

// frappe.ui.form.on("Material Request Item", {
//   project(frm, cdt, cdn) {
//     // a Task from another Project must never stay selected
//     frappe.model.set_value(cdt, cdn, "task", "");
//   },
//   task(frm, cdt, cdn) { irpo_check_unplanned(frm, cdt, cdn); },
//   item_code(frm, cdt, cdn) { irpo_check_unplanned(frm, cdt, cdn); },
// });

// function irpo_check_unplanned(frm, cdt, cdn) {
//   const row = locals[cdt][cdn];
//   if (!row.task || !row.item_code || row.cpc_irpo_unplanned_row_ref) return;
//   const key = `${row.task}|${row.item_code}`;
//   frm._irpo_warned = frm._irpo_warned || {};
//   if (frm._irpo_warned[key]) return;
//   frappe.call({
//     method: IRPO_UNPLANNED_METHOD,
//     args: { task: row.task, item_code: row.item_code },
//     callback(r) {
//       const m = r.message || {};
//       if (m.ambiguous) {
//         frappe.msgprint({
//           title: __("Multiple Planned Rows"), indicator: "red",
//           message: __("This item appears on several planned rows of the IRPO. Create the MR from the Task so the exact row is carried."),
//         });
//       } else if (!m.planned) {
//         frm._irpo_warned[key] = 1;
//         // Plain message: no Continue button. User closes it and uses normal Save/Submit.
//         frappe.msgprint({
//           title: __("Unplanned Item / Service"), indicator: "orange",
//           message: __("This item is not part of the planned items for the selected IRPO. It will be treated as an Unplanned Item/Service and its quantity and cost will be tracked separately against this IRPO."),
//         });
//       }
//     },
//   });
// }










// Material Request: Task filtered by Project + informational "Unplanned" message.
// MERGE with any existing Material Request client script.
const IRPO_UNPLANNED_METHOD =
  "cpc_construction_management.cpc_construction_management.budget.irpo_unplanned.check_item_planned";

// The row-level Task field is an Accounting Dimension. ERPNext's dimension setup
// (erpnext.accounts.dimensions) registers its own {is_group: 0} query for it
// ASYNCHRONOUSLY after the form loads, and the last set_query wins. So the Task
// query is (re)applied on setup, on refresh (twice) and every time a row form opens.
function irpo_apply_task_query(frm) {
  frm.set_query("task", "items", (doc, cdt, cdn) => {
    const row = locals[cdt][cdn];
    const project = row.project || doc.custom_project; // MR keeps its project on custom_project
    if (!project) {
      frappe.show_alert({ message: __("Select Project first"), indicator: "orange" });
      return { filters: { name: "__select_project_first__" } };
    }
    return { filters: { project: project, cpc_is_irpo: 1, is_group: 0 } };
  });
}

frappe.ui.form.on("Material Request", {
  setup(frm) {
    irpo_apply_task_query(frm);
  },
  refresh(frm) {
    irpo_apply_task_query(frm);
    setTimeout(() => irpo_apply_task_query(frm), 1500); // after the async dimension setup
  },
});

frappe.ui.form.on("Material Request Item", {
  form_render(frm) {
    irpo_apply_task_query(frm);
  },
  project(frm, cdt, cdn) {
    // Clear the Task only if it really belongs to a different Project.
    const row = locals[cdt][cdn];
    if (!row.task || !row.project) return;
    frappe.db.get_value("Task", row.task, "project").then((r) => {
      if (r.message && r.message.project !== row.project) {
        frappe.model.set_value(cdt, cdn, "task", "");
      }
    });
  },
  task(frm, cdt, cdn) { irpo_check_unplanned(frm, cdt, cdn); },
  item_code(frm, cdt, cdn) { irpo_check_unplanned(frm, cdt, cdn); },
});

function irpo_check_unplanned(frm, cdt, cdn) {
  const row = locals[cdt][cdn];
  if (!row.task || !row.item_code) return;

  // One server call per Task+Item per form session. Picking the Task and the Item in
  // quick succession shares the same promise, so the message can never pop up twice.
  const key = `${row.task}|${row.item_code}`;
  frm._irpo_cache = frm._irpo_cache || {};
  frm._irpo_warned = frm._irpo_warned || {};
  frm._irpo_cache[key] = frm._irpo_cache[key] ||
    frappe.xcall(IRPO_UNPLANNED_METHOD, { task: row.task, item_code: row.item_code });

  frm._irpo_cache[key].then((m) => {
    m = m || {};
    if (m.ambiguous) {
      frappe.msgprint({
        title: __("Multiple Planned Rows"), indicator: "red",
        message: __("This item appears on several planned rows of the IRPO. Create the MR from the Task so the exact row is carried."),
      });
    } else if (m.planned) {
      // Planned item: show the existing planned row ref straight away (no message).
      if (row.cpc_irpo_unplanned_row_ref) {
        frappe.model.set_value(cdt, cdn, "cpc_irpo_unplanned_row_ref", "");
      }
      if (row.cpc_irpo_budget_row_ref !== m.budget_row_ref) {
        frappe.model.set_value(cdt, cdn, "cpc_irpo_budget_row_ref", m.budget_row_ref);
      }
    } else {
      // Unplanned item: drop any planned ref left over from a previous item/task.
      if (row.cpc_irpo_budget_row_ref) {
        frappe.model.set_value(cdt, cdn, "cpc_irpo_budget_row_ref", "");
      }
      if (frm._irpo_warned[key] || row.cpc_irpo_unplanned_row_ref) return;
      frm._irpo_warned[key] = 1;
      // Plain message: close button only, no Continue. The user closes it and Saves normally.
      frappe.msgprint({
        title: __("Unplanned Item / Service"), indicator: "orange",
        message: __("This item is not part of the planned items for the selected IRPO. It will be treated as an Unplanned Item/Service and its quantity and cost will be tracked separately against this IRPO."),
      });
    }
  });
}