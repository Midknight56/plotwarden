// The family map form without React: what the form says for a register as it is saved, what it says after
// "Clear public details", and the commands that a save sends. Pure. It reads a state and writes nothing.
import { approvalStatus } from "./rules";
import type { ChurchState } from "./types";

export interface Row {
  include: boolean;
  shown: string;
  year: boolean;
  line: string;
}

export interface FormState {
  siteName: string;
  gateName: string;
  directions: string;
  outlines: boolean;
  sectionNames: Record<string, string>;
  pathNames: Record<string, string>;
  includePath: Record<string, boolean>;
  plotCodes: Record<string, string>;
  rows: Record<string, Row>;
}

export type FormCommand = { type: string; [k: string]: unknown };

/**
 * What the form says for the register as it is saved. A burial whose approval is in review, because its name or
 * place was corrected, shows unticked with its current recorded name: it is approved again only when the keeper
 * ticks it, and the name that was approved before the correction is never offered again.
 */
export function fromState(state: ChurchState): FormState {
  const rows: Record<string, Row> = {};
  for (const b of Object.values(state.burials)) {
    if (b.voided === true || b.nameUnknown || b.recordedName === undefined) continue;
    const approval = state.approvals[b.burialId];
    const status = approvalStatus(state, b.burialId);
    rows[b.burialId] = {
      include: status === "approved",
      shown: status === "review" ? b.recordedName : (approval?.name ?? b.recordedName),
      year: approval?.includeYear === true,
      line: approval?.line ?? "",
    };
  }
  const pathNames: Record<string, string> = {};
  const includePath: Record<string, boolean> = {};
  for (const p of Object.values(state.map.paths)) {
    pathNames[p.pathId] = state.pub.pathNames[p.pathId] ?? p.name;
    includePath[p.pathId] = state.pub.pathNames[p.pathId] !== undefined;
  }
  const sectionNames: Record<string, string> = {};
  for (const s of Object.values(state.map.sections)) sectionNames[s.sectionId] = state.pub.sectionNames[s.sectionId] ?? "";
  const plotCodes: Record<string, string> = {};
  for (const p of Object.values(state.core.plots)) plotCodes[p.plotId] = state.pub.plotCodes[p.plotId] ?? p.code;
  return {
    siteName: state.pub.siteName ?? "",
    gateName: state.pub.gateName ?? "",
    directions: state.pub.directions ?? "",
    outlines: state.pub.outlines === true,
    sectionNames,
    pathNames,
    includePath,
    plotCodes,
    rows,
  };
}

/** What the form says once "Clear public details" has saved. */
export function clearedForm(state: ChurchState): FormState {
  return fromState({ ...state, pub: { sectionNames: {}, pathNames: {}, plotCodes: {} } });
}

/** The commands that saving the form sends. Never more than the keeper changed: a row that was not changed sends nothing. */
export function saveCommands(state: ChurchState, edit: FormState): FormCommand[] {
  const commands: FormCommand[] = [];
  const includedPlots = new Set(Object.entries(edit.rows).filter(([, r]) => r.include).map(([id]) => state.burials[id]?.plotId));
  const plotCodes = Object.fromEntries(
    Object.entries(edit.plotCodes).filter(([plotId, code]) => includedPlots.has(plotId) && code.trim() !== "" && code.trim() !== state.core.plots[plotId]?.code),
  );
  commands.push({
    type: "set_public",
    siteName: edit.siteName,
    gateName: edit.gateName,
    directions: edit.directions,
    outlines: edit.outlines,
    sectionNames: Object.fromEntries(Object.entries(edit.sectionNames).filter(([, v]) => v.trim() !== "")),
    pathNames: Object.fromEntries(Object.entries(edit.pathNames).filter(([id, v]) => edit.includePath[id] === true && v.trim() !== "")),
    plotCodes,
  });
  for (const [burialId, row] of Object.entries(edit.rows)) {
    const approval = state.approvals[burialId];
    const status = approvalStatus(state, burialId);
    const hasYear = state.burials[burialId]?.date.p !== "unknown";
    if (row.include) {
      const wantYear = row.year && hasYear;
      if (status !== "approved" || approval?.name !== row.shown.trim() || approval?.includeYear !== wantYear || (approval?.line ?? "") !== row.line.trim()) {
        commands.push({ type: "approve_burial", burialId, ...(row.shown.trim() === "" ? {} : { name: row.shown.trim() }), includeYear: wantYear, ...(row.line.trim() === "" ? {} : { line: row.line.trim() }) });
      }
    } else if (status === "approved") {
      // A row in review is already withheld. Only a live approval that the keeper unticked is withdrawn.
      commands.push({ type: "withdraw_approval", burialId });
    }
  }
  return commands;
}
