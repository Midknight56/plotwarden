// T35 support: the words of the shared screens, typed here from section 5 of the plan.
// The catalog must hold each of them exactly, with no dash between words. Requirements P15.2.
import { describe, expect, it } from "vitest";
import { COPY, FOUNDATION_COPY, fill, reasonText } from "../../template/src/ui/copy";
import { SCREEN_COPY } from "../../template/src/ui/copyScreens";

/** [key, exact words]. Braces are values from committed data. */
const EXACT: [string, string][] = [
  // App chrome
  ["navRegisters", "Registers"],
  ["navSettings", "Settings"],
  ["navHelp", "Help"],
  ["navAbout", "About"],
  ["changeRegister", "Change register"],
  // Library and new site
  ["startRegister", "Start a register"],
  ["myRegisters", "My registers"],
  ["restoreBackup", "Restore backup"],
  ["noRegisters", "No registers on this device."],
  ["openSite", "Open {site}"],
  ["siteName", "Site name"],
  ["localTimeZone", "Local time zone"],
  ["currency", "Currency"],
  ["createRegister", "Create register"],
  ["enterSiteName", "Enter a site name."],
  ["chooseCurrency", "Choose the currency for this garden."],
  ["addYourMap", "Add your map"],
  ["enterRecords", "Enter records"],
  ["importSpreadsheet", "Import spreadsheet"],
  ["startWithMapOrRecord", "Start with your map or your first record."],
  // Register home and search
  ["searchThisRegister", "Search this register"],
  ["nameOrCode", "Name or plot code"],
  ["search", "Search"],
  ["clearSearch", "Clear search"],
  ["mapLink", "Map"],
  ["plotListLink", "Plot list"],
  ["addRecords", "Add records"],
  ["backUp", "Back up"],
  ["searchPrompt", "Search for a name or code."],
  ["noMatchesFor", "No matches for {query}."],
  ["noMatches", "No matches."],
  ["clearFilters", "Clear filters"],
  // Map and plot list
  ["siteMap", "Site map"],
  ["chooseSection", "Choose a section"],
  ["choosePlot", "Choose a plot"],
  ["openPlotList", "Open plot list"],
  ["showOnMap", "Show on map"],
  ["zoomIn", "Zoom in"],
  ["zoomOut", "Zoom out"],
  ["fitSite", "Fit site"],
  ["mapKey", "Map key"],
  ["editMap", "Edit map"],
  ["filterAll", "All"],
  ["stateFree", "Free"],
  ["stateReserved", "Reserved"],
  ["stateTaken", "Taken"],
  ["stateUnusable", "Unusable"],
  ["needsChecking", "Needs checking"],
  ["noMapYet", "No map yet. Add a section or open the plot list."],
  ["plotInSection", "Plot {code} in {section}."],
  ["locationToConfirm", "Location to confirm"],
  // Map editor
  ["mapSetup", "Map setup"],
  ["importSiteLayout", "Import site layout"],
  ["downloadSiteLayout", "Download site layout"],
  ["addSection", "Add section"],
  ["generateRows", "Generate rows"],
  ["traceSection", "Trace a section"],
  ["tracePlot", "Trace a plot"],
  ["addPath", "Add path"],
  ["addGate", "Add gate"],
  ["sectionName", "Section name"],
  ["prefix", "Prefix"],
  ["firstNumber", "First number"],
  ["digits", "Digits"],
  ["rows", "Rows"],
  ["columns", "Columns"],
  ["numberAcross", "Number across"],
  ["numberDown", "Number down"],
  ["reverseAlternate", "Reverse alternate rows"],
  ["rotation", "Rotation"],
  ["rowSpacing", "Row spacing"],
  ["columnSpacing", "Column spacing"],
  ["skipPlaces", "Skip places"],
  ["previewPlots", "Preview plots"],
  ["applyLayout", "Apply layout"],
  ["plotsToAdd", "{count} plots to add"],
  ["firstCode", "First {code}"],
  ["lastCode", "Last {code}"],
  ["keyTaken", "Code {code} is already in {section}."],
  ["keepExistingPlot", "Keep existing plot"],
  ["moveLinkedPlot", "Move linked plot"],
  ["reviewChanges", "Review changes"],
  ["cancel", "Cancel"],
  // Trace and revise
  ["referencePlan", "Reference plan"],
  ["chooseImage", "Choose image"],
  ["scale", "Scale"],
  ["moveEast", "Move east"],
  ["moveNorth", "Move north"],
  ["turn", "Turn"],
  ["opacity", "Opacity"],
  ["lockImage", "Lock image"],
  ["hideImage", "Hide image"],
  ["removeImage", "Remove image"],
  ["east", "East"],
  ["north", "North"],
  ["addPoint", "Add point"],
  ["undoPoint", "Undo point"],
  ["closeShape", "Close shape"],
  ["finishPath", "Finish path"],
  ["name", "Name"],
  ["saveMap", "Save map"],
  ["renamePlots", "Rename plots"],
  ["confirmEmptyPlots", "Confirm empty plots"],
  ["needThreePoints", "Add three points to close a shape."],
  ["crossesItself", "The outline crosses itself."],
  ["pathCrosses", "This path crosses {code}."],
  ["reviewEmpty", "Review {count} empty plots."],
  ["mapSaved", "Map saved."],
  // Add records and the page
  ["oneRecord", "One record"],
  ["fastEntry", "Fast entry"],
  ["registerPage", "Register page"],
  ["choosePagePhoto", "Choose page photo"],
  ["keepPage", "Keep page with register"],
  ["previousPage", "Previous page"],
  ["nextPage", "Next page"],
  ["rotate", "Rotate"],
  ["enlarge", "Enlarge"],
  ["reduce", "Reduce"],
  ["showPage", "Show page"],
  ["showRow", "Show row"],
  ["pageStaysHere", "Page stays on this device."],
  ["choosePageOrEnter", "Choose a page or enter records without one."],
  // Fast entry
  ["sourceRef", "Source ref"],
  ["section", "Section"],
  ["plot", "Plot"],
  ["addRow", "Add row"],
  ["removeRow", "Remove row"],
  ["repeatSection", "Repeat section"],
  ["repeatPage", "Repeat page"],
  ["fillPlotSequence", "Fill plot sequence"],
  ["pasteRows", "Paste rows"],
  ["reviewRows", "Review rows"],
  ["saveRecords", "Save {count} records"],
  ["rowNeedsAttention", "Row {n} needs attention."],
  ["savedCount", "{count} saved · {unplaced} still need a plot."],
  // Import
  ["chooseSheet", "Choose sheet"],
  ["downloadColumnGuide", "Download column guide"],
  ["downloadPracticeBook", "Download a practice book"],
  ["chooseCsv", "Choose CSV"],
  ["pasteSpreadsheet", "Paste spreadsheet"],
  ["separator", "Separator"],
  ["comma", "Comma"],
  ["semicolon", "Semicolon"],
  ["dateOrder", "Date order"],
  ["matchColumns", "Match columns"],
  ["sourceColumn", "Source column"],
  ["registerField", "Register field"],
  ["ignoreColumn", "Ignore column"],
  ["reviewImport", "Review import"],
  ["countReady", "Ready"],
  ["countUnchanged", "Already in register"],
  ["countConflicts", "Conflicts"],
  ["countErrors", "Errors"],
  ["countLeftOut", "Left out"],
  ["fixRow", "Fix row"],
  ["keepCurrent", "Keep current"],
  ["recordCorrection", "Record correction"],
  ["leaveRowOut", "Leave row out"],
  ["restoreRow", "Restore row"],
  ["downloadLeftOut", "Download left out rows"],
  ["importRecords", "Import {count} records"],
  ["cancelImport", "Cancel import"],
  // Plot record and notes
  ["plotTitle", "Plot {code}"],
  ["status", "Status"],
  ["spaces", "Spaces"],
  ["history", "History"],
  ["notes", "Notes"],
  ["photos", "Photos"],
  ["addNote", "Add note"],
  ["addPhoto", "Add photo"],
  ["description", "Description"],
  ["saveChanges", "Save changes"],
  ["correctAnEntry", "Correct an entry"],
  ["reasonForCorrection", "Reason for correction"],
  ["previousValue", "Previous value"],
  ["newValue", "New value"],
  ["archivePlot", "Archive plot"],
  ["noEventsYet", "No events yet."],
  ["noNotes", "No notes."],
  ["noPhotos", "No photos."],
  ["openCommitment", "A plot with an open commitment cannot be archived."],
  // Physical status and capacity
  ["checkPlot", "Check plot"],
  ["markFree", "Mark free"],
  ["markUnusable", "Mark unusable"],
  ["returnToUse", "Return to use"],
  ["reason", "Reason"],
  ["effectiveDate", "Effective date"],
  ["confirmChange", "Confirm change"],
  ["renamePlot", "Rename plot"],
  ["previousCodes", "Previous codes"],
  // Backups and recovery
  ["backUpRegister", "Back up this register"],
  ["downloadBackup", "Download private backup"],
  ["backupPrivate", "This file contains private records and photos."],
  ["chooseBackup", "Choose backup"],
  ["restoreAsNew", "Restore as new register"],
  ["restoreThis", "Restore this register"],
  ["typeSiteName", "Type the site name"],
  ["keepMyCurrent", "Keep my current register"],
  ["actionDownloadRecovery", "Download recovery file"],
  ["restored", "Restored {site}."],
  ["wrongKindOfRegister", "This file belongs to another kind of register."],
  // Settings and library
  ["settingsTitle", "Settings"],
  ["followDeviceMotion", "Follow device motion"],
  ["reduceMotion", "Reduce motion"],
  ["mapContrast", "Map contrast"],
  ["contrastStandard", "Standard"],
  ["contrastHigh", "High"],
  ["printPaper", "Print paper"],
  ["paperA4", "A4"],
  ["paperLetter", "Letter"],
  ["saveSettings", "Save settings"],
  ["removeRegister", "Remove register from this device"],
  ["removeThis", "Remove this register"],
  ["onlySiteRemoved", "Only {site} will be removed."],
  // Help and About
  ["helpTitle", "Help"],
  ["startFromPaper", "Start from paper"],
  ["makeAMap", "Make a map"],
  ["shareVisitorCopy", "Share a visitor copy"],
  ["keepABackup", "Keep a backup"],
  ["useKeyboard", "Use the keyboard"],
  ["aboutTitle", "About Plotwarden"],
  ["aboutInvented", "Lantern Fold and Thimble Beds are invented places. The people, plots, inscriptions and payments in their walkthroughs were made for this project."],
  ["recordsStay", "Records stay in this browser until you choose to export them."],
  ["backupVisitorNote", "A backup includes private records. A visitor copy includes only the fields you approve."],
  // Common states and recovery text
  ["openingRegister", "Opening register…"],
  ["readingImage", "Reading image…"],
  ["checkingRow", "Checking row {n} of {total}…"],
  ["preparingPrint", "Preparing print…"],
  ["saving", "Saving changes…"],
  ["saved", "Saved on this device."],
  ["actionTryAgain", "Try again"],
  ["storageAbort", "Changes are still in this tab. Download a recovery file."],
  ["quota", "This browser could not save the register."],
  ["photoQuota", "There is not enough space for this photo."],
  ["actionDownloadBackup", "Download backup"],
  ["chooseSmallerImage", "Choose a smaller image"],
  ["actionContinueInTab", "Continue in this tab"],
  ["enterField", "Enter {field}."],
  ["invalidDate", "Use a valid date."],
  ["checkField", "Check {field} in row {n}. {reason}."],
  ["spaceTaken", "This plot is already taken."],
  ["staleRevision", "This register changed in another tab."],
  ["actionKeepDraft", "Keep my draft"],
  ["actionOpenLatest", "Open latest"],
  ["chooseCsvMessage", "Choose a spreadsheet saved as CSV."],
  ["visitorCopyFile", "This file is a visitor copy."],
  ["needsNewerVersion", "This file needs a newer version."],
  ["backupIncomplete", "This backup is incomplete. Your register is safe."],
  ["chooseAnotherFile", "Choose another file"],
  ["backToRegister", "Back to register"],
  ["noRecordsYet", "No records yet."],
  ["noPlotsInSection", "No plots in this section."],
  ["yourCopyReady", "Your copy is ready."],
  ["downloadAgain", "Download again"],
  ["printPreviewReady", "Print preview is ready."],
  ["backToPreview", "Back to preview"],
  ["changesNotSaved", "Changes have not been saved."],
  ["actionKeepEditing", "Keep editing"],
  ["discardDraft", "Discard draft"],
  ["pageNotFound", "Page not found"],
  ["openRegisters", "Open registers"],
];

