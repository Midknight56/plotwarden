// Builders for image files, made from their headers, so the tests need no photo.
// The bytes are valid down to the header and the chunk structure, not decodable pictures.
// Test helper. The template never imports it.
import { crc32 } from "node:zlib";

const u8 = (...n: number[]) => Uint8Array.from(n);

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function be16(n: number): Uint8Array {
  return u8((n >> 8) & 255, n & 255);
}
function be32(n: number): Uint8Array {
  return u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}
function le16(n: number): Uint8Array {
  return u8(n & 255, (n >> 8) & 255);
}
function le24(n: number): Uint8Array {
  return u8(n & 255, (n >> 8) & 255, (n >> 16) & 255);
}
function le32(n: number): Uint8Array {
  return u8(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
}
const ascii = (s: string) => new TextEncoder().encode(s);

// ---- PNG ----------------------------------------------------------------------

export const PNG_SIGNATURE = u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type);
  const crc = crc32(concat(typeBytes, data)) >>> 0;
  return concat(be32(data.length), typeBytes, data, be32(crc));
}

export interface PngOptions {
  width: number;
  height: number;
  /** Extra chunks placed after IHDR, for example text or time chunks. */
  extra?: [type: string, data: Uint8Array][];
  /** Pad the file with zero bytes after IEND to reach this length. */
  padTo?: number;
}

export function makePng(options: PngOptions): Uint8Array {
  const ihdr = concat(be32(options.width), be32(options.height), u8(8, 2, 0, 0, 0));
  const parts = [PNG_SIGNATURE, pngChunk("IHDR", ihdr)];
  for (const [type, data] of options.extra ?? []) parts.push(pngChunk(type, data));
  parts.push(pngChunk("IDAT", u8(0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01)), pngChunk("IEND", new Uint8Array(0)));
  const file = concat(...parts);
  if (options.padTo !== undefined && options.padTo > file.length) return concat(file, new Uint8Array(options.padTo - file.length));
  return file;
}

// ---- JPEG ---------------------------------------------------------------------

/** The EXIF segment payload that holds one orientation tag. */
export function exifOrientation(orientation: number, order: "II" | "MM" = "II"): Uint8Array {
  const little = order === "II";
  const w16 = little ? le16 : be16;
  const w32 = little ? le32 : be32;
  const tiff = concat(ascii(order), w16(42), w32(8), w16(1), w16(0x0112), w16(3), w32(1), w16(orientation), w16(0), w32(0));
  return concat(ascii("Exif\0\0"), tiff);
}

export interface JpegOptions {
  width: number;
  height: number;
  /** Segments placed before the frame header: a marker byte and a payload. */
  segments?: [marker: number, payload: Uint8Array][];
  /** The bytes of the scan, which the strip must keep whole. */
  scan?: Uint8Array;
  padTo?: number;
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  return concat(u8(0xff, marker), be16(payload.length + 2), payload);
}

export function makeJpeg(options: JpegOptions): Uint8Array {
  const sof = jpegSegment(0xc0, concat(u8(8), be16(options.height), be16(options.width), u8(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1)));
  const sos = jpegSegment(0xda, u8(3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0));
  const parts: Uint8Array[] = [u8(0xff, 0xd8)];
  for (const [marker, payload] of options.segments ?? []) parts.push(jpegSegment(marker, payload));
  parts.push(sof, sos, options.scan ?? ascii("SCANDATA"), u8(0xff, 0xd9));
  const file = concat(...parts);
  if (options.padTo !== undefined && options.padTo > file.length) return concat(file, new Uint8Array(options.padTo - file.length));
  return file;
}

// ---- WebP ---------------------------------------------------------------------

function webpChunk(fourcc: string, payload: Uint8Array): Uint8Array {
  const pad = payload.length % 2 === 1 ? u8(0) : new Uint8Array(0);
  return concat(ascii(fourcc), le32(payload.length), payload, pad);
}

export interface WebpOptions {
  width: number;
  height: number;
  variant: "lossy" | "lossless" | "extended";
  /** Extra chunks of an extended file, for example EXIF and XMP. */
  extra?: [fourcc: string, payload: Uint8Array][];
}

export function makeWebp(options: WebpOptions): Uint8Array {
  const { width, height } = options;
  const lossy = webpChunk("VP8 ", concat(u8(0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a), le16(width), le16(height)));
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;
  const lossless = webpChunk("VP8L", concat(u8(0x2f), le32(bits)));
  let body: Uint8Array;
  if (options.variant === "lossy") body = lossy;
  else if (options.variant === "lossless") body = lossless;
  else {
    let flags = 0;
    for (const [fourcc] of options.extra ?? []) {
      if (fourcc === "EXIF") flags |= 0x08;
      if (fourcc === "XMP ") flags |= 0x04;
      if (fourcc === "ICCP") flags |= 0x20;
    }
    const header = webpChunk("VP8X", concat(u8(flags, 0, 0, 0), le24(width - 1), le24(height - 1)));
    const iccp = (options.extra ?? []).filter(([f]) => f === "ICCP").map(([f, p]) => webpChunk(f, p));
    const rest = (options.extra ?? []).filter(([f]) => f !== "ICCP").map(([f, p]) => webpChunk(f, p));
    body = concat(header, ...iccp, lossless, ...rest);
  }
  return concat(ascii("RIFF"), le32(body.length + 4), ascii("WEBP"), body);
}

