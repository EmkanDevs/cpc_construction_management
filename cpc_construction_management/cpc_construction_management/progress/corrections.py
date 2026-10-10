"""Step 10 - correcting an approved weekly record (handoff 17.1 / 17.2).

Flow: impact preview -> commercial dependency gate -> cancel original (kept, never
deleted) -> linked amendment draft -> independent PM approval through the normal
Step 6 workflow. Nothing here touches invoices, payment requests or BOQ values.
"""
import frappe
from frappe import _
from frappe.utils import flt, nowdate

from .completion import get_reporting_windows
from .correction_calc import classify_record, restored_weeks

PROGRESS = "IRPO Progress"


def _require_authority():
    # Roles are decided by the client in Role Permission Manager: cancelling an approved
    # IRPO Progress record requires 'cancel' permission on the doctype.
    frappe.has_permission(PROGRESS, "cancel", throw=True)


def find_dependencies(doctype, names):
    """Direct links to `names` from other doctypes (incl. custom fields).
    Returns {'blocking': submitted docs, 'references': other docs}. Works for any
    document a later story (payment request, invoice) links to a progress record."""
    if not names:
        return {"blocking": [], "references": []}
    link_fields = frappe.get_all("DocField", filters={"fieldtype": "Link", "options": doctype},
                                 fields=["parent", "fieldname"])
    link_fields += frappe.get_all("Custom Field", filters={"fieldtype": "Link", "options": doctype},
                                  fields=["dt as parent", "fieldname"])
    blocking, references, seen = [], [], set()
    for lf in link_fields:
        if (lf.parent, lf.fieldname) in seen or lf.parent == doctype or not frappe.db.exists("DocType", lf.parent):
            continue
        seen.add((lf.parent, lf.fieldname))
        meta = frappe.get_meta(lf.parent)
        if meta.istable or not frappe.db.has_column(lf.parent, lf.fieldname):
            continue
        rows = frappe.get_all(lf.parent, filters={lf.fieldname: ["in", list(names)]},
                              fields=["name", "docstatus", lf.fieldname + " as target"])
        for r in rows:
            item = {"doctype": lf.parent, "name": r.name, "field": lf.fieldname, "target": r.target}
            if meta.is_submittable and r.docstatus == 1:
                blocking.append(item)
            elif r.docstatus != 2:
                references.append(item)
    return {"blocking": blocking, "references": references}


def _approved(task):
    return [
        {"name": r.name, "week_start": r.week_start_date, "cutoff": r.measurement_cutoff_date,
         "cum_qty": r.cum_completed_qty, "cum_percent": r.cum_percent}
        for r in frappe.get_all(PROGRESS, filters={"irpo_task": task, "docstatus": 1},
                                fields=["name", "week_start_date", "measurement_cutoff_date",
                                        "cum_completed_qty", "cum_percent"])
        if r.week_start_date and r.measurement_cutoff_date
    ]


@frappe.whitelist()
def get_correction_impact(name):
    doc = frappe.get_doc(PROGRESS, name)
    if doc.docstatus != 1:
        frappe.throw(_("Only an approved (submitted) record can be corrected."))
    records = _approved(doc.irpo_task)
    info = classify_record(records, name)

    now = get_reporting_windows(doc.irpo_task)
    without = get_reporting_windows(doc.irpo_task, exclude=name)
    restored = restored_weeks(now, without, nowdate())

    deps = find_dependencies(PROGRESS, [name] + info["later"])
    task = frappe.db.get_value("Task", doc.irpo_task, ["progress", "parent_task"], as_dict=True)
    parent_progress = frappe.db.get_value("Task", task.parent_task, "progress") if task and task.parent_task else None
    prev = info["previous"]
    return {
        "record": name,
        "irpo": doc.irpo_task,
        "week": doc.calendar_week,
        "cum_completed_qty": doc.cum_completed_qty,
        "cum_percent": doc.cum_percent,
        "is_latest_approved": info["is_latest"],
        "later_records_kept": info["later"],
        "next_record_period_may_change": info["next_later"],
        "completion_after_correction": (
            {"record": prev["name"], "cum_completed_qty": prev["cum_qty"], "cum_percent": prev["cum_percent"]}
            if info["is_latest"] and prev else
            ({"record": None, "cum_completed_qty": 0, "cum_percent": 0} if info["is_latest"] else "unchanged (later approved measurement stands)")
        ),
        "restored_reporting_weeks": [str(w) for w in restored],
        "current_irpo_progress": flt(task.progress) if task else None,
        "current_parent_progress": flt(parent_progress) if parent_progress is not None else None,
        "commercial_blockers": deps["blocking"],
        "other_references": deps["references"],
        "commercial_check": "direct links only; certified payment requests / invoices are detected when they link to IRPO Progress",
    }


@frappe.whitelist()
def cancel_and_amend(name, reason):
    _require_authority()
    reason = (reason or "").strip()
    if not reason:
        frappe.throw(_("A correction needs a reason."))
    impact = get_correction_impact(name)
    if impact["commercial_blockers"]:
        listing = ", ".join(f"{b['doctype']} {b['name']}" for b in impact["commercial_blockers"])
        frappe.throw(
            _("This progress is used by submitted commercial documents ({0}). Route the correction to commercial "
              "review first; the approved progress stays effective and nothing is changed automatically.").format(listing),
            title=_("Commercial review required"),
        )

    orig = frappe.get_doc(PROGRESS, name)
    orig.db_set("cancellation_reason", reason, update_modified=False)
    orig.db_set("downstream_dependency_refs",
                ", ".join(impact["later_records_kept"]) or None, update_modified=False)
    orig.cancel()

    new = frappe.copy_doc(orig)
    new.amended_from = orig.name
    new.docstatus = 0
    new.workflow_state = None
    new.remarks = ((orig.remarks or "") + f"\n[Correction of {orig.name}: {reason}]").strip()
    new.insert()

    orig.add_comment("Info", _("Cancelled for correction by {0}. Reason: {1}. Amendment: {2}").format(
        frappe.session.user, reason, new.name))
    new.add_comment("Info", _("Amendment of {0}. Reason: {1}. Requires independent approval.").format(orig.name, reason))
    return {"cancelled": orig.name, "amendment": new.name, "restored_reporting_weeks": impact["restored_reporting_weeks"]}