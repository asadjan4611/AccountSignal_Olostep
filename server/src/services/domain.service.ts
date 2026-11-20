import { isIP } from "node:net";
import { parse } from "tldts";

/** Free mailbox providers: the domain says nothing about the person's employer. */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
  "zoho.com",
  "zohomail.com",
  "tutanota.com",
  "tuta.io",
  "fastmail.com",
  "hey.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "libero.it",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "rediffmail.com",
  "naver.com",
]);

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Registrable domain (acme.co.uk from mail.acme.co.uk), or null for IPs and private names. */
export function registrableDomain(host: string): string | null {
  const clean = host.trim().toLowerCase().replace(/\.$/, "");
  if (!clean || isIP(clean.replace(/^\[|\]$/g, "")) !== 0 || clean === "localhost") return null;
  // ".example" is reserved for documentation (RFC 2606): used by demo data, never a real company.
  if (/^([a-z0-9-]+\.)*[a-z0-9-]+\.example$/.test(clean))
    return clean.split(".").slice(-2).join(".");
  const info = parse(clean);
  if (!info.domain || info.isIp || !info.isIcann) return null;
  return info.domain;
}

export function emailDomain(email: string): string | null {
  const host = EMAIL_RE.exec(email.trim())?.[1];
  return host ? registrableDomain(host) : null;
}

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export function websiteDomain(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return registrableDomain(url.hostname);
  } catch {
    return null;
  }
}

const LEGAL_SUFFIX =
  /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|gmbh|ag|sa|sas|bv|plc|pvt|pte)\b\.?/gi;

/** "Acme Technologies, Inc." and "acme technologies" group together. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
