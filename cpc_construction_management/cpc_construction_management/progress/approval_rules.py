# Copyright (c) 2026, CPC / Emkaan
# License: see license.txt
#
# US-11 Step 6 — pure approval rules (Section 11 of the handoff).
#
# Kept free of frappe/database calls so the permission decisions can be unit
# tested directly. The IRPO Progress controller supplies the facts (who is
# acting, their roles, who prepared the record) and enforces the verdict on the
# server, so it also covers direct API requests.

APPROVER_ROLE = "IRPO Progress Approver"
BASE_TOLERANCE = 1e-6


def approval_block_reason(user, user_roles, preparers, approver_role=APPROVER_ROLE):
	"""Why `user` may not give final approval, or None if they may.

	  "not_approver"     - lacks the approver role. System Manager alone does
	                       not qualify: final approval needs an authorized PM.
	  "not_independent"  - created or last materially edited the measurement.
	                       Nobody bypasses this, including administrators.

	preparers: the users who created / entered / last materially edited the record.
	"""
	if approver_role not in set(user_roles or ()):
		return "not_approver"
	if user in {p for p in (preparers or ()) if p}:
		return "not_independent"
	return None


def is_stale_base(prior_base, current_base, tolerance=BASE_TOLERANCE):
	"""True when the base the draft was converted on differs from the base in
	force at approval, i.e. a quantity revision landed in between."""
	if prior_base is None:
		return False
	return abs((current_base or 0) - (prior_base or 0)) > tolerance