describe("the words of the shared screens", () => {
  it("has each word of section 5 exactly", () => {
    const wrong = EXACT.filter(([key, text]) => COPY[key] !== text).map(([key, text]) => `${key}: wanted "${text}", has ${JSON.stringify(COPY[key])}`);
    expect(wrong).toEqual([]);
  });

  it("types each key once", () => {
    const keys = EXACT.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(EXACT)("%s has no dash between words and no long dash", (_key, text) => {
    expect(text).not.toMatch(/[\u2013\u2014]/);
    expect(text).not.toMatch(/\s-\s/);
    expect(text).not.toMatch(/[A-Za-z]-[A-Za-z]/);
  });

  it("repeats no key of the foundation catalog", () => {
    const both = Object.keys(SCREEN_COPY).filter((key) => key in FOUNDATION_COPY);
    expect(both).toEqual([]);
  });

  it("uses the middle dot, and nothing else, to separate a summary", () => {
    expect(fill(COPY["plotSummaryLine"] as string, { code: "Y07", section: "Yew Walk", state: "Taken" })).toBe("Y07 · Yew Walk · Taken");
  });

  it("keeps the disclosure about invented places in About and nowhere else", () => {
    const holders = Object.entries(COPY).filter(([, text]) => /invented/i.test(text)).map(([key]) => key);
    expect(holders).toEqual(["aboutInvented"]);
  });

  it("holds no development word", () => {
    const bad = Object.entries(COPY).filter(([, text]) => /\b(TODO|FIXME|debug|stub|lorem|undefined|null|NaN)\b/i.test(text)).map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it("says nothing about how the words or the code were made", () => {
    // Generic words only. A public file names no product or provider, so none is listed here.
    const bad = Object.entries(COPY).filter(([, text]) => /\b(ai|chatbot|assistant|machine learning|generated)\b/i.test(text)).map(([key]) => key);
    expect(bad).toEqual([]);
  });
});

describe("the reason for a row that needs attention", () => {
  it.each([
    ["required", "Enter a value"],
    ["date_year_needed", "Use a four digit year"],
    ["date_ambiguous", "Choose a date order"],
    ["invalid_date", "Use a valid date"],
    ["over_limit", "Shorten it"],
    ["not_a_number", "Use digits only"],
    ["bad_amount", "Use at most two decimals"],
    ["not_a_choice", "Use one of the listed choices"],
    ["unknown_plot", "That plot is not in this register"],
    ["wrong_section", "That plot is in another section"],
    ["duplicate_source_ref", "This source ref is used again"],
    ["space_taken", "This plot is already taken"],
    ["taken_needs_correction", "Correct an entry"],
  ])("says %s as %s", (code, words) => {
    expect(reasonText(code)).toBe(words);
  });

  it("falls back to a plain line for a code it does not know", () => {
    expect(reasonText("made_up_code")).toBe("Check this value");
  });

  it("fills the line the plan gives", () => {
    expect(fill(COPY["checkField"] as string, { field: "Source ref", n: 117, reason: reasonText("required") })).toBe(
      "Check Source ref in row 117. Enter a value.",
    );
  });
});
