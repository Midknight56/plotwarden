// The check that a search text never reaches an address (R22.2) looks for the text as a whole value. A register ID is
// random hex digits, so a plot code such as B03 can sit inside it ("b038b20") without being a leak. The text of a real
// leak stands alone: it is a whole segment, a whole parameter value or a whole word.
import { describe, expect, it } from "vitest";
import { addressHoldsWord } from "../helpers/addressWords";

const SITE = "http://127.0.0.1:4178/#/r/b038b20c-1d4e-4f5a-8b6c-7d8e9f0a1b2c";

describe("addressHoldsWord", () => {
  it("does not find a code inside a register ID that happens to hold its letters", () => {
    expect(addressHoldsWord(SITE, "B03")).toBe(false);
    expect(addressHoldsWord(`${SITE}/map`, "B03")).toBe(false);
    expect(addressHoldsWord(`${SITE}?plot=0f1e2d3c-b03a-4b5c-9d8e-7f6a5b4c3d2e`, "B03")).toBe(false);
    expect(addressHoldsWord("http://127.0.0.1:4176/#/r/ada1e0f2-3b4c-4d5e-8f60-718293a4b5c6", "Ada")).toBe(false);
  });

  it("finds the text as a parameter value, a segment or a word, in any letter case and any encoding", () => {
    expect(addressHoldsWord(`${SITE}?q=B03`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}?q=b03&x=1`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}/B03`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}/b03/map`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}?plot=B03`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}?search=Mirel%20Quillmoss`, "Quillmoss")).toBe(true);
    expect(addressHoldsWord(`${SITE}?search=Mirel+Quillmoss`, "Quillmoss")).toBe(true);
    expect(addressHoldsWord(`${SITE}#B03`, "B03")).toBe(true);
  });

  it("finds a name that stands alone in a longer value", () => {
    expect(addressHoldsWord(`${SITE}?note=see-B03-today`, "B03")).toBe(true);
  });

  // The app writes no code or name into an address once the register and plot IDs are taken out, so a word that is
  // joined to other letters or digits is a leak too.
  it("finds a word that is joined to other letters or digits, once the IDs are taken out", () => {
    expect(addressHoldsWord(`${SITE}?note=B039`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}?note=xB03`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}?q=MirelQuillmoss`, "Quillmoss")).toBe(true);
    expect(addressHoldsWord(`${SITE}?q=MirelQuillmoss`, "Mirel")).toBe(true);
    expect(addressHoldsWord(`${SITE}?ref=quillmoss2026`, "Quillmoss")).toBe(true);
    expect(addressHoldsWord(`${SITE}?ref=Quillmoss2026`, "quillmoss")).toBe(true);
    expect(addressHoldsWord(`${SITE}/Mirel%20Quillmoss`, "Mirel Quillmoss")).toBe(true);
    expect(addressHoldsWord(`${SITE}?q=Mirel%2520Quillmoss`, "Mirel Quillmoss")).toBe(true);
  });

  it("takes every register and plot ID out first, so a word is not found inside an ID and not made by taking one out", () => {
    const plot = "0f1e2d3c-b03a-4b5c-9d8e-7f6a5b4c3d2e";
    expect(addressHoldsWord(`${SITE}/plot/${plot}`, "B03")).toBe(false);
    expect(addressHoldsWord(`${SITE}/plot/${plot}`, "b03a")).toBe(false);
    // Taking an ID out must not join the letters on each side of it into a word.
    expect(addressHoldsWord(`http://127.0.0.1:4178/#/r/Quil${plot}lmoss`, "Quillmoss")).toBe(false);
    expect(addressHoldsWord(`http://127.0.0.1:4178/#/r/${plot}/Quillmoss`, "Quillmoss")).toBe(true);
  });

  it("reads an address that is not valid percent coding as it stands", () => {
    expect(addressHoldsWord(`${SITE}?q=100%B03`, "B03")).toBe(true);
    expect(addressHoldsWord(`${SITE}?q=100%`, "B03")).toBe(false);
  });
});
