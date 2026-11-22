// Photos: header guards, orientation, normalise, metadata scan and strip, captions. No React.
// A file is decided by its bytes, never by its name or its declared type.
import { LIMITS, checkLimit, checkText } from "../limits";
import { err, ok } from "../types";
import type { DomainError, Result, Uuid } from "../types";
import type { Caption, ImageType } from "../notes";

export interface ImageInfo {
  imageType: ImageType;
  width: number;
  height: number;
  /** EXIF orientation 1 to 8. */
  orientation: number;
}

export interface DecodedImage {
  /** Already turned to the way up, so these are the displayed sizes. */
  width: number;
  height: number;
  data: unknown;
}

export interface ImageCodec {
  decode(bytes: Uint8Array, imageType: ImageType, orientation: number): Promise<DecodedImage>;
  encode(image: DecodedImage, imageType: ImageType, width: number, height: number): Promise<Uint8Array>;
}

export interface NormalizedImage {
  imageType: ImageType;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export interface StoredImage extends NormalizedImage {
  blobId: Uuid;
  caption: Caption;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const text = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));
const be16 = (b: Uint8Array, at: number): number => ((b[at] as number) << 8) | (b[at + 1] as number);
const be32 = (b: Uint8Array, at: number): number => (be16(b, at) * 65536 + be16(b, at + 2)) >>> 0;
const le16 = (b: Uint8Array, at: number): number => (b[at] as number) | ((b[at + 1] as number) << 8);
const le24 = (b: Uint8Array, at: number): number => le16(b, at) | ((b[at + 2] as number) << 16);
const le32 = (b: Uint8Array, at: number): number => (le16(b, at) | (le16(b, at + 2) << 16)) >>> 0;

function typeOf(bytes: Uint8Array): ImageType | undefined {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 12) === "WEBP") return "webp";
  return undefined;
}

/** The orientation tag (1 to 8) in a TIFF block, or 1. */
function tiffOrientation(tiff: Uint8Array): number {
  if (tiff.length < 8) return 1;
  const order = text(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return 1;
  const little = order === "II";
  const u16 = (at: number) => (little ? le16(tiff, at) : be16(tiff, at));
  const u32 = (at: number) => (little ? le32(tiff, at) : be32(tiff, at));
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > tiff.length) return 1;
    if (u16(at) === 0x0112) {
      const value = u16(at + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

interface Header {
  width: number;
  height: number;
  orientation: number;
}

function jpegHeader(bytes: Uint8Array): Header | undefined {
  let at = 2;
  let size: { width: number; height: number } | undefined;
  let orientation = 1;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] as number;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const length = be16(bytes, at + 2);
    if (length < 2) return undefined;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (at + 9 > bytes.length) return undefined;
      size = { height: be16(bytes, at + 5), width: be16(bytes, at + 7) };
    } else if (marker === 0xe1 && text(bytes, at + 4, at + 10) === "Exif\0\0") {
      orientation = tiffOrientation(bytes.subarray(at + 10, at + 2 + length));
    }
    if (marker === 0xda) break;
    at += 2 + length;
  }
  return size === undefined ? undefined : { ...size, orientation };
}

function pngHeader(bytes: Uint8Array): Header | undefined {
  if (bytes.length < 24 || text(bytes, 12, 16) !== "IHDR") return undefined;
  return { width: be32(bytes, 16), height: be32(bytes, 20), orientation: 1 };
}

