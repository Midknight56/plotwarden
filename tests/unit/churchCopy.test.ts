// The Churchyard copy catalog (spec 03, task 3.10, T35 for this app). Every word the plan's
// Churchyard Register tables give is typed here from the plan, not read from the catalog.
// No dash between words, and every error code a church command can give has words.
import { describe, expect, it } from "vitest";
import { COPY, fill } from "../../template/src/ui/copy";
import { CHURCH_COPY, churchError, familyWords } from "../../apps/churchyard-register/src/copy";
import { FAMILY_WORDS } from "../helpers/familyWords";

const ALL: Readonly<Record<string, string>> = { ...COPY, ...CHURCH_COPY };
const say = (key: string, values?: Record<string, string | number>): string => fill(ALL[key] ?? key, values ?? {});

const PLAN: [string, string][] = [
  // The library and the desk
  ["libraryPrompt", "Find a burial or start your register."],
  ["openWalkthrough", "Open Lantern Fold"],
  ["restartWalkthrough", "Restart walkthrough"],
  ["findBurial", "Find a burial"],
  ["nameOrCode", "Name or plot code"],
  ["recordBurial", "Record a burial"],
  ["reserveSpace", "Reserve a space"],
  ["unplacedBurials", "Unplaced burials"],
  ["makeFamilyMap", "Make a family map"],
  ["openBurial", "Open burial"],
  ["showOnMap", "Show on map"],
  // The burial record
  ["recordedName", "Recorded name"],
  ["nameUnknown", "Name unknown"],
  ["burialDate", "Burial date"],
  ["exactDate", "Exact date"],
  ["monthAndYear", "Month and year"],
  ["yearOnly", "Year only"],
  ["dateUnknown", "Date unknown"],
  ["sectionLabel", "Section"],
  ["plotLabel", "Plot"],
  ["spaceLabel", "Space"],
  ["locationUnknown", "Location unknown"],
  ["sourceRefLabel", "Source ref"],
  ["saveBurial", "Save burial"],
  ["burialRecorded", "Burial recorded at {plot}."],
  ["burialSavedUnplaced", "Burial saved. Location to confirm."],
  // The stone
  ["burialRecord", "Burial record"],
  ["sourceHeading", "Source"],
  ["wordsOnStone", "Words on stone"],
  ["keepLineBreaks", "Keep line breaks"],
  ["readingStatus", "Reading status"],
  ["readingClear", "Clear"],
  ["unclearLetters", "Unclear letters"],
  ["stonePhoto", "Stone photo"],
  ["addStonePhoto", "Add photo"],
  ["comparePhoto", "Compare photo and words"],
  ["saveReading", "Save reading"],
  ["markedForReading", "Marked for another reading."],
  ["reviewReading", "Review reading"],
  // Reservations
  ["reservationHolder", "Reservation holder"],
  ["contactDetails", "Contact details"],
  ["startDate", "Start date"],
  ["availableSpaces", "Available spaces"],
  ["recordReservation", "Record reservation"],
  ["reserveForNext", "Reserve for next applicant"],
  ["releaseReservation", "Release reservation"],
  ["recordBurialInSpace", "Record burial in this space"],
  ["spaceIsReserved", "{plot}, space {space} is reserved."],
  // Unplaced and name matches
  ["burialsWithNoPlot", "Burials with no plot"],
  ["openSource", "Open source"],
  ["chooseLocation", "Choose location"],
  ["confirmPlacement", "Confirm placement"],
  ["possibleNameMatch", "Possible name match"],
  ["keepSeparate", "Keep separate"],
  ["linkToPerson", "Link to existing person"],
  ["placedAtCode", "{name} placed at {code}."],
  // Private reports
  ["reportHeading", "Burial and reservation report"],
  ["reportFrom", "From"],
  ["reportThrough", "Through"],
  ["reportBurials", "Burials"],
  ["reservationsMade", "Reservations made"],
  ["reservationsReleased", "Reservations released"],
  ["dateIncomplete", "Date incomplete"],
  ["openSpaces", "Open spaces"],
  ["locationToConfirm", "Location to confirm"],
  ["printPrivateReport", "Print private report"],
  ["downloadPrivateCsv", "Download private CSV"],
  ["noEventsInPeriod", "No events in this period."],
  // The family map editor
  ["familyMap", "Family map"],
  ["publicSiteName", "Public site name"],
  ["publicSectionName", "Public section name"],
  ["publicPlotCode", "Public plot code"],
  ["publicDirections", "Public directions"],
  ["publicDirectionsHint", "One way in for the whole site."],
  ["showOutlines", "Show other plots as plain outlines"],
  ["burialLine", "Line to this burial"],
  ["fieldOutlines", "Plain outlines of other plots"],
  ["fieldLines", "A line to each burial"],
  ["includeBurial", "Include this burial"],
  ["nameShownToVisitors", "Name shown to visitors"],
  ["includeYear", "Include year"],
  ["previewAsVisitor", "Preview as a visitor"],
  ["downloadFamilyCopy", "Download family copy"],
  ["printFamilyMap", "Print family map"],
  ["noNamesSelected", "No names selected. You can still share the site map."],
  ["reviewPublicAgain", "Review public details again."],
  // The family file
  ["find", "Find"],
  ["clear", "Clear"],
  ["showLocation", "Show location"],
  ["entrance", "Entrance"],
  ["directionsHeading", "Directions"],
  ["printThisLocation", "Print this location"],
  ["printSiteMap", "Print site map"],
  ["asAt", "As at {date}"],
  ["noPublishedMatch", "No published burial matches that search."],
];

