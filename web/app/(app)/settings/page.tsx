// Settings: account email and sign-in methods, set or change the password, sign out.
import type { Metadata } from "next";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { LogOutIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { LabelValue, LabelValueGrid, PageHeader } from "@/components/ui/typography";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Settings" };

const PROVIDER_LABELS: Record<string, string> = { email: "Email", google: "Google" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const providers = Array.isArray(user?.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : [];

  return (
    <>
      <PageHeader kicker="Account" title="Settings" meta="Your sign-in details." />
      <div className="mt-8 grid max-w-3xl gap-6">
        <Card padding="lg">
          <CardHeader title="Account" description="The email we sign you in with and send alerts to." />
          <LabelValueGrid className="mt-5">
            <LabelValue label="Email">
              <span className="break-all font-medium">{user?.email ?? "–"}</span>
            </LabelValue>
            <LabelValue label="Sign-in methods">
              <span className="flex flex-wrap gap-1.5">
                {(providers.length ? providers : ["email"]).map((p) => (
                  <Chip key={p} tone="grey">
                    {PROVIDER_LABELS[p] ?? p}
                  </Chip>
                ))}
              </span>
            </LabelValue>
            <LabelValue label="Member since">
              <LocalTime value={user?.created_at} format="date" />
            </LabelValue>
          </LabelValueGrid>
        </Card>

        <Card padding="lg" id="password" className="scroll-mt-20">
          <CardHeader
            title="Password"
            description="Set a password to sign in without waiting for an email link, or change the one you have. Email links keep working either way."
          />
          <PasswordForm />
        </Card>

        <Card padding="lg">
          <CardHeader title="Sign out" description="Signs you out in this browser. Your queries keep being captured." />
          <form action="/auth/signout" method="post" className="mt-5">
            <button type="submit" className={buttonClasses({ variant: "secondary" })}>
              <LogOutIcon /> Sign Out
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
