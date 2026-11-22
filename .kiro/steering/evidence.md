---
inclusion: auto
name: evidence
description: Rules for truthful evidence, verification notes, release notes and any claim about results, users or tests. Use when writing docs, README, verification or acceptance records.
---

# Truthful evidence

- Claim only what was observed. An acceptance target is a target until a recorded run meets it.
- Every evidence row names the requirement ID, the exact command, the expected value, the actual value, the source revision and the result. Keep a red example and its green example together.
- When a hook and a direct command check the same failure, record them as two separate runs.
- Label each result by how it was produced: browser assertion, human observation, or simulated review. Never mix them.
- No usage, adoption, time saving or user count claim without a real observation. If a role was not tried by a real person, say which role and task remain unvalidated.
- Speed results state the device, browser, five warm runs, one cold run and the worst value.
- Lantern Fold and Thimble Beds are invented. Say so only in About and in the public write up.
- Public files describe the product only. Raw logs, prompts, account details and private notes stay out of this repository.
- A saved draft or a passing local build is not a release. A browser print dialog is not a printed page.
