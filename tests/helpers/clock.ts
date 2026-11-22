// A fixed clock and one fixture that crosses a daylight saving change.
// Test helper. The template never imports it.

/** Returns a clock that always says `iso`. */
export function fixedClock(iso: string): () => Date {
  const fixed = new Date(iso);
  if (Number.isNaN(fixed.getTime())) throw new Error(`Bad fixed clock: ${iso}`);
  return () => new Date(fixed.getTime());
}

/** The fixed review date used by the Thimble Beds branches. */
export const REVIEW_DATE = "2026-04-20";

/** The write time used when a test does not care about it. */
export const FIXED_NOW = "2026-04-20T09:30:00.000Z";

/**
 * Europe/London in 2026. Clocks go forward at 01:00 UTC on 29 March and back
 * at 01:00 UTC on 25 October. The 29 March day has 23 hours and the 25 October
 * day has 25 hours.
 */
export const LONDON_DST = {
  zone: "Europe/London",
  springForwardUtc: "2026-03-29T01:00:00Z",
  fallBackUtc: "2026-10-25T01:00:00Z",
} as const;
