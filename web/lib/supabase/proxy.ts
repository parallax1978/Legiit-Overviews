// Session refresh for proxy.ts: runs before every matched request, refreshes the auth cookies,
// and redirects signed-out visitors away from the app.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "../safe-next";
import { supabaseEnv } from "./env";

/** Paths that need a signed-in user. */
const PROTECTED_PREFIXES = ["/queries", "/notifications", "/settings"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookies on the response, sends signed-out users from app pages
 * to /login?next=<path>, and sends signed-in users from /login to their destination.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Validates the JWT (and refreshes it when expired). Nothing may run between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtected(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", `${pathname}${search}`);
    return withCookies(NextResponse.redirect(to), response);
  }

  if (signedIn && pathname === "/login") {
    const to = request.nextUrl.clone();
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    const target = new URL(next, request.nextUrl.origin);
    to.pathname = target.pathname;
    to.search = target.search;
    return withCookies(NextResponse.redirect(to), response);
  }

  return response;
}

/** Copies refreshed auth cookies and cache headers onto a redirect so the browser stays in sync. */
function withCookies(redirect: NextResponse, from: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ["cache-control", "expires", "pragma"]) {
    const v = from.headers.get(key);
    if (v) redirect.headers.set(key, v);
  }
  return redirect;
}
