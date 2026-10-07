// Normalisation used everywhere a keyword or URL is compared or counted.
import { parse as parseDomain } from "tldts";
import type { MatchLevel } from "./types.ts";

/**
 * Keyword key for the shared series: NFKC, trim, collapse whitespace, lowercase, strip trailing
 * sentence punctuation. Only . , ; : ! ? (and their CJK forms) are stripped: symbols like # % ) ]
 * belong to the query ("learn c#", "increase by 10%").
 */
export function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[\s.,;:!?…。．，、？！]+$/u, "")
    .trim();
}

const OPERATOR = /(^|\s)(site|inurl|intitle|intext|filetype|related|cache|allintitle|allinurl|allintext):|"|(^|\s)-\S|\sOR\s/;

/**
 * Returns a reason when the keyword uses search operators (DataForSEO bills 5x for them). Checked on
 * the NFKC form, which is what the series stores: full-width ： ＂ － become ASCII operators there.
 */
export function keywordProblem(raw: string): string | null {
  const k = raw.normalize("NFKC").trim();
  if (!k) return "Enter a keyword.";
  if (k.length > 200) return "Keep the keyword under 200 characters.";
  if (OPERATOR.test(k)) return "Search operators (site:, quotes, minus, OR) are not supported.";
  return null;
}

const TRACKING_PARAM = /^(utm_.+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref|ref_src|igshid|yclid|_hsenc|_hsmi|srsltid)$/i;

/** Removes Google text-fragment anchors (#:~:text=...) that DataForSEO keeps on reference URLs. */
export function stripTextFragment(url: string): string {
  const i = url.indexOf("#:~:");
  return i >= 0 ? url.slice(0, i) : url;
}

/**
 * Canonical key for a URL: lowercase host without www., no scheme, no default port, no fragment,
 * no tracking parameters, remaining parameters sorted, no trailing slash, no index.html.
 * Unparseable input is returned lowercased and trimmed.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(stripTextFragment(raw.trim()));
  } catch {
    return raw.trim().toLowerCase();
  }
  const host = hostOf(u.hostname);
  const port = u.port && !["80", "443"].includes(u.port) ? `:${u.port}` : "";
  let path = decodeSafe(u.pathname).replace(/\/{2,}/g, "/");
  path = path.replace(/\/(index|default)\.(html?|php|aspx?)$/i, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/") path = "";
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
  return `${host}${port}${path}${query}`;
}

function decodeSafe(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** Lowercased host without a leading www. */
export function hostOf(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function hostOfUrl(raw: string): string {
  try {
    return hostOf(new URL(stripTextFragment(raw)).hostname);
  } catch {
    return "";
  }
}

/** Registrable domain (eTLD+1) using the Public Suffix List, including private suffixes like github.io. */
export function regDomain(hostOrUrl: string): string {
  const r = parseDomain(hostOrUrl, { allowPrivateDomains: true });
  return (r.domain ?? hostOf(r.hostname ?? hostOrUrl)).toLowerCase();
}

/** Platforms whose citations only count for a user's page at exact URL or path-prefix level. */
export const PLATFORM_DOMAINS = new Set([
  "youtube.com", "reddit.com", "facebook.com", "quora.com", "wikipedia.org", "medium.com",
  "linkedin.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "pinterest.com",
  "substack.com", "github.com",
]);

export function isPlatform(reg: string): boolean {
  return PLATFORM_DOMAINS.has(reg);
}

/**
 * How a cited URL relates to the user's page. Both arguments are url_keys from normalizeUrl.
 * exact_url > path_prefix > same_host > same_domain. Platform domains only match at exact_url or
 * path_prefix, so someone else's post on medium.com never counts as the user's citation.
 */
export function matchLevel(citedKey: string, ownKey: string): MatchLevel | null {
  if (!citedKey || !ownKey) return null;
  if (citedKey === ownKey) return "exact_url";
  const [citedHost, ...citedRest] = citedKey.split("/");
  const [ownHost, ...ownRest] = ownKey.split("/");
  const citedPath = "/" + citedRest.join("/");
  const ownPath = "/" + ownRest.join("/");
  if (citedHost === ownHost && ownPath !== "/" && (citedPath.startsWith(ownPath + "/") || citedPath.startsWith(ownPath + "?"))) {
    return "path_prefix";
  }
  const citedReg = regDomain(citedHost.split(":")[0]);
  if (isPlatform(citedReg)) return null;
  if (citedHost === ownHost) return "same_host";
  if (citedReg === regDomain(ownHost.split(":")[0])) return "same_domain";
  return null;
}

/** Whole-word, case-insensitive brand mention test. */
export function mentionsBrand(text: string, brands: string[]): boolean {
  const t = text.toLowerCase();
  return brands.some((b) => {
    const n = b.trim().toLowerCase();
    if (!n) return false;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(t);
  });
}
