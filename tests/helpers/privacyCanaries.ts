// Invented private strings for Lantern Fold. None of these may appear in any
// visitor file byte or any committee file byte (hand totals section 1).
// Test helper. The template never imports it.

/** The one deceased person approved for the family file. */
export const APPROVED_NAME = "Mirel Quillmoss";

/** The other occupant of Y07. Not approved. */
export const OTHER_OCCUPANT = "Torin Pellwick";

/** Living reservation holders. Never public. */
export const LIVING_HOLDERS = ["Odalys Fennimore", "Wren Ashgrove"] as const;

/** An invented contact for a holder. */
export const CONTACT = "wren.ashgrove@example.invalid";

/** A word that appears only in a private inscription. */
export const INSCRIPTION_WORD = "Hollowmere";

/** The private page image and its original filename. */
export const PAGE_IMAGE_FILENAME = "lantern-book-page-03.webp";

/** Everything that must be absent from a visitor file. */
export const VISITOR_CANARIES: readonly string[] = [
  OTHER_OCCUPANT,
  ...LIVING_HOLDERS,
  CONTACT,
  INSCRIPTION_WORD,
  PAGE_IMAGE_FILENAME,
];

/** Everything that must be absent from a review file. The approved name too. */
export const REVIEW_CANARIES: readonly string[] = [APPROVED_NAME, ...VISITOR_CANARIES];

/** Keys that name a person, a fee or a queue. None may appear in an availability file. */
export const PERSON_KEYS = [
  "holder",
  "applicant",
  "tenant",
  "member",
  "person",
  "name",
  "contact",
  "email",
  "phone",
  "fee",
  "amount",
  "balance",
  "queue",
  "position",
  "reason",
  "burials",
  "note",
] as const;
