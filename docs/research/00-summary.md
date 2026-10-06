# Research summary: what we learned and what it settles

Gathered 2026-10-06. Each bullet is backed by a finding in the numbered files in this folder; the numbers below were fact-checked against primary sources on that date unless marked otherwise.

## 1. Getting the data (see 01)

- Google offers no API for AI Overviews. The Custom Search JSON API never returned them, is closed to new customers, and shuts for everyone on 2027-01-01. Gemini grounding returns Gemini's own answer, not Google's overview.
- Every viable path is a third-party SERP provider. Two shapes exist: single-call browser-rendered capture (DataForSEO with `load_async_ai_overview`, Bright Data `brd_ai_overview=2`, Oxylabs `render=html`) and two-step capture where a short-lived `page_token` must be redeemed within about a minute (SerpApi, SearchApi, HasData, ScrapingDog). SerpApi confirms in writing that the two-step path counts as two searches.
- Only some providers map text chunks to citations. SerpApi, SearchApi, HasData and Bright Data give `reference_indexes` per text block; Oxylabs maps per sentence fragment; DataForSEO attaches references per element and returns full markdown. Serper returns no AI Overview at all.
- DataForSEO is the cheapest fully structured option: $0.0006 per SERP on the Standard queue plus one base price for the async overview, refunded when no async overview exists, so about $0.0012 per capture. SerpApi is $10 to $25 per thousand and carries a $2M Legal Shield from the $150/month Production plan.
- Providers scrape signed out. BrightEdge found signed-out users see 10 to 20 percent fewer overviews and up to 90 percent fewer on e-commerce queries, so buying-intent captures will under-count.
- Self-hosting a scraper is slower, costlier and legally exposed: Google requires JavaScript since January 2025, a residential-proxy test succeeded on 31 of 50 queries, and Google is suing SerpApi under DMCA section 1201.

## 2. Competitors (see 02)

- Thirty-plus vendors sell AI visibility, almost all as brand share-of-voice across many engines. Self-serve daily tracking clusters at $1.20 to $2.00 per tracked prompt per month (Mentions.so $49 to $399, Otterly $29 to $489, Peec roughly $95 to $495). SEO suites bundle it at $3 to $4 per prompt. Raw overview checks retail at a cent each (ZipTie) or two cents (Ahrefs).
- Mentions.so, the tool named in the thread, is a daily brand-mention monitor with a Kanban insights board. Jake Ward lists it on his own site as his offering, so he is a competitor's distribution channel, not an evangelist.
- No vendor found does the full loop: daily full-text capture with per-claim citations, day-to-day diff, frequency analysis of claims, entities, formats and sources, reverse engineering of the cited pages, a brief, and post-publish re-tracking. SEOmonitor and SE Ranking are the strongest on capture alone; ZipTie sells briefs as a $20 add-on; Profound removed its self-serve plans in September 2026.
- Reviewers complain about the same things everywhere: three tools give three answers, scores are opaque, recommendations are generic, prompt caps are tight, tier cliffs are steep, and nobody tells them what to do next. That complaint is steps 3 to 5 of the thread.

## 3. How overviews behave (see 03)

- An overview is a stochastic per-render draw, not a document. Ahrefs (43,000 keywords) found a 70 percent chance the text changes between observations and 45.5 percent of citations swap per update, while meaning stays at 0.95 cosine similarity and 54 percent of entities persist. Two incognito captures two minutes apart differed.
- Intra-day variance is as large as day-to-day variance. A preprint on AI engines (overviews excluded) recommends 7 to 8 renders per day and a 2 to 4 week rolling window for stable source statistics. SISTRIX's weekly panel shows a stable core of domains for 86 percent of prompts with the rest rotating.
- Overlap between cited pages and the organic top 10 collapsed from 76 percent (July 2025) to 38 percent (March 2026) in Ahrefs' data, with other panels at 17 to 19 percent. Ranking does not imply citation, so the organic SERP must be captured alongside every overview.
- Model upgrades cause step changes. When Gemini 3 became the overview model on 2026-01-27 it replaced 42 percent of cited domains and raised sources per overview from 11.6 to 15.2. Baselines must carry a model-era tag.
- Trigger rates now favour the thread's target queries: "best [product]" went from 5 to 83 percent presence in a year, while "buy X" stays near 13 percent; question-form queries trigger at 60 to 65 percent versus about 10 percent for non-questions.
- Being cited is not being recommended. For 100 "best software" queries, self-promotional listicles were cited 323 times but the brand was left out of the recommendation 69 percent of the time.
- Citations are platform-heavy: YouTube, Reddit and Facebook together hold about half of top-50 mention share. Cited passages sit early in the page (55 percent within the first 30 percent). Overviews are not freshness-driven and domain authority correlates near zero with citation.
- A Washington University audit decomposed 98,020 overview claims into atomic claims and found 11 percent unsupported by any citation, which validates the atomic-claim pipeline and warns of an unmatched rate.
- Search Console now has a Generative AI performance report (UK subset 2026-06-03, worldwide 2026-08-31) with impressions only for AI Overviews, AI Mode and Discover AI by page, country, device and date, from 2026-05-18. Whether the Search Analytics API exposes it is unverified.

## 4. The analysis pipeline (see 04)

