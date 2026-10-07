"use client";
// Add-query form: calls the add-query Edge Function, shows progress while Google is checked, then opens the
// query, or explains that no overview appeared and offers sibling searches that do show one.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, describedBy } from "@/components/ui/form";
import { ArrowRightIcon, LoaderIcon, MonitorIcon, SearchIcon, SmartphoneIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SectionLabel } from "@/components/ui/typography";
import { formatCompact, languageName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { AddQueryRequest, AddQueryResponse, Device, LocationRow } from "@/lib/types";

type DeviceChoice = Device | "both";

const COMMON_LANGUAGES = ["en", "es", "fr", "de", "it", "nl", "pt", "pl", "sv", "da", "no", "fi", "hi", "ja", "ko", "zh", "ar", "tr"];
const DEFAULT_LOCATION = 2840;
const EXPECTED_SECONDS = 60;

/** Reads `{ error }` from an Edge Function failure, with friendly fallbacks. */
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
    if (res?.status === 401) return "Your session ended. Sign in again, then add the query.";
    if (message) return message;
    if (res?.status && res.status >= 500) return "Checking Google failed on our side. Try again in a minute.";
    return "That query couldn't be added. Check the keyword and try again.";
  }
  if (error instanceof FunctionsRelayError) return "The request didn't reach our server. Try again in a minute.";
  if (error instanceof FunctionsFetchError) return "We couldn't reach our server. Check your connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

interface Watching {
  keyword: string;
  response: AddQueryResponse;
}

export interface AddQueryFormProps {
  locations: LocationRow[];
  initialKeyword: string;
}