// ---- Reading the structure back, for assertions -------------------------------

/** The chunk types of a PNG, in order. */
export function pngChunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let at = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    types.push(new TextDecoder().decode(bytes.subarray(at + 4, at + 8)));
    at += 12 + length;
  }
  return types;
}

/** The marker bytes of a JPEG, up to the scan, in order. */
export function jpegMarkers(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1] as number;
    markers.push(marker);
    if (marker === 0xda) break;
    at += 2 + (((bytes[at + 2] as number) << 8) | (bytes[at + 3] as number));
  }
  return markers;
}

/** The chunk FourCCs of a WebP, in order. */
export function webpChunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let at = 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    types.push(new TextDecoder().decode(bytes.subarray(at, at + 4)));
    at += 8 + size + (size % 2);
  }
  return types;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export { ascii, concat };

// ---- Backup archives, made by hand so a test can break one thing at a time -----

import { Zip, ZipPassThrough, zipSync } from "fflate";
import { canonicalJson, revisionOf } from "../../template/src/events";
import type { StoredEvent } from "../../template/src/events";
import type { Site } from "../../template/src/types";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ForgeBase {
  site: Site;
  events: readonly StoredEvent[];
  blobs: readonly { id: string; type: string; bytes: Uint8Array }[];
}

export interface ForgePatch {
  /** Change the manifest after the entries were listed. */
  manifest?: (m: Record<string, unknown>) => Record<string, unknown>;
  /** Replace the content of site.json before it is hashed. */
  site?: (s: Record<string, unknown>) => unknown;
  /** Replace the content of events.json before it is hashed. */
  events?: (e: unknown[]) => unknown;
  /** Files that are hashed and listed, for example an extra image. */
  extraFiles?: Record<string, Uint8Array>;
  /** Files taken out of the archive after they were listed. */
  dropFiles?: string[];
  /** Files put in the archive but not listed. */
  unlisted?: Record<string, Uint8Array>;
  /** Change a file's bytes after it was hashed. */
  tamper?: Record<string, (b: Uint8Array) => Uint8Array>;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const text = (s: string) => new TextEncoder().encode(s);

/** A backup archive built from parts, with one thing changed. Not the code under test. */
export async function forgeBackup(base: ForgeBase, patch: ForgePatch = {}): Promise<Uint8Array> {
  const { lastSeq: _lastSeq, ...siteRow } = base.site as Site & { lastSeq?: number };
  const siteJson = patch.site === undefined ? siteRow : patch.site(siteRow as Record<string, unknown>);
  const eventsJson = patch.events === undefined ? [...base.events] : patch.events([...base.events]);

  const files: Record<string, Uint8Array> = {
    "site.json": text(canonicalJson(siteJson)),
    "events.json": text(canonicalJson(eventsJson)),
  };
  for (const blob of base.blobs) files[`images/${blob.id}.${EXT[blob.type] ?? "png"}`] = blob.bytes;
  Object.assign(files, patch.extraFiles ?? {});

  const entries = [];
  for (const [path, bytes] of Object.entries(files)) {
    entries.push({ path, byteLength: bytes.length, sha256: await sha256Hex(bytes) });
  }
  let manifest: Record<string, unknown> = {
    format: "plot.backup.v1",
    schemaVersion: 1,
    siteKind: base.site.kind,
    siteId: base.site.id,
    lineageId: base.site.lineageId,
    revision: revisionOf(base.events),
    createdAt: "2026-04-20T09:30:00+00:00",
    entries,
    counts: { events: base.events.length, images: base.blobs.length + Object.keys(patch.extraFiles ?? {}).length },
  };
  if (patch.manifest !== undefined) manifest = patch.manifest(manifest);

  for (const name of patch.dropFiles ?? []) delete files[name];
  Object.assign(files, patch.unlisted ?? {});
  for (const [name, change] of Object.entries(patch.tamper ?? {})) {
    const bytes = files[name];
    if (bytes !== undefined) files[name] = change(bytes);
  }
  const archive: Record<string, [Uint8Array, { level: 0 }]> = { "manifest.json": [text(canonicalJson(manifest)), { level: 0 }] };
  for (const [name, bytes] of Object.entries(files)) archive[name] = [bytes, { level: 0 }];
  return zipSync(archive, { mtime: new Date(2020, 0, 1) });
}

/** A zip that may repeat a name, which an object cannot. */
export function zipWithNames(entries: [string, Uint8Array][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error !== null) throw error;
    chunks.push(chunk);
  });
  for (const [name, bytes] of entries) {
    const file = new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
  }
  zip.end();
  return concat(...chunks);
}

export { zipSync };
