// Notifications: the user's alerts (first seen, lost, regained, reports, platform changes, digests).
import type { Metadata } from "next";
import { ErrorCard } from "@/components/ui/feedback";
import { RetryButton } from "@/components/ui/retry-button";
import { PageHeader } from "@/components/ui/typography";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/types";
import { NotificationsList } from "./notifications-list";

export const metadata: Metadata = { title: "Notifications" };

const LIMIT = 100;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, tracked_query_id, kind, title, body, link, emailed_at, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    return (
      <>
        <PageHeader kicker="Inbox" title="Notifications" />
        <ErrorCard className="mt-8" title="Notifications didn't load" detail={error.message} action={<RetryButton />} />
      </>
    );
  }

  const rows = (data ?? []) as NotificationRow[];
  // Re-mount when the server list changes (after router.refresh) so new rows show.
  const key = `${rows.length}:${rows[0]?.id ?? ""}:${rows.filter((n) => !n.read_at).length}`;
  return <NotificationsList key={key} initial={rows} limit={LIMIT} />;
}
