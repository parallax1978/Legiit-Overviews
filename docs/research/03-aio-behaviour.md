# How AI Overviews behave (what the studies say)

_Research dimension: How Google AI Overviews behave (official docs + published studies) and what that implies for the metrics the product must compute_

Gathered 2026-10-06. See [README.md](README.md) for method and caveats.

## Summary

Google's own documentation (Search Central "AI features" page and the "Optimizing your website for generative AI features" guide, last updated 2026-07-10) states that AI Overviews and AI Mode are grounded via RAG in the core Search ranking systems, use a "query fan-out" of concurrent related sub-queries, require only that a page be indexed and snippet-eligible, ignore llms.txt and need no special markup, and are reported in Search Console only as impressions (no clicks) through the new Generative AI performance report. The single most important empirical fact for the product is that an AIO is a stochastic, per-render draw, not a fixed document: Ahrefs (43k keywords, 16+ captures each) found a 70% chance the text changes between consecutive captures with 2.15-day average persistence and 45.5% of citations swapping per update, while the semantic meaning stays at 0.95 cosine similarity and 54% of entities persist. Intra-day variance is as large as day-to-day variance (a 10-render test cited the same page in 6 of 9 renders; SE Ranking found 9.2% three-way URL overlap in three same-day AI Mode parses; Schulte et al. found within-24h Jaccard 0.32–0.43 equal to day-to-day 0.34–0.42), so "one capture per day for 7 days" under-samples; the academically derived answer is 7–8 renders per prompt per day and a 2–4 week rolling window to get standard error below ~0.05–0.08. At the same time SISTRIX's 17-week weekly panel shows AIOs have a stable core (86% of prompts have a persistent domain core; the non-core rotates ~89%/week; AIO domains were fully stable for just over half of queries), which is precisely the "what keeps showing up" signal the thread describes, so the product's core metric should be per-URL/domain/claim/entity survival rate across renders rather than a snapshot. The overlap between AIO citations and the organic top 10 has collapsed and depends heavily on method: Ahrefs measured 76.1% in July 2025 but 37.9% in March 2026 (31.2% from positions 11–100 and 31.0% beyond 100), BrightEdge ~17%, SE Ranking 19% after Gemini 3, Authoritas GOA 42.2%, so the product must capture the organic SERP alongside every AIO and must not assume ranking implies citation. Model upgrades cause step changes: Gemini 3 became the default AIO model on 2026-01-27 and replaced 42.4% of previously cited domains while raising sources per AIO from 11.55 to 15.22, so baselines must be tagged by model era. Trigger behaviour favours exactly the queries the thread targets: BrightEdge saw "best [product]" AIO presence jump from 5% to 83% (Nov 2024 to Nov 2025) while "buy X" stays ~13%; Semrush's 10M-keyword study shows informational share of AIO queries falling from 91.3% to 57.1% while commercial rose to 18.57% and transactional to 13.94%; question-form queries trigger at ~60–65% vs ~10% for non-questions. Citation sources are dominated by platforms (Ahrefs Sept 2026 mention share: YouTube 22.9%, Reddit 18.5%, Facebook 10.1%, google.com 8.8%, Wikipedia 4.0%), Lily Ray showed that being cited is not being recommended (self-promotional "best" listicles were cited 323 times but the brand was omitted from the recommendation 69% of the time), and a WashU audit of 98,020 atomic claims found 11% of AIO claims unsupported by their citations, which both validates an atomic-claim-decomposition pipeline and warns that claim-to-citation mapping will have a non-trivial unmatched rate. Format evidence says AIO answers are short (Surfer: 157 words average, 78% contain a list, exact query present only 5.4% of the time), cited passages sit early in the page (CXL: 55% within the first 30%), and AIOs are not freshness-driven (Ahrefs: AIO-cited pages average 1,432 days old, 16 days older than organic), so the reverse-engineering module should measure answer position, list/table structure and entity coverage rather than recency or domain authority (Surfer's 5M-citation study found authority correlations near zero). Location matters modestly within a country (SE Ranking: 47% of queries cite identical domains across five US cities; 6.3% have zero overlap, concentrated in legal/health/real estate) and heavily across countries, and AIOs render for logged-out stateless browsers, so each tracked query must be pinned to a country, city, device and logged-out state. Finally, AI Mode and AI Overviews cite largely different sets (SE Ranking 10.7% URL overlap; SISTRIX 17% domain overlap; AI Mode rotates 56% of domains weekly vs. AIO's stable core), so they must be tracked as separate surfaces.

## Fact-check results

Independent skeptics tried to refute the top plan-critical claims. Where a claim was `partially_wrong`, the corrected claim below is authoritative.

### Verdict: `confirmed`

**Original claim.** Google officially states that AI Overviews and AI Mode are grounded in its core Search ranking systems via retrieval-augmented generation and use a 'query fan-out' of concurrent related sub-queries; a page only needs to be indexed and snippet-eligible, no special markup/AI files are needed, llms.txt is ignored, and snippet controls (nosnippet, data-nosnippet, max-snippet, noindex) govern what can appear.

**Corrected claim.** Google officially states (Search Central "AI features and your website", last updated 2025-12-10; "Optimizing your website for generative AI features", last updated 2026-07-10) that AI Overviews and AI Mode are grounded via retrieval-augmented generation that relies on "our core Search ranking systems to retrieve relevant, up-to-date web pages from our Search index", and that both features "may use a 'query fan-out' technique — issuing multiple related searches across subtopics and data sources" (defined as "a set of concurrent, related queries generated by the model"). "There are no additional requirements to appear in AI Overviews or AI Mode"; a page must only be "indexed and eligible to be shown in Google Search with a snippet". No new machine-readable files, AI text files, markup, or special schema.org structured data are needed; creating LLMS.txt files "will neither harm nor help your site's visibility or rankings in Google Search, as Google Search ignores them"; "There's no ideal page length"; "Structured data isn't required"; and Google warns to "be wary of third-party tools that promise ranking success". Preview controls nosnippet, data-nosnippet, max-snippet, and noindex limit what is shown from pages in these features.

