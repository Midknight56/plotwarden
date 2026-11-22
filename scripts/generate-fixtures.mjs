// Writes the invented fixtures for spec 02. Run with `npm run fixtures`.
// Everything here is made up for this project. No real person, grave or page.
// Output is UTF-8 with LF line ends, except the one file that tests a byte order mark.
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tests", "fixtures");
mkdirSync(out, { recursive: true });

function writeText(name, text) {
  writeFileSync(join(out, name), text, { encoding: "utf8" });
}

// ---- The 200 record paper book ------------------------------------------------
// References R001 to R200. R001 to R198 sit at C001 to C198 in section Paper.
// R199 and R200 have no location. The bad file leaves the source ref of R117 blank.

const FIRST = [
  "Alder", "Brindle", "Cove", "Dunmore", "Elspin", "Fenwick", "Garrow", "Hesper", "Ivel", "Juniper",
  "Kestrel", "Lorne", "Marram", "Nettle", "Orrin", "Pennant", "Quill", "Rowan", "Sorrel", "Tamsin",
];
const LAST = [
  "Ashgrove", "Bramblecote", "Cloverhythe", "Dewmarsh", "Emberlow", "Fernhollow", "Goldwick", "Hartwell",
  "Inglenook", "Larkspur",
];

/** A name for row i (0 based). Two rows share a name on purpose, with different source refs. */
function nameFor(i) {
  if (i === 49 || i === 149) return "Mirel Quillmoss";
  return `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
}

function dateFor(i) {
  const year = 1850 + (i % 50);
  const month = String((i % 12) + 1).padStart(2, "0");
  const day = String((i % 27) + 1).padStart(2, "0");
  switch (i % 5) {
    case 0:
      return String(year);
    case 1:
      return `${year}-${month}`;
    case 2:
      return `${year}-${month}-${day}`;
    case 3:
      return "unknown";
    default:
      return "";
  }
}

function paperRows(blankRef117) {
  const lines = ["Source ref,Name,Section,Plot,Burial date,Page"];
  for (let i = 0; i < 200; i += 1) {
    const n = i + 1;
    const ref = `R${String(n).padStart(3, "0")}`;
    const placed = n <= 198;
    const plot = placed ? `C${String(n).padStart(3, "0")}` : "";
    const section = placed ? "Paper" : "";
    const page = `P${Math.floor(i / 10) + 1}`;
    const shownRef = blankRef117 && n === 117 ? "" : ref;
    lines.push([shownRef, nameFor(i), section, plot, dateFor(i), page].join(","));
  }
  return `${lines.join("\n")}\n`;
}

writeText("paper-200.csv", paperRows(false));
writeText("paper-200-bad.csv", paperRows(true));

// ---- Quotes, commas, a newline in quotes, accents and leading zeros -------------

const quoteLines = [
  "Source ref,Name,Plot,Notes",
  'R001,"Quillmoss, Mirel",001,"Said ""hello"" at the gate"',
  'R002,Zoë Ångström,Y07,"Line one\nLine two"',
  "R003,,,",
];
// One byte order mark at the start, so the reader's byte order mark path is tested.
writeFileSync(join(out, "comma-quotes.csv"), Buffer.from(`\uFEFF${quoteLines.join("\n")}\n`, "utf8"));

// ---- A tiny page photo, 8 by 6, with metadata chunks the app must not keep -------

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function tinyPng() {
  const width = 8;
  const height = 6;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = [0]; // filter type none
    for (let x = 0; x < width; x += 1) row.push(40 + x * 25, 60 + y * 30, 150);
    rows.push(Buffer.from(row));
  }
  const text = (key, value) => chunk("tEXt", Buffer.from(`${key}\0${value}`, "latin1"));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    text("Software", "Invented Camera 1.0"),
    text("Comment", "Private page note"),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(join(out, "tiny-page.png"), tinyPng());
console.log("fixtures written to tests/fixtures");
