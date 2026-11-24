// Whether an address holds a word. Test helper, with no browser in it, so a unit test can run it. The template never imports it.

/** One percent decoding. An address that is not valid percent coding is left as it stands. */
function decodeOnce(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The address as a person would read it: percent codes undone, in lower case. */
export function readableAddress(address: string): string {
  return decodeOnce(address).toLowerCase();
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A register ID or a plot ID: a random UUID, which is hex digits and dashes. */
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * Every reading of the address that a leak could hide in: as it stands, percent codes undone once and twice, and with
 * a plus sign as a space. In each, every ID is taken out and a space put in its place, so that taking an ID out never
 * joins the letters on each side of it into a word.
 */
function readings(address: string): string[] {
  const once = decodeOnce(address);
  const twice = decodeOnce(once);
  return [address, once, twice, once.replace(/\+/g, " "), twice.replace(/\+/g, " ")].map((text) => text.toLowerCase().replace(ID, " "));
}

/**
 * True when the address holds the word anywhere, in any letter case and any encoding, joined to other letters or digits
 * or not ("MirelQuillmoss" and "quillmoss2026" hold "Quillmoss"). The app writes no code or name into an address, so the
 * only text that is allowed to look like a word is an ID. A register ID and a plot ID are random hex, so "B03" inside
 * "b038b20c-..." is the ID and not a leak. Each ID is taken out before the search, and the rest is searched whole.
 */
export function addressHoldsWord(address: string, word: string): boolean {
  const needle = new RegExp(escaped(word.toLowerCase()));
  return readings(address).some((text) => needle.test(text));
}
