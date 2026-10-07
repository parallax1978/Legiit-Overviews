// Add a query: keyword, country, language and device, submitted to the add-query Edge Function.
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ErrorCard } from "@/components/ui/feedback";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { NumberBadge } from "@/components/ui/number-badge";
import { RetryButton } from "@/components/ui/retry-button";
import { PageHeader, SectionLabel } from "@/components/ui/typography";
import { getLocations } from "@/lib/queries";
import { AddQueryForm } from "./add-query-form";

export const metadata: Metadata = { title: "Add a query" };

const NEXT_STEPS = [
  "We check Google for an AI Overview on this search, which takes up to a minute.",
  "If one appears, captures start right away and repeat every 3 hours.",
  "Patterns build from the first day. The preliminary report arrives at day 3, the full one at day 7.",
];

export default async function NewQueryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = params.keyword;
  const keyword = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 200) ?? "";
  const { data: locations, error } = await getLocations();

  return (
    <>
      <Link href="/queries" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Queries
      </Link>
      <PageHeader className="mt-4" kicker="New query" title="Add a query" meta="Pick a search, where it's searched from, and on which device." />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        {error || !locations ? (
          <ErrorCard title="The country list didn't load" detail={error} action={<RetryButton />} />
        ) : (
          <AddQueryForm locations={locations} initialKeyword={keyword} />
        )}
        <Card padding="md" className="lg:sticky lg:top-20">
          <SectionLabel>What happens next</SectionLabel>
          <ol className="mt-3 space-y-3">
            {NEXT_STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm leading-6 text-ink-muted">
                <NumberBadge n={i + 1} size="sm" className="mt-0.5" />
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-ink-muted">
            Someone else may already track the same search, country, language and device. Then you share their captures and
            start with their history.
          </p>
        </Card>
      </div>
    </>
  );
}
