// Consistent display formatting applied on SAVE (not on read) for names and
// phone numbers, so stored data is uniform everywhere it appears.

/**
 * Capitalise the first letter of each whitespace-separated word, leaving the
 * rest of the word exactly as typed (so a manual correction like "McDonald"
 * survives a later re-save). Also trims and collapses runs of whitespace.
 */
export function formatName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
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

  const digits = trimmed.replace(/\D/g, "");
  let normalised: string | null = null;
  if (/^07\d{9}$/.test(digits)) normalised = digits;
  else if (/^7\d{9}$/.test(digits)) normalised = `0${digits}`;
  else if (/^447\d{9}$/.test(digits)) normalised = `0${digits.slice(2)}`;

  if (normalised === null) return trimmed;
  return `${normalised.slice(0, 5)} ${normalised.slice(5)}`;
}
