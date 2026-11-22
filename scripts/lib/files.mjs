// Small file helpers shared by the release scripts. Node built ins only.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A refusal with the exit code the script ends with: 1 for a check that failed, 2 for a bad call or missing input. */
export class Refusal extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

/** Every file under `root`, as sorted paths with forward slashes. Folders are not listed. A missing folder lists nothing. */
export function listFiles(root) {
  const found = [];
  const visit = (rel) => {
    const dir = rel === "" ? root : join(root, rel);
    for (const name of readdirSync(dir)) {
      const next = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(root, next)).isDirectory()) visit(next);
      else found.push(next);
    }
  };
  if (existsSync(root) && statSync(root).isDirectory()) visit("");
  return found.sort();
}

/**
 * Read `--name value` and `--flag` arguments. `spec` maps each name to "value" or "flag".
 * An unknown name, a missing value or a stray word is a refusal.
 */
export function parseArgs(argv, spec) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const name = arg.startsWith("--") ? arg.slice(2) : undefined;
    if (name === undefined || spec[name] === undefined) throw new Refusal(`Unknown argument: ${arg}`);
    if (spec[name] === "flag") {
      values[name] = true;
    } else {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Refusal(`The argument --${name} needs a value`);
      values[name] = value;
      i += 1;
    }
  }
  return values;
}

/** Run a script's main function (sync or async) and turn a refusal into a message and an exit code. */
export function finish(main) {
  const fail = (error) => {
    if (error instanceof Refusal) {
      console.error(error.message);
      process.exitCode = error.code;
    } else {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 2;
    }
  };
  try {
    const result = main();
    if (result !== null && typeof result === "object" && typeof result.then === "function") {
      return result.then((code) => void (process.exitCode = code ?? 0), fail);
    }
    process.exitCode = result ?? 0;
  } catch (error) {
    fail(error);
  }
  return undefined;
}
