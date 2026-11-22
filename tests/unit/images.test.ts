// T11 (photo guards, orientation, metadata removed, captions, failed replacement) and the photo bounds of T32.
// Requirements P12. Images are built from their headers by tests/helpers/paperFiles.ts.
import { describe, expect, it } from "vitest";
import {
  attachPhoto,
  checkCaption,
  findMetadata,
  fitLongEdge,
  inspectImage,
  normalizeAll,
  normalizeImage,
  replacePhoto,
  stripMetadata,
} from "../../template/src/data/images";
import type { DecodedImage, ImageCodec, StoredImage } from "../../template/src/data/images";
import { LIMITS } from "../../template/src/limits";
import type { ImageType } from "../../template/src/notes";
import {
  ascii,
  bytesEqual,
  exifOrientation,
  jpegMarkers,
  makeJpeg,
  makePng,
  makeWebp,
  pngChunkTypes,
  webpChunkTypes,
} from "../helpers/paperFiles";

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : (r.error as { code: string }).code);

/** A codec that turns the image the way up, and counts how many calls run at once. */
class FakeCodec implements ImageCodec {
  decodes = 0;
  active = 0;
  maxActive = 0;
  failDecodeAt: number | undefined;
  withMetadata = false;
  outputType: ImageType | undefined;

  async decode(bytes: Uint8Array, imageType: ImageType, orientation: number): Promise<DecodedImage> {
    this.decodes += 1;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    if (this.failDecodeAt === this.decodes) {
      this.active -= 1;
      throw new Error("corrupt");
    }
    const info = inspectImage(bytes);
    if (!info.ok) throw new Error("bad");
    const turned = orientation >= 5;
    return {
      width: turned ? info.value.height : info.value.width,
      height: turned ? info.value.width : info.value.height,
      data: { imageType },
    };
  }

  async encode(_image: DecodedImage, imageType: ImageType, width: number, height: number): Promise<Uint8Array> {
    this.active -= 1;
    const type = this.outputType ?? imageType;
    const text: [string, Uint8Array][] = this.withMetadata ? [["tEXt", ascii("Make\0Invented Camera")], ["eXIf", ascii("Exif\0\0")]] : [];
    if (type === "png") return makePng({ width, height, extra: text });
    if (type === "webp") return makeWebp({ width, height, variant: "extended", extra: this.withMetadata ? [["EXIF", ascii("Exif\0\0")]] : [] });
    return makeJpeg({ width, height, segments: this.withMetadata ? [[0xe1, exifOrientation(6)], [0xfe, ascii("private note")]] : [] });
  }
}

describe("reading the header", () => {
  it("reads a PNG, a JPEG and a WebP of each kind by their signature", () => {
    expect(inspectImage(makePng({ width: 800, height: 600 }))).toEqual({
      ok: true,
      value: { imageType: "png", width: 800, height: 600, orientation: 1 },
    });
    expect(inspectImage(makeJpeg({ width: 1200, height: 900 }))).toEqual({
      ok: true,
      value: { imageType: "jpeg", width: 1200, height: 900, orientation: 1 },
    });
    for (const variant of ["lossy", "lossless", "extended"] as const) {
      expect(inspectImage(makeWebp({ width: 640, height: 480, variant }))).toEqual({
        ok: true,
        value: { imageType: "webp", width: 640, height: 480, orientation: 1 },
      });
    }
  });

  it("reads the orientation of a JPEG, little endian and big endian", () => {
    const little = makeJpeg({ width: 400, height: 300, segments: [[0xe1, exifOrientation(6, "II")]] });
    const big = makeJpeg({ width: 400, height: 300, segments: [[0xe1, exifOrientation(8, "MM")]] });
    expect(inspectImage(little)).toMatchObject({ ok: true, value: { orientation: 6, width: 400, height: 300 } });
    expect(inspectImage(big)).toMatchObject({ ok: true, value: { orientation: 8 } });
  });

  it("decides the type from the bytes and from nothing else", () => {
    const jpeg = makeJpeg({ width: 10, height: 10 });
    expect(inspectImage(jpeg)).toMatchObject({ ok: true, value: { imageType: "jpeg" } });
    for (const bad of [ascii("GIF89a\u0001\u0000\u0001\u0000"), ascii("BM\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"), ascii("<html>not a picture</html>"), new Uint8Array(0)]) {
      expect(code(inspectImage(bad))).toBe("unsupported_type");
    }
  });

  it("refuses a header that is cut short or has no size", () => {
    expect(code(inspectImage(makePng({ width: 800, height: 600 }).slice(0, 20)))).toBe("unreadable");
    expect(code(inspectImage(makePng({ width: 0, height: 600 })))).toBe("unreadable");
    expect(code(inspectImage(makeJpeg({ width: 100, height: 100 }).slice(0, 8)))).toBe("unreadable");
    expect(code(inspectImage(makeWebp({ width: 100, height: 100, variant: "lossy" }).slice(0, 20)))).toBe("unreadable");
  });
});

