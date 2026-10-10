"""Pure helpers (no frappe import) for IRPO unplanned-item stage movements.

Kept separate so the logic can be unit-tested standalone:
    python3 -m unittest test_irpo_unplanned_calc
"""

TOL = 1e-6

# Ledger vocabulary (matches the existing IRPO Quantity Ledger select options)
STAGE = {
    "Material Request": "MR Pending",
    "Purchase Order": "PO Pending",
    "Purchase Receipt": "PR",
    "Purchase Invoice": "PI Actual",
}
EVENT = {
    "Material Request": "MR Submit",
    "Purchase Order": "PO Submit",
    "Purchase Receipt": "PR Submit",
    "Purchase Invoice": "PI Submit",
}
CREATED_FROM = {
    "Material Request": "MR",
    "Purchase Order": "PO",
    "Purchase Receipt": "PR",
    "Purchase Invoice": "PI",
}
SUMMARY_FIELD = {
    "MR Pending": "irpo_mr_pending_qty",
    "PO Pending": "irpo_po_pending_qty",
    "PR": "irpo_pr_qty",
    "PI Actual": "irpo_pi_actual_qty",
}


def source_stage_for(voucher_type, has_mr=False, has_po=False, has_pr=False):
    """Stage the quantity is transferred OUT of (mirrors the planned engine).

    PO <- MR Pending, PR <- PO Pending, PI <- PR (else PO Pending). None = fresh.
    """
    if voucher_type == "Purchase Order":
        return "MR Pending" if has_mr else None
    if voucher_type == "Purchase Receipt":
        return "PO Pending" if has_po else None
    if voucher_type == "Purchase Invoice":
        if has_pr:
            return "PR"
        if has_po:
            return "PO Pending"
    return None


def plan_stage_rows(dest_stage, source_stage, qty, source_balance):
    """Return [(stage, signed_qty), ...] ledger legs for one voucher row.

    Unplanned rows have no ceiling, so over-ordering is allowed: only what the
    source stage actually holds is moved; the excess lands fresh in dest_stage.
    This keeps every stage balance >= 0.
    """
    if qty is None or qty <= TOL:
        return []
    legs = []
    if source_stage:
        move = max(0.0, min(qty, source_balance))
        if move > TOL:
            legs.append((source_stage, -move))
    legs.append((dest_stage, qty))
    return legs


def summary_from_balances(balances):
    """balances: {stage: signed_sum} -> {irpo_mr_pending_qty, irpo_po_pending_qty, irpo_pr_qty, irpo_pi_actual_qty}."""
    out = {}
    for stage, field in SUMMARY_FIELD.items():
        out[field] = round(float(balances.get(stage) or 0), 6)
    return out


def is_unplanned_only(lines):
    """lines: iterable of (planned_ref, unplanned_ref) for ONE IRPO on ONE voucher.

    True only when there is at least one line and every line is unplanned.
    A mixed voucher returns False so planned budget control is never bypassed.
    """
    lines = list(lines)
    return bool(lines) and all(u and not p for p, u in lines)


def available_qty(qty, balances):
    """Informational 'IRPO Available Qty' for an unplanned row.

    qty = the expected/requested qty entered on the Task row (0 = none given).
    Mirrors the planned definition (qty minus the four consumption stages) but is
    never a ceiling: it may go negative when more is bought than expected.
    """
    qty = float(qty or 0)
    if qty <= TOL:
        return 0.0
    controlled = sum(float(balances.get(stage) or 0) for stage in SUMMARY_FIELD)
    return round(qty - controlled, 6)