// T21 (dates): partial and unknown dates, leap days, intervals and zones.
// Expected values are worked by hand from 00-contracts R5 and design D5.
import { describe, expect, it } from "vitest";
import {
  addDays,
  classifyInPeriod,
  compareLocalDate,
  coveredInterval,
  daysBetween,
  intervalCovers,
  intervalsOverlap,
  isValidLocalDate,
  isValidZone,
  localDateOf,
  parseDateEntry,
  parseLocalDate,
  sortPartialDates,
  writeTime,
  type PartialDate,
} from "../../template/src/calendar";
import { fixedClock, FIXED_NOW, LONDON_DST } from "../helpers/clock";

function entry(text: string, order?: "dmy" | "mdy") {
  return parseDateEntry(text, order ? { order } : undefined);
}

describe("T21 calendar dates", () => {
  it("accepts 29 February only in a leap year", () => {
    expect(isValidLocalDate("2024-02-29")).toBe(true);
    expect(isValidLocalDate("2000-02-29")).toBe(true);
    expect(isValidLocalDate("2025-02-29")).toBe(false);
    expect(isValidLocalDate("1900-02-29")).toBe(false);
  });

  it("rejects impossible and badly shaped dates", () => {
    for (const bad of ["2026-13-01", "2026-04-31", "2026-00-10", "2026-4-1", "26-04-01", "", "2026-04-1x"]) {
      expect(isValidLocalDate(bad)).toBe(false);
    }
  });

  it("returns invalid_date for a bad date", () => {
    const result = parseLocalDate("2025-02-29");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_date");
    expect(parseLocalDate("2026-04-10")).toEqual({ ok: true, value: "2026-04-10" });
  });

  it("compares dates by calendar order", () => {
    expect(compareLocalDate("2026-04-09", "2026-04-10")).toBeLessThan(0);
    expect(compareLocalDate("2026-04-10", "2026-04-10")).toBe(0);
    expect(compareLocalDate("2027-01-01", "2026-12-31")).toBeGreaterThan(0);
  });

  it("adds days across month ends, leap days and daylight saving changes", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts calendar days across both daylight saving changes", () => {
    // Hand count: Mar 31 + Apr 30 + May 31 + Jun 30 + Jul 31 + Aug 31 + Sep 30 + Oct 31 = 245.
    expect(daysBetween("2026-03-01", "2026-11-01")).toBe(245);
    expect(daysBetween("2026-03-28", "2026-03-31")).toBe(3);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-04-10", "2026-04-10")).toBe(0);
    expect(daysBetween("2026-04-10", "2026-04-09")).toBe(-1);
  });
});

describe("T21 date entry keeps its precision", () => {
  it("never fills a missing month or day", () => {
    expect(entry("1874")).toEqual({ ok: true, value: { value: { p: "year", y: 1874 }, text: "1874" } });
    expect(entry("1874-03")).toEqual({ ok: true, value: { value: { p: "month", y: 1874, m: 3 }, text: "1874-03" } });
    expect(entry("1874-03-03")).toEqual({
      ok: true,
      value: { value: { p: "day", y: 1874, m: 3, d: 3 }, text: "1874-03-03" },
    });
  });

  it("reads English month names in any case", () => {
    expect(entry("March 1874")).toMatchObject({ ok: true, value: { value: { p: "month", y: 1874, m: 3 } } });
    expect(entry("mar 1874")).toMatchObject({ ok: true, value: { value: { p: "month", y: 1874, m: 3 } } });
    expect(entry("3 March 1874")).toMatchObject({ ok: true, value: { value: { p: "day", y: 1874, m: 3, d: 3 } } });
    expect(entry("3 MARCH 1874")).toMatchObject({ ok: true, value: { value: { p: "day", y: 1874, m: 3, d: 3 } } });
    expect(entry("12 Sept 1901")).toMatchObject({ ok: true, value: { value: { p: "day", y: 1901, m: 9, d: 12 } } });
  });

  it("stores unknown for an empty or explicit unknown entry and keeps the text", () => {
    for (const text of ["", "   ", "unknown", "Date unknown", "DATE UNKNOWN"]) {
      expect(entry(text)).toEqual({ ok: true, value: { value: { p: "unknown" }, text } });
    }
  });

  it("keeps the original text exactly as typed", () => {
    const result = entry("  3 March 1874 ");
    expect(result.ok && result.value.text).toBe("  3 March 1874 ");
  });

  it("refuses a day and month order unless one was chosen", () => {
    for (const text of ["03/04/2026", "3.4.2026", "03-04-2026"]) {
      const result = entry(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("date_ambiguous");
    }
  });

  it("reads a chosen order and no other", () => {
    expect(entry("03/04/2026", "dmy")).toMatchObject({ ok: true, value: { value: { p: "day", y: 2026, m: 4, d: 3 } } });
    expect(entry("03/04/2026", "mdy")).toMatchObject({ ok: true, value: { value: { p: "day", y: 2026, m: 3, d: 4 } } });
    expect(entry("03.04.2026", "dmy")).toMatchObject({ ok: true, value: { value: { p: "day", y: 2026, m: 4, d: 3 } } });
    const impossible = entry("31/12/2026", "mdy");
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) expect(impossible.error.code).toBe("invalid_date");
  });

  it("refuses a two digit year with or without an order", () => {
    for (const order of [undefined, "dmy", "mdy"] as const) {
      const result = entry("03/04/26", order);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("date_year_needed");
    }
  });

  it("rejects impossible dates with invalid_date", () => {
    for (const text of ["1873-02-29", "1874-13", "1874-00", "1874-02-30", "31 April 1874", "0874", "10000", "spring", "1874-3-3"]) {
      const result = entry(text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.error.code, text).toBe("invalid_date");
    }
    expect(entry("1872-02-29").ok).toBe(true);
  });
});

