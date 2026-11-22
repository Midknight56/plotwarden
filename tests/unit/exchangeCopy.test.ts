// X8: the words of the Exchange screen. The exact words are typed here from the plan (section 6 and section 5),
// not read from the catalog. The catalog must hold each exactly, with no dash between words, and its keys must
// not shadow a key of the shared catalogs.
import { describe, expect, it } from "vitest";
import { COPY, FOUNDATION_COPY, fill } from "../../template/src/ui/copy";
import { EXCHANGE_COPY } from "../../template/src/ui/copyExchange";
import { SCREEN_COPY } from "../../template/src/ui/copyScreens";

/** [key, exact words]. Braces are values from committed data. */
const EXACT: [string, string][] = [
  // The register side, plan section 6
  ["committeeReview", "Committee review"],
  ["chooseReviewDate", "Choose a review date"],
  ["siteNameForCommittee", "Site name for committee"],
  ["reviewPlotLabels", "Review plot labels"],
  ["previewReviewFile", "Preview review file"],
  ["downloadReviewFile", "Download review file"],
  ["openReturnSlip", "Open return slip"],
  // The keeper's side of the return, plan sections 5 and 6
  ["reviewReturnedChecks", "Review returned checks"],
  ["openMatchingRecord", "Open matching record"],
  ["alreadyReceived", "Already received"],
  ["sourceHasChanged", "Source has changed"],
  ["readyToCheck", "Ready to check"],
  ["issueAlreadyClosed", "Issue already closed"],
  ["recordReceipt", "Record receipt"],
  ["decisionChecked", "Checked"],
  ["decisionNeedsKeeper", "Needs keeper"],
  // The four reasons, the actions of the Desk
  ["actionCheckLocation", "Check the location"],
  ["actionReadStone", "Read the stone again"],
  ["actionCheckReply", "Check the reply"],
  ["actionCheckPayment", "Check the payment"],
  // Refusals and results
  ["slipOtherRegister", "This slip belongs to another register."],
  ["reviewDetailsAgain", "Review public details again."],
  ["noOpenChecks", "No open checks at this date."],
  ["nothingToReceive", "Nothing new to record."],
  ["exProblemOverLimit", "Use 40 characters or fewer."],
];

describe("the exact words", () => {
  it.each(EXACT)("%s is %j", (key, words) => {
    expect(EXCHANGE_COPY[key]).toBe(words);
  });
});

describe("the whole catalog", () => {
  const entries = Object.entries(EXCHANGE_COPY);

  it("holds at least the exact words and the fill words", () => {
    expect(entries.length).toBeGreaterThanOrEqual(EXACT.length + 20);
  });

  it.each(entries)("%s has no dash between words and no long dash", (_key, text) => {
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/\s-\s/);
    expect(text).not.toMatch(/[A-Za-z]-[A-Za-z]/);
  });

  it.each(entries)("%s is not empty", (_key, text) => {
    expect(text.trim()).not.toBe("");
  });

  it("never shadows a key of the foundation or the shared screens", () => {
    const shared = new Set([...Object.keys(FOUNDATION_COPY), ...Object.keys(SCREEN_COPY)]);
    expect(entries.map(([key]) => key).filter((key) => shared.has(key))).toEqual([]);
  });

  it("is part of the catalog the register shell reads", () => {
    for (const [key, text] of entries) expect(COPY[key]).toBe(text);
  });

  it("uses the middle dot as the only separator", () => {
    expect(EXCHANGE_COPY["checkRowLine"]).toBe("{label} · {reason} · version {version}");
  });

  it("fills each template from its named values", () => {
    expect(fill(EXCHANGE_COPY["checksInFile"] as string, { count: 2 })).toBe("2 checks in this file.");
    expect(fill(EXCHANGE_COPY["oneCheckInFile"] as string, {})).toBe("1 check in this file.");
    expect(fill(EXCHANGE_COPY["labelForItem"] as string, { n: 3 })).toBe("Label for item 3");
    expect(fill(EXCHANGE_COPY["receiptsRecorded"] as string, { count: 2 })).toBe("Receipts recorded: 2. Saved on this device.");
    expect(fill(EXCHANGE_COPY["returnedRowLine"] as string, { decision: "Checked", date: "2026-04-21" })).toBe("Checked on 2026-04-21");
    expect(fill(EXCHANGE_COPY["slipAsAt"] as string, { date: "2026-04-20", revision: 7 })).toBe("From the review file as at 2026-04-20, revision 7.");
    expect(fill(EXCHANGE_COPY["fileSize"] as string, { bytes: 612 })).toBe("612 bytes");
    expect(fill(EXCHANGE_COPY["wholeFileFields"] as string, { fields: "format, siteKind" })).toBe("Whole file: format, siteKind");
    expect(fill(EXCHANGE_COPY["eachCheckFields"] as string, { fields: "issueKey, label" })).toBe("Each check: issueKey, label");
  });

  it("says the file holds no names, contacts or amounts, and that a receipt changes no record", () => {
    expect(EXCHANGE_COPY["committeeReviewHint"]).toBe("Send your committee a small list of checks. The file holds no names, contacts or amounts.");
    expect(EXCHANGE_COPY["receiptNote"]).toBe("A receipt records that your committee looked. It changes no record.");
  });

  it("has one problem sentence for each way a typed word can fail", () => {
    for (const key of ["exProblemRequired", "exProblemOverLimit", "exProblemPrivate", "exProblemAmount", "exProblemContact"]) {
      expect(EXCHANGE_COPY[key], key).toBeDefined();
    }
  });

  it("never says that anything was printed, and says saved only with the receipts", () => {
    const saved = entries.filter(([, text]) => /saved/i.test(text)).map(([key]) => key);
    expect(saved).toEqual(["receiptsRecorded"]);
    expect(entries.filter(([, text]) => /\bprinted\b/i.test(text))).toEqual([]);
  });
});
