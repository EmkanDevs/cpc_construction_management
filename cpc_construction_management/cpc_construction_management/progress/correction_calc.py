"""Step 10 - pure helpers for correction impact and scope review (no Frappe imports)."""
from datetime import timedelta

try:
    from .revision_calc import to_date
    from .completion_calc import monday
except ImportError:  # running unit tests directly from this folder
    from revision_calc import to_date
    from completion_calc import monday


def classify_record(records, target_name):
    """records: approved dicts {name, week_start, cutoff, cum_qty, cum_percent}.
    Returns dict: is_latest, later (sorted names), next_later, previous (record or None)."""
    ordered = sorted(records, key=lambda r: (to_date(r["week_start"]), to_date(r["cutoff"]), r["name"]))
    idx = next(i for i, r in enumerate(ordered) if r["name"] == target_name)
    later = ordered[idx + 1:]
    return {
        "is_latest": not later,
        "later": [r["name"] for r in later],
        "next_later": later[0]["name"] if later else None,
        "previous": ordered[idx - 1] if idx > 0 else None,
    }


def closed_week_starts(windows, as_of):
    """Concrete week-start Mondays inside closed windows, up to as_of."""
    out, as_of = set(), monday(as_of)
    for start, end in windows:
        w = start
        limit = min(end - timedelta(days=7), as_of) if end else as_of
        while w <= limit:
            out.add(w)
            w += timedelta(days=7)
    return sorted(out)


def restored_weeks(windows_now, windows_without, as_of):
    """Weeks closed today that would become reporting obligations again."""
    without = set(closed_week_starts(windows_without, as_of))
    return [w for w in closed_week_starts(windows_now, as_of) if w not in without]


def hypothetical_parent_progress(children, exclude_name):
    """Simple average of live children (handoff 12.2), excluding one child.
    children: dicts {name, progress, status}. Cancelled children never count."""
    live = [c for c in children if c.get("status") != "Cancelled"]
    def avg(items):
        return round(sum(float(c.get("progress") or 0) for c in items) / len(items), 6) if items else None
    return {"current": avg(live), "without": avg([c for c in live if c["name"] != exclude_name])}