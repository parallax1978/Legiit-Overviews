// Marketing home: plum hero with a sample report, proof strip, how it works, what you get, evidence, FAQ, CTA.
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckList } from "@/components/ui/feedback";
import { BellIcon, CheckIcon, ChevronRightIcon, FileTextIcon, GaugeIcon } from "@/components/ui/icons";
import { NumberBadge } from "@/components/ui/number-badge";
import { Eyebrow } from "@/components/ui/typography";
import { EvidenceSample, HeroReportCard, PageSample, PatternsSample } from "./_components/samples";

export const metadata: Metadata = {
  title: { absolute: "Legiit Overviews: see what Google's AI Overview cites, then get cited" },
};

const START = "/login?next=%2Fqueries%2Fnew";
const NOTE = "Sign in with your email. The first capture runs while you wait, then every 3 hours.";

const PROOF = ["Captured every 3 hours", "Every count opens its evidence", "Counted in the database, not guessed", "Alerts when your page is cited"];

const STEPS = [
  {
    title: "Pick a query that shows an overview",
    body: "Enter a search. We check Google for an AI Overview and, when there isn't one, suggest close searches that do show one.",
    foot: "About a minute",
  },
  {
    title: "Capture it every 3 hours",
    body: "Eight renders a day on desktop, mobile or both, so the patterns rest on dozens of captures instead of one screenshot.",
    foot: "56 renders in the first week",
  },
  {
    title: "Count what keeps showing up",
    body: "Each capture is split into claims, brands and sources. The database counts how often each one appears.",
    foot: "Every count shows its n",
  },
  {
    title: "Study the cited pages",
    body: "The most cited pages are parsed and measured: where the answer starts, tables, lists, evidence, and the passage Google quoted.",
    foot: "Top 10 cited pages per query",
  },
  {
    title: "Get the brief",
    body: "The answer to open with, the topics and brands to cover, the format to use, and what no cited page offers yet.",
    foot: "Preliminary at day 3, full at day 7",
  },
  {
    title: "Track your citation",
    body: "Add your URL. Every capture is checked for it, and you hear when it is first cited, lost, or back again.",
    foot: "Alerts in the app and by email",
  },
];

const EXTRAS = [
  {
    icon: <FileTextIcon />,
    title: "The brief",
    body: "The sentence to open with, the topics and brands to cover with how often each appears, the format to copy, an outline, and ideas no cited page has yet. Exports as Markdown.",
    foot: "Every item links to its evidence",
  },
  {
    icon: <GaugeIcon />,
    title: "Draft score",
    body: "Paste a draft or a URL. It is measured the same way as the cited pages and scored 0 to 100 against the brief, with fixes in priority order.",
    foot: "Topic, brand and format coverage",
  },
  {
    icon: <BellIcon />,
    title: "Tracking and alerts",
    body: "Add your URL and brand names. Each capture is checked for your page at six match levels, with the heading Google quoted from it.",
    foot: "First seen, lost and regained",
  },
];

const FAQ = [
  {
    q: "Which searches can I track?",
    a: "Any search without operators, in 10 countries, on desktop, mobile or both. If a search doesn't show an AI Overview today, we keep checking it every 3 hours and suggest similar searches that do.",
  },
  {
    q: "Why every 3 hours?",
    a: "AI Overviews change between most renders, and they change as much within a day as across days. Eight captures a day gives 56 in the first week, which is enough for the percentages to hold up.",
  },
  {
    q: "Is the AI making up the numbers?",
    a: "No. Claude reads each capture and matches its claims to ones seen before. The counting happens in the database, and every number opens the captures and sentences behind it.",
  },
  {
    q: "What is in the brief?",
    a: "The one or two sentences to open with and a word budget, the topics and brands to cover with their recurrence, the format and outline, the evidence the cited pages use, and ideas Google has no page for yet.",
  },
  {
    q: "How do you know my page was cited?",
    a: "Every citation in every capture is compared with your URL: the exact URL, the same page after redirects, the same section, the same subdomain, the same domain, or your brand named in the answer. You also see which heading Google quoted.",
  },
  {
    q: "What if Google changes how overviews work?",
    a: "We watch every tracked search at once. When citations shift across the board on the same day, that is recorded as a Google-wide change and lost-citation alerts are held back, so a platform change isn't reported as your loss.",
  },
  {
    q: "Do I share data with other people tracking the same search?",
    a: "Captures are shared, your settings are not. Everyone tracking the same search, country, language and device reads one set of captures, so a popular search comes with its history from the first day. Your own page and alerts stay private.",
  },
];

