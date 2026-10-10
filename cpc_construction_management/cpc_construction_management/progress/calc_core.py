# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt
#
# US-11 Step 5 — numerical core of the shared calculation service.
#
# Pure functions only (no frappe, no database), so every rule in Sections 10,
# 12 and 20 of the handoff can be unit-tested directly. The database-facing
# wrapper lives in calculation.py and calls into this module; documents,
# screens and reports must all go through that wrapper.
#
# Definitions (Section 10):
#   Q     = applicable approved total progress base
#   C     = current cumulative completed quantity
#   Cprev = nearest earlier APPROVED cumulative quantity, or 0

TOLERANCE = 1e-6

# workflow_state values that count as "pending approval" when bounding
# neighbouring records. Confirmed in Step 6 when the workflow is created.
PENDING_STATES = ("Pending Approval",)


class CalculationError(ValueError):
	"""A user-facing rule violation. Callers turn this into frappe.throw()."""


def _fmt(value):
	text = f"{value:.6f}".rstrip("0").rstrip(".")
	return text or "0"


def quantity_to_percent(quantity, base):
	_require_positive_base(base)
	return quantity / base * 100


def percent_to_quantity(percent, base):
	_require_positive_base(base)
	return base * percent / 100


def _require_positive_base(base):
	if base is None or base <= 0:
		raise CalculationError("The progress base must be greater than zero.")


def resolve_measurement(base, input_mode, entered_qty, entered_pct, prev_qty, no_change=False):
	"""Return the controlling measurement as {"cum_qty", "cum_pct"}.

	The entered value in the controlling mode is authoritative; the other is
	derived. Values a hair above the base (float noise within TOLERANCE) snap
	to the base; anything further above is an error, never silently clamped.
	"""
	_require_positive_base(base)
	entered_qty = entered_qty or 0
	entered_pct = entered_pct or 0
	prev_qty = prev_qty or 0

	if no_change:
		entered = entered_qty if input_mode == "Quantity" else percent_to_quantity(entered_pct, base)
		if abs(entered) > TOLERANCE and abs(entered - prev_qty) > TOLERANCE:
			raise CalculationError(
				f"No Change is selected, but the entered value ({_fmt(entered)}) differs from the previous "
				f"approved quantity ({_fmt(prev_qty)}). Clear the entered value or untick No Change."
			)
		cum_qty = prev_qty
	elif input_mode == "Quantity":
		if entered_qty < 0:
			raise CalculationError("Cumulative Completed Qty cannot be negative.")
		cum_qty = entered_qty
	elif input_mode == "Percentage":
		if entered_pct < -TOLERANCE or entered_pct > 100 + TOLERANCE:
			raise CalculationError("Cumulative % must be between 0 and 100.")
		cum_qty = percent_to_quantity(min(max(entered_pct, 0), 100), base)
	else:
		raise CalculationError(f"Unknown input mode: {input_mode}")

	if cum_qty > base + TOLERANCE:
		raise CalculationError(
			f"Cumulative quantity {_fmt(cum_qty)} is above the applicable base {_fmt(base)}."
		)
	if cum_qty > base:
		cum_qty = base

	return {"cum_qty": cum_qty, "cum_pct": quantity_to_percent(cum_qty, base)}


def compute_period(cum_qty, prev_qty, base):
	"""Increase over the previous approved cumulative, plus remaining quantity."""
	_require_positive_base(base)
	prev_qty = prev_qty or 0
	period_qty = cum_qty - prev_qty
	if abs(period_qty) <= TOLERANCE:
		period_qty = 0
	remaining = base - cum_qty
	if abs(remaining) <= TOLERANCE:
		remaining = 0
	return {
		"period_qty": period_qty,
		"period_pct": period_qty / base * 100,
		"prev_pct_same_base": prev_qty / base * 100,
		"remaining_qty": remaining,
	}


def check_bounds(cum_qty, lower_bound_qty, upper_bound_qty, lower_ref=None, upper_ref=None):
	"""Ordinary cumulative progress can neither fall below an earlier record
	nor rise above a later one (Section 20). Corrections go through cancel and
	amend, never through these bounds."""
	if lower_bound_qty is not None and cum_qty < lower_bound_qty - TOLERANCE:
		where = f" ({lower_ref})" if lower_ref else ""
		raise CalculationError(
			f"Cumulative quantity {_fmt(cum_qty)} is below the earlier record{where} at {_fmt(lower_bound_qty)}. "
			"Progress cannot decrease; use cancel and amend to correct an approved record."
		)
	if upper_bound_qty is not None and cum_qty > upper_bound_qty + TOLERANCE:
		where = f" ({upper_ref})" if upper_ref else ""
		raise CalculationError(
			f"Cumulative quantity {_fmt(cum_qty)} is above the later record{where} at {_fmt(upper_bound_qty)}. "
			"An earlier week cannot exceed a later week's cumulative."
		)


def pick_neighbors(rows, week_start, exclude_name=None, pending_states=PENDING_STATES):
	"""Choose the records that constrain a measurement, ordered by REPORTING
	PERIOD (week_start_date), never by entry or approval time.

	rows: dicts with name, week_start_date, cum_completed_qty, docstatus,
	      workflow_state. Only approved records (docstatus 1) and pending
	      drafts (docstatus 0 in a pending state) count; scratch drafts and
	      cancelled records never constrain anything.

	Returns:
	  prev_approved     nearest earlier approved row (source of Cprev) or None
	  lower_bound_qty   highest earlier approved/pending quantity, or None
	  upper_bound_qty   lowest later approved/pending quantity, or None
	"""
	considered = [
		r
		for r in rows
		if r.get("name") != exclude_name
		and (r.get("docstatus") == 1 or (r.get("docstatus") == 0 and r.get("workflow_state") in pending_states))
	]
	earlier = sorted((r for r in considered if r["week_start_date"] < week_start), key=lambda r: r["week_start_date"])
	later = sorted((r for r in considered if r["week_start_date"] > week_start), key=lambda r: r["week_start_date"])

	approved_earlier = [r for r in earlier if r["docstatus"] == 1]
	lower = max(earlier, key=lambda r: r["cum_completed_qty"] or 0) if earlier else None
	upper = min(later, key=lambda r: r["cum_completed_qty"] or 0) if later else None

	return {
		"prev_approved": approved_earlier[-1] if approved_earlier else None,
		"lower_bound_qty": (lower["cum_completed_qty"] or 0) if lower else None,
		"lower_bound_ref": lower["name"] if lower else None,
		"upper_bound_qty": (upper["cum_completed_qty"] or 0) if upper else None,
		"upper_bound_ref": upper["name"] if upper else None,
	}


def latest_approved(rows):
	"""Latest approved record BY REPORTING PERIOD. A late entry for an older
	week must not replace a later week's official completion (Section 12.1)."""
	approved = [r for r in rows if r.get("docstatus") == 1]
	if not approved:
		return None
	return max(approved, key=lambda r: (r["week_start_date"], r.get("name") or ""))


def child_live_percent(latest_approved_qty, current_base):
	"""Child live % = latest approved cumulative quantity / current effective
	base x 100. No approved measurement means 0%. Not clamped: an inconsistent
	result should be visible, not hidden."""
	if not latest_approved_qty:
		return 0.0
	return quantity_to_percent(latest_approved_qty, current_base)


def parent_simple_average(child_percents):
	"""BOQ parent progress = sum(included child live %) / included child count.
	Every child weighs the same; unstarted children are passed in as 0.
	Returns None (progress unavailable) when there are no included children."""
	percents = list(child_percents)
	if not percents:
		return None
	return sum(percents) / len(percents)