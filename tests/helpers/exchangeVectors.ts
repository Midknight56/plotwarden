// One runner for tests/fixtures/exchange-vectors.json. Test helper. The template never imports it.
// The same vectors run against template/src/exchange and against the pinned copy the Desk holds.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ParseVector {
  name: string;
  value: unknown;
  expect: { ok: true } | { ok: false; code: string; path: string };
}

export interface CompareVector {
  name: string;
  current: unknown;
  incoming: unknown;
  expect: { relation: string; changes?: { new: string[]; stillOpen: string[]; changed: string[]; noLongerFlagged: string[] } };
}

export interface ReadingVector {
  name: string;
  slip: unknown;
  context: { siteKey: string; lineageId: string; open: { issueKey: string; factVersion: number }[]; received: string[] };
  expect: { ok: true; statuses: string[] } | { ok: false; code: string };
}

export interface Vectors {
  format: string;
  packets: ParseVector[];
  slips: ParseVector[];
  compare: CompareVector[];
  reading: ReadingVector[];
}

/** The parts of the exchange module the vectors need. Typed loosely so a copy can be tested as it is. */
export interface ExchangeModule {
  parsePacket(value: unknown): { ok: boolean; value?: unknown; issues?: { path: string; code: string }[] };
  parseSlip(value: unknown): { ok: boolean; value?: unknown; issues?: { path: string; code: string }[] };
  comparePackets(current: never, incoming: never): { relation: string; changes?: { new: string[]; stillOpen: string[]; changed: string[]; noLongerFlagged: string[] } };
  readSlip(slip: never, context: never): { ok: boolean; code?: string; rows?: { status: string }[] };
}

export const VECTORS_PATH = fileURLToPath(new URL("../fixtures/exchange-vectors.json", import.meta.url));

export function loadVectors(path: string = VECTORS_PATH): Vectors {
  return JSON.parse(readFileSync(path, "utf8")) as Vectors;
}

const sorted = (list: readonly string[]): string[] => [...list].sort();

/** undefined when the vector passes, else a sentence naming what differed. */
export function checkParseVector(parse: (value: unknown) => { ok: boolean; issues?: { path: string; code: string }[] }, vector: ParseVector): string | undefined {
  const got = parse(vector.value);
  if (vector.expect.ok) return got.ok ? undefined : `${vector.name}: expected ok, got ${JSON.stringify(got.issues)}`;
  if (got.ok) return `${vector.name}: expected ${vector.expect.code} at "${vector.expect.path}", got ok`;
  const first = got.issues?.[0];
  if (first?.code !== vector.expect.code || first.path !== vector.expect.path) {
    return `${vector.name}: expected ${vector.expect.code} at "${vector.expect.path}", got ${JSON.stringify(first)}`;
  }
  return undefined;
}

export function checkCompareVector(mod: ExchangeModule, vector: CompareVector): string | undefined {
  const current = mod.parsePacket(vector.current);
  const incoming = mod.parsePacket(vector.incoming);
  if (!current.ok || !incoming.ok) return `${vector.name}: a packet in the vector does not parse`;
  const got = mod.comparePackets(current.value as never, incoming.value as never);
  if (got.relation !== vector.expect.relation) return `${vector.name}: expected ${vector.expect.relation}, got ${got.relation}`;
  const want = vector.expect.changes;
  if (want === undefined) return undefined;
  const have = got.changes;
  if (have === undefined) return `${vector.name}: no changes given`;
  for (const key of ["new", "stillOpen", "changed", "noLongerFlagged"] as const) {
    if (JSON.stringify(sorted(have[key])) !== JSON.stringify(sorted(want[key]))) {
      return `${vector.name}: ${key} expected ${JSON.stringify(want[key])}, got ${JSON.stringify(have[key])}`;
    }
  }
  return undefined;
}

export function checkReadingVector(mod: ExchangeModule, vector: ReadingVector): string | undefined {
  const slip = mod.parseSlip(vector.slip);
  if (!slip.ok) return `${vector.name}: the slip in the vector does not parse`;
  const got = mod.readSlip(slip.value as never, vector.context as never);
  if (!vector.expect.ok) {
    return !got.ok && got.code === vector.expect.code ? undefined : `${vector.name}: expected refusal ${vector.expect.code}, got ${JSON.stringify(got)}`;
  }
  if (!got.ok) return `${vector.name}: expected rows, got refusal ${got.code}`;
  const statuses = (got.rows ?? []).map((r) => r.status);
  return JSON.stringify(statuses) === JSON.stringify(vector.expect.statuses) ? undefined : `${vector.name}: expected ${JSON.stringify(vector.expect.statuses)}, got ${JSON.stringify(statuses)}`;
}

/** Every failure over the whole file. An empty list means the module meets the contract. */
export function vectorFailures(mod: ExchangeModule, vectors: Vectors): string[] {
  const out: (string | undefined)[] = [
    ...vectors.packets.map((v) => checkParseVector((x) => mod.parsePacket(x), v)),
    ...vectors.slips.map((v) => checkParseVector((x) => mod.parseSlip(x), v)),
    ...vectors.compare.map((v) => checkCompareVector(mod, v)),
    ...vectors.reading.map((v) => checkReadingVector(mod, v)),
  ];
  return out.filter((m): m is string => m !== undefined);
}