**Checker notes.** Verified word-by-word via WebFetch on 2026-10-06. All quoted phrases in the claim match the live pages: fan-out "may use" language and "no additional requirements" on the ai-features page (note: its last-updated stamp is 2025-12-10, not more recent); RAG definition, query fan-out definition, LLMS.txt "neither harm nor help ... Google Search ignores them", "no ideal page length", "Structured data isn't required", and "Be wary of third-party tools" on the optimization guide (last updated 2026-07-10, as the claim states). The ai-features page lists exactly nosnippet, data-nosnippet, max-snippet, noindex as the controls. The 2025-05-20 blog post independently confirms fan-out ("issuing a multitude of queries simultaneously"). Caveat: Google says "may use" fan-out, so it is not guaranteed for every query, and the "sub-queries are unseen" build implication is an inference, not a Google statement. A WebSearch for post-January-2026 contradicting announcements could not be run because the per-turn search budget was exhausted; no contradicting evidence was found on the primary sources themselves, and the AI Mode feature still exists under that name on the current page. A follow-up search for 2026 announcements (e.g., any renaming of AI Mode or new publisher controls) is recommended if the builder wants extra certainty.

Evidence:
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- https://blog.google/products/search/google-search-ai-mode-update/

### Verdict: `confirmed`

**Original claim.** AIO answer text changes roughly every 2 days (70% chance of change between consecutive captures) and about 45% of citations swap on each update, but the underlying meaning is stable (0.95 cosine similarity) and 54% of named entities persist.

**Corrected claim.** Per Ahrefs' Brand Radar study (published 11 Nov 2025; ~43,000 keywords with at least 16 recorded AI Overviews each, observed over roughly one month in autumn 2025), AIO answer text had a 70% chance of changing between consecutive observations and a mean "persistence" of 2.15 days; 45.5% of cited URLs changed per update (54.5% URL overlap); 37% of AIOs contained named entities (~3 per response) with 54% entity overlap between consecutive versions; semantic cosine similarity between versions averaged 0.95; and change rate showed no correlation with search volume (Spearman −0.014). Important caveat stated by Ahrefs: checks were not daily, so these are observation-bounded figures and "the real citation change rate is much higher" — i.e. 2.15 days / 70% are lower bounds on volatility, not a natural refresh cadence. The study is now ~11 months old (Nov 2025 data) and no newer Ahrefs update was found.

**Checker notes.** Primary source check: every number in the claim matches the Ahrefs article verbatim (70% pointwise change rate; "persistence of 2.15 days on average"; 54.5% URL overlap / 45.5% citation change; 37% of AIOs with entities, ~3 per response, 54% entity overlap; cosine similarity 0.95; Spearman −0.014 vs search volume; 43,000 keywords with ≥16 AIOs over about a month). Author Louise Linehan, data by Xibeijia Guan, published 2025-11-11. The claim's caveat about capture cadence is actually understated: Ahrefs explicitly says "Since our checks weren't daily, it's likely that the real citation change rate is much higher," so the 2.15-day/70% figures are floors, and the derived "~3 distinct AIO versions in 7 days" build implication is likely an underestimate. Staleness check: the WebSearch budget for this turn was exhausted (shared limit), so I could not run the extended search for post-January-2026 contradicting studies; a check of Semrush's AI Overviews study found no volatility/churn data (it is a Sept 2024 snapshot). No evidence found that contradicts the figures, but they describe late-2025 AIO behaviour and should be re-validated empirically by the product itself (the proposed Jaccard/survival/entity/cosine metrics are the right way to do that). Minor wording: the article says 54% "entity overlap consistency," which the claim renders as "54% of named entities persist" — acceptable paraphrase.

Evidence:
- https://ahrefs.com/blog/ai-overview-change/

### Verdict: `partially_wrong`

**Original claim.** Intra-day stochastic variance is as large as day-to-day variance, so a single daily capture is a weak sample; peer-reviewed guidance is 7–8 renders per prompt per day and a 2–4-week rolling window to get standard error below ~0.05–0.08.

**Corrected claim.** Intra-day stochastic variance is roughly as large as day-to-day variance, so a single daily capture is a weak sample. The guidance comes from an arXiv preprint (Schulte, Bleeker & Kaufmann, "Don't Measure Once", arXiv 2604.07585v1, April 2026 — NOT peer-reviewed), which studied ChatGPT, Gemini, Google AI Mode and Perplexity (Jan 24–Mar 20 2026; simultaneous runs Mar 21–25 2026; Google AI Overviews explicitly excluded). Findings: day-to-day source Jaccard 0.336–0.423; same-24h repeated runs 0.321–0.434 ("intra-day stochastic variation alone accounts for most of the observed instability"); bootstrap: single run SE 0.370 ("essentially uninformative"), n=7 SE 0.081 (95% CI ±0.158), n=8 SE 0.062 (±0.121); rolling window 10 days SE 0.107, 14 days SE 0.080 (±0.157, "sufficient for directional monitoring but not for fine-grained brand comparison"), 21 days SE 0.053 (±0.105), 28 days SE 0.033 (±0.065). The paper recommends at least 7 runs/prompt/day for brand visibility and at least 8 when source-level coverage matters; a 3–4-week window (not 2 weeks) is needed to get SE to ~0.05 or below. AIO-specific corroboration is informal/non-peer-reviewed: a thegeolab.net 10-render same-afternoon logged-out test (Aug 5 2026) cited the target page in 6 of 9 resolved renders with 9–19 sources per render, recommending at least 5 renders across at least 2 access configurations and reporting citation rate plus sample size rather than a boolean; SE Ranking's three same-day (June 20 2025) AI Mode parses of 10,000 keywords showed only 9.2% three-way exact-URL overlap (18.5–19% pairwise). Build implication (an inference, not a source finding): implement the "7 days" minimum as >=7 days x >=3 renders/day (~21+ samples) for a "preliminary pattern" report, flag 21–28 days as the "stable baseline" (14 days is directional only), store every render, and treat every citation/entity metric as a frequency with a sample size.

**Checker notes.** Primary-source check (arXiv HTML, fetched today) confirms nearly every number in the claim verbatim: Jaccard ranges, the "intra-day stochastic variation alone accounts for most of the observed instability" quote (Section 5), single-run SE 0.370 "essentially uninformative" (Appendix J.3), n=7 SE 0.081 (±0.158), n=8 SE 0.062, and rolling-window SEs at 10/21/28 days. The paper does recommend >=7 runs/prompt/day (brand visibility) and >=8 (source-level coverage). Engines, dates and AIO exclusion match. The thegeolab.net E101 test and SE Ranking study figures also match (SE Ranking run date is June 20 2025, published Aug 29 2025). Two material corrections: (1) the claim labels the guidance "peer-reviewed" — it is an arXiv preprint (v1, April 8 2026) with no venue listed; (2) "2–4-week rolling window to get SE below ~0.05–0.08" overstates the lower bound — the paper's Appendix K.3 gives 14 days SE 0.080 and calls it "sufficient for directional monitoring but not for fine-grained brand comparison"; SE ~0.05 requires 21 days and 0.033 requires 28. The "build implication" (7 days x 3 renders) is the researcher's own inference, not something any source recommends; the paper's prescription is 7–8 runs per day, and thegeolab's is >=5 renders across >=2 configurations. Caveat on method (2): the per-turn web search budget was exhausted before my search ran, so I could not search for newer contradicting studies or later paper versions (v2+) after April 2026; findings rest on the three cited sources only. No AIO-specific data exists in the arXiv paper, so applying its run counts to Google AI Overviews is extrapolation.