function Cta({ dark = false }: { dark?: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 text-center">
      <ButtonLink href={START} size="xl" glow iconRight={<ChevronRightIcon className="h-5 w-5" />}>
        Start Tracking
      </ButtonLink>
      <p className={dark ? "max-w-md text-xs leading-relaxed text-white/60" : "max-w-md text-xs leading-relaxed text-ink-muted"}>{NOTE}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="hero-dark overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <Eyebrow tone="soft">AI Overview tracking, with the evidence</Eyebrow>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Track what Google&rsquo;s AI Overview says,
              <span className="text-gradient block">then get cited.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/75">
              Add a search. Every 3 hours we capture its AI Overview, count what keeps coming back, and take apart the pages it
              cites. Then you get the brief, and an alert when your page is in.
            </p>
            <form className="mt-8 max-w-xl" action="/queries/new" method="get">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  name="keyword"
                  required
                  maxLength={200}
                  placeholder="best crm for small business"
                  aria-label="A search to track"
                  autoComplete="off"
                  className="h-14 min-w-0 appearance-none rounded-full border border-white/15 bg-white/10 px-5 text-[17px] text-white outline-none backdrop-blur transition-colors placeholder:text-white/40 focus:border-brand-soft focus:bg-white/15 sm:h-12 sm:flex-1 sm:text-base"
                />
                <button type="submit" className={buttonClasses({ size: "lg", glow: true, className: "h-14 shrink-0 sm:h-12" })}>
                  Start Tracking
                  <ChevronRightIcon />
                </button>
              </div>
              <p className="mt-3 max-w-md text-xs leading-relaxed text-white/60">{NOTE}</p>
            </form>
          </div>
          <HeroReportCard />
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <ul className="mx-auto grid max-w-6xl gap-x-8 gap-y-2 px-4 py-4 text-sm text-ink-muted sm:flex sm:flex-wrap sm:items-center sm:justify-center">
          {PROOF.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <CheckIcon className="text-brand" />
              {p}
            </li>
          ))}
          <li className="text-ink-muted sm:ml-2">From the team behind Legiit</li>
        </ul>
      </section>

      <section id="how" className="scroll-mt-14 border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Six steps from a search to a cited page</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            The manual process, run for you every 3 hours: pick the query, watch it, count what repeats, study the pages it
            cites, write a better page, and check that it gets in.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-card border border-line bg-surface-alt p-5">
                <div className="flex items-center gap-3">
                  <NumberBadge n={i + 1} tone="solid" size="lg" />
                  <h3 className="text-base font-bold leading-snug">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{s.body}</p>
                <p className="mt-3 text-xs font-medium text-brand-strong">{s.foot}</p>
              </li>
            ))}
          </ol>
          <Cta />
        </div>
      </section>

      <section id="features" className="scroll-mt-14">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <Eyebrow>What you get</Eyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Five things on every query</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            A sample for &ldquo;best crm for small business&rdquo; in the United States, on desktop. Your queries get the same
            report, built from their own captures.
          </p>
          <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <PatternsSample />
            <PageSample />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {EXTRAS.map((x) => (
              <Card key={x.title} padding="lg" className="flex flex-col">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-faint text-brand">{x.icon}</span>
                <h3 className="mt-4 font-bold">{x.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{x.body}</p>
                <p className="mt-auto pt-3 text-xs font-medium text-brand-strong">{x.foot}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <Eyebrow>Inside a report</Eyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Every number opens its evidence</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            A percentage on its own proves nothing. Click any count and the captures behind it open, newest first, with the
            sentence Google wrote and the sources it attached.
          </p>
          <div className="mt-8 grid gap-8 md:grid-cols-[1.15fr_1fr] md:gap-12">
            <EvidenceSample />
            <div>
              <p className="text-sm font-semibold text-brand">Behind every number</p>
              <CheckList
                tone="good"
                className="mt-3"
                items={[
                  "The share and the sample size, written as 82% · n=56",
                  "The captures that count toward it, newest first",
                  "The exact sentence, with the sources Google attached",
                  "A confidence label: low under 10 renders, high above 20",
                ]}
              />
              <ul className="mt-8 grid gap-6 border-t border-line pt-8">
                <li>
                  <p className="font-semibold">Claude reads, the database counts</p>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">
                    Claude splits each overview into short claims and matches them to ones seen before. Every count is a database
                    query over the window you pick: the first 7 days, then rolling 7 and 28 days.
                  </p>
                </li>
                <li>
                  <p className="font-semibold">Nothing is dropped</p>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">
                    Renders without an overview count as absent and failed captures are left out of the denominator, so a share always
                    says what it is a share of.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-5xl scroll-mt-14 px-4 py-16">
        <Eyebrow>Questions</Eyebrow>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Before you start</h2>
        <dl className="mt-8 divide-y divide-line rounded-card border border-line bg-white shadow-card">
          {FAQ.map((f) => (
            <div key={f.q} className="grid grid-cols-1 gap-2 px-6 py-5 md:grid-cols-3 md:gap-6">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="text-sm leading-6 text-ink-muted md:col-span-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="hero-dark">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Find out what the AI Overview cites</h2>
          <p className="mt-3 text-white/70">The first capture takes about a minute. The patterns build from there.</p>
          <Cta dark />
          <p className="mt-6 text-xs text-white/50">
            Already have an account?{" "}
            <Link className="underline hover:text-white" href="/login">
              Sign In
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
