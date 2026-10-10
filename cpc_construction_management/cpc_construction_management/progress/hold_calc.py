"""Step 9 - pure Hold / partial-period rules (no Frappe imports, unit-testable).

Handoff refs: Sections 15.1, 15.2, 20; acceptance tests 14, 26, 27, 28, 29, 46.

Datetimes are naive site-local datetimes. Period = [period_start, period_end]
(Monday 00:00:00 .. Sunday 23:59:59.999999). A Hold interval is [start, end):
work is invalid strictly inside it. end=None means still on Hold.
"""
from datetime import datetime, timedelta

HOLD = "Hold"
RESUME = "Resume"


def build_hold_intervals(events):
    """events: iterable of dicts {event_type, effective_datetime}.
    Returns sorted list of (start, end_or_None). Ignores duplicate Hold and
    orphan Resume events instead of failing (history is never rewritten)."""
    evs = sorted(
        (e for e in events if e.get("event_type") in (HOLD, RESUME)),
        key=lambda e: e["effective_datetime"],
    )
    out, open_start = [], None
    for e in evs:
        t = e["effective_datetime"]
        if e["event_type"] == HOLD and open_start is None:
            open_start = t
        elif e["event_type"] == RESUME and open_start is not None:
            out.append((open_start, t))
            open_start = None
    if open_start is not None:
        out.append((open_start, None))
    return out


def _far():
    return datetime.max


def active_segments(period_start, period_end, intervals):
    """Active (not held) sub-ranges of the period, each (start, end)."""
    segs, cur = [], period_start
    for hs, he in intervals:
        he = he or _far()
        if he <= period_start or hs >= period_end:
            continue
        if hs > cur:
            segs.append((cur, min(hs, period_end)))
        cur = max(cur, he)
        if cur >= period_end:
            break
    if cur < period_end:
        segs.append((cur, period_end))
    return [s for s in segs if s[1] > s[0]]


def is_fully_held(period_start, period_end, intervals):
    """True when no active time remains in the period (show Hold/carried)."""
    return not active_segments(period_start, period_end, intervals)


def is_on_hold_at(moment, intervals):
    return any(hs <= moment < (he or _far()) for hs, he in intervals)


def overlaps_hold(period_start, upto, intervals):
    """Does any Hold interval touch [period_start, upto]?"""
    return any(hs <= upto and (he or _far()) > period_start for hs, he in intervals)


def cutoff_in_held_interval(cutoff, intervals):
    """Strictly inside a Hold interval (start == cutoff or end == cutoff is fine)."""
    return any(hs < cutoff < (he or _far()) for hs, he in intervals)


def period_status(period_start, period_end, intervals, has_record):
    """'Hold/carried' for a fully held week without a record, else None."""
    if not has_record and is_fully_held(period_start, period_end, intervals):
        return "Hold/carried"
    return None


def validate_hold_rules(period_start, period_end, cutoff, now, intervals,
                        exception_flag=False, exception_reason=None,
                        qty_increase=None):
    """Returns (errors, needs_pm_exception_review).

    Ordinary entry: no Hold touches the period up to the cutoff and the task is
    not on Hold now. Otherwise a controlled exception is mandatory, the cutoff
    must sit in an active portion, and it can never claim held time.
    """
    errors = []
    if cutoff is None:
        return ["Measurement cutoff is required."], False
    if cutoff > now:
        errors.append("Measurement cutoff cannot be in the future.")
    if cutoff < period_start or cutoff > period_end:
        errors.append("Measurement cutoff must fall inside the reporting period.")
    if cutoff_in_held_interval(cutoff, intervals):
        errors.append("Cutoff falls inside a Hold interval; work during Hold cannot be reported.")

    held_now = is_on_hold_at(now, intervals)
    touched = overlaps_hold(period_start, min(cutoff, period_end), intervals)
    needs_exception = held_now or touched

    if needs_exception:
        if not exception_flag:
            errors.append("Task is/was on Hold in this period: a partial-period Hold exception "
                          "(with reason) is required.")
        elif not (exception_reason or "").strip():
            errors.append("Partial-period Hold exception requires a reason.")
        if is_fully_held(period_start, min(cutoff, period_end), intervals) and (qty_increase or 0) > 0:
            errors.append("Entire reporting window was on Hold; no new work can be reported.")
    elif exception_flag:
        errors.append("Hold exception is not applicable: no Hold in this period.")
    return errors, bool(needs_exception and not errors)


def parent_includes(child_state):
    """Hold keeps the child in the parent average (D06). Only an approved
    scope cancellation removes it."""
    return child_state not in ("Cancelled Approved",)