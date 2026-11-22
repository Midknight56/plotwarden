// Support for spec 01: the exact error text of 00-contracts design D6, the
// plain words rule, and the plot summary line. The full catalog gate is T35.
import { describe, expect, it } from "vitest";
import {
  COPY,
  ERROR_ACTIONS,
  errorText,
  fill,
  formatPartialDate,
  plotSummaryText,
  stateWord,
} from "../../template/src/ui/copy";
import type { PlotSummary } from "../../template/src/status";

describe("error text from design D6", () => {
  it("uses the exact words", () => {
    expect(errorText("stale_revision")).toBe("This register changed in another tab.");
    expect(errorText("op_conflict")).toBe("This change was already saved with different details. Open latest to check it.");
    expect(errorText("space_taken")).toBe("This plot is already taken.");
    expect(errorText("storage_abort")).toBe("Changes are still in this tab. Download a recovery file.");
    expect(errorText("quota")).toBe("This browser could not save the register.");
    expect(errorText("invalid_date")).toBe("Use a valid date.");
    expect(errorText("open_commitment")).toBe("A plot with an open commitment cannot be archived.");
  });

  it("fills the braces from committed values", () => {
    expect(errorText("key_taken", { code: "Y07", section: "Yew Walk" })).toBe("Code Y07 is already in Yew Walk.");
    expect(errorText("exceeds_balance", { amount: "GBP 24.00" })).toBe("Amount exceeds the balance of GBP 24.00.");
  });

  it("has no text for a code it does not know", () => {
    expect(errorText("made_up_code")).toBeUndefined();
  });

  it("names the actions that go with each error", () => {
    expect(ERROR_ACTIONS["stale_revision"]).toEqual(["Keep my draft", "Open latest"]);
    expect(ERROR_ACTIONS["op_conflict"]).toEqual(["Open latest"]);
    expect(ERROR_ACTIONS["key_taken"]).toEqual(["Keep editing"]);
    expect(ERROR_ACTIONS["storage_abort"]).toEqual(["Try again", "Download recovery file"]);
    expect(ERROR_ACTIONS["quota"]).toEqual(["Download backup", "Continue in this tab"]);
  });

  it("has the saved and saving words", () => {
    expect(COPY["saved"]).toBe("Saved on this device.");
    expect(COPY["saving"]).toBe("Saving changes…");
  });
});

describe("filling a template", () => {
  it("puts each value in once, as plain text", () => {
    expect(fill("Code {code} is already in {section}.", { code: "{section}", section: "Yew Walk" })).toBe(
      "Code {section} is already in Yew Walk.",
    );
  });

  it("uses a value more than once and numbers as text", () => {
    expect(fill("{n} of {n}", { n: 2 })).toBe("2 of 2");
  });

  it("ignores values the template does not use", () => {
    expect(fill("Hello", { unused: "x" })).toBe("Hello");
  });

  it("refuses a template with a missing value", () => {
    expect(() => fill("Code {code}", {})).toThrow(/code/);
  });

  it("leaves a dollar sign in a value alone", () => {
    expect(fill("Fee {amount}", { amount: "$&1" })).toBe("Fee $&1");
  });
});

describe("plain words", () => {
  const entries = Object.entries(COPY);

  it("has a catalog", () => {
    expect(entries.length).toBeGreaterThan(15);
  });

  it.each(entries)("%s has no dash between words and no long dash", (_key, text) => {
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/\s-\s/);
    expect(text).not.toMatch(/[A-Za-z]-[A-Za-z]/);
  });

  it.each(entries)("%s is not empty", (_key, text) => {
    expect(text.trim()).not.toBe("");
  });

  it("uses the middle dot as the only separator in the summary", () => {
    expect(COPY["plotUsed"]).toBe("{state} · {used} of {total} spaces used");
  });
});

describe("state and date words", () => {
  it("names the four physical states", () => {
    expect(stateWord("free")).toBe("Free");
    expect(stateWord("reserved")).toBe("Reserved");
    expect(stateWord("taken")).toBe("Taken");
    expect(stateWord("unusable")).toBe("Unusable");
  });

  it("shows a date at its stored precision", () => {
    expect(formatPartialDate({ p: "year", y: 1874 })).toBe("1874");
    expect(formatPartialDate({ p: "month", y: 1874, m: 3 })).toBe("March 1874");
    expect(formatPartialDate({ p: "day", y: 1874, m: 3, d: 3 })).toBe("3 March 1874");
    expect(formatPartialDate({ p: "unknown" })).toBe("Date unknown");
  });
});

describe("plot summary line", () => {
  function summary(over: Partial<PlotSummary>): PlotSummary {
    return {
      plotId: "p",
      code: "Y07",
      spaceCount: 1,
      counts: { free: 0, reserved: 0, taken: 0, unusable: 0 },
      uncheckedCount: 0,
      needsChecking: false,
      ...over,
    };
  }

  it("reads Taken · 2 of 2 spaces used for Y07 (hand totals section 1)", () => {
    const y07 = summary({ spaceCount: 2, counts: { free: 0, reserved: 0, taken: 2, unusable: 0 }, primary: "taken" });
    expect(plotSummaryText(y07)).toBe("Taken · 2 of 2 spaces used");
  });

  it("reads Taken · 1 of 2 spaces used for a plot with one burial", () => {
    const one = summary({ spaceCount: 2, counts: { free: 1, reserved: 0, taken: 1, unusable: 0 }, primary: "taken" });
    expect(plotSummaryText(one)).toBe("Taken · 1 of 2 spaces used");
  });

  it("gives the state alone for a one space plot", () => {
    expect(plotSummaryText(summary({ counts: { free: 0, reserved: 0, taken: 1, unusable: 0 }, primary: "taken" }))).toBe("Taken");
    expect(plotSummaryText(summary({ counts: { free: 1, reserved: 0, taken: 0, unusable: 0 }, primary: "free" }))).toBe("Free");
  });

  it("counts used spaces for a reserved plot with several spaces", () => {
    const held = summary({ spaceCount: 2, counts: { free: 1, reserved: 1, taken: 0, unusable: 0 }, primary: "reserved" });
    expect(plotSummaryText(held)).toBe("Reserved · 0 of 2 spaces used");
  });

  it("says Needs checking for a plot with no checked space", () => {
    const fresh = summary({ uncheckedCount: 1, needsChecking: true });
    expect(plotSummaryText(fresh)).toBe("Needs checking");
  });

  it("adds Needs checking when only some spaces are checked", () => {
    const part = summary({
      spaceCount: 2,
      counts: { free: 1, reserved: 0, taken: 0, unusable: 0 },
      primary: "free",
      uncheckedCount: 1,
      needsChecking: true,
    });
    expect(plotSummaryText(part)).toBe("Free · 0 of 2 spaces used · Needs checking");
  });
});
