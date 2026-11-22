// Writes the invented fixtures for spec 02. Run with `npm run fixtures`.
// Everything here is made up for this project. No real person, grave or page.
// Output is UTF-8 with LF line ends, except the one file that tests a byte order mark.
//
//   node scripts/generate-fixtures.mjs                        write every fixture into tests/fixtures
//   node scripts/generate-fixtures.mjs --practice-book <dir>  write only practice-book.csv into <dir>
//
// The practice book is the bad paper book (R117 without its source ref). It is written from the same source as
// tests/fixtures/paper-200-bad.csv, so the two are the same bytes. `npm run church:build` writes it into the
// churchyard build, where the Import screen links to it.
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { finish, parseArgs } from "./lib/files.mjs";
import { paperBookCsv } from "./lib/paperBook.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- Quotes, commas, a newline in quotes, accents and leading zeros -------------

const quoteLines = [
  "Source ref,Name,Plot,Notes",
  'R001,"Quillmoss, Mirel",001,"Said ""hello"" at the gate"',
  'R002,Zoë Ångström,Y07,"Line one\nLine two"',
  "R003,,,",
];

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

finish(() => {
  const args = parseArgs(process.argv.slice(2), { "practice-book": "value" });

  if (args["practice-book"] !== undefined) {
    const folder = resolve(args["practice-book"]);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "practice-book.csv"), paperBookCsv(true), { encoding: "utf8" });
    console.log(`practice book written to ${folder}`);
    return 0;
  }

  const out = join(root, "tests", "fixtures");
  mkdirSync(out, { recursive: true });
  const writeText = (name, text) => writeFileSync(join(out, name), text, { encoding: "utf8" });

  writeText("paper-200.csv", paperBookCsv(false));
  writeText("paper-200-bad.csv", paperBookCsv(true));
  // One byte order mark at the start, so the reader's byte order mark path is tested.
  writeFileSync(join(out, "comma-quotes.csv"), Buffer.from(`\uFEFF${quoteLines.join("\n")}\n`, "utf8"));
  writeFileSync(join(out, "tiny-page.png"), tinyPng());
  console.log("fixtures written to tests/fixtures");
  return 0;
});
