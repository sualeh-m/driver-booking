// Client-side mirror of the server's strict UK-mobile rule for WORKER phone
// numbers: mandatory, and must normalise to an 11-digit 07 number. Accepts
// 7XXXXXXXXX (leading 0 added) and 447/+447 prefixes; everything else is
// invalid. The server re-validates and does the final "07123 456789" format.

export const UK_MOBILE_ERROR =
  "Enter a valid UK mobile number starting 07, 11 digits";

export function isValidUkMobile(raw: string): boolean {
  const digits = raw.trim().replace(/\D/g, "");
  return (
    /^07\d{9}$/.test(digits) ||
    /^7\d{9}$/.test(digits) ||
    /^447\d{9}$/.test(digits)
  );
}
