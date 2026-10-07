"use client";
// Draft scorer form: paste text or give a URL, start score-draft, then poll the draft_scores row every
// 3 seconds until it is done (opens the result) or failed. Resumes a score that is already running.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea, describedBy } from "@/components/ui/form";
import { FileTextIcon, LinkIcon, LoaderIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { DraftScoreRow, ScoreDraftRequest, ScoreDraftResponse } from "@/lib/types";

type Source = "text" | "url";

const POLL_MS = 3_000;
const TIMEOUT_MS = 3 * 60_000;
const EXPECTED_SECONDS = 60;
const MAX_TEXT = 200_000;

export interface DraftScorerProps {
  trackedQueryId: string;
  /** A score already running for this query (resumed on load). */
  running: { id: string; created_at: string; source: Source } | null;
}

async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    let message: string | undefined;
    try {
      const body = (await res?.clone().json()) as { error?: unknown } | undefined;
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Body wasn't JSON.
    }
    if (res?.status === 409) return "The brief isn't ready yet, so there's nothing to score against. Try again once the Brief tab shows it.";
    if (res?.status === 429) return "A draft for this query is already being scored. Wait for it to finish, then score the next one.";
    if (res?.status === 401) return "Your session ended. Sign in again, then score the draft.";
    if (message) return message;
    return "Scoring failed to start on our side. Try again in a minute.";
  }
  if (error instanceof FunctionsRelayError) return "The request didn't reach our server. Try again in a minute.";
  if (error instanceof FunctionsFetchError) return "We couldn't reach our server. Check your connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function validUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

interface Job {
  id: string;
  startedAt: number;
  source: Source;
}

function jobFrom(running: DraftScorerProps["running"]): Job | null {
  return running ? { id: running.id, startedAt: Date.parse(running.created_at), source: running.source } : null;
}

