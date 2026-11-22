// The site as it was on a date (spec 02, P20, H20). Status at a date reads the claims in force on that date, with
// current corrections. A burial dated by a year or a month stores a claim with no start, so the adapter names the
// earliest day such a claim could mean. Expected values come from hand-totals.md sections 1, 4 and 5 and from the
// dates written in the helpers: Lantern Fold's Y07 holds a burial of 2 June 1889 and one of 1921, and B02 of
// Thimble Beds began on 2025-04-01 and was handed over on 2026-05-01.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDate } from "../../template/src/calendar";
import { claimsInForce, plotSummaryAt, spaceStateAt } from "../../template/src/status";
import type { ClaimFloor } from "../../template/src/status";
import { COPY, fill, plotSummaryText } from "../../template/src/ui/copy";
import type { T } from "../../template/src/ui/messages";
import { asAtOf, plotRows, readAsAt } from "../../template/src/ui/plotView";
import type { OpenRegister } from "../../template/src/ui/shellContext";
import { churchAdapter } from "../../apps/churchyard-register/src/adapter";
import { allotAdapter } from "../../apps/allotment-register/src/adapter";
import { ChurchEnv, id, plotId, spaceId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";
import { GardenEnv, plotId as gardenPlot, spaceId as gardenSpace } from "../helpers/gardenEnv";
import { buildTenanted, claim, person, tenancy } from "../helpers/thimbleBeds";

const TODAY: LocalDate = "2026-04-20";
const t: T = (key, values) => fill(COPY[key] ?? `[${key}]`, values ?? {});

/** The screen's rows for a register, as the map and the list read them, with no browser. */
function rowsOf(state: ChurchEnv["state"], date: LocalDate, floor?: ClaimFloor) {
  const open = { state, today: TODAY } as unknown as OpenRegister;
  return plotRows(open, t, date, floor);
}

describe("Lantern Fold as it was (hand totals 1 and 4)", () => {
  let env: ChurchEnv;
  let floor: ClaimFloor;
  beforeEach(async () => {
    env = await ChurchEnv.create();
    await buildFold(env);
    floor = (c) => churchAdapter.claimFloor?.(env.state, c);
  });

  /** `useFloor` false reads the state with no adapter answer, as every screen did before. */
  const summaryOn = (code: string, date: LocalDate, useFloor = true) => plotSummaryAt(env.state.core, plotId(code), date, useFloor ? floor : undefined);
  const stateOn = (code: string, date: LocalDate, useFloor = true) => spaceStateAt(env.state.core, spaceId(code), date, useFloor ? floor : undefined)?.state;

  it("reads Y07 as Taken · 1 of 2 spaces used as at 1900-01-01 and 2 of 2 as at today", () => {
    const y07 = (date: LocalDate) => rowsOf(env.state, date, floor).find((r) => r.plot.code === "Y07");
    expect(y07("1900-01-01")?.stateText).toBe("Taken · 1 of 2 spaces used");
    expect(y07("1900-01-01")?.line).toBe("Y07 · Yew Walk · Taken · 1 of 2 spaces used");
    expect(y07(TODAY)?.stateText).toBe("Taken · 2 of 2 spaces used");
    expect(plotSummaryText(summaryOn("Y07", "1900-01-01") as NonNullable<ReturnType<typeof summaryOn>>)).toBe("Taken · 1 of 2 spaces used");
  });

  it("counts a burial of a year from the first day of that year (Y01, 1871)", () => {
    expect(stateOn("Y01", "1870-12-31")).toBe("free");
    expect(stateOn("Y01", "1871-01-01")).toBe("taken");
    expect(stateOn("Y01", TODAY)).toBe("taken");
  });

  it("counts a burial of a month from the first day of that month (Y04, March 1902)", () => {
    expect(stateOn("Y04", "1902-02-28")).toBe("free");
    expect(stateOn("Y04", "1902-03-01")).toBe("taken");
    expect(stateOn("Y04", "1902-03-31")).toBe("taken");
  });

  it("counts a burial of a day from that day, without the adapter (Y06, 14 November 1938)", () => {
    expect(stateOn("Y06", "1938-11-13", false)).toBe("free");
    expect(stateOn("Y06", "1938-11-14", false)).toBe("taken");
  });

  it("counts a burial with no date on every date (Y05)", () => {
    expect(stateOn("Y05", "1000-01-01")).toBe("taken");
    expect(stateOn("Y05", "1850-06-01")).toBe("taken");
    expect(stateOn("Y05", TODAY)).toBe("taken");
  });

  it("reads a claim with no start on every date when no adapter answers, as before", () => {
    expect(stateOn("Y01", "1870-12-31", false)).toBe("taken");
    expect(stateOn("Y01", "1000-01-01", false)).toBe("taken");
  });

  it("follows a correction: a year changed to 1881 is free in 1875 and taken in 1881", async () => {
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    await env.must([{ type: "correct_burial", burialId: id("burial:LF-01"), date: { p: "year", y: 1881 }, dateText: "1881", correctsEventId: original, reason: "Misread 1871", correctionRef: "LF page 1" }]);
    expect(stateOn("Y01", "1875-06-01")).toBe("free");
    expect(stateOn("Y01", "1880-12-31")).toBe("free");
    expect(stateOn("Y01", "1881-01-01")).toBe("taken");
  });

  it("changes no stored event and no claim, and asks the adapter for a past view only", async () => {
    const events = JSON.stringify(await env.events());
    const claims = JSON.stringify(env.state.core.claims);
    expect(env.state.core.claims[id("claim:LF-01")]?.start).toBeUndefined();
    const ask = vi.fn(floor);
    rowsOf(env.state, "1900-01-01", ask);
    expect(ask).toHaveBeenCalled();
    ask.mockClear();
    rowsOf(env.state, TODAY, ask);
    expect(ask).not.toHaveBeenCalled();
    expect(JSON.stringify(await env.events())).toBe(events);
    expect(JSON.stringify(env.state.core.claims)).toBe(claims);
  });

  it("gives the adapter's answer for each kind of burial and for a claim that names none", () => {
    const claimOf = (ref: string) => env.state.core.claims[id(`claim:${ref}`)];
    expect(floor(claimOf("LF-01") as NonNullable<ReturnType<typeof claimOf>>)).toBe("1871-01-01");
    expect(floor(claimOf("LF-04") as NonNullable<ReturnType<typeof claimOf>>)).toBe("1902-03-01");
    expect(floor(claimOf("LF-05") as NonNullable<ReturnType<typeof claimOf>>)).toBeUndefined();
    const reservation = env.state.core.claims[id("claim:LF-R1")] as NonNullable<ReturnType<typeof claimOf>>;
    expect(floor(reservation)).toBeUndefined();
    expect(floor({ ...reservation, ref: "no-such-burial" })).toBeUndefined();
  });

  it("holds the allotment adapter to no floor: a tenancy always has a start", () => {
    expect(allotAdapter.claimFloor).toBeUndefined();
  });
});

describe("Thimble Beds as it was (hand totals 5.1, handover of B02 on 2026-05-01)", () => {
  const D = "2026-05-01";
  let env: GardenEnv;
  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildTenanted(env);
    await env.must(
      [{ type: "hand_over", tenancyId: tenancy("B02"), newTenancyId: tenancy("B02:new"), claimId: claim("tenancy:B02:new"), personId: person("Hale Pennywort"), holderName: "Hale Pennywort", sourceRef: "TB-HO-1" }],
      D,
    );
  });

  const holdersIn = (date: LocalDate) =>
    claimsInForce(env.state.core, gardenSpace("B02"), date).map((c) => {
      const tenancyRecord = env.state.tenancies[c.ref as string];
      return { tenancyId: c.ref, holder: tenancyRecord === undefined ? undefined : env.state.people[tenancyRecord.personId]?.displayName };
    });

  it("names the earlier holder's tenancy the day before the handover and the new one on the day", () => {
    expect(holdersIn("2026-04-30")).toEqual([{ tenancyId: tenancy("B02"), holder: "Ada Stonecrop" }]);
    expect(holdersIn(D)).toEqual([{ tenancyId: tenancy("B02:new"), holder: "Hale Pennywort" }]);
    expect(holdersIn("2026-06-01")).toEqual([{ tenancyId: tenancy("B02:new"), holder: "Hale Pennywort" }]);
  });

  it("names no tenancy before the first one began, and Free then", () => {
    expect(holdersIn("2025-03-31")).toEqual([]);
    expect(plotSummaryAt(env.state.core, gardenPlot("B02"), "2025-03-31")?.primary).toBe("free");
    expect(plotSummaryAt(env.state.core, gardenPlot("B02"), "2025-04-01")?.primary).toBe("taken");
  });

  it("keeps B02 Taken across the handover day and counts the plots of each date", () => {
    for (const date of ["2026-04-30", D]) expect(plotSummaryAt(env.state.core, gardenPlot("B02"), date)?.primary).toBe("taken");
    const open = { state: env.state, today: TODAY } as unknown as OpenRegister;
    const taken = (date: LocalDate) => plotRows(open, t, date).filter((r) => r.summary.primary === "taken").map((r) => r.plot.code);
    expect(taken("2025-03-31")).toEqual(["B01", "B04"]);
    expect(taken("2023-06-01")).toEqual(["B04"]);
    expect(taken(TODAY)).toEqual(["B01", "B02", "B04"]);
  });
});

