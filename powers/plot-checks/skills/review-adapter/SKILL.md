---
name: review-adapter
description: Use when you add or change the adapter of a plot register, such as a market stall register, or when you must check what a visitor file or a committee file can hold. It calls the plot inspector tools explain_plot, audit_projection and check_adapter on the invented fixtures.
---

# Review an adapter before you accept it

Use this when someone adds a register kind to the Plotwarden foundation, changes the rules of an existing one, or asks whether a visitor file can leak a person. The method has four steps. Do them in order and say what each tool answered.

The keeper's own register is never an input. The three tools read three invented fixtures that are built in memory: `lantern-fold`, `thimble-beds` and `market-stalls`. They accept no path, no address and no record. If a tool is not available, say so. Do not describe another command as a tool call.

## 1. Run the width rule on the market fixture

Call `check_adapter` with `adapterId` `market` and `caseId` `width_rule`. A trader who needs 240 cm must be accepted on a 300 cm stall and refused on a 200 cm stall, and the refusal must name both widths. Read `pass` and `mismatches`. A mismatch names the field and the reason. Copy them as they are.

## 2. Run the other vectors

Call `check_adapter` with `replay`, `refusal` and `visitor` for the adapter under review. `replay` shows that the stored events give the same state as deciding and applying them. `refusal` shows that bad commands are refused with the right code and change nothing. `visitor` shows that the visitor file keeps its closed schema and holds no private string.

## 3. Explain a plot

Call `explain_plot` for one plot of the `market-stalls` fixture, for example `S2`, with `asOf` `2026-04-20`. Read the state of each space, the counts and the ordered source events. Check that the state is the one the rule should give. A stall with no frontage must never read as free for a trader.

## 4. Audit the projection

Call `audit_projection` with `fixtureId` `market-stalls` and `audience` `visitor`, then `committee`. Read `allowedKeys`, `counts`, `canaryViolations` and `privateEditChangesOutput`.

- `canaryViolations` must be empty.
- `privateEditChangesOutput` must be false. A private note must not change what a visitor sees.
- `allowedKeys` must hold no key that names a person, a fee or a queue.

## What to say at the end

State the tool, the arguments and the answer for each check that you ran, and name each check that you could not run. A pass on these fixtures does not prove that a real register is safe. It shows that the adapter keeps the rules on invented data.