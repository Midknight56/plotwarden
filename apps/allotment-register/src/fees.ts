// Fees: one ledger of charges, receipts and reversals, read at a date. Pure.
// The balance of a charge is the template's `balanceOf`, so the app and the oracle share one calculation.
// A reversal undoes one receipt or one unpaid charge by its exact amount. An entry never changes.
import type { LocalDate } from "../../../template/src/calendar";
import { toCsv } from "../../../template/src/data/csvExport";
import { balanceOf, feeStatusAt, formatMoney } from "../../../template/src/money";
import type { ReportTable } from "../../../template/src/output/print";
import { orderQueue } from "../../../template/src/queue";
import type { ChargeLedger, FeeStatus } from "../../../template/src/money";
import type { Currency, Uuid } from "../../../template/src/types";
import type { AllotState, LedgerEntry } from "./types";

export interface ChargeSummary {
  charge: LedgerEntry;
  /** The charge amount. */
  charged: number;
  /** Every receipt up to the date, before any reversal. */
  received: number;
  /** Receipts that a reversal undid by the date. */
  reversed: number;
  /** What is still owed: charged less received plus reversed. */
  balance: number;
  status: FeeStatus | "reversed";
  dueOn?: LocalDate;
  receipts: { entry: LedgerEntry; reversed: boolean }[];
}

const FAR: LocalDate = "9999-12-31";

const entries = (state: AllotState): LedgerEntry[] => Object.values(state.ledger);

/** The charge an entry belongs to. A charge belongs to itself. */
export function chargeIdOf(entry: LedgerEntry): Uuid {
  return entry.type === "charge" ? entry.entryId : (entry.chargeId as Uuid);
}

/** The entries that a reversal undid by a date, with the reversal. */
function reversedAt(state: AllotState, asOf: LocalDate): Map<Uuid, LedgerEntry> {
  const map = new Map<Uuid, LedgerEntry>();
  for (const e of entries(state)) if (e.type === "reversal" && e.reverses !== undefined && e.on <= asOf) map.set(e.reverses, e);
  return map;
}

/** A charge at a date, or undefined when it was not yet charged. */
export function chargeSummary(state: AllotState, chargeId: Uuid, asOf: LocalDate): ChargeSummary | undefined {
  const charge = state.ledger[chargeId];
  if (charge === undefined || charge.type !== "charge" || charge.on > asOf) return undefined;
  const undone = reversedAt(state, asOf);
  const receipts = entries(state)
    .filter((e) => e.type === "receipt" && e.chargeId === chargeId && e.on <= asOf)
    .map((entry) => ({ entry, reversed: undone.has(entry.entryId) }));
  const ledger: ChargeLedger = { charge: charge.minorUnits, receipts: receipts.map((r) => ({ amount: r.entry.minorUnits, reversed: r.reversed })) };
  const dueOn = state.seasons[charge.seasonId]?.dueOn;
  const summary: ChargeSummary = {
    charge,
    charged: charge.minorUnits,
    received: receipts.reduce((sum, r) => sum + r.entry.minorUnits, 0),
    reversed: receipts.filter((r) => r.reversed).reduce((sum, r) => sum + r.entry.minorUnits, 0),
    balance: undone.has(chargeId) ? 0 : balanceOf(ledger),
    status: undone.has(chargeId) ? "reversed" : feeStatusAt(ledger, dueOn, asOf),
    receipts,
  };
  if (dueOn !== undefined) summary.dueOn = dueOn;
  return summary;
}

/** The charges of a tenancy in the order they were made. A reversed charge is included. */
export function chargesOfTenancy(state: AllotState, tenancyId: Uuid): LedgerEntry[] {
  return entries(state).filter((e) => e.type === "charge" && e.tenancyId === tenancyId);
}

/** What a tenancy still owes at a date. It never includes another tenancy. */
export function tenancyBalance(state: AllotState, tenancyId: Uuid, asOf: LocalDate): number {
  let total = 0;
  for (const charge of chargesOfTenancy(state, tenancyId)) {
    const summary = chargeSummary(state, charge.entryId, asOf);
    if (summary !== undefined && summary.status !== "reversed") total += summary.balance;
  }
  return total;
}

/** The charge of a tenancy in a season that has not been reversed. */
export function liveChargeOf(state: AllotState, tenancyId: Uuid, seasonId: Uuid): LedgerEntry | undefined {
  const undone = reversedAt(state, FAR);
  return chargesOfTenancy(state, tenancyId).find((c) => c.seasonId === seasonId && !undone.has(c.entryId));
}

/** True when any charge was ever made, even one that was reversed. The currency is then fixed. */
export function hasAnyCharge(state: AllotState): boolean {
  return entries(state).some((e) => e.type === "charge");
}