describe("T21 covered interval and report periods", () => {
  it("gives the first and last day each precision could mean", () => {
    expect(coveredInterval({ p: "year", y: 1874 })).toEqual({ first: "1874-01-01", last: "1874-12-31" });
    expect(coveredInterval({ p: "month", y: 1874, m: 2 })).toEqual({ first: "1874-02-01", last: "1874-02-28" });
    expect(coveredInterval({ p: "month", y: 1872, m: 2 })).toEqual({ first: "1872-02-01", last: "1872-02-29" });
    expect(coveredInterval({ p: "day", y: 1874, m: 3, d: 3 })).toEqual({ first: "1874-03-03", last: "1874-03-03" });
    expect(coveredInterval({ p: "unknown" })).toBeUndefined();
  });

  const q1 = { from: "2026-01-01", through: "2026-03-31" };

  it("is inside only when every day it could mean is inside", () => {
    expect(classifyInPeriod({ p: "day", y: 2026, m: 2, d: 10 }, q1)).toBe("inside");
    expect(classifyInPeriod({ p: "month", y: 2026, m: 3 }, q1)).toBe("inside");
    expect(classifyInPeriod({ p: "year", y: 2026 }, { from: "2026-01-01", through: "2026-12-31" })).toBe("inside");
  });

  it("is outside when no day it could mean is inside", () => {
    expect(classifyInPeriod({ p: "month", y: 2026, m: 4 }, q1)).toBe("outside");
    expect(classifyInPeriod({ p: "year", y: 2025 }, q1)).toBe("outside");
    expect(classifyInPeriod({ p: "day", y: 2026, m: 4, d: 1 }, q1)).toBe("outside");
  });

  it("is incomplete when the date overlaps the edge, and always for unknown", () => {
    expect(classifyInPeriod({ p: "year", y: 2026 }, q1)).toBe("incomplete");
    expect(classifyInPeriod({ p: "month", y: 2026, m: 3 }, { from: "2026-03-15", through: "2026-03-31" })).toBe("incomplete");
    expect(classifyInPeriod({ p: "unknown" }, q1)).toBe("incomplete");
  });
});

