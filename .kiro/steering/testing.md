---
inclusion: always
---

# Tests first

## Red, then green

1. Write the assertion named by the task's T ID in its named file.
2. Run it and see it fail **on the missing behaviour**. A missing module, a failed install, a syntax error or an empty snapshot is not a red result. Add a small compilable stub first if needed.
3. Write the smallest complete code that makes it pass.
4. Run the same assertion again and record it passing. Then run the adjacent tests.
5. Report which tests failed first and why.

Never weaken, skip or delete a test to make it pass. If a check still fails after two repairs, stop and report the failing output.

## What a feature includes

A feature is done only with: its test, the own data path (not only walkthrough data), a useful error, its copy, its phone layout and its result or print. Every error path checks prior state, saved counts and keyboard focus.

## Independent expectations

- Expected totals come from `tests/fixtures/expected/hand-totals.md`, worked by hand from the plan before code existed. Never copy expected values from production output.
- Fees, queue order and tenure at a date are compared with `scripts/oracle.py`, written from the worked examples with the Python standard library only.
- Property tests (fast-check) run at least 1,000 cases per property set with recorded seeds. Keep failing seeds next to the requirement they broke.
- Use a fixed test clock and fixed effective dates. One fixture crosses a daylight saving change.

## Running

- Unit, property, conformance and oracle tests run with Vitest from npm scripts.
- Browser tests use `@playwright/test` 1.65.1 exactly, headless, one worker, at 360 by 640 and 1920 by 1080. Never open a window. Do not run `playwright install`.
- Servers bind `127.0.0.1` with strict ports. Stop every server you start.
- No test makes a network request. Tests that check privacy log every request and expect zero.