/** The receipts of a charge that no reversal has undone. */
export function liveReceipts(state: AllotState, chargeId: Uuid): LedgerEntry[] {
  const undone = reversedAt(state, FAR);
  return entries(state).filter((e) => e.type === "receipt" && e.chargeId === chargeId && !undone.has(e.entryId));
}

/**
 * How much a new receipt dated `on` may be. A receipt counts on its own date and every date after it, so the
 * most that is applied on any of those dates sets the limit. In date order this is the charge less what is paid.
 */
export function availableAt(state: AllotState, chargeId: Uuid, on: LocalDate): number {
  const charge = state.ledger[chargeId];
  if (charge === undefined) return 0;
  const dates = new Set<LocalDate>([on]);
  for (const e of entries(state)) if (e.chargeId === chargeId && e.on >= on) dates.add(e.on);
  let worst = 0;
  for (const date of dates) {
    const undone = reversedAt(state, date);
    const applied = entries(state)
      .filter((e) => e.type === "receipt" && e.chargeId === chargeId && e.on <= date && !undone.has(e.entryId))
      .reduce((sum, e) => sum + e.minorUnits, 0);
    if (applied > worst) worst = applied;
  }
  return charge.minorUnits - worst;
}

export type Say = (key: string, values?: Record<string, string | number>) => string;

export interface SeasonRow {
  tenancyId: Uuid;
  plotCode: string;
  holder: string;
  chargeId: Uuid;
  charged: number;
  received: number;
  reversed: number;
  balance: number;
  status: FeeStatus | "reversed";
  waiver?: string;
}

export interface SeasonReport {
  seasonId: Uuid;
  seasonName: string;
  asOf: LocalDate;
  revision: number;
  /** Corrections are applied: the report is built from the current state. */
  basis: "current_corrections";
  rows: SeasonRow[];
  /** Received is net of reversals. Balance due is charged less received, over the rows that are not reversed. */
  totals: { charged: number; received: number; balanceDue: number };
  handovers: { plotCode: string; on: LocalDate; from: string; to: string }[];
  waiting: { position: number; name: string; joinedOn: LocalDate; pending: boolean }[];
  currency: string;
  empty: boolean;
}

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

/** The waiting list as it stood on a date: joined by then, and not yet housed or withdrawn. */
export function waitingAt(state: AllotState, asOf: LocalDate): SeasonReport["waiting"] {
  const offers = Object.values(state.offers);
  const entries = Object.values(state.applications)
    .filter((a) => {
      if (a.joinedOn > asOf) return false;
      if (a.withdrawn !== undefined && a.withdrawn.on <= asOf) return false;
      const accepted = a.state === "housed" && a.offerId !== undefined ? state.offers[a.offerId] : undefined;
      if (accepted?.closed !== undefined && accepted.closed.on <= asOf) return false;
      return true;
    })
    .map((a) => ({
      applicationId: a.applicationId,
      joinedOn: a.joinedOn,
      sequence: a.sequence,
      pending: offers.some((o) => o.applicationId === a.applicationId && o.offeredOn <= asOf && (o.closed === undefined || o.closed.on > asOf)),
    }));
  return orderQueue(entries).map((e, index) => {
    const application = state.applications[e.applicationId];
    return { position: index + 1, name: state.people[application?.personId ?? ""]?.displayName ?? "", joinedOn: e.joinedOn, pending: e.pending };
  });
}