function webpHeader(bytes: Uint8Array): Header | undefined {
  if (bytes.length < 20) return undefined;
  const fourcc = text(bytes, 12, 16);
  let width: number;
  let height: number;
  if (fourcc === "VP8 ") {
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined;
    width = le16(bytes, 26) & 0x3fff;
    height = le16(bytes, 28) & 0x3fff;
  } else if (fourcc === "VP8L") {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return undefined;
    const bits = le32(bytes, 21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (fourcc === "VP8X") {
    if (bytes.length < 30) return undefined;
    width = le24(bytes, 24) + 1;
    height = le24(bytes, 27) + 1;
  } else {
    return undefined;
  }
  let orientation = 1;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size = le32(bytes, at + 4);
    if (text(bytes, at, at + 4) === "EXIF") {
      const payload = bytes.subarray(at + 8, at + 8 + size);
      orientation = tiffOrientation(text(payload, 0, 6) === "Exif\0\0" ? payload.subarray(6) : payload);
      break;
    }
    at += 8 + size + (size % 2);
  }
  return { width, height, orientation };
}

/** Read the type, size and orientation from the header. Nothing is decoded. */
export function inspectImage(bytes: Uint8Array): Result<ImageInfo> {
  if (bytes.length > LIMITS.photoBytes) {
    return err("over_limit", { item: "photoBytes", limit: LIMITS.photoBytes, value: bytes.length });
  }
  const imageType = typeOf(bytes);
  if (imageType === undefined) return err("unsupported_type");
  const header = imageType === "png" ? pngHeader(bytes) : imageType === "jpeg" ? jpegHeader(bytes) : webpHeader(bytes);
  if (header === undefined || header.width < 1 || header.height < 1) return err("unreadable");
  const pixels = header.width * header.height;
  if (pixels > LIMITS.photoMegapixels * 1_000_000) {
    return err("over_limit", { item: "photoMegapixels", limit: LIMITS.photoMegapixels, value: Math.ceil(pixels / 1_000_000) });
  }
  return ok({ imageType, ...header });
}

/** The size with the longest edge at most `max`, kept in proportion. */
export function fitLongEdge(width: number, height: number, max: number = LIMITS.photoStoredLongEdge): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const PNG_METADATA = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME", "iCCP"]);
const WEBP_METADATA = new Set(["EXIF", "XMP ", "ICCP"]);
/** JPEG markers that hold metadata: APP1 to APP15 and a comment. APP0 is the JFIF header and stays. */
const isJpegMetadata = (marker: number): boolean => (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

interface Segment {
  at: number;
  end: number;
  name: string;
  metadata: boolean;
}

/** The segments of a JPEG before its scan, and where the scan starts. */
function jpegSegments(bytes: Uint8Array): { segments: Segment[]; scanAt: number } {
  const segments: Segment[] = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] as number;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += marker === 0xff ? 1 : 2;
      continue;
    }
    const end = Math.min(bytes.length, at + 2 + be16(bytes, at + 2));
    const name = marker === 0xfe ? "COM" : marker >= 0xe0 && marker <= 0xef ? `APP${marker - 0xe0}` : `M${marker}`;
    segments.push({ at, end, name, metadata: isJpegMetadata(marker) });
    at = end;
  }
  return { segments, scanAt: at };
}

function pngChunks(bytes: Uint8Array): { at: number; end: number; name: string }[] {
  const chunks: { at: number; end: number; name: string }[] = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const end = Math.min(bytes.length, at + 12 + be32(bytes, at));
    chunks.push({ at, end, name: text(bytes, at + 4, at + 8) });
    at = end;
  }
  return chunks;
}

function webpChunks(bytes: Uint8Array): { at: number; end: number; name: string }[] {
  const chunks: { at: number; end: number; name: string }[] = [];
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size = le32(bytes, at + 4);
    const end = Math.min(bytes.length, at + 8 + size + (size % 2));
    chunks.push({ at, end, name: text(bytes, at, at + 4) });
    at = end;
  }
  return chunks;
}

/** The names of the metadata markers found: JPEG APP segments and COM, PNG and WebP chunks. */
export function findMetadata(bytes: Uint8Array): string[] {
  switch (typeOf(bytes)) {
    case "jpeg":
      return jpegSegments(bytes).segments.filter((s) => s.metadata).map((s) => s.name);
    case "png":
      return pngChunks(bytes).filter((c) => PNG_METADATA.has(c.name)).map((c) => c.name);
    case "webp":
      return webpChunks(bytes).filter((c) => WEBP_METADATA.has(c.name)).map((c) => c.name);
    default:
      return [];
  }
}

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The same image without any metadata marker. Lossless: no pixel is decoded. */
export function stripMetadata(bytes: Uint8Array): Uint8Array {
  switch (typeOf(bytes)) {
    case "jpeg": {
      const { segments, scanAt } = jpegSegments(bytes);
      if (!segments.some((s) => s.metadata)) return bytes;
      const parts = [bytes.subarray(0, 2), ...segments.filter((s) => !s.metadata).map((s) => bytes.subarray(s.at, s.end)), bytes.subarray(scanAt)];
      return join(parts);
    }
    case "png": {
      const chunks = pngChunks(bytes);
      if (!chunks.some((c) => PNG_METADATA.has(c.name))) return bytes;
      return join([bytes.subarray(0, 8), ...chunks.filter((c) => !PNG_METADATA.has(c.name)).map((c) => bytes.subarray(c.at, c.end))]);
    }
    case "webp": {
      const chunks = webpChunks(bytes);
      if (!chunks.some((c) => WEBP_METADATA.has(c.name))) return bytes;
      const kept = chunks
        .filter((c) => !WEBP_METADATA.has(c.name))
        .map((c) => {
          const part = bytes.slice(c.at, c.end);
          // The flags of an extended file say which metadata chunks follow. Clear them.
          if (c.name === "VP8X") part[8] = (part[8] as number) & ~(0x20 | 0x08 | 0x04);
          return part;
        });
      const body = join(kept);
      const header = new Uint8Array(12);
      header.set(bytes.subarray(0, 4), 0);
      new DataView(header.buffer).setUint32(4, body.length + 4, true);
      header.set(bytes.subarray(8, 12), 8);
      return join([header, body]);
    }
    default:
      return bytes;
  }
}

