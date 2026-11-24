// Compare the committee file rules in a Plotwarden register with the copy in the Review Desk.
//
//   node compare.mjs --register <register folder> --desk <Review Desk folder>
//
// Each of the eight files is checked against the Desk's saved record, vendor/exchange/provenance.json in the
// Desk: its byte count and its SHA 256. The register's own copy of the eight pairs is read from
// scripts/lib/exchange-files.json in the register folder. Prints
//   Desk matches N/8
//   Register matches N/8
// and one line per file that differs:
//   Register differs <path in the register> (<bytes> bytes, expected <bytes>)
//   Desk differs <path in the Desk> (<bytes> bytes, expected <bytes>)
// Exit 0 when every file matches. Exit 1 when a file differs. Exit 2 for bad input: a missing folder or file, a
// bad argument, a bad record, an entry that is listed twice, is not one of the eight, or has a path outside its
// folder. Every entry is checked before any file is read, and nothing is printed on exit 2.
// This script only reads. It never changes a file or a folder in either project. Node built ins only.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const FORMAT = "plot.exchange.vendor.v1";
const LIST_PATH = "scripts/lib/exchange-files.json";
const RECORD_PATH = "vendor/exchange/provenance.json";
const DESK_FILES = "vendor/exchange";
const USAGE = "Use: node compare.mjs --register <register folder> --desk <Review Desk folder>";

/** Bad input. The script ends with exit code 2. */
class BadInput extends Error {}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if ((name !== "--register" && name !== "--desk") || values[name] !== undefined) {
      throw new BadInput(`Unknown or repeated argument: ${name}. ${USAGE}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new BadInput(`The argument ${name} needs a folder. ${USAGE}`);
    values[name] = value;
    i += 1;
  }
  if (values["--register"] === undefined || values["--desk"] === undefined) {
    throw new BadInput(`Give both folders with --register and --desk. ${USAGE}`);
  }
  return { register: resolve(values["--register"]), desk: resolve(values["--desk"]) };
}

function folderOf(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new BadInput(`${path} is not a folder. Check the ${label} folder.`);
  return realpathSync(path);
}

/** The path inside the folder, or a refusal when it is empty, absolute or climbs out of the folder. */
function inside(folder, rel, where) {
  const text = typeof rel === "string" ? rel : "";
  const climbs = text.split(/[\\/]/).includes("..");
  if (text === "" || text.includes("\0") || isAbsolute(text) || /^[a-zA-Z]:/.test(text) || text.startsWith("/") || text.startsWith("\\") || climbs) {
    throw new BadInput(`${text === "" ? String(rel) : text} in ${where} is outside the folder.`);
  }
  const full = resolve(folder, text);
  const back = relative(folder, full);
  if (back === "" || back.startsWith("..") || isAbsolute(back)) throw new BadInput(`${text} in ${where} is outside the folder.`);
  return full;
}

/** The bytes of a file, or a refusal when it is missing, is not a file, or is reached through a link out of the folder. */
function readInside(folder, rel, side, label) {
  const full = join(folder, ...rel.split("/"));
  if (!existsSync(full)) throw new BadInput(`${label} is missing from the ${side}.`);
  if (!statSync(full).isFile()) throw new BadInput(`${label} in the ${side} is not a file.`);
  const back = relative(folder, realpathSync(full));
  if (back.startsWith("..") || isAbsolute(back)) throw new BadInput(`${label} in the ${side} is outside the folder.`);
  return readFileSync(full);
}

function readJson(folder, rel, side) {
  const bytes = readInside(folder, rel, side, rel);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BadInput(`${rel} in the ${side} is not valid JSON.`);
  }
}

/** The eight pairs [path in the register, path in the Desk copy], from the register's own list. */
function readPairs(register) {
  const list = readJson(register, LIST_PATH, "register");
  if (!Array.isArray(list) || list.length === 0) throw new BadInput(`${LIST_PATH} in the register is not a list of pairs.`);
  return list.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") {
      throw new BadInput(`${LIST_PATH} in the register holds an entry that is not a pair of paths.`);
    }
    inside(register, pair[0], `${LIST_PATH} (register path)`);
    inside(register, pair[1], `${LIST_PATH} (Desk path)`);
    return { sourcePath: pair[0], path: pair[1] };
  });
}

/** The Desk's saved record, one entry per pair, in the order of the list. Every entry is checked before it is used. */
function readRecord(desk, register, pairs) {
  const record = readJson(desk, RECORD_PATH, "Desk");
  if (record === null || typeof record !== "object" || record.format !== FORMAT || !Array.isArray(record.files)) {
    throw new BadInput(`${RECORD_PATH} in the Desk is not a ${FORMAT} record.`);
  }
  const deskFolder = join(desk, ...DESK_FILES.split("/"));
  const seen = new Map();
  for (const entry of record.files) {
    if (entry === null || typeof entry !== "object") throw new BadInput(`${RECORD_PATH} holds an entry that is not an object.`);
    inside(deskFolder, entry.path, RECORD_PATH);
    inside(register, entry.sourcePath, RECORD_PATH);
    if (seen.has(entry.path)) throw new BadInput(`${RECORD_PATH} lists ${entry.path} twice.`);
    const pair = pairs.find((p) => p.path === entry.path && p.sourcePath === entry.sourcePath);
    if (pair === undefined) throw new BadInput(`${entry.path} in ${RECORD_PATH} is not one of the eight files.`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new BadInput(`${entry.path} in ${RECORD_PATH} has no usable byte count and SHA 256.`);
    }
    seen.set(entry.path, entry);
  }
  return pairs.map((pair) => {
    const entry = seen.get(pair.path);
    if (entry === undefined) throw new BadInput(`${pair.path} is missing from ${RECORD_PATH}.`);
    return { ...pair, bytes: entry.bytes, sha256: entry.sha256 };
  });
}

function main() {
  const { register: registerArg, desk: deskArg } = parseArgs(process.argv.slice(2));
  const register = folderOf(registerArg, "register");
  const desk = folderOf(deskArg, "Review Desk");
  const expected = readRecord(desk, register, readPairs(register));

  // Read every file first, so a missing file ends the run before anything is printed.
  const found = expected.map((e) => ({
    e,
    deskFile: `${DESK_FILES}/${e.path}`,
    deskBytes: readInside(desk, `${DESK_FILES}/${e.path}`, "Desk", `${DESK_FILES}/${e.path}`),
    registerBytes: readInside(register, e.sourcePath, "register", e.sourcePath),
  }));

  const differs = (bytes, e) => bytes.length !== e.bytes || sha256(bytes) !== e.sha256;
  const deskDiffs = found.filter((f) => differs(f.deskBytes, f.e));
  const registerDiffs = found.filter((f) => differs(f.registerBytes, f.e));

  console.log(`Desk matches ${found.length - deskDiffs.length}/${found.length}`);
  console.log(`Register matches ${found.length - registerDiffs.length}/${found.length}`);
  for (const f of deskDiffs) console.log(`Desk differs ${f.deskFile} (${f.deskBytes.length} bytes, expected ${f.e.bytes})`);
  for (const f of registerDiffs) console.log(`Register differs ${f.e.sourcePath} (${f.registerBytes.length} bytes, expected ${f.e.bytes})`);
  return deskDiffs.length + registerDiffs.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  if (!(error instanceof BadInput)) throw error;
  console.error(`compare: ${error.message}`);
  process.exitCode = 2;
}
