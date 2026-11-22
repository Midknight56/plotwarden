"""Independent reference for fees, queue order and tenure at a date.

Python standard library only. Written from the worked examples in
tests/fixtures/expected/hand-totals.md (sections 2.1 to 2.5) and the rules in
.kiro/specs/00-contracts/design.md section D5. It does not read or share any
code with the TypeScript.

Input on standard input:   {"cases": [{"id": "...", "kind": "queue_order" | "fee" | "tenure", ...}]}
Output on standard output: {"results": [{"id": "...", "value": ...} or {"id": "...", "error": "..."}]}

Exit code 2 when the input is not JSON.
"""

import json
import sys
from datetime import date

MAX_MINOR_UNITS = 99_999_999


def parse_day(text):
    """A year first date string as a date. Raises ValueError for anything else."""
    return date.fromisoformat(text)


def queue_order(case):
    """Order by joined date, then fixed sequence, then application id.

    A person with a pending offer stays in the order but is never the next
    eligible applicant (hand totals 2.2).
    """
    entries = case["entries"]
    ranked = sorted(
        entries,
        key=lambda e: (parse_day(e["joinedOn"]), int(e["sequence"]), e["applicationId"]),
    )
    order = [e["applicationId"] for e in ranked]
    nxt = None
    for e in ranked:
        if not e.get("pending", False):
            nxt = e["applicationId"]
            break
    return {"order": order, "next": nxt}


def fee(case):
    """One charge, a list of steps, and its status on a date (hand totals 2.3 and 2.4).

    A receipt is refused unless it is a positive whole number that does not
    exceed the open balance. A reversal names the nth accepted receipt (counted
    from 0), restores its exact amount, and works once.
    """
    charge = int(case["charge"])
    if charge < 0 or charge > MAX_MINOR_UNITS:
        raise ValueError("charge out of range")

    receipts = []  # each is [amount, still_applied]
    refused = []

    def balance():
        return charge - sum(amount for amount, live in receipts if live)

    for index, step in enumerate(case.get("steps", [])):
        if step["op"] == "receive":
            amount = step["amount"]
            fine = isinstance(amount, int) and 0 < amount <= MAX_MINOR_UNITS and amount <= balance()
            if fine:
                receipts.append([amount, True])
            else:
                refused.append(index)
        elif step["op"] == "reverse":
            n = step["receipt"]
            if 0 <= n < len(receipts) and receipts[n][1]:
                receipts[n][1] = False
            else:
                refused.append(index)
        else:
            raise ValueError("unknown step")

    left = balance()
    as_of = parse_day(case["asOf"])
    due = case.get("dueOn")
    if left == 0:
        status = "paid"
    elif due is not None and as_of > parse_day(due):
        status = "overdue"  # due today is still due. Overdue begins the next day.
    elif any(live for _, live in receipts):
        status = "part_paid"
    else:
        status = "due"
    return {"balance": left, "status": status, "refused": refused}


def tenure(case):
    """Which tenancies cover a date, and which pairs overlap (hand totals 2.5).

    A span is half open: it includes its first day and not its end day. A
    missing start or end is unbounded. A span whose start is not before its
    end holds no day.
    """
    day = parse_day(case["date"])

    def bounds(t):
        lo = parse_day(t["start"]) if t.get("start") else date.min
        hi = parse_day(t["endExclusive"]) if t.get("endExclusive") else date.max
        return lo, hi

    spans = [(t["id"], *bounds(t)) for t in case["tenancies"]]
    covering = [tid for tid, lo, hi in spans if lo <= day < hi]
    overlaps = []
    for i in range(len(spans)):
        for j in range(i + 1, len(spans)):
            a_id, a_lo, a_hi = spans[i]
            b_id, b_lo, b_hi = spans[j]
            if a_lo >= a_hi or b_lo >= b_hi:
                continue
            if max(a_lo, b_lo) < min(a_hi, b_hi):
                overlaps.append([a_id, b_id])
    return {"covering": covering, "overlaps": overlaps}


KINDS = {"queue_order": queue_order, "fee": fee, "tenure": tenure}


def answer(case):
    handler = KINDS.get(case.get("kind"))
    if handler is None:
        return {"id": case.get("id"), "error": "unknown_kind"}
    try:
        return {"id": case["id"], "value": handler(case)}
    except (KeyError, ValueError, TypeError) as problem:
        return {"id": case.get("id"), "error": "bad_case: %s" % problem}


def main():
    try:
        request = json.load(sys.stdin)
        cases = request["cases"]
    except (ValueError, KeyError, TypeError):
        sys.stderr.write("oracle: input must be JSON with a cases list\n")
        return 2
    json.dump({"results": [answer(c) for c in cases]}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
