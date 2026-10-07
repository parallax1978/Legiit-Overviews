"use client";
// Own page card: the URL and brand names matched against every capture. Saves through the set-own-page
// Edge Function, which parses the page and re-matches the last 28 days, then refreshes the tab's data.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Label, describedBy } from "@/components/ui/form";
import { LinkIcon, XIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { SetOwnPageRequest, SetOwnPageResponse } from "@/lib/types";

const MAX_BRANDS = 10;
const MAX_BRAND_LENGTH = 100;

export interface TrackingOwnPageProps {
  trackedQueryId: string;
  ownUrl: string | null;
  brandNames: string[];
  /** When the own page was last read (own_pages.parsed_at), or null if it never was. */
  parsedAt: string | null;
}

type Outcome = { tone: "good" | "warn"; title: string; body: string };

async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    try {
      const body = (await res?.clone().json()) as { error?: unknown } | undefined;
      if (typeof body?.error === "string" && body.error) {
        if (res?.status === 404) return "This query wasn't found. Reload the page and try again.";
        return body.error.charAt(0).toUpperCase() + body.error.slice(1);
      }
    } catch {
      // Body wasn't JSON.
    }
    if (res?.status === 401) return "Your session ended. Sign in again, then save.";
    return "Saving failed on our side. Try again in a minute.";
  }
  if (error instanceof FunctionsRelayError) return "The request didn't reach our server. Try again in a minute.";
  if (error instanceof FunctionsFetchError) return "We couldn't reach our server. Check your connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function validUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

