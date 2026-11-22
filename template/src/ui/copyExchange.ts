// The words of the Exchange screen. No React.
// Plain short words. No dash between words. The middle dot is the only separator.
// Braces are filled with values from committed data, as plain text.
export const EXCHANGE_COPY: Readonly<Record<string, string>> = {
  // The register side
  committeeReview: "Committee review",
  committeeReviewHint: "Send your committee a small list of checks. The file holds no names, contacts or amounts.",
  chooseReviewDate: "Choose a review date",
  siteNameForCommittee: "Site name for committee",
  reviewPlotLabels: "Review plot labels",
  labelForItem: "Label for item {n}",
  labelsHint: "Each label is sent exactly as you type it. Use a plain word or number.",
  previewReviewFile: "Preview review file",
  downloadReviewFile: "Download review file",
  openReturnSlip: "Open return slip",
  openReturnSlipHint: "Choose a return slip from your committee. Opening it changes no record.",
  noOpenChecks: "No open checks at this date.",
  emptyRegisterReview: "Nothing has been recorded yet, so there is nothing to send.",
  reviewDetailsAgain: "Review public details again.",

  // The preview: the exact fields that will leave the device
  reviewFilePreview: "Review file preview",
  fileHoldsHeading: "What this file holds",
  holdsSiteName: "The site name you typed",
  holdsReviewDate: "The review date",
  holdsKind: "The file format, the kind of register and its revision number",
  holdsKeys: "Random keys and a version number. They hold no name and let your slip find its record.",
  holdsEachCheck: "For each check: your label, the reason and what to do",
  holdsMore: "More fields. Choose Show field names to see them.",
  showFieldNames: "Show field names",
  hideFieldNames: "Hide field names",
  fieldsInFile: "Field names in this file",
  wholeFileFields: "Whole file: {fields}",
  eachCheckFields: "Each check: {fields}",
  checksInFile: "{count} checks in this file.",
  oneCheckInFile: "1 check in this file.",
  fileSize: "{bytes} bytes",
  checkRowLine: "{label} · {reason} · version {version}",

  // The four reasons, which are the actions of the Desk
  actionCheckLocation: "Check the location",
  actionReadStone: "Read the stone again",
  actionCheckReply: "Check the reply",
  actionCheckPayment: "Check the payment",

  // The keeper's side of the return
  reviewReturnedChecks: "Review returned checks",
  slipAsAt: "From the review file as at {date}, revision {revision}.",
  readyToCheck: "Ready to check",
  sourceHasChanged: "Source has changed",
  issueAlreadyClosed: "Issue already closed",
  alreadyReceived: "Already received",
  openMatchingRecord: "Open matching record",
  recordReceipt: "Record receipt",
  receiptNote: "A receipt records that your committee looked. It changes no record.",
  nothingToReceive: "Nothing new to record.",
  receiptsRecorded: "Receipts recorded: {count}. Saved on this device.",
  decisionChecked: "Checked",
  decisionNeedsKeeper: "Needs keeper",
  returnedRowLine: "{decision} on {date}",
  unknownItem: "Unknown item",

  // Files that cannot be opened here
  slipOtherRegister: "This slip belongs to another register.",
  slipIsReview: "This file is a review file, not a return slip.",
  slipNotSlip: "This file is not a return slip.",
  slipInvalid: "This return slip is not valid. Nothing was changed.",
  slipTooBig: "This file is too big to be a return slip.",

  // What can be wrong with a typed site name or label
  exProblemRequired: "Enter a word or number.",
  exProblemOverLimit: "Use 40 characters or fewer.",
  exProblemPrivate: "This holds a name, contact or reference. Use a plain word.",
  exProblemAmount: "This looks like an amount. Use a plain word.",
  exProblemContact: "This looks like a contact. Use a plain word.",
};