describe("the words of the plan's Churchyard Register tables", () => {
  it.each(PLAN)("%s says exactly what the plan says", (key, text) => {
    expect(ALL[key]).toBe(text);
  });
});

describe("the catalog rules (R23.1)", () => {
  const entries = Object.entries(CHURCH_COPY);

  it("has entries, and none is empty", () => {
    expect(entries.length).toBeGreaterThan(PLAN.length - 20);
    for (const [key, text] of entries) expect(text.trim(), key).not.toBe("");
  });

  it.each(entries)("%s has no dash between words, no long dash and no hyphenated word", (key, text) => {
    expect(text, key).not.toMatch(/[\u2013\u2014]/);
    expect(text, key).not.toMatch(/\s-\s/);
    expect(text, key).not.toMatch(/\p{L}-\p{L}/u);
  });

  it("keeps the middle dot as the only separator in a summary", () => {
    expect(say("summaryLine", { code: "Y07", section: "Yew Walk", state: "Taken" })).toBe("Y07 · Yew Walk · Taken");
  });
});

describe("the words of the family file", () => {
  it("are the catalog words, key by key", () => {
    expect(familyWords()).toEqual(FAMILY_WORDS);
  });
});

describe("the words of an error (C9.2)", () => {
  const cases: [string, Record<string, string | number>, string][] = [
    ["space_taken", { sourceRef: "LF-01" }, "This plot is already taken."],
    ["space_reserved", { sourceRef: "LF-R2" }, "This space is reserved. Reservation LF-R2. Choose Record burial in this space to convert it."],
    ["source_ref_used", {}, "This source ref is already used."],
    ["name_and_unknown", {}, "Enter a name or choose Name unknown, not both."],
    ["bad_conversion", {}, "This reservation cannot become a burial here. Check the space and the date."],
    ["start_required", {}, "A reservation becomes a burial on a full date. Enter the day."],
    ["reservation_closed", {}, "This reservation is already released or used."],
    ["request_closed", {}, "This request already has a reservation."],
    ["approval_needs_name", {}, "A burial with no name cannot be shown to visitors."],
    ["space_limit", {}, "A plot can have at most 12 spaces."],
    ["no_such_photo", {}, "Choose a photo of this plot."],
    ["memorial_exists", {}, "This burial already has a reading. Edit that one."],
    ["claim_overlap", { sourceRef: "LF-R1" }, "This space is held at that time. Reservation LF-R1."],
    ["not_placed", {}, "This burial has no plot yet. Choose a location first."],
    ["already_placed", {}, "This burial already has a plot. Use Move burial."],
    ["no_such_burial", {}, "That burial is not in this register."],
  ];
  it.each(cases)("%s has words", (code, detail, text) => {
    expect(churchError(say, { code, detail })).toBe(text);
  });

  it("falls back to the shared words for a code it does not own", () => {
    expect(churchError(say, { code: "invalid_date" })).toBe("Use a valid date.");
  });

  it("says which field is wrong for an input error", () => {
    expect(churchError(say, { code: "invalid_input", fields: [{ field: "recordedName", code: "required" }] })).toBe("Enter Recorded name.");
    expect(churchError(say, { code: "invalid_input", fields: [{ field: "holder", code: "required" }] })).toBe("Enter Reservation holder.");
  });
});