describe("T21 partial date order", () => {
  const item = (id: string, date: PartialDate, seq: number) => ({ id, date, seq });

  it("orders by earliest day, then finer precision, then write order, unknown last", () => {
    const items = [
      item("A", { p: "year", y: 1874 }, 1),
      item("B", { p: "day", y: 1874, m: 1, d: 1 }, 2),
      item("C", { p: "month", y: 1874, m: 1 }, 3),
      item("D", { p: "unknown" }, 4),
      item("E", { p: "day", y: 1873, m: 12, d: 31 }, 5),
      item("F", { p: "day", y: 1874, m: 1, d: 1 }, 6),
    ];
    expect(sortPartialDates(items).map((i) => i.id)).toEqual(["E", "B", "F", "C", "A", "D"]);
  });

  it("does not change the input array", () => {
    const items = [item("A", { p: "unknown" }, 1), item("B", { p: "year", y: 1900 }, 2)];
    const before = JSON.stringify(items);
    sortPartialDates(items);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("orders several unknown dates by write order", () => {
    const items = [item("late", { p: "unknown" }, 9), item("early", { p: "unknown" }, 3)];
    expect(sortPartialDates(items).map((i) => i.id)).toEqual(["early", "late"]);
  });
});

describe("T21 half open intervals", () => {
  it("covers its first day and not its end day", () => {
    const april = { start: "2026-04-01", endExclusive: "2026-05-01" };
    expect(intervalCovers(april, "2026-04-01")).toBe(true);
    expect(intervalCovers(april, "2026-04-30")).toBe(true);
    expect(intervalCovers(april, "2026-05-01")).toBe(false);
    expect(intervalCovers(april, "2026-03-31")).toBe(false);
  });

  it("treats a missing start or end as unbounded", () => {
    expect(intervalCovers({ start: "2026-04-10" }, "2099-01-01")).toBe(true);
    expect(intervalCovers({ start: "2026-04-10" }, "2026-04-09")).toBe(false);
    expect(intervalCovers({ endExclusive: "2026-04-10" }, "1500-01-01")).toBe(true);
    expect(intervalCovers({}, "2026-04-10")).toBe(true);
  });

  it("does not overlap on a handover day", () => {
    const outgoing = { start: "2025-04-01", endExclusive: "2026-05-01" };
    const incoming = { start: "2026-05-01" };
    expect(intervalsOverlap(outgoing, incoming)).toBe(false);
    expect(intervalsOverlap(incoming, outgoing)).toBe(false);
  });

  it("overlaps when one day is shared", () => {
    expect(intervalsOverlap({ start: "2026-04-01", endExclusive: "2026-05-02" }, { start: "2026-05-01" })).toBe(true);
    expect(intervalsOverlap({}, {})).toBe(true);
    expect(intervalsOverlap({ endExclusive: "2026-04-10" }, { start: "2026-04-09" })).toBe(true);
    expect(intervalsOverlap({ endExclusive: "2026-04-10" }, { start: "2026-04-10" })).toBe(false);
  });

  it("an empty interval overlaps nothing", () => {
    expect(intervalsOverlap({ start: "2026-05-01", endExclusive: "2026-05-01" }, {})).toBe(false);
  });
});

describe("T21 write times and zones", () => {
  it("writes UTC with an offset", () => {
    expect(writeTime(new Date("2026-04-10T09:30:00Z"))).toBe("2026-04-10T09:30:00.000+00:00");
    expect(writeTime(fixedClock(FIXED_NOW)())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/);
  });

  it("knows real zones", () => {
    expect(isValidZone("Europe/London")).toBe(true);
    expect(isValidZone("America/New_York")).toBe(true);
    expect(isValidZone("Mars/Olympus")).toBe(false);
    expect(isValidZone("")).toBe(false);
  });

  it("shows the local date across the spring forward change", () => {
    const zone = LONDON_DST.zone;
    expect(localDateOf("2026-03-28T23:30:00+00:00", zone)).toBe("2026-03-28");
    expect(localDateOf("2026-03-29T00:30:00Z", zone)).toBe("2026-03-29");
    // 01:30 UTC is 02:30 BST on the same day.
    expect(localDateOf("2026-03-29T01:30:00Z", zone)).toBe("2026-03-29");
    // The same instant written with an offset.
    expect(localDateOf("2026-03-29T03:30:00+02:00", zone)).toBe("2026-03-29");
  });

  it("shows the local date across the fall back change", () => {
    const zone = LONDON_DST.zone;
    // 23:30 UTC on the 24th is 00:30 BST on the 25th.
    expect(localDateOf("2026-10-24T23:30:00Z", zone)).toBe("2026-10-25");
    // 23:30 UTC on the 25th is 23:30 GMT on the 25th.
    expect(localDateOf("2026-10-25T23:30:00Z", zone)).toBe("2026-10-25");
  });

  it("changes only the display when the zone changes", () => {
    const stored = "2026-10-24T23:30:00.000+00:00";
    expect(localDateOf(stored, "Europe/London")).toBe("2026-10-25");
    expect(localDateOf(stored, "America/New_York")).toBe("2026-10-24");
    expect(localDateOf(stored, "Asia/Tokyo")).toBe("2026-10-25");
    expect(stored).toBe("2026-10-24T23:30:00.000+00:00");
  });
});
