// Automated accessibility checks for the browser specs, with axe. Test helper. The template never imports it.
// axe finds what a program can find. It does not replace a person who uses a keyboard or a screen reader.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export interface Finding {
  rule: string;
  impact: string;
  help: string;
  nodes: { target: string; summary: string }[];
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Run every axe rule of those tags on the page as it is now. Returns each violation, of any weight. */
export async function axeFindings(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact ?? "unknown",
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary ?? "").split("\n").slice(0, 3).join(" ") })),
  }));
}

/** The findings that fail a run: serious and critical. */
export const blocking = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.impact === "serious" || f.impact === "critical");

/** The findings that are kept in the log and do not fail a run. */
export const noted = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.impact !== "serious" && f.impact !== "critical");