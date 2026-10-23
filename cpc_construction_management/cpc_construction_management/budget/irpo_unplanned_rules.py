"""Pure rules (no frappe) for the 21-Oct-2026 Unplanned Qty enhancement.

New file. Does NOT replace irpo_unplanned_calc.py (that one is unchanged).

Model: Total (the Task row "QTY") = quantity ever introduced for the Task + Item.
    Available = Total - (MR Pending + PO Pending + PR + PI Actual)   [irpo_unplanned_calc.available_qty]
Total goes up only when NEW quantity enters a stage that is not a transfer
and not drawn from Available:
    - Direct MR (MR not created from the Task)         -> whole line is new
    - PO/PR/PI line larger than what its source stage holds -> the excess is new
    - Manual increase of QTY on the Task row
Task-based MR (is_created_from_task) consumes Available instead.
"""
TOL = 1e-6


class UnplannedQtyError(ValueError):
    """Message is safe to show to the user."""


def fresh_qty(qty, source_stage, source_balance):
    """Part of this voucher line that is NEW quantity (not transferred from a source stage)."""
    qty = float(qty or 0)
    if qty <= TOL:
        return 0.0
    if not source_stage:
        return round(qty, 6)
    moved = max(0.0, min(qty, float(source_balance or 0)))
    return round(qty - moved, 6)


def check_qty_edit(old_qty, new_qty, controlled):
    """Manual edit of the Task row QTY. Returns the increase (0 if unchanged).

    An unchanged QTY is always accepted, so legacy rows (QTY below the stage sum)
    do not block saving the Task before the repair patch has run.
    """
    old_qty, new_qty, controlled = float(old_qty or 0), float(new_qty or 0), float(controlled or 0)
    diff = round(new_qty - old_qty, 6)
    if abs(diff) <= TOL:
        return 0.0
    if diff < 0:
        raise UnplannedQtyError(
            f"Unplanned Qty cannot be decreased ({old_qty:g} to {new_qty:g}). "
            "Decreasing is not supported yet.")
    if new_qty < controlled - TOL:
        raise UnplannedQtyError(
            f"Qty {new_qty:g} is below the quantity already requested/ordered ({controlled:g}).")
    return diff


def check_consumption(requested, available):
    """Task-based MR may not exceed IRPO Available Qty."""
    if float(requested or 0) > float(available or 0) + TOL:
        raise UnplannedQtyError(
            f"Quantity {float(requested):g} exceeds IRPO Available Qty {float(available):g}.")


def lowered_total(total, added, controlled):
    """Total after a voucher that had raised it by `added` is cancelled."""
    new_total = round(float(total or 0) - float(added or 0), 6)
    if new_total < float(controlled or 0) - TOL:
        raise UnplannedQtyError(
            "This quantity is already used downstream and cannot be withdrawn.")
    return new_total