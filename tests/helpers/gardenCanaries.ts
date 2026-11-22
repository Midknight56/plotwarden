// Invented private strings for Thimble Beds. None of these may appear in any availability
// file byte or any committee file byte (hand totals section 5.5). Test helper.
// The template never imports it.

export const APPLICANTS = ["Tavi Bramblequill", "Olin Reedwhorl"] as const;
export const TENANTS = ["Marlo Fennick", "Ada Stonecrop", "Ilse Burrowby"] as const;
export const NEW_HOLDER = "Hale Pennywort";

export const CONTACTS = [
  "tavi.bramblequill@example.invalid",
  "olin.reedwhorl@example.invalid",
  "ada.stonecrop@example.invalid",
] as const;

export const RECEIPT_REF = "TB-RCPT-1";

/**
 * Amounts as written, and the currency code. Pence forms such as 1200 are not scanned for in file
 * bytes because a map coordinate may be the same number. The closed schema has no money key at all.
 */
export const AMOUNTS = ["36.00", "30.00", "12.00", "24.00", "GBP"] as const;

/** Everything that must be absent from an availability file. */
export const AVAILABILITY_CANARIES: readonly string[] = [...APPLICANTS, ...TENANTS, NEW_HOLDER, ...CONTACTS, RECEIPT_REF, ...AMOUNTS];

/** Everything that must be absent from a review file. */
export const REVIEW_CANARIES: readonly string[] = AVAILABILITY_CANARIES;

/** Keys that name a person, a fee or a queue. None may appear in an availability file. */
export const GARDEN_PERSON_KEYS = [
  "holder",
  "applicant",
  "tenant",
  "member",
  "person",
  "contact",
  "email",
  "phone",
  "fee",
  "amount",
  "balance",
  "charge",
  "receipt",
  "queue",
  "position",
  "sequence",
  "reason",
  "offer",
  "note",
] as const;
