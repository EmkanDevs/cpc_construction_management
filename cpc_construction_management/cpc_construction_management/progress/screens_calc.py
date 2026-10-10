"""Step 11 - pure labelling of a reporting week (handoff Section 13.1 table)."""
from datetime import date, datetime

ACTION_PREFIXES = ("Missing", "Draft — submission pending", "Returned", "Update required")


def _d(v):
    return v.date() if isinstance(v, datetime) else (v if isinstance(v, date) else datetime.strptime(str(v)[:10], "%Y-%m-%d").date())


def week_label(week_start, week_end, today, anchor_week_start, record=None,
               fully_held=False, partially_held=False, closed=False):
    """Returns the display label for one IRPO and one week.

    record: None or {docstatus, workflow_state} of the active (non-cancelled) record.
    A label never implies zero progress: 'Missing' is not 'no change'.
    """
    ws, we, today = _d(week_start), _d(week_end), _d(today)
    if anchor_week_start is None or ws < _d(anchor_week_start):
        return "Not applicable"
    if ws > today:
        return "Not applicable"

    if record:
        if record.get("docstatus") == 1:
            return "Approved"
        state = record.get("workflow_state") or "Draft"
        if state == "Pending Approval":
            return "Pending approval"
        if state == "Returned":
            return "Returned — update required"
        return "Draft — submission pending" if we < today else "Draft"

    if closed:
        return "Completed — reporting closed"
    if fully_held:
        return "Hold/carried"
    if ws <= today <= we:
        return "Current — not entered"
    if partially_held:
        return "Update required (active portion)"
    return "Missing — update required"


def needs_action(label):
    return label.startswith(ACTION_PREFIXES)