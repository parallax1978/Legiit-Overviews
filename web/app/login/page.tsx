// Sign-in page: plum split screen with the pitch on the left and the sign-in card on the right.
import type { Metadata } from "next";
import { CheckCircleIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { Eyebrow } from "@/components/ui/typography";
import { safeNext } from "@/lib/safe-next";
import { supabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link didn't work. It may have expired or been used already. Send a new one below.",
  oauth: "Google sign-in didn't finish. Try again, or use an email link.",
  session: "Your session ended. Sign in again to continue.",
};

/** Whether the Google provider is switched on for this Supabase project (cached for 5 minutes). */
async function googleEnabled(): Promise<boolean | null> {
  try {
    const { url, anonKey } = supabaseEnv();
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey }, next: { revalidate: 300 } });
    if (!res.ok) return null;
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return Boolean(body.external?.google);
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(one(params.next));
  const errorKey = one(params.error);
  const initialError = errorKey ? (ERRORS[errorKey] ?? ERRORS.link) : null;
  const google = await googleEnabled();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="hero-dark relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Logo tone="dark" size="md" />
        <div className="max-w-md">
          <Eyebrow tone="soft">Built for pages that want to be cited</Eyebrow>
          <h1 className="mt-4 text-4xl font-bold leading-[1.25] tracking-tight">
            See what the AI Overview cites.
            <span className="text-gradient block">Then get your page in it.</span>
          </h1>
          <ul className="mt-8 space-y-3 text-base text-white/80">
            {[
              "Add a search. We capture its AI Overview every 3 hours.",
              "See the claims, brands and sources that keep coming back, with the captures behind every count.",
              "Get a brief for a page it can cite, and an alert when yours is.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 text-white/80" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">A Legiit product.</p>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center bg-surface-alt px-4 py-12">
        <div className="mb-8 lg:hidden">
          <Logo size="md" />
        </div>
        <LoginForm next={next} initialError={initialError} googleEnabled={google} />
        <p className="mt-8 text-xs text-ink-muted lg:hidden">A Legiit product.</p>
      </main>
    </div>
  );
}