export function AddQueryForm({ locations, initialKeyword }: AddQueryFormProps) {
  const router = useRouter();
  const defaultLocation = locations.find((l) => l.code === DEFAULT_LOCATION) ?? locations[0];
  const [keyword, setKeyword] = useState(initialKeyword);
  const [locationCode, setLocationCode] = useState<number | undefined>(defaultLocation?.code);
  const [language, setLanguage] = useState(defaultLocation?.default_language ?? "en");
  const [device, setDevice] = useState<DeviceChoice>("desktop");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [watching, setWatching] = useState<Watching | null>(null);

  const languages = useMemo(() => {
    const codes = new Set([...COMMON_LANGUAGES, ...locations.map((l) => l.default_language), language]);
    return [...codes]
      .map((code) => ({ value: code, label: `${languageName(code)} (${code})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [locations, language]);

  useEffect(() => {
    if (!submitting) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [submitting, startedAt]);

  async function add(target: string) {
    setError(null);
    setKeywordError(null);
    const kw = target.trim().replace(/\s+/g, " ");
    if (!kw) {
      setKeywordError("Enter a search to track.");
      return;
    }
    if (kw.length > 200) {
      setKeywordError("Keep the search under 200 characters.");
      return;
    }
    if (!locationCode) {
      setError("Pick a country.");
      return;
    }
    const body: AddQueryRequest = {
      keyword: kw,
      location_code: locationCode,
      language_code: language,
      devices: device === "both" ? ["desktop", "mobile"] : [device],
    };
    setWatching(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setSubmitting(kw);
    try {
      const { data, error: fnError } = await createClient().functions.invoke<AddQueryResponse>("add-query", { body, timeout: 150_000 });
      if (fnError) throw fnError;
      const results = data?.results ?? [];
      if (results.length === 0) throw new Error("The query wasn't created. Try again.");
      const shown = results.find((r) => r.overview_present || r.status === "tracking");
      if (shown) {
        router.push(`/queries/${shown.tracked_query_id}`);
        return;
      }
      setWatching({ keyword: kw, response: data as AddQueryResponse });
      setSubmitting(null);
    } catch (err) {
      const message = await functionErrorMessage(err);
      // Validation messages from the function belong to the keyword field.
      if (/keyword|operator|search/i.test(message) && !/server|reach|session/i.test(message)) setKeywordError(message);
      else setError(message);
      setSubmitting(null);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void add(keyword);
  }

  if (submitting) {
    const progress = Math.min(0.92, 1 - Math.exp(-elapsed / (EXPECTED_SECONDS / 2.2)));
    return (
      <Card padding="lg" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-faint text-brand">
            <LoaderIcon className="animate-spin" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Checking Google for an AI Overview&hellip; this takes up to a minute</p>
            <p className="mt-1 break-words text-sm text-ink-muted">
              &ldquo;{submitting}&rdquo; · {locations.find((l) => l.code === locationCode)?.name} · {languageName(language)} ·{" "}
              {device === "both" ? "Desktop and mobile" : device === "mobile" ? "Mobile" : "Desktop"}
            </p>
            <ProgressBar value={progress} className="mt-4" label="Checking Google" />
            <p className="mt-2 text-xs tabular-nums text-ink-soft">{elapsed}s</p>
          </div>
        </div>
      </Card>
    );
  }

  const kwHint = "One search, the way people type it. No operators like site: or quotes.";

  return (
    <div className="space-y-6">
      {watching && (
        <WatchingResult
          watching={watching}
          onPick={(sibling) => {
            setKeyword(sibling);
            void add(sibling);
          }}
        />
      )}
      <Card padding="lg">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Field id="keyword" label="Search" hint={kwHint} error={keywordError}>
            <Input
              id="keyword"
              name="keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="best crm for small business"
              autoComplete="off"
              maxLength={200}
              autoFocus={!initialKeyword}
              icon={<SearchIcon />}
              invalid={Boolean(keywordError)}
              aria-describedby={describedBy("keyword", { hint: kwHint, error: keywordError })}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="country" label="Country">
              <Select
                id="country"
                value={locationCode ?? ""}
                onChange={(e) => {
                  const code = Number(e.target.value);
                  setLocationCode(code);
                  const loc = locations.find((l) => l.code === code);
                  if (loc) setLanguage(loc.default_language);
                }}
                options={locations.map((l) => ({ value: String(l.code), label: l.name }))}
              />
            </Field>
            <Field id="language" label="Language" hint="Set from the country. Change it if your audience searches in another language.">
              <Select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={languages}
                aria-describedby="language-hint"
              />
            </Field>
          </div>
          <div className="space-y-1.5">
            <p id="device-label" className="text-sm font-medium text-ink">
              Device
            </p>
            <SegmentedControl<DeviceChoice>
              aria-labelledby="device-label"
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: "Desktop", icon: <MonitorIcon className="h-3.5 w-3.5" /> },
                { value: "mobile", label: "Mobile", icon: <SmartphoneIcon className="h-3.5 w-3.5" /> },
                { value: "both", label: "Both" },
              ]}
            />
            <p className="text-xs text-ink-muted">
              {device === "both" ? "Two queries, one per device. Overviews often differ between them." : "Captured 8 times a day."}
            </p>
          </div>
          {error && <Alert tone="bad">{error}</Alert>}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" glow iconRight={<ArrowRightIcon />}>
              Check and Start Tracking
            </Button>
            <ButtonLink href="/queries" variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </Card>
    </div>
  );
}

function WatchingResult({ watching, onPick }: { watching: Watching; onPick: (keyword: string) => void }) {
  const { keyword, response } = watching;
  const first = response.results[0];
  const siblings = response.siblings ?? [];
  return (
    <Card padding="lg" className="border-warn/30">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="warn" dot>
          Watching
        </Chip>
        <p className="font-semibold text-ink">No AI Overview for &ldquo;{keyword}&rdquo; right now</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        We added it anyway and will keep checking every 3 hours. When an overview appears, tracking starts on its own and you
        get a notification.
      </p>
      {siblings.length > 0 ? (
        <>
          <SectionLabel className="mt-5">Similar searches that show an overview now</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {siblings.map((s) => (
              <button
                key={s.keyword}
                type="button"
                onClick={() => onPick(s.keyword)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-faint px-3 py-1 text-sm font-medium text-brand-strong ring-1 ring-inset ring-brand-soft transition-colors hover:bg-brand-soft"
              >
                {s.keyword}
                {typeof s.search_volume === "number" && (
                  <span className="text-xs font-normal text-brand-strong/70 tabular-nums">{formatCompact(s.search_volume)}/mo</span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Pick one to add it with the same country, language and device.</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">We didn&rsquo;t find similar searches that show an overview yet.</p>
      )}
      {first && (
        <div className="mt-5 border-t border-line pt-4">
          <ButtonLink href={`/queries/${first.tracked_query_id}`} variant="secondary" size="sm" iconRight={<ArrowRightIcon className="h-3.5 w-3.5" />}>
            Open &ldquo;{keyword}&rdquo;
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}
