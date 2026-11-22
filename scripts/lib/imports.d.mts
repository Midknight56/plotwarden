export interface ScanResult {
  /** The source with comments blanked out. Strings and line breaks are kept. */
  code: string;
  /** Import specifiers in the order they appear. */
  imports: string[];
}

export function scanSource(text: string): ScanResult;

export function walkSourceFiles(root: string): string[];

export type ResolvedImport = { kind: "relative"; target: string } | { kind: "bare"; pkg: string };

export function resolveImport(fileRel: string, spec: string): ResolvedImport;
