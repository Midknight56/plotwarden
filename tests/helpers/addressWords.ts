// Whether an address holds a word. Test helper, with no browser in it, so a unit test can run it. The template never imports it.

/** The address as a person would read it: percent codes undone, in lower case. */
export function readableAddress(address: string): string {
  try {
    return decodeURIComponent(address).toLowerCase();
  } catch {
    return address.toLowerCase();
  }
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when the address holds the word as a whole value: not joined to a letter or a digit on either side. A register
 * ID is random hex, so "B03" inside "b038b20c" is the ID and not a leak, while "?q=B03", "/B03" and "see-B03-today" are.
 */
export function addressHoldsWord(address: string, word: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escaped(word.toLowerCase())}(?![a-z0-9])`).test(readableAddress(address));
}
