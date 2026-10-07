// Validates post-sign-in redirect targets so `next` can't send users to another site.

/** Default page after signing in. */
export const DEFAULT_NEXT = "/queries";

/**
 * Returns `next` when it is a same-origin path ("/queries/new?keyword=x"), otherwise the default.
 * Rejects protocol-relative ("//evil.com"), backslash ("/\\evil.com") and absolute URLs.
 */
export function safeNext(next: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  for (let i = 0; i < next.length; i++) if (next.charCodeAt(i) < 0x20) return fallback;
  try {
    const u = new URL(next, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return fallback;
    if (u.pathname === "/login" || u.pathname.startsWith("/auth/")) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
