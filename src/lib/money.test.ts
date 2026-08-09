import { describe, expect, it } from "vitest";

import { formatMoney, minorUnitDigits, parseMoney } from "./money";

describe("minorUnitDigits", () => {
  it("is 2 for the common currencies", () => {
    expect(minorUnitDigits("AUD")).toBe(2);
    expect(minorUnitDigits("GBP")).toBe(2);
    expect(minorUnitDigits("EUR")).toBe(2);
  });

  it("is 0 for JPY — no minor unit", () => {
    expect(minorUnitDigits("JPY")).toBe(0);
  });
});

describe("formatMoney / parseMoney round-trip", () => {
  const cases: Array<[minor: number, currency: string]> = [
    [123456, "AUD"],
    [999, "GBP"],
    [100000, "EUR"],
    [123456, "JPY"], // no minor unit — 123,456 yen, not 1,234.56
    [0, "AUD"],
    [0, "JPY"],
  ];

  it.each(cases)(
    "round-trips %i minor units of %s losslessly",
    (minor, currency) => {
      const display = formatMoney(minor, currency);
      expect(parseMoney(display, currency)).toBe(minor);
    },
  );

  it("does not divide JPY by 100 — 8000 minor units is ¥8,000, not ¥80", () => {
    expect(formatMoney(8000, "JPY")).toContain("8,000");
    expect(formatMoney(8000, "JPY")).not.toContain("80.00");
  });

  it("rejects a non-integer minor amount", () => {
    expect(() => formatMoney(12.5, "AUD")).toThrow(TypeError);
  });

  it("rejects unparseable input", () => {
    expect(() => parseMoney("not a number", "AUD")).toThrow(SyntaxError);
    expect(() => parseMoney("", "AUD")).toThrow(SyntaxError);
  });

  it("reads a comma as a decimal separator when the digit count matches the currency", () => {
    expect(parseMoney("12,50", "EUR")).toBe(1250);
  });

  it("reads a comma as grouping when the trailing digit count doesn't match", () => {
    expect(parseMoney("1,234", "AUD")).toBe(123400);
  });

  it("handles negative amounts", () => {
    expect(parseMoney("-12.34", "AUD")).toBe(-1234);
  });
});
