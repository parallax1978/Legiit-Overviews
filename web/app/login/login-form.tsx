"use client";
// Sign-in card: email magic link (default), email and password, or Google. Respects `next`.
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { GoogleIcon, MailIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";

type Mode = "link" | "password";

export interface LoginFormProps {
  /** Validated same-origin path to open after signing in. */
  next: string;
  initialError: string | null;
  /** False when the Google provider is off; null when unknown. */
  googleEnabled: boolean | null;
}

function friendlyError(error: { message?: string; status?: number; code?: string }): string {
  const msg = error.message ?? "";
  if (error.status === 429 || /rate limit|too many/i.test(msg)) return "Too many attempts. Wait a minute, then try again.";
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match. Try again, or use a sign-in link.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first. Send yourself a sign-in link instead.";
  if (/signups not allowed|signup is disabled/i.test(msg)) return "New sign-ups are closed right now.";
  if (/provider is not enabled|unsupported provider/i.test(msg)) return "Google sign-in isn't set up yet. Use an email link instead.";
  if (/fetch|network/i.test(msg)) return "We couldn't reach the sign-in service. Check your connection and try again.";
  return msg || "Something went wrong. Try again.";
}

export function LoginForm({ next, initialError, googleEnabled }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"link" | "password" | "google" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendLink(target: string) {
    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
    const { error: err } = await supabase.auth.signInWithOtp({ email: target, options: { emailRedirectTo, shouldCreateUser: true } });
    if (err) throw err;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const target = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "link") {
      setBusy("link");
      try {
        await sendLink(target);
        setSentTo(target);
      } catch (err) {
        setError(friendlyError(err as Error));
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy("password");
    const { error: err } = await createClient().auth.signInWithPassword({ email: target, password });
    if (err) {
      setBusy(null);
      setError(friendlyError(err));
      return;
    }
    // Full navigation so the server renders with the new session cookies.
    window.location.assign(next);
  }

  async function onGoogle() {
    setError(null);
    if (googleEnabled === false) {
      setError("Google sign-in isn't set up yet. Use an email link instead.");
      return;
    }
    setBusy("google");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (err) {
      setBusy(null);
      setError(friendlyError(err));
    }
  }

  if (sentTo) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-pop">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-faint text-brand">
          <MailIcon className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-1 text-[15px] leading-6 text-ink-muted">
          We sent a sign-in link to <span className="font-medium text-ink">{sentTo}</span>. It works once and expires in an hour.
        </p>
        {error && (
          <Alert tone="bad" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            loading={busy === "link"}
            onClick={async () => {
              setError(null);
              setBusy("link");
              try {
                await sendLink(sentTo);
              } catch (err) {
                setError(friendlyError(err as Error));
              } finally {
                setBusy(null);
              }
            }}
          >
            Send It Again
          </Button>
          <button
            type="button"
            className="mt-2 text-xs text-ink-muted hover:text-ink"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
          >
            Use a Different Email
          </button>
        </div>
      </div>
    );
  }

  const errorId = "login-error";
  return (
    <div className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-pop">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-[15px] leading-6 text-ink-muted">
        {mode === "link"
          ? "No password needed. New here? We'll set up your account from the link."
          : "Sign in with your email and password."}
      </p>

      <form className="mt-5 space-y-3" onSubmit={onSubmit} noValidate>
        <Field id="email" label="Email">
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={Boolean(error) && mode === "link"}
            aria-describedby={error ? errorId : undefined}
            required
          />
        </Field>
        {mode === "password" && (
          <Field id="password" label="Password">
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-sm font-medium text-bad">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth loading={busy === "link" || busy === "password"} className="mt-1">
          {mode === "link" ? "Email Me a Sign-In Link" : "Sign In"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="secondary" fullWidth onClick={onGoogle} loading={busy === "google"} iconLeft={<GoogleIcon />}>
        Continue with Google
      </Button>

      <p className="mt-4 text-center text-xs text-ink-muted">We only use your email to sign you in and send the alerts you choose.</p>
      <p className="mt-3 text-center">
        <button
          type="button"
          className="text-xs text-ink-muted hover:text-ink"
          onClick={() => {
            setMode(mode === "link" ? "password" : "link");
            setError(null);
          }}
        >
          {mode === "link" ? "Have a Password? Sign In with It Instead" : "Use a Sign-In Link Instead"}
        </button>
      </p>
    </div>
  );
}