- Verified Claude prices: Opus 5.5 $4 / $20 per million tokens, Sonnet 5.5 $2 / $10, Haiku 4.5 $1 / $5; the Batch API halves all of them; structured outputs work in batches; caching in batches is best-effort. Haiku 4.5's retirement is "not sooner than 2026-10-15", so model IDs must be aliases in config.
- The right algorithm for "find the patterns" is Microsoft's Claimify recipe: split, select verifiable sentences, disambiguate, decompose into atomic decontextualised claims, as one structured-output call per snapshot, then cluster across days with embeddings (voyage-4-lite or text-embedding-3-small, both $0.02 per million tokens) in pgvector.
- Text diffing is solved (jsdiff 9). Sentence splitting is built into Node via `Intl.Segmenter`.
- For cited pages, Firecrawl is the simplest API-first fetcher (1 credit per page), with Jina Reader and self-hosted Playwright as fallbacks; Defuddle plus Readability extract structure, schema.org data, author and dates in-process.
- Estimated LLM cost: about $0.02 to $0.03 per snapshot for extraction and $0.35 to $0.80 for a full seven-day analysis including ten cited-page analyses and an Opus-generated brief. Token counts are assumptions until measured with `count_tokens`.

## 5. Stack (see 05)

- Next.js 16 App Router on Vercel Pro (Hobby is non-commercial), Neon Postgres with Drizzle 0.45.x pinned (1.0 is still a release candidate; Prisma 8 is too), Better Auth 1.7 with the organization and Stripe plugins, Inngest for scheduling and fan-out with Vercel Workflows as the cost fallback, Stripe Billing, Resend, PostHog plus Sentry.
- Infra cost excluding provider and LLM spend: about $20 per month at zero customers, $150 to $200 at 100, $400 to $550 at 1,000. Inngest's free tier (50,000 executions) runs out far earlier than the "100 customers" assumption once multiple renders per day are used.
- Skip paid boilerplates; scaffold with `create-next-app` and Vercel's MIT SaaS starter patterns. Keep `CLAUDE.md` under 200 lines, pin versions, and seed seven days of fixture snapshots so analysis is testable without spend.

## 6. Legal and platform risk (see 06)

- Google's Terms (effective 2026-07-30) bar automated access that violates robots.txt, and google.com/robots.txt disallows /search. The product must never request google.com and must route everything through providers behind an adapter.
- Google v. SerpApi is live (amended DMCA complaint 2026-08-10; second motion to dismiss pending). Reddit v. SerpApi survived dismissal on 2026-07-31 and kept Perplexity in the case as a direct circumventor, so downstream buyers are not automatically insulated. Vendor legal shields cover the vendor's collection only, never the customer's use.
- DataForSEO's terms bar use that "adversely affects the business interests of the search engine providers"; get written confirmation before relying on it as primary.
- Storing and analysing extracts of cited pages for search and analysis is defensible (Authors Guild v. Google); building a substitute is not (Thomson Reuters v. Ross, affirmed September 2026). Keep structural features and at most five short quotes per page; never display full third-party text.
- Overview text is machine-generated and uncopyrightable in the US, but Google's terms forbid training models on it and overviews can embed licensed images; store text and citations only, never images.
- Do not put Google, AI Overview(s), Gemini or SGE in the product name; "Legiit Overviews" is probably defensible pending counsel. Use the trademark footer.
- EU AI Act Article 50 applies from 2026-08-02: mark generated briefs as AI-generated and require human review. Standard GDPR processor obligations apply.

## 7. Go-to-market (see 07)

- Agencies are the proven paying segment; every competitor has an agency tier. Legiit (launched 2018, bootstrapped, 45 staff, over one million orders, 25,000 freelancers) already sells Command Center at $19 per month and Legiit Leads at $47 to $497 per month with "AI Overview verdicts" on every tier, and six of its fifteen best-selling SEO services in September 2026 were AI Overview or GEO themed.
- The category's free hook is a seven-day no-card trial with 25 to 50 prompts. Opt-in trials convert at about 18 percent; freemium at under 3 percent.
- Credible positioning: the only tool that turns one AI Overview into a page you can rank in it. Credible pricing: free (one query, seven days), roughly $39, $99 and $249 tiers anchored just under the $2-per-prompt norm but including briefs, plus a productised "brief plus build" order fulfilled by Legiit sellers.

## What the research settles (carried into PLAN.md as constraints)

1. Validate before building: a two-week concierge pilot with a CLI and fixtures, selling ten playbooks by hand through Legiit, gates the SaaS build.
2. Capture is a global pool keyed on normalised query, country, language, location, device and provider; customers subscribe to series. Tenancy applies to queries, analyses and briefs, not snapshots.
3. Cadence is a tier feature, and LLM extraction runs only on unique content, because extraction, not scraping, is the cost driver.
4. DataForSEO primary (pending written confirmation on its terms), SerpApi Production fallback, provider health scoring, a product-owned canary set.
5. Snapshot status and variant taxonomy, a fixture corpus in week one, capture days computed in the series' timezone, and minimum sample rules before a report is shown.
6. A standalone own-page matcher module with match levels.
7. Retention: raw payloads 90 days, normalised rows forever, cited-page HTML 14 days, short quotes only, no images, no training.
8. Search Console is a v1.1 secondary signal; render-based tracking is the step-6 signal.
9. Public API, MCP server and share pages expose derived data only.
10. Cost and abuse guardrails ship in the first SaaS sprint.