/** Decode, turn, shrink and re encode one image, with no metadata. */
export async function normalizeImage(bytes: Uint8Array, codec: ImageCodec): Promise<Result<NormalizedImage>> {
  const info = inspectImage(bytes);
  if (!info.ok) return info;
  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(bytes, info.value.imageType, info.value.orientation);
  } catch {
    return err("unreadable");
  }
  const target = fitLongEdge(decoded.width, decoded.height);
  let encoded: Uint8Array;
  try {
    encoded = await codec.encode(decoded, info.value.imageType, target.width, target.height);
  } catch {
    return err("unreadable");
  }
  // A codec may leave a marker in. Never store bytes that hold one.
  const clean = findMetadata(encoded).length > 0 ? stripMetadata(encoded) : encoded;
  // Take the type and size from what was really written.
  const written = inspectImage(clean);
  if (!written.ok) return err("unreadable");
  return ok({ imageType: written.value.imageType, width: written.value.width, height: written.value.height, bytes: clean });
}

/** One image at a time, in order. A failure on one does not stop the others. */
export async function normalizeAll(files: readonly Uint8Array[], codec: ImageCodec): Promise<Result<NormalizedImage>[]> {
  const results: Result<NormalizedImage>[] = [];
  for (const file of files) results.push(await normalizeImage(file, codec));
  return results;
}

export function checkCaption(caption: Caption): Result<Caption> {
  if ("pending" in caption && caption.pending === true) return ok({ pending: true });
  const value = (caption as { text?: unknown }).text;
  if (typeof value !== "string" || value.trim() === "") return err("required", { field: "caption" });
  const length = checkText("noteChars", value);
  if (!length.ok) return length;
  return ok({ text: value });
}

/** Add a photo to a record. A ninth is refused. */
export function attachPhoto(list: readonly StoredImage[], photo: StoredImage): Result<StoredImage[]> {
  const limit = checkLimit("photosPerRecord", list.length + 1);
  if (!limit.ok) return limit;
  return ok([...list, photo]);
}

/** Replace a photo. If the new one fails, the old one is returned untouched. */
export async function replacePhoto(
  old: StoredImage,
  newBytes: Uint8Array,
  newBlobId: Uuid,
  codec: ImageCodec,
): Promise<{ photo: StoredImage; replaced: boolean; error?: DomainError }> {
  const normalized = await normalizeImage(newBytes, codec);
  if (!normalized.ok) return { photo: old, replaced: false, error: normalized.error };
  return { photo: { ...normalized.value, blobId: newBlobId, caption: old.caption }, replaced: true };
}

const MIME: Record<ImageType, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** The browser's own codec: `createImageBitmap` and a canvas. The browser turns the image the way up. */
export const browserCodec: ImageCodec = {
  async decode(bytes, imageType) {
    const blob = new Blob([bytes as BlobPart], { type: MIME[imageType] });
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, data: bitmap };
  },
  async encode(image, imageType, width, height) {
    const bitmap = image.data as ImageBitmap;
    try {
      let blob: Blob | null;
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
        blob = await canvas.convertToBlob({ type: MIME[imageType], quality: 0.9 });
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, MIME[imageType], 0.9));
      }
      if (blob === null) throw new Error("The canvas gave no image");
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      bitmap.close();
    }
  },
};