describe("guards before any decode", () => {
  it("accepts 12 MiB and refuses one byte more", () => {
    expect(inspectImage(makePng({ width: 100, height: 100, padTo: LIMITS.photoBytes })).ok).toBe(true);
    const over = inspectImage(makePng({ width: 100, height: 100, padTo: LIMITS.photoBytes + 1 }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detail).toMatchObject({ item: "photoBytes", limit: LIMITS.photoBytes });
  });

  it("accepts 24 megapixels and refuses one more row", () => {
    expect(inspectImage(makePng({ width: 6000, height: 4000 })).ok).toBe(true);
    const over = inspectImage(makePng({ width: 6000, height: 4001 }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detail).toMatchObject({ item: "photoMegapixels", limit: 24 });
  });

  it("refuses a huge image before the codec is asked to decode it", async () => {
    const codec = new FakeCodec();
    const r = await normalizeImage(makePng({ width: 100000, height: 100000 }), codec);
    expect(code(r)).toBe("over_limit");
    expect(codec.decodes).toBe(0);
    const big = await normalizeImage(makePng({ width: 10, height: 10, padTo: LIMITS.photoBytes + 1 }), codec);
    expect(code(big)).toBe("over_limit");
    expect(codec.decodes).toBe(0);
  });

  it("refuses a file that is not a picture before the codec is asked to decode it", async () => {
    const codec = new FakeCodec();
    expect(code(await normalizeImage(ascii("plain text"), codec))).toBe("unsupported_type");
    expect(codec.decodes).toBe(0);
  });
});

describe("size", () => {
  it.each([
    [4000, 3000, 2400, 1800],
    [3000, 4000, 1800, 2400],
    [2400, 100, 2400, 100],
    [2401, 2401, 2400, 2400],
    [1, 5000, 1, 2400],
    [800, 600, 800, 600],
  ])("fits %i by %i to %i by %i", (w, h, ew, eh) => {
    expect(fitLongEdge(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe("metadata", () => {
  const exifSegments: [number, Uint8Array][] = [
    [0xe0, ascii("JFIF\0\u0001\u0001\0\0\u0001\0\u0001\0\0")],
    [0xe1, exifOrientation(6)],
    [0xe2, ascii("ICC_PROFILE\0\u0001\u0001")],
    [0xed, ascii("Photoshop 3.0\0")],
    [0xfe, ascii("camera serial 42")],
  ];

  it("finds the markers in a JPEG, a PNG and a WebP", () => {
    expect(findMetadata(makeJpeg({ width: 100, height: 80, segments: exifSegments }))).toEqual(["APP1", "APP2", "APP13", "COM"]);
    const png = makePng({
      width: 100,
      height: 80,
      extra: [["tEXt", ascii("a\0b")], ["iTXt", ascii("a\0\0\0\0\0b")], ["zTXt", ascii("a\0\0")], ["eXIf", ascii("x")], ["tIME", new Uint8Array(7)], ["iCCP", ascii("p\0\0")]],
    });
    expect(findMetadata(png)).toEqual(["tEXt", "iTXt", "zTXt", "eXIf", "tIME", "iCCP"]);
    const webp = makeWebp({ width: 100, height: 80, variant: "extended", extra: [["EXIF", ascii("Exif\0\0")], ["XMP ", ascii("<x/>")]] });
    expect(findMetadata(webp)).toEqual(["EXIF", "XMP "]);
  });

  it("finds none in a clean file", () => {
    expect(findMetadata(makeJpeg({ width: 100, height: 80 }))).toEqual([]);
    expect(findMetadata(makePng({ width: 100, height: 80 }))).toEqual([]);
    expect(findMetadata(makeWebp({ width: 100, height: 80, variant: "lossy" }))).toEqual([]);
    expect(findMetadata(ascii("not an image"))).toEqual([]);
  });

  it("strips a JPEG and keeps the frame, the scan and the JFIF header", () => {
    const scan = ascii("SCAN-BYTES-KEPT-WHOLE");
    const jpeg = makeJpeg({ width: 640, height: 480, segments: exifSegments, scan });
    const stripped = stripMetadata(jpeg);
    expect(findMetadata(stripped)).toEqual([]);
    expect(jpegMarkers(stripped)).toEqual([0xe0, 0xc0, 0xda]);
    expect(inspectImage(stripped)).toMatchObject({ ok: true, value: { width: 640, height: 480, orientation: 1 } });
    expect(new TextDecoder().decode(stripped)).toContain("SCAN-BYTES-KEPT-WHOLE");
    expect([...stripped.slice(-2)]).toEqual([0xff, 0xd9]);
    expect(bytesEqual(stripMetadata(stripped), stripped)).toBe(true);
  });

  it("strips a PNG and keeps IHDR, IDAT and IEND intact", () => {
    const png = makePng({ width: 64, height: 32, extra: [["tEXt", ascii("a\0b")], ["tIME", new Uint8Array(7)]] });
    const stripped = stripMetadata(png);
    expect(pngChunkTypes(stripped)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(inspectImage(stripped)).toMatchObject({ ok: true, value: { width: 64, height: 32 } });
    expect(bytesEqual(stripped, makePng({ width: 64, height: 32 }))).toBe(true);
  });

  it("strips a WebP, fixes the RIFF size and clears the flags", () => {
    const webp = makeWebp({ width: 64, height: 32, variant: "extended", extra: [["EXIF", ascii("Exif\0\0")], ["XMP ", ascii("<x/>")]] });
    const stripped = stripMetadata(webp);
    expect(webpChunkTypes(stripped)).toEqual(["VP8X", "VP8L"]);
    const size = new DataView(stripped.buffer, stripped.byteOffset).getUint32(4, true);
    expect(size).toBe(stripped.length - 8);
    expect((stripped[20] as number) & (0x20 | 0x08 | 0x04)).toBe(0);
    expect(inspectImage(stripped)).toMatchObject({ ok: true, value: { width: 64, height: 32 } });
  });

  it("returns the same bytes when there is nothing to strip", () => {
    const clean = makePng({ width: 10, height: 10 });
    expect(stripMetadata(clean)).toBe(clean);
  });
});

describe("normalising", () => {
  it("turns an orientation 6 photo the way up and fits its longest edge to 2,400", async () => {
    const codec = new FakeCodec();
    // 4000 wide and 3000 high on disk, turned a quarter: 3000 wide and 4000 high on screen.
    const photo = makeJpeg({ width: 4000, height: 3000, segments: [[0xe1, exifOrientation(6)]] });
    const r = await normalizeImage(photo, codec);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value).toMatchObject({ imageType: "jpeg", width: 1800, height: 2400 });
    expect(inspectImage(r.value.bytes)).toMatchObject({ ok: true, value: { width: 1800, height: 2400, orientation: 1 } });
  });

  it("leaves a small photo at its size and keeps its type", async () => {
    const codec = new FakeCodec();
    for (const [bytes, type] of [
      [makePng({ width: 800, height: 600 }), "png"],
      [makeWebp({ width: 800, height: 600, variant: "lossless" }), "webp"],
      [makeJpeg({ width: 800, height: 600 }), "jpeg"],
    ] as const) {
      const r = await normalizeImage(bytes, codec);
      expect(r.ok && [r.value.imageType, r.value.width, r.value.height]).toEqual([type, 800, 600]);
    }
  });

  it("keeps no camera metadata, even if the codec leaves some in", async () => {
    const codec = new FakeCodec();
    codec.withMetadata = true;
    for (const bytes of [makeJpeg({ width: 500, height: 400 }), makePng({ width: 500, height: 400 }), makeWebp({ width: 500, height: 400, variant: "lossy" })]) {
      const r = await normalizeImage(bytes, codec);
      if (!r.ok) throw new Error("refused");
      expect(findMetadata(r.value.bytes)).toEqual([]);
    }
  });

  it("holds the type, size and bytes and no file name", async () => {
    const r = await normalizeImage(makePng({ width: 50, height: 40 }), new FakeCodec());
    if (!r.ok) throw new Error("refused");
    expect(Object.keys(r.value).sort()).toEqual(["bytes", "height", "imageType", "width"]);
  });

  it("takes the type the codec really wrote", async () => {
    const codec = new FakeCodec();
    codec.outputType = "png";
    const r = await normalizeImage(makeWebp({ width: 90, height: 60, variant: "lossy" }), codec);
    expect(r.ok && r.value.imageType).toBe("png");
  });

  it("refuses an image the codec cannot decode", async () => {
    const codec = new FakeCodec();
    codec.failDecodeAt = 1;
    expect(code(await normalizeImage(makePng({ width: 50, height: 40 }), codec))).toBe("unreadable");
  });

  it("decodes one image at a time, in order, and a failure does not stop the rest", async () => {
    const codec = new FakeCodec();
    codec.failDecodeAt = 2;
    const files = [1, 2, 3, 4].map((n) => makePng({ width: 100 * n, height: 50 }));
    const results = await normalizeAll(files, codec);
    expect(codec.maxActive).toBe(1);
    expect(results.map((r) => (r.ok ? r.value.width : r.error.code))).toEqual([100, "unreadable", 300, 400]);
  });
});

describe("captions", () => {
  it("takes a description or the choice Description pending, and nothing else", () => {
    expect(checkCaption({ text: "A stone in snow" })).toEqual({ ok: true, value: { text: "A stone in snow" } });
    expect(checkCaption({ pending: true })).toEqual({ ok: true, value: { pending: true } });
    expect(code(checkCaption({ text: "   " }))).toBe("required");
    expect(code(checkCaption({} as never))).toBe("required");
  });

  it("takes 4,000 characters and refuses 4,001", () => {
    expect(checkCaption({ text: "x".repeat(LIMITS.noteChars) }).ok).toBe(true);
    expect(code(checkCaption({ text: "x".repeat(LIMITS.noteChars + 1) }))).toBe("over_limit");
  });
});

describe("a record's photos", () => {
  const photo = (n: number): StoredImage => ({
    blobId: `blob-${n}`,
    imageType: "jpeg",
    width: 100,
    height: 80,
    bytes: makeJpeg({ width: 100, height: 80 }),
    caption: { text: `Stone ${n}` },
  });

  it("takes 8 and refuses a ninth", () => {
    let list: StoredImage[] = [];
    for (let i = 1; i <= 8; i += 1) {
      const r = attachPhoto(list, photo(i));
      if (!r.ok) throw new Error("refused");
      list = r.value;
    }
    const ninth = attachPhoto(list, photo(9));
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error.detail).toMatchObject({ item: "photosPerRecord", limit: 8, value: 9 });
    expect(list.length).toBe(8);
  });

  it("replaces a photo and keeps its caption", async () => {
    const old = photo(1);
    const r = await replacePhoto(old, makePng({ width: 300, height: 200 }), "blob-new", new FakeCodec());
    expect(r.replaced).toBe(true);
    expect(r.photo).toMatchObject({ blobId: "blob-new", imageType: "png", width: 300, height: 200, caption: { text: "Stone 1" } });
  });

  it("keeps the old photo when the new one fails", async () => {
    const old = photo(1);
    const codec = new FakeCodec();
    codec.failDecodeAt = 1;
    const broken = await replacePhoto(old, makePng({ width: 300, height: 200 }), "blob-new", codec);
    expect(broken.replaced).toBe(false);
    expect(broken.photo).toBe(old);
    expect(broken.error?.code).toBe("unreadable");
    const notAPicture = await replacePhoto(old, ascii("plain text"), "blob-new", new FakeCodec());
    expect(notAPicture.replaced).toBe(false);
    expect(notAPicture.photo).toBe(old);
    expect(notAPicture.error?.code).toBe("unsupported_type");
    const tooBig = await replacePhoto(old, makePng({ width: 7000, height: 7000 }), "blob-new", new FakeCodec());
    expect(tooBig.photo).toBe(old);
    expect(tooBig.error?.code).toBe("over_limit");
  });
});
