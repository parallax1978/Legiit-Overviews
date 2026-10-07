// Email link return: verifies token_hash + type (custom email template) or exchanges a PKCE code
// (default template), sets the session cookie, then continues to `next`.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    // A recovery link signs the user in; send them to set a new password.
    const target = type === "recovery" ? "/settings#password" : next;
    return NextResponse.redirect(new URL(target, origin));
  }

  const login = new URL("/login", origin);
  login.searchParams.set("error", "link");
  login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