describe("the date field", () => {
  it("accepts today and an earlier day, after trimming", () => {
    expect(readAsAt("2026-04-20", TODAY)).toEqual({ ok: true, date: "2026-04-20" });
    expect(readAsAt(" 1900-01-01 ", TODAY)).toEqual({ ok: true, date: "1900-01-01" });
    expect(readAsAt("1000-01-01", TODAY)).toEqual({ ok: true, date: "1000-01-01" });
  });

  it("refuses a later day with its own message", () => {
    expect(readAsAt("2026-04-21", TODAY)).toEqual({ ok: false, key: "asAtLater" });
    expect(readAsAt("9999-12-31", TODAY)).toEqual({ ok: false, key: "asAtLater" });
  });

  it("refuses a text that is not a real day, a year below 1000 and an empty field", () => {
    for (const text of ["", "   ", "yesterday", "20/04/2026", "2026-4-20", "2026-02-30", "2025-02-29", "0999-12-31"]) {
      expect(readAsAt(text, TODAY), text).toEqual({ ok: false, key: "invalidDate" });
    }
  });

  it("reads the view date from the address only when it is a day before today", () => {
    expect(asAtOf(new URLSearchParams("asAt=2025-03-31"), TODAY)).toBe("2025-03-31");
    expect(asAtOf(new URLSearchParams("plot=p1&asAt=1900-01-01"), TODAY)).toBe("1900-01-01");
    for (const query of ["", "asAt=2026-04-20", "asAt=2026-04-21", "asAt=soon", "asAt=", "plot=p1"]) {
      expect(asAtOf(new URLSearchParams(query), TODAY), query).toBeUndefined();
    }
  });

  it("has its words in the catalog, in plain words with no dash", () => {
    expect(COPY["showSiteAsAt"]).toBe("Show the site as at");
    expect(COPY["backToToday"]).toBe("Back to today");
    expect(COPY["asAt"]).toBe("As at {date}");
    expect(COPY["asAtLater"]).toBe("Choose today or an earlier date.");
    expect(COPY["asAtHint"]).toBe("Year, month, day, for example 2026-04-20");
    expect(COPY["invalidDate"]).toBe("Use a valid date.");
    for (const key of ["showSiteAsAt", "backToToday", "asAtLater"]) expect(COPY[key], key).not.toMatch(/[-–—]/);
  });
});
