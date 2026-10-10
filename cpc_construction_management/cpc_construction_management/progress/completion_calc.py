"""Step 8 - pure reporting completion / reopening windows (handoff 15.3, 15.4).

Only APPROVED records are passed in, so a pending 100% never closes reporting.
A closed window is a half-open range of week-start Mondays [start, end);
end=None means still closed.
"""
from datetime import timedelta

try:
    from .revision_calc import TOLERANCE, to_date
except ImportError:  # running the unit tests directly from this folder
    from revision_calc import TOLERANCE, to_date


def monday(d):
    d = to_date(d)
    return d - timedelta(days=d.weekday())


def latest_effective_record(records):
    """records: dicts {week_start, cutoff, cum_qty}. Latest period wins, then latest cutoff."""
    if not records:
        return None
    return max(records, key=lambda r: (to_date(r["week_start"]), to_date(r["cutoff"]), float(r["cum_qty"])))


def closed_windows(records, revision_dates, base_at_fn, as_of, tol=TOLERANCE):
    """Closed reporting windows implied by the latest approved measurement.

    base_at_fn(date) -> effective base at that date.
    revision_dates: effective dates of approved base revisions.
    Future-dated revisions (> as_of) are not applied early.
    """
    last = latest_effective_record(records)
    if not last:
        return []
    cum = float(last["cum_qty"])
    cutoff = to_date(last["cutoff"])
    as_of = to_date(as_of)

    windows, start = [], None
    if cum >= float(base_at_fn(cutoff)) - tol:
        start = monday(last["week_start"]) + timedelta(days=7)

    for d in sorted({to_date(x) for x in revision_dates}):
        if d <= cutoff or d > as_of:
            continue
        complete_now = cum >= float(base_at_fn(d)) - tol
        if start is not None and not complete_now:
            end = monday(d)
            if end > start:
                windows.append((start, end))
            start = None
        elif start is None and complete_now:
            start = monday(d) + timedelta(days=7)
    if start is not None:
        windows.append((start, None))
    return windows


def is_week_closed(week_start, windows):
    w = monday(week_start)
    return any(s <= w and (e is None or w < e) for s, e in windows)


def window_containing(week_start, windows):
    w = monday(week_start)
    for s, e in windows:
        if s <= w and (e is None or w < e):
            return (s, e)
    return None