Evidence:
- https://arxiv.org/html/2604.07585v1
- https://thegeolab.net/ai-overview-citation-variance/
- https://seranking.com/blog/ai-mode-research/

## Findings

### 1. Google officially states that AI Overviews and AI Mode are grounded in its core Search ranking systems via retrieval-augmented generation and use a 'query fan-out' of concurrent related sub-queries; a page only needs to be indexed and snippet-eligible, no special markup/AI files are needed, llms.txt is ignored, and snippet controls (nosnippet, data-nosnippet, max-snippet, noindex) govern what can appear.

_Confidence: high_ **[plan-critical]**

As of 2026-10-06 the Search Central page 'AI features and your website' says both features 'may use a "query fan-out" technique — issuing multiple related searches across subtopics and data sources — to develop a response' and that 'There are no additional requirements to appear in AI Overviews or AI Mode'. The 'Optimizing your website for generative AI features' guide (last updated 2026-07-10) defines RAG as 'relying on our core Search ranking systems to retrieve relevant, up-to-date web pages', defines query fan-out as 'a set of concurrent, related queries generated by the model', states 'LLMS.txt files...will neither harm nor help...as Google Search ignores them', 'There's no ideal page length', 'Structured data isn't required', and 'Be wary of third-party tools that promise ranking success'. Build implication: the cited set for a query is the union of retrievals across unseen sub-queries, so the product should (a) capture the head-query organic SERP AND infer likely sub-queries (PAA, related searches, the AIO's own section headings) and (b) never claim deterministic 'ranking' in AIOs; it should also check robots/snippet directives on the user's page as a pre-flight.

Sources:
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- https://blog.google/products/search/google-search-ai-mode-update/

### 2. AIO answer text changes roughly every 2 days (70% chance of change between consecutive captures) and about 45% of citations swap on each update, but the underlying meaning is stable (0.95 cosine similarity) and 54% of named entities persist.

_Confidence: high_ **[plan-critical]**

Ahrefs (Brand Radar) analysed 'over 43,000 keywords—each with at least 16 recorded AI Overviews' over one month. Findings: '70% chance of changing' between consecutive observations; 'persistence of 2.15 days on average'; '45.5% of citations change when AI Overviews update'; 'Only 54.5% of URLs overlap on average'; 37% of AIOs contained entities (~3 per response) and '54% of entities stay consistent'; semantic consistency '0.95 out of 1.0'; search-volume correlation with change rate −0.014 (no caching-by-popularity effect). Caveat: the article does not state the capture cadence, so '2.15 days' may be bounded by sampling frequency. Build implication: in 7 days expect ~3 distinct AIO versions and ~2–3 citation reshuffles; compute (1) citation Jaccard between consecutive captures, (2) per-URL survival rate, (3) entity recurrence, (4) embedding cosine drift; treat claims (semantic content) as the stable layer and wording/citations as the noisy layer.

Sources:
- https://ahrefs.com/blog/ai-overview-change/

### 3. Intra-day stochastic variance is as large as day-to-day variance, so a single daily capture is a weak sample; peer-reviewed guidance is 7–8 renders per prompt per day and a 2–4-week rolling window to get standard error below ~0.05–0.08.

_Confidence: high_ **[plan-critical]**

Schulte et al., 'Don't Measure Once' (arXiv 2604.07585, Jan 24–Mar 20 2026, 4 engines: ChatGPT, Gemini, Google AI Mode, Perplexity; Google AIO explicitly excluded): day-to-day source Jaccard 0.34–0.42; within-24h repeated runs 0.32–0.43 ('intra-day stochastic variation alone accounts for most of the observed instability'); bootstrap: n=7 runs SE<0.10 (95% CI ±0.158), n=8 SE 0.062; single run SE 0.370 'essentially uninformative'; rolling window 10 days SE 0.107, 21 days 0.053, 28 days 0.033. AIO-specific corroboration: a 10-render same-afternoon test (Aug 5 2026, logged-out) cited the target page in 6 of 9 resolved renders with 9–19 sources per render; SE Ranking's three same-day AI Mode parses of 10,000 keywords had only 9.2% three-way URL overlap. Build implication: the '7 days' minimum should be implemented as ≥7 days × ≥3 renders/day (≈21+ samples) for a 'preliminary pattern' report, with 14–28 days flagged as the 'stable baseline'; store every render, not a daily winner; every citation/entity metric is a frequency with a sample size, never a boolean.

Sources:
- https://arxiv.org/html/2604.07585v1
- https://thegeolab.net/ai-overview-citation-variance/
- https://seranking.com/blog/ai-mode-research/

### 4. Only ~38% of AIO-cited pages rank in the organic top 10 for the same query as of March 2026 (down from 76% in July 2025), with ~31% ranking 11–100 and ~31% beyond 100; other 2026 panels put top-10 overlap at 17–19%.

_Confidence: high_ **[plan-critical]**

Ahrefs, 2 Mar 2026, 863K keyword SERPs / 4M AIO URLs: top-10 37.9%, 11–100 31.2%, beyond 100 31.0% (organic-blue-links-only: 37.1% / 26.2% / 36.7%); YouTube was 18.2% of beyond-top-100 citations and 5.6% of all citations. Ahrefs' July 2025 study (1.9M citations, top-3 citations only) found 76.10% top-10, 9.5% 11–100, 14.4% not ranking; median rank of cited URLs was 3. BrightEdge (Feb 2025–Feb 2026, 9 industries): 'Only about 17% of sources cited in AIOs also rank in the organic top 10' (by industry 9.3% restaurants to 24.0% healthcare). SE Ranking (Feb 2026, 100K keywords): 'Only 19% of AIO sources overlap with the top 10'. Older/alternative definitions: Authoritas GOA score 42.2% (Aug 2024); Semrush July 2025 67% URL / 86% domain; Surfer 52%; seoClarity '>99% of AIOs contain at least one top-10 source' (a per-AIO, not per-citation, measure). Build implication: capture the organic top 20 with every AIO render and compute a GOA-style score (share of cited URLs in top 10/20) per query and per day; show 'cited but not ranking' pages prominently since they reveal fan-out sub-queries; do not use rank as a proxy for citation.

Sources:
- https://ahrefs.com/blog/ai-overview-citations-top-10/
- https://ahrefs.com/blog/search-rankings-ai-citations
- https://www.brightedge.com/resources/weekly-ai-search-insights/ai-overviews-one-year-presence-size-citing
- https://seranking.com/blog/gemini-3-impact-on-ai-overviews/
- https://www.authoritas.com/blog/why-generative-to-organic-alignment-scores-goa-score-matter-when-optimising-for-ai-overviews

### 5. Model upgrades cause step changes in citations: when Gemini 3 became the default AIO model on 2026-01-27 it replaced 42.4% of previously cited domains and raised sources per AIO from 11.55 to 15.22 (+31.8%).

_Confidence: high_ **[plan-critical]**

SE Ranking, 100,000 keywords across 20 niches, compared January 2026 (pre), late January (post-launch with bug), February 2026 (bug fixed): '42.4% of domains cited before Gemini 3 no longer appear'; '51.7% of new domains gained citations'; unique domains 89,262→97,574 (+9.3%); among the top 500 cited domains only one disappeared; AIO appearance 60.85%→59.73%; top domains unchanged (YouTube 10.74%, Reddit 4.01%, Facebook 1.85%, Indeed 1.28%, Quora 1.27%, Wikipedia 1.14%). Build implication: store a 'model era'/regime tag per capture and run change-point detection on citation-set Jaccard and sources-per-AIO across all tracked queries; a global step change should invalidate pre-change baselines and trigger a re-baseline rather than being reported as 'your page lost'.

Sources:
- https://seranking.com/blog/gemini-3-impact-on-ai-overviews/

### 6. AIO trigger rates have expanded sharply into commercial 'best X' queries: 'best [product]' queries went from 5% to 83% AIO presence between Nov 2024 and Nov 2025, while 'buy X' (13%) and bare product names (14%) stay low; the intent mix of AIO-triggering queries shifted from 91.3% informational to 57.1% over 2025.

_Confidence: high_ **[plan-critical]**

BrightEdge Black Friday analysis (same keyword set, Nov 2024 vs Nov 2025): overall 34%→46%; 'Best [product]' 5%→83% (+78pp); transactional 'buy air fryer' 13%; pure product names 14%; eCommerce 16% vs all other industries 58%; lower-volume keywords 60% vs high-volume 28%. Semrush 10M+ keywords Jan–Nov 2025: trigger rate 6.49% (Jan) → 24.61% (Jul) → 15.69% (Nov); intent share of AIO queries Oct 2024→Oct 2025: informational 91.3%→57.1%, commercial 8.15%→18.57%, transactional 1.98%→13.94%, navigational 0.74%→10.33%; ~60% of AIO keywords have ≤100 monthly searches. Ahrefs (232.8M US desktop crawls, Jul–Sep 2026): AIOs on 82.91% of branded and 78.3% of non-branded desktop results by late Sept 2026. Build implication: the product should run a 'trigger check' (N renders) at query-add time and show trigger probability; treat 'no AIO shown' as a first-class daily state; default query templates should be 'best X', 'X vs Y', and question forms; aggregate trigger rate per vertical for onboarding expectations.

Sources:
- https://www.brightedge.com/resources/weekly-ai-search-insights/black-friday-2024-vs-2025-what-a-year-of-testing-taught-google-about-ai-overviews
- https://www.semrush.com/blog/semrush-ai-overviews-study/
- https://ahrefs.com/blog/ai-overviews-on-branded-searches/

### 7. Question-form and longer queries trigger AIOs far more often: ~60–65% for question-form vs ~10% for non-questions; 8% for 1–2-word queries vs 53% for 10+ words.

_Confidence: high_ **[plan-critical]**

WashU audit (arXiv 2605.14021, 55,393 trending queries, Mar 13–Apr 21 2026, stateless logged-out Chrome, us-east-1): overall activation 13.7%; 'Question-form queries trigger AIOs at 64.7% versus 9.5% for non-question queries'; 'how' 84.3%, 'why' 73.4%, 'who' 47.9%; single-word 9.9% vs six+ words 38.7%. Pew Research (900 US adults, 68,879 searches, March 2025): 18% of searches produced an AI summary; 8% of 1–2-word searches vs 53% of 10+ words; 60% of question-word queries. Build implication: query-suggestion UI should steer users toward long, question-form or 'best X for Y' phrasings and warn on short head terms; the trigger-probability estimate can use word count and question-word features as priors before any capture.

Sources:
- https://arxiv.org/html/2605.14021v1
- https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/

### 8. Despite per-render churn, AIOs have a stable 'core' of citations: across 17 weekly samples, 86% of prompts kept a stable core of domains while non-core citations rotated ~89% per week, and AIO domain sets were completely stable week-to-week for just over half of queries (vs AI Mode rotating 56%/week and ChatGPT 74%/week).

_Confidence: medium_ **[plan-critical]**

SISTRIX panel (82,619 prompts, six countries, weekly, Dec 17 2025–Apr 8 2026, as reported by PPC Land from SISTRIX's Apr 30 2026 newsletter): '86% of all prompts' had a stable core; non-core rotated '89% per week'; AI Overviews 'completely stable' for just over 50% of queries; AI Mode rotates '56% of citations per week'; 'Only 1.4% of news articles...remain in the citation set on a permanent basis'; drift 54–59% across countries with no decline over 17 weeks. Longer-horizon corroboration: Authoritas (11,203 keywords, desktop, Aug 2024–Jan 2025) AIO ranking volatility 0.68 at 8 weeks / 0.73 at 13 weeks vs organic 0.49/0.55, text volatility only 0.18/0.21, and Spearman correlation between organic and AIO volatility 0.09 ('change independently'). Profound: 59.3% of AIO-cited domains differed between June and July 2025. Build implication: the product's headline 'what Google consistently includes' output should split citations into CORE (present in ≥80% of renders) vs ROTATING, at both URL and domain level, and compute a Citation Stability Score = mean pairwise Jaccard across the window; the brief should be built around CORE sources only.

Sources:
- https://ppc.land/sistrix-april-2026-ai-citation-drift-and-the-death-of-keyword-research/
- https://www.authoritas.com/blog/serp-organic-and-ai-overview-volatility-research
- https://www.tryprofound.com/blog/ai-search-volatility

### 9. Being cited is not being recommended: for 100 B2B 'best [category] software' queries, self-promotional listicles were cited 323 times but the brand behind the page was left out of the AIO's recommendation 69% of the time (224/323), and 74% of prompts showed this pattern.

_Confidence: high_ **[plan-critical]**

Lily Ray (Substack, sampled Apr 15, May 15 and Jun 8 2026): ~1 in 5 'best software' queries showed no AIO; 184 self-promoting listicle pages across 146 brands identified; most-cited domains for 'best' queries were Reddit (rising), Forbes Advisor (surging since Mar 2026), YouTube, G2 and Capterra; conclusion: 'Google has at least started to decouple what it will cite as a source from who it will actually recommend', with recommendations anchored to 'how much of the web is talking about you'. Build implication: the pattern-finder must extract two separate entity sets per render—RECOMMENDED entities (named in the answer, with any 'best for X' label) and CITED sources—and compute entity→source linkage (which citations support which entity claim); the brief generator should warn against ranking yourself #1 and should quantify third-party/UGC coverage of the user's brand as a gap.

Sources:
- https://lilyraynyc.substack.com/p/why-calling-yourself-the-best-could

### 10. AIO citations are dominated by platform/UGC domains: in Sept 2026 YouTube (22.9%), Reddit (18.5%), Facebook (10.1%), google.com (8.8%), Instagram (5.6%), Quora (4.7%) and Wikipedia (4.0%) led Ahrefs' top-50 mention share, with the top three alone at 51.5%; LinkedIn was only 0.6%.

_Confidence: high_

Ahrefs, >3M US queries, Sept 2026 ('mention share' = a domain's citations as % of the summed citations of the top 50). Independent corroboration: WashU trending-query audit Mar–Apr 2026: youtube.com 5.49%, en.wikipedia.org 4.39%, facebook.com 3.68%, instagram.com 3.65%; top 5 hostnames only 20.0% and top 100 57.1% of all citations; 14.2% of AIO reference URLs were social/UGC vs 41.4% of first-page organic URLs. SE Ranking Feb 2026: YouTube 10.74%, Reddit 4.01%. BrightEdge: when Reddit is cited in an AIO, YouTube co-appears 29%, Quora 9.4%, Facebook 8.8%. Ahrefs branded panel: external citations in branded AIOs go mostly to Wikipedia (71.9%), YouTube (38.6%), LinkedIn (22.8%), not the brand site. Build implication: classify every cited domain into platform classes (video, forum/UGC, social, encyclopedia, review platform, editorial, vendor, government) and report 'displaceable' editorial/vendor citations separately from platform citations the user's page cannot replace; the brief should include a 'platform presence' section (YouTube video, Reddit thread) when those classes dominate the CORE set.

Sources:
- https://ahrefs.com/blog/most-cited-domains-ai-overviews/
- https://arxiv.org/html/2605.14021v1
- https://seranking.com/blog/gemini-3-impact-on-ai-overviews/
- https://www.brightedge.com/resources/weekly-ai-search-insights/google-ai-overviews-vs-chatgpt-reddit-usage
- https://ahrefs.com/blog/ai-overviews-on-branded-searches/

### 11. AIO claims can be decomposed into atomic claims and verified against cited pages with high precision, but ~11% of claims are not supported by any cited page (7.0% omitted, 2.7% contradicted).

_Confidence: high_

WashU audit (arXiv 2605.14021): 98,020 claims across 7,583 AIOs ('mean 12.9 per AIO, median 12'); labels Clear 84.61%, Vague 4.36%, Omitted 6.98%, Incorrect 2.66%, Ambiguous 1.39%; '88.97% are consistent...11.03% unsupported'; only 41.9% of AIOs were perfectly grounded; claim-extraction pipeline precision 98.26%, recall 83.23%, F1 90.12%; verification agreed with humans on 98/100 (κ=0.94); source quality and claim fidelity are independent (r≈0.045); time-varying pages (weather, availability) are a known failure mode. A smaller SaaS study (31 keywords, Aug 2026) found only 64.7% of AIO claims directly supported by a cited source. Build implication: implement exactly this pipeline—LLM atomic-claim extraction per render → cluster claims across renders by semantic similarity → claim recurrence count → verify each claim against fetched text of the cited pages → store the matched passage; expect a 10–35% unmatched rate and surface it as 'claims with no supporting citation' (opportunities to be the source).

Sources:
- https://arxiv.org/html/2605.14021v1
- https://www.position.digital/blog/ai-overview-citation-source-analysis/

### 12. Expect roughly 5–16 citations per AIO depending on year, method and whether the AIO is expanded; the median in 2026 is ~8–15.

_Confidence: high_

Semrush (200K keywords, Sept 2024): average 11 links per AIO (max 302). Surfer (405,576 AIOs): 5 sources on average, '90% of the time, Google lists 8 or fewer'. SE Ranking (June 2024): pre-click ~2.2 links (most common 1), post-click ~5.5 (most common 4). SE Ranking five-city study (Apr 2025): 13.28–13.41 links per response, 9.81–9.90 unique domains. SE Ranking Feb 2026 (post-Gemini 3): 15.22 sources. WashU (Mar–Apr 2026): median 8, mean 8.1, range 1–32. Semrush July 2025: AIO sidebar averages ~3 unique domains vs 7 for AI Mode. Build implication: the scraper must capture the fully expanded AIO (click 'Show more'/'Show all') and record both inline/per-claim citation chips and the full source list; store citation position/order per render (RBO/rank-weighted stability is lower than Jaccard, so order matters).

Sources:
- https://www.semrush.com/blog/ai-overviews-study/
- https://surferseo.com/blog/ai-overviews-study/
- https://seranking.com/blog/google-ai-overviews-research/
- https://seranking.com/blog/ai-overviews-us-states-comparison-research/
- https://seranking.com/blog/gemini-3-impact-on-ai-overviews/
- https://arxiv.org/html/2605.14021v1
- https://www.semrush.com/blog/ai-mode-comparison-study/

### 13. AIO answers are short and list-heavy and rarely contain the exact query: 157 words on average (99% under 328), 78% contain a list (61% unordered, 12% ordered, 21% no list), and the exact query appears in the text only 5.4% of the time.

_Confidence: high_

Surfer, 405,576 English AIOs. Semrush 2024: 119 words desktop / 91 mobile. seoClarity: average AIO text fell ~70% from ~5,300 characters (Jul 2025) to ~1,600 (Aug 2025). SE Ranking Apr 2025: 1,759–1,772 characters, 253–255 words. BrightEdge: average AIO height exceeds 1,200 px on desktop (Feb 2026). Build implication: the 'format fingerprint' per render should record word count, list type and item count, presence of a table, number of sections/headings, 'best for X' label structure and whether entities are bolded/linked; recurrence of the format across renders tells the brief which structure to mirror (e.g. ranked bullet list with per-item 'best for' qualifier for 'best X' queries).

Sources:
- https://surferseo.com/blog/ai-overviews-study/
- https://www.semrush.com/blog/ai-overviews-study/
- https://www.seoclarity.net/research/ai-overviews-impact
- https://seranking.com/blog/ai-overviews-us-states-comparison-research/

### 14. Cited passages sit early in the page: 55% of AIO-cited passages came from the first 30% of the source page (21% in the first 10%, 27% in 10–20%), and 89% of AI-cited passages are self-contained.

_Confidence: medium_

CXL mapped 100 AIO citations to their position in the source page (published Mar 6 2026, updated Sep 17 2026): 0–10% 21%, 10–20% 27%, 20–30% 7%, 30–40% 9%, 40–60% 15%, 60–80% 11%, 80–100% 10%. CXL also relays Kevin Indig's ChatGPT finding of 44.2% from the first 30% (the Search Engine Land primary returned 403 and was not opened). Geekytech 613-query B2B study (ChatGPT/Gemini/AIO/Bing, 11,000+ citations traced to passages): '89% of cited passages were self-contained'; cited pages median 2,151 words, 27 headings, 30 list items; 41% included at least one table; 65% had FAQ-style sections. Build implication: the reverse-engineering module should fuzzy-match each AIO claim to the cited page's text, record the passage's relative character offset, enclosing element (p/li/td/h2-adjacent), 'words before first direct answer' and a self-containedness score; aggregate these across CORE sources to produce the 'how quickly they answer' and 'structure' findings the thread calls for.

Sources:
- https://cxl.com/blog/google-ai-overview-citation-sources/
- https://www.geekytech.co.uk/resources-tools/ai-citation-study-2026/

### 15. Commercial queries are answered from listicles while informational queries are answered from educational articles; ranked 'Top-N' lists dominate listicle citations.

_Confidence: medium_

Position.digital (31 SaaS keywords, 92 renders, US, Aug 2026): commercial intent → listicles 37.6% of citations; informational → educational articles 70.2%; YouTube 14.5% of all citations (explainer 46%, roundup 29%); first-position citation stable 86% of the time while 52% of keywords changed sources on repeat. Evertune (40,000+ URLs ChatGPT cited over 60 days, ~50 categories, Apr 2026): '50% of ChatGPT citations are listicles. Of that, 58% are ranked lists'; typical cited page 941 words, 4 H2s, 2 H3s, 15 external links, 10 images; YouTube's citation share 'roughly tripled on Google AI Mode and AI Overview since October' 2025. A widely reported Evertune/SEL figure of 63% listicles across ~400M citations was only seen in a search summary (SEL returned 403) and is unverified. Build implication: page-type classification (listicle/ranked list, comparison, guide, product page, forum thread, video, review platform) should be part of the citation fingerprint, and the brief should default to a ranked list with explicit criteria and a comparison table for 'best X' queries.

Sources:
- https://www.position.digital/blog/ai-overview-citation-source-analysis/
- https://www.evertune.ai/resources/ai-search-statistics-for-generative-engine-optimization

### 16. Google AI Overviews are not freshness-driven: AIO-cited URLs averaged 1,432 days since publication, 16 days OLDER than organic results (1,416), unlike ChatGPT (958–1,023 days) and Perplexity (1,166).

_Confidence: high_

Ahrefs, 28 Jul 2025, 16.975M cited URLs across ChatGPT, Perplexity, Gemini, Copilot, AIO and organic: AI assistants overall 25.7% 'fresher' (1,064 vs 1,432 days), but AIO was the exception. Days since last update: AI assistants 909 vs organic 1,047. Build implication: record published/modified dates for cited pages (for diffing) but do not weight recency heavily in the AIO brief; the 'give Google something new' lever is original data/claims, not a new date stamp.

Sources:
- https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content

### 17. Domain authority does not predict AIO citation: across ~5M cited URLs the correlation between PageRank/Domain Score and citation frequency is ≈0 (−0.065 to +0.010), and the median AI-cited page in a B2B study had zero page-level backlinks.

_Confidence: high_

Surfer (17 Sep 2026; ~5M unique citation URLs, 20,000 prompts, 3 months; AI Mode, AI Overviews, ChatGPT, Perplexity): PageRank −0.065, Harmonic Centrality +0.010, Domain Score −0.051; after removing the top 5% of domains correlations collapse toward zero; conclusion 'close enough to zero to be noise'. Geekytech: AI-cited URLs median 0 backlinks, 53% no referring domains, vs Google top-10-never-cited median 2. Position.digital: DR correlation 0.15. Build implication: do not gate or weight the brief by DA/DR; competitive analysis should focus on page content, structure and entity coverage; a cheap 'authority' field is optional context only.

Sources:
- https://surferseo.com/blog/domain-authority-impact-on-ai-citations/
- https://www.geekytech.co.uk/resources-tools/ai-citation-study-2026/
- https://www.position.digital/blog/ai-overview-citation-source-analysis/

### 18. Within one country, location changes AIO sources modestly: across five US cities AIO appearance varied <1 point (27.75–28.66%), 47.05% of queries cited identical domain sets everywhere, but 6.34% had zero overlap (mostly legal, healthcare, real estate); across countries answers are rebuilt almost entirely.

_Confidence: high_

SE Ranking (100,013 keywords, Denver/Houston/LA/NYC/DC, Apr 15 2025): identical sources 47.05%; ≥50% domain match 53%+; zero overlap 6.34%; 9.81–9.90 unique domains and 13.28–13.41 links per response; text length within 1%. Geekytech (613 B2B queries, US vs UK): cross-country domain overlap Gemini 0.192, ChatGPT 0.267 vs organic 0.387; 'none of 613 keywords achieving a similarity score above 0.8'. Google serves AIOs to signed-out users and the WashU audit collected all AIOs with fresh stateless browser profiles, so logged-out capture is viable and the cleanest baseline. Build implication: each tracked query must be pinned to country + city (uule/geo) + device + logged-out state and never mixed across these; offer a per-query 'location sensitivity' check (compare 2–3 cities once) and flag local-intent verticals.

Sources:
- https://seranking.com/blog/ai-overviews-us-states-comparison-research/
- https://www.geekytech.co.uk/resources-tools/ai-citation-study-2026/
- https://arxiv.org/html/2605.14021v1
- https://support.google.com/websearch/answer/14901683

### 19. AI Mode and AI Overviews cite largely different sources and must be tracked as separate surfaces: 10.7% URL / 16% domain overlap (SE Ranking), 17% same domains (SISTRIX), with AI Mode rotating 56% of domains weekly.

_Confidence: medium_

SE Ranking (10,000 keywords, June 20 2025, logged-out US): AIM vs AIO URL overlap 10.7% (56.2% of keywords ≤10%; 13.8% none), domain overlap 16%; AI Mode averages 12.6 URLs per response, 90.8% as block links; AI Mode vs organic top 10: 14% URL / 21.9% domain. Semrush (5,000 keywords, July 2025) found higher overlap (58% URL / 88% domain), so the number is method-dependent, but all sources agree the sets differ materially. SISTRIX: AI Mode 56%/week domain rotation vs AIO's stable core. GetMentions (June 2026, 7 days daily; covers AI Mode, not AIO): AI Mode 75.9% daily source churn, 40.4% one-day retention, 2.6% seven-day retention. Build implication: v1 should track AIO only (more stable, the thread's target); AI Mode is a separate, noisier surface to add later with its own sampling budget.

Sources:
- https://seranking.com/blog/ai-mode-research/
- https://www.semrush.com/blog/ai-mode-comparison-study/
- https://ppc.land/sistrix-april-2026-ai-citation-drift-and-the-death-of-keyword-research/
- https://www.getmentions.ai/blog/ai-citation-volatility-study

### 20. Search Console's new Generative AI performance report (rolled out June–Aug 2026) shows impressions only, for AI Overviews and AI Mode, by page/country/device/date, with no clicks and no stated API access—so the product's post-publish tracking cannot rely on GSC for click or query-level AIO data.

_Confidence: medium_

Search Console Help: 'The generative AI performance report includes impressions for AI Overviews and AI Mode'; 'Impressions are how many times links to your site were shown to a user in a generative AI feature on Google Search'; dimensions Pages, Countries, Dates, Devices; eligibility requires 'enough impressions in generative AI features'. Google's 'AI features' page says AI feature traffic is otherwise blended into the Web search type. Ahrefs' tracking guide notes Google 'doesn't give you tools in Search Console or GA4 to identify AI Overview impressions, citations, or clicks' (pre-report) and recommends recording citations, mentions, citation position and response text per check. Build implication: step 6 ('does your page start appearing?') must be done by the product's own renders (page-URL match in cited set, mention of brand entity, citation position); optionally let users paste/export GSC generative-AI impressions as a secondary signal; verify whether the Search Analytics API exposes the new report before promising an integration.

Sources:
- https://support.google.com/webmasters/answer/16984139?hl=en
- https://developers.google.com/search/docs/appearance/ai-features
- https://ahrefs.com/blog/how-to-track-ai-overviews/

### 21. Vertical trigger rates vary from <3% to ~88%, so the product should set expectations per vertical at onboarding.

_Confidence: high_

BrightEdge (Feb 2025→Feb 2026, 9 industries): overall ~30%→48% (+58%); Healthcare 72%→88%, Education 18%→83%, B2B Technology 36%→82%, Restaurants 10%→78%; eCommerce 16% vs 58% for other industries (Nov 2025). Semrush Nov 2025 by category: Science 25.96%, Computers & Electronics 17.92%, People & Society 17.29%; Real Estate, Shopping, Arts & Entertainment <3%. Conductor (118M keywords, Sept 2025): 16% overall; 59% desktop / 39% mobile; top industries Life Sciences 40%, Education Services 39%. Authoritas (10K keywords, Dec 2024): problem-solving 74%, specific question 69%, navigational 0%; Telecoms 56%, Beauty 14%. Build implication: maintain a vertical-level trigger-rate table (updated from the product's own captures) and show it when a user adds a query; suppress 'no AIO yet' anxiety with the expected rate.

Sources:
- https://www.brightedge.com/resources/weekly-ai-search-insights/ai-overviews-one-year-presence-size-citing
- https://www.brightedge.com/resources/weekly-ai-search-insights/black-friday-2024-vs-2025-what-a-year-of-testing-taught-google-about-ai-overviews
- https://www.semrush.com/blog/semrush-ai-overviews-study/
- https://www.conductor.com/academy/ai-overviews-analysis/
- https://www.authoritas.com/blog/ai-overview-user-intent-research

### 22. Google says AIOs are 'built to only show information that is backed up by top web results', limits user-generated content where it could mislead, and aims not to show AIOs for hard-news topics; Google also recommends multimodal content, semantic HTML, Merchant Center and Business Profile data for product/local visibility.

_Confidence: high_

Liz Reid, 30 May 2024: 'AI Overviews are powered by a customized language model...integrated with our core web ranking systems'; 'built to only show information that is backed up by top web results'; 'we aim to not show AI Overviews for hard news topics'. The 2026 optimization guide: 'Add high-quality images and video'; 'Try to use semantic HTML'; use 'Merchant Center feeds' and 'Google Business Profiles'; 'Don't just recycle what others on the internet have already said'. Build implication: the brief's 'something NEW' section is aligned with Google's own stated preference for non-commodity content; for product/local queries the brief should include structured product/business data as an action item; news/YMYL-crisis queries should be flagged as unlikely to trigger.

Sources:
- https://blog.google/products/search/ai-overviews-update-may-2024/
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

### 23. Long-horizon URL survival in AI citations is low: a three-wave longitudinal study across five engines including AIO found only 10.6% of 1,127 cited URLs persisted across all waves over ~28 days, and 57–62% of AI-cited domains were absent from Google/Bing top 20.

_Confidence: low_

Digital Authority Partners (reported via search results; the primary page returned HTTP 403 and was not opened, so treat as secondary): 119 of 1,127 URLs in all three waves (10.6%); max cross-platform domain overlap 17%. Consistent direction with Profound (59.3% AIO domain drift in one month) and SISTRIX (non-core rotates ~89%/week). Build implication: 'winning sources' should be defined by survival across a rolling 2–4-week window, and the user's own page should be scored on survival rate after publishing, not on first appearance.

Sources:
- https://www.tryprofound.com/blog/ai-search-volatility
- https://ppc.land/sistrix-april-2026-ai-citation-drift-and-the-death-of-keyword-research/

## Recommendations from this dimension

- Treat every AIO as a per-render sample: capture ≥3 renders per query per day (logged-out, pinned country/city/device, fully expanded 'Show more'), store every render verbatim (answer HTML/text, per-claim citation chips, full source list with order, organic top-20, PAA/related searches, timestamp, model-era tag), and present all metrics as frequencies with sample sizes, never booleans.
- Define the '7 days' as 7 days × ≥3 renders (≈21 samples) for a 'preliminary pattern' report and 14–28 days for a 'stable baseline' (per Schulte et al.: 10 days SE≈0.11, 21 days ≈0.05, 28 days ≈0.03); keep the window rolling after publish.
- Core metrics to compute per query: (1) Trigger rate = renders with AIO / renders; (2) Citation Stability Score = mean pairwise Jaccard of cited-URL sets (and domain sets) across renders; (3) per-URL and per-domain Survival Rate, bucketed CORE (≥80% of renders) / RECURRING (40–80%) / ROTATING (<40%); (4) Claim Recurrence via LLM atomic-claim extraction → semantic clustering → count across renders; (5) Entity Recurrence (NER + alias resolution) split into RECOMMENDED entities vs CITED domains, with entity→citation linkage; (6) Semantic Drift = embedding cosine between consecutive renders (expect ~0.95; alert below ~0.85 as a real 'opinion change'); (7) Format Fingerprint (word count, list type/count, table presence, section headings, 'best for' labels); (8) GOA score = share of cited URLs in organic top 10/20; (9) day-to-day diff view (claims/entities/citations added, dropped, reordered).
- Build the reverse-engineering module around passage matching: for each CORE cited page, fetch and extract text, fuzzy-match each supported AIO claim to a passage, record relative position (expect ~55% in the first 30%), enclosing element (paragraph/list item/table cell/under which heading), words-before-first-direct-answer, self-containedness, page type (ranked listicle, comparison, guide, product, forum, video, review platform), entity coverage, tables/lists count, evidence/data presence, published/modified dates (for context only—AIO is not freshness-driven), and schema types; aggregate into 'what they have in common' and 'gaps between sources'.
- Classify every cited domain into platform classes (video, forum/UGC, social, encyclopedia, review platform, editorial, vendor, government) and report 'displaceable' editorial/vendor citations separately from platform citations (YouTube/Reddit/Facebook/Quora dominate at 50%+ of top-50 share); when platform classes dominate the CORE set, the brief should add 'platform presence' actions (a YouTube video, a Reddit thread) rather than only a page.
- Implement model-regime change detection: track sources-per-AIO and global citation Jaccard across all tracked queries; a step change (like Gemini 3 on 2026-01-27 replacing 42% of cited domains) should auto-re-baseline and be shown as a platform event, not as the user's page losing.
- Make 'no AIO shown' a tracked state and run a trigger-probability check at query-add time using word-count and question-form priors (question-form ~60–65% vs ~10%; 'best X' ~83% vs 'buy X' ~13%), plus a vertical trigger table; steer users toward 'best X', 'X vs Y' and question phrasings.
- Separate 'cited' from 'recommended' everywhere in the UI and in the brief: measure whether the user's brand is named in the answer, whether their URL is cited, and whether both co-occur; warn that self-ranking 'best' listicles are cited but the brand is omitted 69% of the time, and quantify third-party/UGC mentions of the user's brand as a gap.
- Expect ~11% (trending queries) to ~35% (niche SaaS) of AIO claims to have no supporting citation; surface 'unsupported claims' as explicit opportunities for the user's page to become the source, and use the WashU-style five-label verification (Clear/Vague/Omitted/Incorrect/Ambiguous) in the claim→citation mapper.
- Track AI Overviews only in v1; add AI Mode later as a separate surface with its own (higher) sampling budget, since URL overlap with AIO is ~11–17% and AI Mode rotates ~56% of domains weekly.
- Post-publish tracking should be render-based (URL in cited set, brand entity in answer, citation position, survival rate over a rolling 2–4 week window) rather than GSC-based; optionally ingest the Search Console Generative AI performance report (impressions only, by page/country/device/date) as a secondary signal after verifying API availability.
- Do not weight domain authority or publish date in the brief; weight entity coverage, answer-first structure, ranked list/table format for commercial queries, and original data/claims that no CORE source currently supports.

## Open questions

- What is Ahrefs' actual capture cadence behind the '2.15-day persistence' figure? If captures were every ~1.5–2 days, true AIO persistence could be shorter (the 10-render test and SE Ranking's same-day parses suggest per-render variance), which would raise the recommended renders-per-day.
- Does Google's Search Console API (Search Analytics) expose the new Generative AI performance report (impressions for AIO/AI Mode by page/country/device)? The Help page and blog archive do not say; this determines whether a GSC integration is feasible for step 6.
- How does query fan-out manifest observably—can the AIO's section headings, PAA questions and 'related searches' be used to reconstruct the sub-queries well enough to explain 'cited but not ranking' pages (62% of citations in Ahrefs' March 2026 data)? No published study has validated a reconstruction method.
- Which 'core vs rotating' threshold is right for AIO specifically? SISTRIX's weekly panel found a stable core for 86% of prompts, but no daily, AIO-only, multi-render study has published survival distributions; the product should calibrate thresholds from its own first months of data.
- How much do mobile and desktop AIOs differ in citations and text for the same query? Studies report different trigger rates (Conductor 59% desktop / 39% mobile share; Semrush 119 vs 91 words) but none I opened quantified citation-set overlap between devices.
- Is the widely cited 'Evertune: 63% of ~400M citations are listicles' figure accurate for Google AIO specifically? The Search Engine Land primary returned 403; only ChatGPT-specific numbers (50% listicles, 58% ranked) were verified on Evertune's site.
- Does logged-in personalisation (Search history, AI Mode personal context) materially change AIO citations versus logged-out capture? Google documents personal context for AI Mode but publishes nothing on AIO personalisation magnitude; a small controlled test (logged-in vs logged-out, same city) would settle the capture-mode decision.
- How often do AIOs change intra-day on a schedule (cache refresh) vs purely stochastically? Ahrefs found no search-volume correlation (−0.014), but no study has published time-of-day effects; capture times should be randomised and logged so the product can answer this itself.
