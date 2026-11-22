// The plot inspector as a Model Context Protocol server on standard streams: one JSON message a line, in
// and out, as the stdio transport defines. It lists exactly three tools. It opens no file, no socket and no
// process, and reads no environment value. Standard error carries nothing.
import { createInterface } from "node:readline";
import process from "node:process";
import { TOOLS, TOOL_NAMES, callTool } from "./inspect";

const NEWEST = "2025-06-18";
const SUPPORTED: readonly string[] = [NEWEST, "2025-03-26", "2024-11-05"];

type Id = string | number | null;

const reply = (id: Id, result: unknown): string => JSON.stringify({ jsonrpc: "2.0", id, result });
const fault = (id: Id, code: number, message: string): string => JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });

const isId = (v: unknown): v is string | number => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/** One input line in, one output line out, or nothing for a notification and a blank line. */
export function handleLine(line: string): string | undefined {
  const text = line.trim();
  if (text === "") return undefined;
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return fault(null, -32700, "Parse error");
  }
  if (message === null || typeof message !== "object" || Array.isArray(message)) return fault(null, -32600, "Invalid request");
  const m = message as { id?: unknown; method?: unknown; params?: unknown };
  const id: Id = isId(m.id) ? m.id : null;
  if (typeof m.method !== "string") return fault(id, -32600, "Invalid request");
  // A message with no id is a notification. It gets no answer, whatever it says.
  if (m.id === undefined) return undefined;
  const params = m.params !== null && typeof m.params === "object" && !Array.isArray(m.params) ? (m.params as Record<string, unknown>) : {};

  switch (m.method) {
    case "initialize": {
      const asked = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "";
      return reply(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : NEWEST,
        capabilities: { tools: {} },
        serverInfo: { name: "plot-inspector", version: "1.0.0" },
      });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case "tools/call": {
      const name = params["name"];
      if (typeof name !== "string" || !(TOOL_NAMES as readonly string[]).includes(name)) return fault(id, -32602, "Unknown tool");
      const result = callTool(name, params["arguments"] === undefined ? {} : params["arguments"]);
      return reply(id, {
        content: [{ type: "text", text: JSON.stringify(result.ok ? result.value : { error: result.error }) }],
        isError: !result.ok,
      });
    }
    default:
      return fault(id, -32601, "Method not found");
  }
}

/** Read lines from standard input until it closes, and answer each on standard output. */
export function serve(): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    const answer = handleLine(line);
    if (answer !== undefined) process.stdout.write(`${answer}\n`);
  });
}

// Start only when this file is the one Node was asked to run, so a test can import `handleLine`.
if ((process.argv[1] ?? "").replace(/\\/g, "/").endsWith("/server.mjs")) serve();