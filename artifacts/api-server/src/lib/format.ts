// Consistent display formatting applied on SAVE (not on read) for names and
// phone numbers, so stored data is uniform everywhere it appears.

/**
 * Force proper Title Case regardless of how the name was entered: lowercase the
 * whole string first, then uppercase the first letter of each word. So "JOHN
 * SMITH", "john smith" and "jOhN sMiTh" all become "John Smith". Also trims and
 * collapses runs of whitespace.
 */
export function formatName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Nullable variant: blank/undefined collapses to null. */
export function formatNameOrNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t === "" ? null : formatName(t);
}

/**
 * Normalise a UK mobile number to "07123 456789": strip every non-digit,
 * accept 7XXXXXXXXX (add leading 0), 07XXXXXXXXX, or 447XXXXXXXXX / +44...
 * (replace 44 with 0), then insert a single space after the first 5 digits.
 * Anything that doesn't look like a UK mobile is kept as typed (trimmed)
 * rather than mangled. Blank/undefined collapses to null.
 */
export function formatUkMobile(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const normalised = normalizeUkMobileDigits(trimmed);
  if (normalised === null) return trimmed;
  return `${normalised.slice(0, 5)} ${normalised.slice(5)}`;
}

/**
 * Strict variant for WORKER phone numbers, which are mandatory and must be a
 * valid UK mobile: returns "07123 456789" for any input that normalises to an
 * 11-digit 07 number (accepting 7XXXXXXXXX with the 0 added, and 447/+447
 * prefixes), or null when the input is NOT a valid UK mobile — callers must
 * reject with a clear message rather than saving.
 */
export function strictUkMobile(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalised = normalizeUkMobileDigits(trimmed);
  if (normalised === null) return null;
  return `${normalised.slice(0, 5)} ${normalised.slice(5)}`;
}

export const UK_MOBILE_ERROR =
  "Enter a valid UK mobile number starting 07, 11 digits";

function normalizeUkMobileDigits(trimmed: string): string | null {
  const digits = trimmed.replace(/\D/g, "");
  if (/^07\d{9}$/.test(digits)) return digits;
  if (/^7\d{9}$/.test(digits)) return `0${digits}`;
  if (/^447\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}
