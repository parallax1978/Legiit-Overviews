"use client";
// Password form: sets or changes the signed-in user's password with supabase.auth.updateUser.
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, describedBy } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

function friendly(message: string): string {
  if (/same.*password|different from the old/i.test(message)) return "That's your current password. Choose a new one.";
  if (/weak|at least|characters/i.test(message)) return message;
  if (/reauthentication|recent login/i.test(message)) return "For security, sign in again with an email link, then set the password.";
  if (/session/i.test(message)) return "Your session ended. Sign in again, then set the password.";
  return message || "The password wasn't saved. Try again.";
}

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "password" | "confirm" | null; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError({ field: "password", message: `Use at least ${MIN_LENGTH} characters.` });
      return;
    }
    if (password !== confirm) {
      setError({ field: "confirm", message: "The passwords don't match." });
      return;
    }
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError({ field: null, message: friendly(err.message) });
      return;
    }
    setPassword("");
    setConfirm("");
    setSaved(true);
  }

  const pwError = error?.field === "password" ? error.message : null;
  const confirmError = error?.field === "confirm" ? error.message : null;
  const hint = `At least ${MIN_LENGTH} characters.`;

  return (
    <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-password" label="New password" hint={hint} error={pwError}>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={Boolean(pwError)}
            aria-describedby={describedBy("new-password", { hint, error: pwError })}
          />
        </Field>
        <Field id="confirm-password" label="Confirm password" error={confirmError}>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            invalid={Boolean(confirmError)}
            aria-describedby={describedBy("confirm-password", { error: confirmError })}
          />
        </Field>
      </div>
      {error && !error.field && <Alert tone="bad">{error.message}</Alert>}
      {saved && (
        <Alert tone="good" onDismiss={() => setSaved(false)}>
          Password saved. You can now sign in with your email and password.
        </Alert>
      )}
      <Button type="submit" loading={busy}>
        Save Password
      </Button>
    </form>
  );
}
