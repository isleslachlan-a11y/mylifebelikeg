/**
 * All monetary values in this app are integers in minor units (cents,
 * pence, ...) with an explicit 3-letter currency code alongside — see
 * CLAUDE.md rule 1. Never floats, never a bare number. These are the only
 * two places that should ever cross the minor-units/display boundary.
 */

/**
 * A short, curated list for currency pickers — not exhaustive ISO 4217,
 * just what this app's users are likely to need. Every entry is a real
 * currency `Intl.NumberFormat` recognises. That matters because the
 * database only checks `currency ~ '^[A-Z]{3}$'` (see
 * `app.is_currency_code`) — a well-formed but made-up code like "ZZZ"
 * would pass that check yet make `formatMoney`/`minorUnitDigits` throw.
 * Picking from this list instead of free-text input avoids that class of
 * bug entirely, rather than catching it after the fact.
 */
export const COMMON_CURRENCIES = [
  "AUD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "CAD",
  "SGD",
] as const;

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale = "en-US"): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Number of digits after the decimal point this currency's minor unit
 * implies — 2 for most currencies, 0 for JPY/KRW, 3 for KWD/BHD/OMR.
 * Derived from `Intl`'s own currency data rather than a table we'd have
 * to maintain by hand: a hard-coded `/ 100` renders ¥8,000 as ¥80.
 */
export function minorUnitDigits(currency: string): number {
  return getFormatter(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

export type FormatMoneyOptions = {
  locale?: string;
};

/**
 * Format an integer minor-units amount for display, e.g.
 * `formatMoney(123456, "AUD")` → `"A$1,234.56"`,
 * `formatMoney(8000, "JPY")` → `"¥8,000"`.
 */
export function formatMoney(
  minor: number,
  currency: string,
  opts: FormatMoneyOptions = {},
): string {
  if (!Number.isInteger(minor)) {
    throw new TypeError(
      `formatMoney expects an integer minor-units amount, got ${minor}`,
    );
  }
  const digits = minorUnitDigits(currency);
  const major = minor / 10 ** digits;
  return getFormatter(currency, opts.locale).format(major);
}

const CLEAN_RE = /[^0-9.,-]/g;

/**
 * Parse a user-entered (or `formatMoney`-produced) amount string into
 * integer minor units for `currency`. Throws `SyntaxError` on anything
 * that isn't a parseable number.
 *
 * Handles both `.` and `,` as the decimal separator: if both appear, the
 * rightmost one wins and the other is treated as grouping; if only `,`
 * appears, it's read as a decimal separator when the digit count after it
 * matches the currency's minor-unit digits (e.g. "12,50" for a 2-digit
 * currency), otherwise as grouping (e.g. "123,456" for 0-digit JPY).
 */
export function parseMoney(input: string, currency: string): number {
  const digits = minorUnitDigits(currency);
  const cleaned = input.trim().replace(CLEAN_RE, "");
  if (cleaned === "" || cleaned === "-") {
    throw new SyntaxError(`Could not parse "${input}" as an amount`);
  }

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present — the rightmost is the decimal separator, the other is
    // grouping and gets stripped entirely.
    if (lastDot > lastComma) {
      normalized = cleaned.replaceAll(",", "");
    } else {
      normalized = cleaned.replaceAll(".", "").replace(",", ".");
    }
  } else if (lastComma !== -1) {
    const trailingDigits = cleaned.length - lastComma - 1;
    normalized =
      digits > 0 && trailingDigits === digits
        ? cleaned.replace(",", ".")
        : cleaned.replaceAll(",", "");
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (Number.isNaN(value)) {
    throw new SyntaxError(`Could not parse "${input}" as an amount`);
  }

  return Math.round(value * 10 ** digits);
}
