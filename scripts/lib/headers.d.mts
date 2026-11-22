export interface HeaderRule {
  pattern: string;
  headers: [string, string][];
}

export function parseHeaders(text: string): HeaderRule[];
export function matches(pattern: string, path: string): boolean;
export function rulesFor(path: string, rules: HeaderRule[]): HeaderRule[];
export function headersFor(path: string, rules: HeaderRule[]): [string, string][];
export function valuesOf(path: string, rules: HeaderRule[], name: string): string[];
export function parsePolicy(policy: string): Record<string, string[]>;
export function policyProblems(policy: string): string[];
