"""Step 12 - pure report helpers (no Frappe imports). Handoff Sections 12.2 and 19."""
try:
    from .revision_calc import to_date
except ImportError:  # unit tests run from this folder
    from revision_calc import to_date


def carry_forward(approved, week_start):
    """Latest APPROVED record whose period starts on/before week_start (official value in force).
    approved: dicts {week_start, cutoff, cum_percent, ...}. Returns the record or None."""
    ws = to_date(week_start)
    eligible = [r for r in approved if to_date(r["week_start"]) <= ws]
    return max(eligible, key=lambda r: (to_date(r["week_start"]), to_date(r.get("cutoff") or r["week_start"]))) if eligible else None


def member_in_week(created, cancel_effective, week_start, week_end):
    """Historical scope membership: existed by the week's end and not yet excluded by its start."""
    if created is not None and to_date(created) > to_date(week_end):
        return False
    if cancel_effective is not None and to_date(cancel_effective) <= to_date(week_start):
        return False
    return True


def parent_average(values):
    """Equal-weight simple average; unstarted children are passed as 0. None when no members."""
    values = [float(v or 0) for v in values]
    return round(sum(values) / len(values), 6) if values else None


def live_percent(qty, base):
    if not base or float(base) <= 0:
        return 0.0
    return round(min(100.0, float(qty or 0) * 100.0 / float(base)), 6)


def _p(v):
    return f"{float(v):g}%"


def cell_text(label, official, own=None):
    """Plain-text cell (export friendly). official = carried approved percent or None.
    Pending proposed values stay separate from the official percentage."""
    if label == "Not applicable":
        return ""
    if label == "Approved":
        return f"{_p(own)} Approved"
    if label == "Pending approval":
        return f"Pending {_p(own)}; official {_p(official)}" if own is not None else f"Pending; official {_p(official or 0)}"
    if label.startswith("Hold/carried"):
        return f"Hold/carried ({_p(official or 0)})"
    if label.startswith("Completed"):
        return f"Closed ({_p(official or 0)})"
    base = "Missing" if label.startswith(("Missing", "Update required", "Current")) else label.split(" — ")[0]
    return f"{base}; last approved {_p(official)}" if official is not None else base