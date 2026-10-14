import { randomBytes, randomInt } from "node:crypto";

/**
 * Normalised email used to detect duplicate bookings.
 * - lower-cased and trimmed
 * - for Gmail / Googlemail: dots and "+tag" suffixes are ignored
 *   (jo.hn+puja@gmail.com === john@gmail.com)
 */
export function emailKey(email: string): string {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at < 1) return clean;
  let local = clean.slice(0, at);
  let domain = clean.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  } else {
    local = local.split("+")[0];
  }
  return `${local}@${domain}`;
}

/**
 * Normalised phone number used to detect duplicate bookings.
 * Treats 07700 900123, +44 7700 900123 and 0044 7700 900123 as the same number.
 */
export function phoneKey(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("44")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

// No 0/O/1/I/L to avoid confusion when reading a reference aloud
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateReference(prefix: string): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `${prefix}-${code}`;
}

export function generateAccessToken(): string {
  return randomBytes(18).toString("base64url");
}