function cleanBrand(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function TrackingOwnPage({ trackedQueryId, ownUrl, brandNames, parsedAt }: TrackingOwnPageProps) {
  const router = useRouter();
  const [url, setUrl] = useState(ownUrl ?? "");
  const [brands, setBrands] = useState<string[]>(brandNames);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [urlError, setUrlError] = useState<string | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const brandInput = useRef<HTMLInputElement>(null);
  const brandsId = useId();

  /** Adds comma-separated names from text; returns the new list or null when the limit is hit. */
  function addBrands(text: string, current: string[]): string[] | null {
    const next = [...current];
    for (const part of text.split(",")) {
      const name = cleanBrand(part);
      if (!name) continue;
      if (name.length > MAX_BRAND_LENGTH) {
        setBrandError(`Keep each brand name under ${MAX_BRAND_LENGTH} characters.`);
        return null;
      }
      if (next.some((b) => b.toLowerCase() === name.toLowerCase())) continue;
      if (next.length >= MAX_BRANDS) {
        setBrandError(`Add at most ${MAX_BRANDS} brand names.`);
        return null;
      }
      next.push(name);
    }
    setBrandError(null);
    return next;
  }

  function commitDraft(): string[] | null {
    if (!draft.trim()) return brands;
    const next = addBrands(draft, brands);
    if (next) {
      setBrands(next);
      setDraft("");
    }
    return next;
  }

  function onBrandKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && brands.length) {
      setBrands(brands.slice(0, -1));
      setBrandError(null);
    }
  }

  function onBrandChange(value: string) {
    if (value.includes(",")) {
      const parts = value.split(",");
      const rest = parts.pop() ?? "";
      const next = addBrands(parts.join(","), brands);
      if (next) setBrands(next);
      setDraft(rest);
      return;
    }
    setDraft(value);
  }

  async function save(nextUrl: string | null) {
    setError(null);
    setOutcome(null);
    setUrlError(null);
    const finalBrands = commitDraft();
    if (!finalBrands) return;
    const target = nextUrl?.trim() || null;
    if (target && !validUrl(target)) {
      setUrlError("Enter the full address, starting with https://");
      return;
    }
    const body: SetOwnPageRequest = { tracked_query_id: trackedQueryId, own_url: target, brand_names: finalBrands };
    setSaving(true);
    try {
      const { data, error: fnError } = await createClient().functions.invoke<SetOwnPageResponse>("set-own-page", { body, timeout: 150_000 });
      if (fnError) throw fnError;
      const matches = data?.matches ?? 0;
      const found =
        matches > 0
          ? `${plural(matches, "capture")} from the last 28 days ${matches === 1 ? "cites" : "cite"} your page or ${matches === 1 ? "names" : "name"} your brand.`
          : "No capture from the last 28 days cites your page or names your brand yet. We check every new capture.";
      if (!target) {
        setOutcome({
          tone: "good",
          title: "Saved without a URL",
          body: finalBrands.length ? `We keep checking the answer for your brand names. ${found}` : "Tracking is off until you add a URL or a brand name.",
        });
        setUrl("");
      } else if (data?.parsed) {
        setOutcome({ tone: "good", title: "Saved and your page was read", body: found });
        setUrl(target);
      } else {
        setOutcome({
          tone: "warn",
          title: "Saved, but we couldn't read the page",
          body: `Citations still match by URL. To see which section Google quoted, make sure the page loads without a login. ${found}`,
        });
        setUrl(target);
      }
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(await functionErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save(url);
  }

  const urlHint = "The page you want Google to cite for this search.";
  const brandHint = `Press Enter or type a comma to add a name. Up to ${MAX_BRANDS}.`;
  const busy = saving || refreshing;

  return (
    <Card padding="lg">
      <CardHeader
        title="Your page"
        description="Every capture's citations are checked against this URL, and the answer text against your brand names."
        action={
          ownUrl && parsedAt ? (
            <span className="text-xs text-ink-muted">
              Page read <LocalTime value={parsedAt} format="relative" />
            </span>
          ) : null
        }
      />
      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-5">
        <Field id="own-url" label="Page URL" hint={urlHint} error={urlError}>
          <Input
            id="own-url"
            name="own_url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com/best-form-builder"
            icon={<LinkIcon />}
            invalid={Boolean(urlError)}
            disabled={busy}
            aria-describedby={describedBy("own-url", { hint: urlHint, error: urlError })}
          />
        </Field>

        <div className="space-y-1.5">
          <Label htmlFor={brandsId}>Brand names</Label>
          <div
            className={cn(
              "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 transition-[border-color,box-shadow] focus-within:ring-2",
              brandError ? "border-bad focus-within:border-bad focus-within:ring-bad/15" : "border-line focus-within:border-brand focus-within:ring-brand/15",
              busy && "bg-surface-alt",
            )}
            onClick={() => brandInput.current?.focus()}
          >
            {brands.map((b) => (
              <span key={b.toLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-faint py-0.5 pl-2 pr-1 text-xs font-medium text-brand-strong">
                <span className="truncate">{b}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBrands(brands.filter((x) => x !== b));
                    setBrandError(null);
                  }}
                  aria-label={`Remove ${b}`}
                  className="rounded p-0.5 text-brand hover:bg-brand-soft"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              ref={brandInput}
              id={brandsId}
              value={draft}
              onChange={(e) => onBrandChange(e.target.value)}
              onKeyDown={onBrandKey}
              onBlur={() => commitDraft()}
              disabled={busy || brands.length >= MAX_BRANDS}
              placeholder={brands.length ? (brands.length >= MAX_BRANDS ? "" : "Add another") : "Your brand, e.g. Acme Forms"}
              aria-invalid={brandError ? true : undefined}
              aria-describedby={brandError ? `${brandsId}-error` : `${brandsId}-hint`}
              className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-ink-soft disabled:cursor-not-allowed"
            />
          </div>
          {brandError ? (
            <p id={`${brandsId}-error`} role="alert" className="text-xs font-medium text-bad">
              {brandError}
            </p>
          ) : (
            <p id={`${brandsId}-hint`} className="text-xs text-ink-muted">
              {brandHint}
            </p>
          )}
        </div>

        {error && (
          <Alert tone="bad" title="Not saved">
            {error}
          </Alert>
        )}
        {outcome && !error && (
          <Alert tone={outcome.tone} title={outcome.title} onDismiss={() => setOutcome(null)}>
            {outcome.body}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={busy}>
            {saving ? "Saving" : refreshing ? "Updating" : "Save"}
          </Button>
          {ownUrl && (
            <Button variant="ghost" disabled={busy} onClick={() => void save(null)}>
              Remove URL
            </Button>
          )}
          {saving && (
            <span role="status" className="text-xs text-ink-muted">
              Reading your page and re-checking the last 28 days of captures. This can take up to a minute.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
