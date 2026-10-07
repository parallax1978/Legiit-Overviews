"use client";
// Query actions menu: pause or resume tracking (updates status through RLS) and remove the query.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { MoreIcon, PauseIcon, PlayIcon, TrashIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { createClient } from "@/lib/supabase/client";
import type { TrackedQueryStatus } from "@/lib/types";

export interface QueryActionsProps {
  id: string;
  keyword: string;
  status: TrackedQueryStatus;
  /** Status to restore on resume: tracking once the series has shown an overview, else watching. */
  resumeStatus: Exclude<TrackedQueryStatus, "paused">;
}

export function QueryActions({ id, keyword, status, resumeStatus }: QueryActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function setStatus(next: TrackedQueryStatus) {
    setError(null);
    setBusy(true);
    const { data, error: err } = await createClient().from("tracked_queries").update({ status: next }).eq("id", id).select("id");
    setBusy(false);
    if (err || !data?.length) {
      setError(err?.message ?? "That change didn't save. Try again.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function remove() {
    setError(null);
    setBusy(true);
    const { data, error: err } = await createClient().from("tracked_queries").delete().eq("id", id).select("id");
    if (err || !data?.length) {
      setBusy(false);
      setConfirming(false);
      setError(err?.message ?? "The query wasn't removed. Try again.");
      return;
    }
    router.replace("/queries");
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Menu
        label="Query actions"
        align="start-end"
        triggerClassName={buttonClasses({ variant: "secondary", size: "sm", className: "gap-1.5" })}
        trigger={
          <>
            <MoreIcon /> Actions
          </>
        }
        items={[
          status === "paused"
            ? { label: "Resume Tracking", icon: <PlayIcon />, onSelect: () => void setStatus(resumeStatus), disabled: busy }
            : { label: "Pause Tracking", icon: <PauseIcon />, onSelect: () => void setStatus("paused"), disabled: busy },
          "separator",
          { label: "Remove Query", icon: <TrashIcon />, tone: "danger", onSelect: () => setConfirming(true), disabled: busy },
        ]}
      />
      {error && (
        <Alert tone="bad" onDismiss={() => setError(null)} className="max-w-xs py-2">
          {error}
        </Alert>
      )}
      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title={`Remove “${keyword}”?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy} data-autofocus>
              Keep It
            </Button>
            <Button variant="danger" onClick={() => void remove()} loading={busy}>
              Remove
            </Button>
          </>
        }
      >
        Your reports, draft scores and alerts for this query are deleted. Captures stay with anyone else tracking the same search.
      </Dialog>
    </div>
  );
}
