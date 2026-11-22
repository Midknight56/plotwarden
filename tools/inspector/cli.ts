// The plot inspector on the command line, for people. It runs the same three tools as the server.
//
//   node dist/inspector/cli.mjs --list
//   node dist/inspector/cli.mjs explain_plot '{"fixtureId":"lantern-fold","plotCode":"Y07","asOf":"2026-04-20"}'
//
// The arguments are one tool name and one JSON text. They are data. Nothing is run from them.
// Exit 0 for an answer, 1 for a refused call (the typed error is printed), 2 for a bad command line.
import process from "node:process";
import { TOOL_NAMES, callTool } from "./inspect";

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

const USAGE = 'Use: cli --list, or cli <tool> <json>. For example: cli explain_plot \'{"fixtureId":"lantern-fold","plotCode":"Y07","asOf":"2026-04-20"}\'';

export function runCli(argv: readonly string[]): CliResult {
  if (argv.length === 1 && argv[0] === "--list") return { code: 0, out: TOOL_NAMES.join("\n") + "\n", err: "" };
  if (argv.length !== 2) return { code: 2, out: "", err: `I need a tool name and one JSON text. ${USAGE}\n` };
  const [name, text] = argv as [string, string];
  if (!(TOOL_NAMES as readonly string[]).includes(name)) return { code: 2, out: "", err: `I do not know the tool "${name.slice(0, 40)}". The tools are ${TOOL_NAMES.join(", ")}.\n` };
  let args: unknown;
  try {
    args = JSON.parse(text);
  } catch {
    return { code: 2, out: "", err: `The second argument is not JSON. ${USAGE}\n` };
  }
  const result = callTool(name, args);
  if (result.ok) return { code: 0, out: `${JSON.stringify(result.value, null, 2)}\n`, err: "" };
  return { code: 1, out: `${JSON.stringify({ error: result.error })}\n`, err: "" };
}

if ((process.argv[1] ?? "").replace(/\\/g, "/").endsWith("/cli.mjs")) {
  const result = runCli(process.argv.slice(2));
  if (result.out !== "") process.stdout.write(result.out);
  if (result.err !== "") process.stderr.write(result.err);
  process.exitCode = result.code;
}