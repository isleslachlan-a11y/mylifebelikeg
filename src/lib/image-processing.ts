/**
 * Client-side only. Everything a photo goes through before it ever
 * reaches `<ImageUpload>`'s upload call: reject the wrong type or too
 * large a file, then decode/resize/re-encode to WebP via canvas.
 *
 * `sniffImageType` is deliberately pure (bytes in, a type out) so it's
 * unit-testable under this repo's node-only Vitest environment (see
 * CLAUDE.md) without a real File/Blob/canvas — everything downstream of
 * it (`validateImageFile`, `processImageForUpload`) needs real browser
 * APIs (File, createImageBitmap, canvas) and isn't unit-tested here, same
 * situation `<PlaceMap>`'s canvas-adjacent code and every other
 * browser-only piece of this app is already in.
 */

export type AcceptedImageType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic";

export class ImageValidationError extends Error {}
export class ImageProcessingError extends Error {}

export const MAX_ORIGINAL_FILE_BYTES = 15 * 1024 * 1024;
const HEADER_SNIFF_BYTES = 16;

/**
 * "Check the actual decoded type, not the file extension" (P8.1 brief) --
 * this inspects the file's own magic-number header, not `file.name` or
 * even `file.type` (a browser-reported MIME that on some platforms is
 * itself extension-derived, which is exactly the signal the brief says
 * not to trust). HEIC/HEIF is an ISOBMFF container: a `ftyp` box at byte
 * offset 4 followed by a 4-byte major brand at offset 8 -- this checks
 * against the brand strings iPhone's camera actually emits (`heic`,
 * `heix`, `hevc`, `hevx`, `heim`, `heis`, `hevm`, `hevs`) plus the two
 * generic MIAF brands (`mif1`, `msf1`) some HEIC encoders use instead of
 * a heic-specific one -- not every ISOBMFF brand that has ever existed
 * (this isn't a general-purpose container sniffer), just the ones a
 * phone's own camera roll produces.
 */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    return "image/png";
  }

  const isRiff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // "RIFF"
  const isWebp =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // "WEBP"
  if (isRiff && isWebp) {
    return "image/webp";
  }

  if (bytes.length >= 12) {
    const decoder = new TextDecoder("ascii");
    const boxType = decoder.decode(bytes.slice(4, 8));
    const brand = decoder.decode(bytes.slice(8, 12));
    const HEIC_BRANDS = new Set([
      "heic",
      "heix",
      "hevc",
      "hevx",
      "heim",
      "heis",
      "hevm",
      "hevs",
      "mif1",
      "msf1",
    ]);
    if (boxType === "ftyp" && HEIC_BRANDS.has(brand)) {
      return "image/heic";
    }
  }

  return null;
}

/**
 * Size is checked first, before any bytes are read -- "reject over 15MB
 * before processing" (brief, verbatim): a phone photo that's already too
 * large shouldn't cost a decode attempt at all.
 */
export async function validateImageFile(
  file: File,
): Promise<AcceptedImageType> {
  if (file.size > MAX_ORIGINAL_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new ImageValidationError(
      `That photo is ${mb}MB — the limit is 15MB.`,
    );
  }

  const head = new Uint8Array(
    await file.slice(0, HEADER_SNIFF_BYTES).arrayBuffer(),
  );
  const type = sniffImageType(head);
  if (!type) {
    throw new ImageValidationError(
      "That doesn't look like a JPEG, PNG, WebP or HEIC photo.",
    );
  }
  return type;
}

export type ProcessedImage = { full: Blob; thumb: Blob };

const FULL_MAX_EDGE = 2000;
const THUMB_MAX_EDGE = 400;
const WEBP_QUALITY = 0.8;

/**
 * Decode once, draw twice at two different target sizes. Re-encoding
 * through a canvas is what actually drops EXIF (brief, verbatim: "which
 * is the point") -- a canvas has no metadata channel, so a GPS
 * coordinate or timestamp embedded in the source file has nothing to
 * survive onto; both the OffscreenCanvas and fallback <canvas> paths
 * below only ever emit a fresh raw bitmap, so this holds regardless of
 * which one actually runs. Verified against a real uploaded object
 * (P8.1's own acceptance criterion), not just assumed from how canvas
 * works in principle -- see the P8.1 verification notes.
 *
 * `imageOrientation: "from-image"` bakes the source EXIF orientation tag
 * into the decoded pixels *before* that tag is dropped -- without it, a
 * photo taken with the phone rotated would decode upright-as-stored (the
 * canvas ignores orientation metadata by default in most engines) and
 * come out sideways once the tag telling a viewer to rotate it is gone.
 */
async function resizeAndEncode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageProcessingError("Canvas 2D context unavailable.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/webp", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageProcessingError("Canvas 2D context unavailable.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImageProcessingError("WebP encoding failed.")),
      "image/webp",
      quality,
    );
  });
}

/**
 * The full pipeline: decode the validated file once, produce a
 * longest-edge-2000px full image and a longest-edge-400px thumbnail,
 * both WebP at ~0.8 quality, both from the same decode. Caller is
 * expected to have already run `validateImageFile` -- this doesn't
 * re-check type/size, only decodes and re-encodes.
 */
export async function processImageForUpload(
  file: File,
): Promise<ProcessedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC decode support varies by browser/OS -- Safari (and anything
    // WebKit-based, which iOS mandates for every browser) can, most
    // Chromium/Firefox builds on non-Apple platforms can't. Failing loud
    // here with a specific, actionable message is the honest behaviour;
    // silently falling back to uploading the undecoded original would
    // both skip the resize/re-encode step *and* keep the file's EXIF,
    // which is the one thing this pipeline exists to prevent.
    throw new ImageProcessingError(
      "This photo couldn't be opened. Some browsers can't decode HEIC — try a JPEG or PNG, or take the photo again.",
    );
  }

  try {
    const [full, thumb] = await Promise.all([
      resizeAndEncode(bitmap, FULL_MAX_EDGE, WEBP_QUALITY),
      resizeAndEncode(bitmap, THUMB_MAX_EDGE, WEBP_QUALITY),
    ]);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}