export function DraftScorer({ trackedQueryId, running }: DraftScorerProps) {
  const router = useRouter();
  const [source, setSource] = useState<Source>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<Job | null>(() => jobFrom(running));
  const [seenRunningId, setSeenRunningId] = useState(running?.id ?? null);
  const [timedOut, setTimedOut] = useState(false);
  // 0 until the first clock tick, so server and client render the same elapsed time.
  const [now, setNow] = useState(0);

  // A running score that appears after a refresh (e.g. after a 429) is picked up here.
  if ((running?.id ?? null) !== seenRunningId) {
    setSeenRunningId(running?.id ?? null);
    if (running && job?.id !== running.id) {
      setJob(jobFrom(running));
      setTimedOut(false);
    }
  }

  useEffect(() => {
    if (!job || timedOut) return;
    let stopped = false;
    const supabase = createClient();
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    const poll = setInterval(async () => {
      if (Date.now() - job.startedAt > TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      const { data, error: readError } = await supabase.from("draft_scores").select("id, status, error").eq("id", job.id).maybeSingle();
      if (stopped || readError || !data) return;
      const row = data as Pick<DraftScoreRow, "id" | "status" | "error">;
      if (row.status === "done") {
        stopped = true;
        setJob(null);
        router.replace(`/queries/${trackedQueryId}/draft?score=${row.id}`, { scroll: false });
      } else if (row.status === "failed") {
        stopped = true;
        setJob(null);
        setError(row.error?.trim() || "Scoring failed without an error message. Try again.");
        router.refresh();
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [job, timedOut, router, trackedQueryId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInputError(null);
    const input = source === "text" ? text.trim() : url.trim();
    if (!input) {
      setInputError(source === "text" ? "Paste the text of your draft." : "Enter the URL of your draft.");
      return;
    }
    if (source === "url" && !validUrl(input)) {
      setInputError("Enter the full address, starting with https://");
      return;
    }
    if (source === "text" && input.length > MAX_TEXT) {
      setInputError(`Paste at most ${formatCount(MAX_TEXT)} characters.`);
      return;
    }
    const body: ScoreDraftRequest = { tracked_query_id: trackedQueryId, source, input };
    setStarting(true);
    try {
      const { data, error: fnError } = await createClient().functions.invoke<ScoreDraftResponse>("score-draft", { body, timeout: 60_000 });
      if (fnError) throw fnError;
      if (!data?.draft_score_id) throw new Error("Scoring didn't start. Try again.");
      const startedAt = Date.now();
      setTimedOut(false);
      setNow(startedAt);
      setJob({ id: data.draft_score_id, startedAt, source });
    } catch (err) {
      setError(await functionErrorMessage(err));
      if (err instanceof FunctionsHttpError && (err.context as Response | undefined)?.status === 429) router.refresh();
    } finally {
      setStarting(false);
    }
  }

  if (job) {
    const elapsed = now ? Math.max(0, Math.floor((now - job.startedAt) / 1000)) : 0;
    const progress = Math.min(0.94, 1 - Math.exp(-elapsed / (EXPECTED_SECONDS / 2.2)));
    const steps =
      elapsed < 10
        ? job.source === "url"
          ? "Reading your page"
          : "Measuring your draft"
        : elapsed < 25
          ? "Comparing it with the brief and the cited pages"
          : "Scoring coverage and writing your fixes";
    return (
      <Card padding="lg" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-faint text-brand">
            <LoaderIcon className={timedOut ? undefined : "animate-spin"} />
          </span>
          <div className="min-w-0 flex-1">
            {timedOut ? (
              <>
                <p className="font-semibold text-ink">This is taking longer than usual</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  Scoring keeps running in the background. Check back in a few minutes; the result appears in History below.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const startedAt = Date.now();
                      setNow(startedAt);
                      setJob({ ...job, startedAt });
                      setTimedOut(false);
                    }}
                  >
                    Keep waiting
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
                    Refresh history
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-ink">Scoring your draft&hellip; this takes about a minute</p>
                <p className="mt-1 text-sm text-ink-muted">{steps}</p>
                <ProgressBar value={progress} className="mt-4" label="Scoring the draft" />
                <p className="mt-2 text-xs tabular-nums text-ink-soft">{elapsed}s</p>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const words = source === "text" ? wordCount(text) : 0;
  const textHint = text ? `${formatCount(words)} words. Markdown headings and lists help us read the structure.` : "Paste the whole page. Markdown headings (#, ##) and lists help us read the structure.";
  const urlHint = "The page must load without a login. Public staging pages work.";

  return (
    <Card padding="lg">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <SegmentedControl<Source>
          aria-label="Draft source"
          value={source}
          onChange={(v) => {
            setSource(v);
            setInputError(null);
          }}
          options={[
            { value: "text", label: "Paste text", icon: <FileTextIcon /> },
            { value: "url", label: "Page URL", icon: <LinkIcon /> },
          ]}
        />
        {source === "text" ? (
          <Field id="draft-text" label="Your draft" hint={textHint} error={inputError}>
            <Textarea
              id="draft-text"
              name="input"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"# Best form builder in 2026\n\nThe best form builder for most teams is…"}
              invalid={Boolean(inputError)}
              disabled={starting}
              aria-describedby={describedBy("draft-text", { hint: textHint, error: inputError })}
            />
          </Field>
        ) : (
          <Field id="draft-url" label="Page URL" hint={urlHint} error={inputError}>
            <Input
              id="draft-url"
              name="input"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com/best-form-builder"
              icon={<LinkIcon />}
              invalid={Boolean(inputError)}
              disabled={starting}
              aria-describedby={describedBy("draft-url", { hint: urlHint, error: inputError })}
            />
          </Field>
        )}
        {error && (
          <Alert tone="bad" title="Not scored">
            {error}
          </Alert>
        )}
        <Button type="submit" loading={starting}>
          Score draft
        </Button>
      </form>
    </Card>
  );
}
