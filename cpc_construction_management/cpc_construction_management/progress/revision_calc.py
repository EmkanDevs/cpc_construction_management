"""Step 8 - pure quantity-revision maths (no Frappe imports).

Handoff Section 14. Ledger rows are IRPO Quantity Ledger rows with
event_type 'Budget Revision'. The base at a cutoff is computed as a DELTA on
top of the current base (already produced by calculation.get_applicable_base),
so rows that were never revised need no special handling:

    base_at(cutoff) = current_base + sum over revised item rows of
                      (value_at_cutoff - latest_value)
"""
from datetime import date, datetime

TOLERANCE = 1e-6


def to_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()


def effective_revision_rows(rows):
    """Keep live Budget Revision rows: not cancelled and not reversed by a Cancel event."""
    reversed_names = {
        r["reversal_of"] for r in rows
        if r.get("event_type") == "Cancel" and not r.get("is_cancelled") and r.get("reversal_of")
    }
    return [
        r for r in rows
        if r.get("event_type") == "Budget Revision"
        and not r.get("is_cancelled")
        and r.get("name") not in reversed_names
    ]


def _sort_key(r):
    return (to_date(r["posting_date"]), r.get("revision_no") or 0, str(r.get("creation") or ""), str(r.get("name") or ""))


def _groups(rows):
    groups = {}
    for r in rows:
        groups.setdefault(r.get("irpo_budget_row_ref") or r.get("item") or "", []).append(r)
    return {k: sorted(v, key=_sort_key) for k, v in groups.items()}


def base_delta_at(rows, cutoff):
    """Returns (delta, ref_name) for effective revision rows at `cutoff`.
    ref_name = the latest revision row applied at the cutoff (None if none applied)."""
    cutoff = to_date(cutoff)
    delta, ref, ref_key = 0.0, None, None
    for ordered in _groups(rows).values():
        latest_value = float(ordered[-1]["budget_qty_after"] or 0)
        applicable = [r for r in ordered if to_date(r["posting_date"]) <= cutoff]
        if applicable:
            value = float(applicable[-1]["budget_qty_after"] or 0)
            k = _sort_key(applicable[-1])
            if ref_key is None or k > ref_key:
                ref, ref_key = applicable[-1].get("name"), k
        else:
            value = float(ordered[0]["budget_qty_before"] or 0)
        delta += value - latest_value
    return delta, ref


def base_at(current_base, rows, cutoff):
    delta, ref = base_delta_at(rows, cutoff)
    return float(current_base) + delta, ref


def base_conflict(base, approved_completed_qty, tol=TOLERANCE):
    """True when the base is below already approved completed quantity."""
    return float(approved_completed_qty or 0) > float(base) + tol