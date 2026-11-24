---
name: compare-desk-copy
description: Use when someone asks whether the Review Desk copy of the committee file rules matches the current Plotwarden register.
---

# Compare the Review Desk copy with the register

Plotwarden and the Review Desk share eight files: the four exchange files, the three pure files they import, and the shared vectors. The Desk keeps its own copy in `vendor/exchange/` and a saved record of that copy in `vendor/exchange/provenance.json`. The record holds a byte count and a SHA 256 for each file. The Desk's own check only reads its own copy. It cannot see a change in the register. This skill checks both sides against the record.

The check only reads. It never changes either folder. If the script cannot run, say so. Do not work the answer out by hand and do not describe another command as the script.

## 1. Run the script

Run the `scripts/compare.mjs` that sits next to this skill, in the installed power folder, with the two local folders:

```
node <installed power>/skills/compare-desk-copy/scripts/compare.mjs --register <Plotwarden folder> --desk <Review Desk folder>
```

It uses Node only. It needs no account, key, package or server. The eight file pairs come from `scripts/lib/exchange-files.json` in the register, the same list `scripts/export-exchange.mjs` reads.

## 2. Read the result

The script prints `Desk matches N/8` and `Register matches N/8`. It prints one `Register differs <path> (<bytes> bytes, expected <bytes>)` or `Desk differs <path> (<bytes> bytes, expected <bytes>)` line for each file that differs.

| Exit | Meaning |
|---|---|
| 0 | All files on both sides match the saved record. |
| 1 | At least one file differs. |
| 2 | Bad input. A file is missing, an entry is listed twice or is not one of the eight, or a path is outside its folder. Nothing was compared. Report the message and stop. |

## 3. Say what changed

Report both match counts as printed. For each differing file, name the path and both byte counts.

A byte difference alone does not say that return slips behave differently. Read the differing register file and the matching file in the Desk copy, and say what changed in the committee file rules, for example a new check. If the Desk copy differs from its own record, say that first. The Desk copy was edited by hand, and updating it from the register would hide that.

State that the register and the Desk should receive the same change, and that the Desk copy is updated from the register with `npm run export:exchange -- <Review Desk folder>/vendor/exchange`. Do not run that command. It writes files, and this check does not.
