// The 200 record paper book. One source for the test fixtures (`tests/fixtures/paper-200*.csv`) and for the
// practice book in the churchyard build. Everything here is made up for this project. No real person, grave or page.
//
// References R001 to R200. R001 to R198 sit at C001 to C198 in section Paper. R199 and R200 have no location.
// The practice book leaves the source ref of R117 blank.

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

/** The CSV text of the book, LF line ends and a final newline. With `blankRef117` the source ref of row 117 is blank. */
export function paperBookCsv(blankRef117) {
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