export function seasonReport(state: AllotState, input: { seasonId: Uuid; asOf: LocalDate; revision: number }): SeasonReport {
  const season = state.seasons[input.seasonId];
  const holderOf = (personId: Uuid | undefined): string => (personId === undefined ? "" : (state.people[personId]?.displayName ?? ""));
  const rows: SeasonRow[] = [];
  const order = new Map<Uuid, string>();
  for (const charge of entries(state)) {
    if (charge.type !== "charge" || charge.seasonId !== input.seasonId) continue;
    const summary = chargeSummary(state, charge.entryId, input.asOf);
    if (summary === undefined) continue;
    const tenancy = state.tenancies[charge.tenancyId];
    const plotCode = tenancy === undefined ? "" : (state.core.plots[tenancy.plotId]?.code ?? "");
    order.set(charge.entryId, `${tenancy?.start ?? ""}`);
    const row: SeasonRow = {
      tenancyId: charge.tenancyId,
      plotCode,
      holder: holderOf(tenancy?.personId),
      chargeId: charge.entryId,
      charged: summary.charged,
      received: summary.received,
      reversed: summary.reversed,
      balance: summary.balance,
      status: summary.status,
    };
    if (charge.waiver !== undefined) row.waiver = charge.waiver;
    rows.push(row);
  }
  rows.sort((a, b) => natural(a.plotCode, b.plotCode) || natural(order.get(a.chargeId) ?? "", order.get(b.chargeId) ?? ""));

  const live = rows.filter((r) => r.status !== "reversed");
  const totals = {
    charged: live.reduce((n, r) => n + r.charged, 0),
    received: live.reduce((n, r) => n + r.received - r.reversed, 0),
    balanceDue: live.reduce((n, r) => n + r.balance, 0),
  };

  const handovers = Object.values(state.tenancies)
    .filter((t) => t.handoverFrom !== undefined && t.start <= input.asOf)
    .map((t) => ({
      plotCode: state.core.plots[t.plotId]?.code ?? "",
      on: t.start,
      from: holderOf(state.tenancies[t.handoverFrom as Uuid]?.personId),
      to: holderOf(t.personId),
    }))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : natural(a.plotCode, b.plotCode)));

  return {
    seasonId: input.seasonId,
    seasonName: season?.name ?? "",
    asOf: input.asOf,
    revision: input.revision,
    basis: "current_corrections",
    rows,
    totals,
    handovers,
    waiting: waitingAt(state, input.asOf),
    currency: state.currency ?? "",
    empty: rows.length === 0,
  };
}

const STATUS_KEYS: Readonly<Record<SeasonRow["status"], string>> = {
  due: "feeDue",
  part_paid: "feePartPaid",
  paid: "feePaid",
  overdue: "feeOverdue",
  reversed: "feeReversed",
};

const money = (state: AllotState, minor: number): string => formatMoney(minor, (state.currency ?? "GBP") as Currency);

/** The private report as a plain table, for the screen, the print document and the CSV. */
export function reportTable(state: AllotState, report: SeasonReport, say: Say): ReportTable {
  const fees = report.rows.map((r) => [r.plotCode, r.holder, money(state, r.charged), money(state, r.received), money(state, r.reversed), money(state, r.balance), say(STATUS_KEYS[r.status])]);
  return {
    title: say("seasonReport"),
    subtitle: say("privateRegisterReport"),
    scope: [say("seasonLine", { season: report.seasonName }), say("reportAsAtLine", { date: report.asOf }), say("reportBasis", { date: report.asOf, revision: report.revision })],
    totals: [
      { label: say("feesCharged"), value: money(state, report.totals.charged) },
      { label: say("feesReceived"), value: money(state, report.totals.received) },
      { label: say("balanceDue"), value: money(state, report.totals.balanceDue) },
    ],
    sections: [
      {
        heading: say("seasonFees"),
        columns: ["plotLabel", "holderHeading", "amountCharged", "amountReceived", "reversedHeading", "stillDue", "statusHeading"].map((k) => say(k)),
        rows: fees,
        emptyText: say("noChargesInSeason"),
      },
      {
        heading: say("plotHandovers"),
        columns: ["plotLabel", "dateHeading", "previousHolder", "newHolder"].map((k) => say(k)),
        rows: report.handovers.map((h) => [h.plotCode, h.on, h.from, h.to]),
        emptyText: say("noHandovers"),
      },
      {
        heading: say("waitingListOrder"),
        columns: ["positionLabel", "applicantHeading", "joinedHeading"].map((k) => say(k)),
        rows: report.waiting.map((w) => [String(w.position), w.pending ? `${w.name} · ${say("offerPending")}` : w.name, w.joinedOn]),
        emptyText: say("noOneWaiting"),
      },
    ],
    footer: say("reportPrivateFooter"),
  };
}

/** The private CSV. A cell that starts like a formula is escaped by `toCsv`. */
export function reportCsv(state: AllotState, report: SeasonReport, say: Say): string {
  const headings = ["partHeading", "plotLabel", "holderHeading", "amountCharged", "amountReceived", "reversedHeading", "stillDue", "statusHeading", "dateHeading", "detailHeading"].map((k) => say(k));
  const rows: string[][] = [];
  for (const r of report.rows) {
    rows.push([say("seasonFees"), r.plotCode, r.holder, money(state, r.charged), money(state, r.received), money(state, r.reversed), money(state, r.balance), say(STATUS_KEYS[r.status]), "", r.waiver ?? ""]);
  }
  for (const h of report.handovers) rows.push([say("plotHandovers"), h.plotCode, h.to, "", "", "", "", "", h.on, h.from]);
  for (const w of report.waiting) rows.push([say("waitingListOrder"), "", w.name, "", "", "", "", w.pending ? say("offerPending") : "", w.joinedOn, String(w.position)]);
  return toCsv(headings, rows);
}