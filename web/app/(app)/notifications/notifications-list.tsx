"use client";
// Notifications list: unread styling, mark all read, and click to mark read and open the link.
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { AlertTriangleIcon, BellIcon, CheckCircleIcon, CheckIcon, FileTextIcon, GlobeIcon, InboxIcon, RefreshIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { NotificationKind, NotificationRow } from "@/lib/types";

const KINDS: Record<NotificationKind, { label: string; tone: ChipTone; icon: ReactNode }> = {
  first_seen: { label: "First seen", tone: "good", icon: <CheckCircleIcon /> },
  regained: { label: "Regained", tone: "good", icon: <RefreshIcon /> },
  lost: { label: "Lost", tone: "bad", icon: <AlertTriangleIcon /> },
  report_ready: { label: "Report ready", tone: "brand", icon: <FileTextIcon /> },
  platform_event: { label: "Google-wide change", tone: "warn", icon: <GlobeIcon /> },
  digest: { label: "Daily digest", tone: "grey", icon: <InboxIcon /> },
};

const ICON_BG: Record<ChipTone, string> = {
  good: "bg-good-soft text-good",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  brand: "bg-brand-faint text-brand",
  grey: "bg-surface-sunken text-ink-muted",
  ink: "bg-ink text-white",
};

/** Only same-site paths are followed; anything else is ignored. */
function safeLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.startsWith("/\\")) return null;
  return link;
}

export function NotificationsList({ initial, limit }: { initial: NotificationRow[]; limit: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(ids: string[]): Promise<boolean> {
    const now = new Date().toISOString();
    const { error: err } = await createClient().from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
    if (err) {
      setError(err.message);
      return false;
    }
    setItems((prev) => prev.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)));
    return true;
  }

  async function markAll() {
    setError(null);
    setMarkingAll(true);
    const now = new Date().toISOString();
    const { error: err } = await createClient().from("notifications").update({ read_at: now }).is("read_at", null);
    setMarkingAll(false);
    if (err) {
      setError(err.message);
      return;
    }
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    startTransition(() => router.refresh());
  }

  async function open(n: NotificationRow) {
    setError(null);
    if (!n.read_at) await markRead([n.id]);
    const link = safeLink(n.link);
    if (link) router.push(link);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <PageHeader
        kicker="Inbox"
        title="Notifications"
        meta={items.length ? `${plural(unread, "unread notification")}${items.length >= limit ? ` · latest ${limit}` : ""}` : "Alerts about your queries"}
        actions={
          items.length > 0 && (
            <Button variant="secondary" onClick={() => void markAll()} disabled={unread === 0} loading={markingAll} iconLeft={<CheckIcon />}>
              Mark All Read
            </Button>
          )
        }
      />
      {error && (
        <Alert tone="bad" className="mt-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<BellIcon className="h-5 w-5" />}
          title="No notifications yet"
          body="You'll hear here when your page is first cited, lost or back, when a report is ready, and once a day with a digest of what changed."
        />
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
          {items.map((n) => {
            const kind = KINDS[n.kind] ?? KINDS.digest;
            const isUnread = !n.read_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void open(n)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-alt sm:px-5",
                    isUnread && "bg-brand-faint/40",
                  )}
                >
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", ICON_BG[kind.tone])}>{kind.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("text-[15px] text-ink", isUnread ? "font-semibold" : "font-medium")}>{n.title}</span>
                      {isUnread && <span className="sr-only">(unread)</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm leading-6 text-ink-muted">{n.body}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <Chip tone={kind.tone} size="sm">
                        {kind.label}
                      </Chip>
                      <LocalTime value={n.created_at} format="relative" />
                    </span>
                  </span>
                  {isUnread && <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
