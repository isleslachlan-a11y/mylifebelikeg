import { describe, expect, it } from "vitest";

import { sniffImageType } from "./image-processing";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

describe("sniffImageType", () => {
  it("recognizes a JPEG signature", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(
      "image/jpeg",
    );
  });

  it("recognizes a PNG signature", () => {
    expect(
      sniffImageType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0),
      ),
    ).toBe("image/png");
  });

  it("recognizes a WebP signature (RIFF....WEBP)", () => {
    expect(
      sniffImageType(
        bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")),
      ),
    ).toBe("image/webp");
  });

  it("recognizes an HEIC signature (ftyp box, heic brand)", () => {
    expect(
      sniffImageType(bytes(0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("heic"))),
    ).toBe("image/heic");
  });

  it("recognizes the generic MIAF brand some HEIC encoders use", () => {
    expect(
      sniffImageType(bytes(0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("mif1"))),
    ).toBe("image/heic");
  });

  it("rejects an unrelated ftyp brand (e.g. an mp4 video)", () => {
    expect(
      sniffImageType(bytes(0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("isom"))),
    ).toBeNull();
  });

  it("rejects a GIF, which this app doesn't accept", () => {
    expect(sniffImageType(bytes(...ascii("GIF89a"), 0, 0, 0, 0, 0, 0))).toBeNull();
  });

  it("rejects a bare text file renamed to look like an image", () => {
    expect(sniffImageType(bytes(...ascii("just some text")))).toBeNull();
  });

  it("rejects a too-short buffer rather than throwing", () => {
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
  });

  it("doesn't false-positive a RIFF file that isn't WEBP (e.g. WAV)", () => {
    expect(
      sniffImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"))),
    ).toBeNull();
  });
});
