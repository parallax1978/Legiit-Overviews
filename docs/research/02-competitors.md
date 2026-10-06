# Competitive landscape

_Research dimension: Competitive landscape for an AI-Overview tracking + pattern-analysis + content-brief SaaS (as of 2026-10-06)_

Gathered 2026-10-06. See [README.md](README.md) for method and caveats.

## Summary

As of 2026-10-06 the AI-visibility category is crowded (30+ vendors, $29 to $3,000+/mo) but almost entirely organised around brand share-of-voice across many engines, not around winning one Google AI Overview. Every tool I checked tracks Google AI Overviews as one engine among several, most refresh daily, and most store cited URLs per prompt, but only a handful demonstrably store the full AI Overview answer text per day (SEOmonitor, SE Ranking via cached SERPs and its API, ZipTie, AccuRanker's keyword table), and none I could find maps citations to individual claims, computes claim/entity/format frequency across a run of daily snapshots, or reverse-engineers the most-cited pages into a brief. Content output exists but is bolted on: ZipTie sells briefs as a $20/mo add-on, Writesonic/Promptwatch/Goodie/Evertune generate articles, Profound's AI Marketer goes "insight to brief to finished content" at enterprise prices, and SEO suites (Surfer, Frase, Clearscope, Semrush) analyse Google's top-10 organic pages, not the AI Overview's cited pages. Mentions.so, the tool Jake Ward names in the thread (and lists on jakeward.io), is a $49-$399/mo daily brand-mention monitor with a Kanban "insights" board; it does not do his loop either, which is the clearest signal the loop is white space. Pricing clusters tightly: self-serve multi-engine daily tracking costs about $1.2-$2.0 per tracked prompt per month (Mentions.so $1.33-$1.99, Otterly $1.22-$1.93, Peec ~$1.41-$1.90, Promptwatch $1.63-$1.90, Writesonic $1.58-$2.00), SEO-suite add-ons cost $3-$4 per prompt (Semrush $3.96, Surfer $3.64, Goodie $3.33), and raw AIO-only daily checks are cheap (ZipTie $0.30/mo per daily prompt-engine at $0.01/check, Ahrefs $0.02/check, SE Visible $0.50/prompt for 5 engines). Entry points have fallen to $29/mo (Otterly 15 prompts, Promptmonitor 25 prompts), and Profound quietly removed its $99/$399 self-serve plans in September 2026, leaving only a free trial and Enterprise. Review and press complaints are consistent: three tools give three answers for the same prompts (Digiday), scores are opaque vanity metrics, recommendations are generic, prompt caps are tight (Semrush 25, Otterly 15), tier cliffs are steep, and users explicitly ask for "clearer guidance on which actions to take" and a content workflow. That is precisely steps 3-5 of Jake's process, so the credible wedge is a narrow, query-centric product that charges for the analysis and brief rather than for the scrape, priced around $29-$49 entry, $99 pro, $249-$299 agency, with AIO (and later AI Mode) only, locale/device-aware capture, multiple samples per day to handle non-determinism, and an API/MCP from day one. Confidence is high on list prices I read from vendor pages, medium on Otterly and Peec (client-rendered pricing; dated third-party sources), and medium on the "nobody does the full loop" claim because I cannot see inside paid dashboards.

## Fact-check results

Independent skeptics tried to refute the top plan-critical claims. Where a claim was `partially_wrong`, the corrected claim below is authoritative.

### Verdict: `partially_wrong`

**Original claim.** No competitor I could verify does Jake Ward's full loop (daily AIO capture with full text + per-claim citations -> day-to-day diff -> LLM frequency analysis of recurring claims/entities/formats/sources -> reverse-engineering of the most-cited pages -> content brief -> post-publish re-tracking). The closest partial implementations are SEOmonitor (full AIO text + all citation sources stored daily, desktop and mobile, no LLM analysis or briefs), SE Ranking (cached SERP copies; API returns answer text + sources, no analysis), ZipTie (full answer + sources kept, LLM Trends, briefs as a $20/mo add-on, 'Content Impact since the day you published'), and Writesonic (daily tracking, citation analysis, Action Center, AI articles).

**Corrected claim.** Among the competitors checked (SEOmonitor, SE Ranking, ZipTie, Writesonic, Profound, Rankscale, Scrunch, Otterly), none documents Jake Ward's full loop (daily AIO capture with full text + per-claim citations -> day-to-day text diff -> LLM frequency analysis of recurring claims/entities/formats/sources -> reverse-engineering of the most-cited pages -> content brief -> post-publish re-tracking); a wider market sweep for newer entrants could not be completed, so this is "none found", not "none exists". Closest partials: SEOmonitor captures "the full AIO answer, including content hidden behind the 'Show more' button" daily on both devices and "extract[s] all citation sources"; its change view compares "the selected date with the previous one" (a scorecard plus a Trend Explainer), with no text diff, LLM analysis or briefs. SE Ranking's GET /v1/project-management/airt/prompts/answer returns text, sources (url + position), brands and organic_urls (Google AI Overview only), but the full text field is retained only 30 days (presence metrics one year) and nothing maps sources to claims. ZipTie "archives full answers and sources for historical comparison", has an Action Center that ranks gaps, a Verify step to "track which engines cite your published content and measure impact over time", and a Content Generation add-on at $20/mo per context giving 8 briefs and 4 finished pieces a month into a shared pool. Writesonic offers "Daily tracking. All platforms.", Citation Analysis ("Top cited pages, competitor citations, source type breakdowns (media, blogs, forums, UGC)") and a "Full Action Center: content, citations, technical". A therankmasters roundup (updated May 25, 2026) names no tool with native answer diffs and treats saving prompt output and sources as a manual step. Caveat: paid dashboards were not inspected.

**Checker notes.** Primary-source check (pass 1): SEOmonitor quotes confirmed verbatim (full AIO incl. Show more, daily on both devices, all citation sources, comparison with previous date); page also has a Trend Explainer, Share of Voice and landing-page citation tracking, but no text diff, LLM analysis or briefs. SE Ranking endpoint confirmed as GET .../airt/prompts/answer with fields text, sources, brands, organic_urls; the claim omits that the text field is retained only 30 days, which weakens it as a "cached full text stored daily" partial. ZipTie pricing confirmed at $20/mo per context, 8 briefs + 4 finished pieces (claim's "4 content pieces" is close enough); however the exact quotes "keeps the full answer and the sources behind it", "LLM Trends" and "Content Impact since the day you published" did not appear on the fetched homepage or pricing page (homepage says it "archives full answers and sources for historical comparison" and "measure impact over time"), so those quotes are unverified as worded. Writesonic quotes confirmed. therankmasters date (May 25, 2026) and "no native diff / manual snapshots" confirmed. Pass 2 (newer/contradicting sources): could not be run because the shared WebSearch budget for this turn was exhausted; Profound, Rankscale, Scrunch and Otterly pages were not re-fetched within the call cap. Therefore the universal negative ("no competitor does the full loop") remains unverified beyond the named vendors and should be framed as "none found among those checked". Core vendor facts are not refuted.

Evidence:
- https://help.seomonitor.com/en/articles/9375479-daily-ai-overview-insights
- https://seranking.com/api/project/ai-result-tracker/
- https://ziptie.ai/
- https://ziptie.ai/pricing/
- https://writesonic.com/ai-visibility
- https://www.therankmasters.com/insights/ai-visibility/best-ai-visibility-tools-answer-change-detection

### Verdict: `partially_wrong`

**Original claim.** Typical self-serve price is $1.2-$2.0 per tracked prompt per month for daily, multi-engine tracking; SEO-suite add-ons run $3-$4 per prompt; raw AIO-only daily checks retail at roughly $0.30-$0.62 per prompt per month. Entry tiers now start at $29/mo.

**Corrected claim.** Typical self-serve list price is roughly $1.2-$2.0 per tracked prompt per month for daily tracking (verified today: Mentions.so $49/25=$1.96, $99/50=$1.98, $199/100=$1.99, $399/300=$1.33, all 'Updated daily', though the $49 Starter covers only 3 LLMs; Otterly Lite $29/15=$1.93, Standard $189/100=$1.89, Premium $489/400=$1.22, but Google Gemini and Google AI Mode are paid add-ons at $9-$149/mo each, so full multi-engine coverage on Otterly costs more than the base per-prompt figure). SEO-suite bundles run about $3-$4 per included prompt (Semrush AI Visibility Toolkit $99/25=$3.96; Semrush One Starter 50 prompts), but Semrush sells marginal capacity at $60 per 50 prompts = $1.20/prompt, so the suite premium is mostly in the base bundle, not the marginal prompt. Raw per-check metered tracking is far cheaper: ZipTie charges '$0.01' per prompt-engine-check (or '$0.0087 a check on all 7 engines'), i.e. about $0.30/mo for a daily single-engine (AIO-only) prompt and about $1.83/mo for a daily prompt across all 7 engines; Ahrefs custom-prompt packages are $50/mo for 2,500 checks ($0.02/check, ~$0.60/mo per daily prompt), $100/7,000 and $250/25,000. Entry tiers do NOT start at $29/mo: the cited Rankability survey (Oct 2, 2026, 20 tools; median $99/mo, average $337/mo, sweet spot $79-$149/mo) lists Rankscale AI at $20/mo and Keyword AI Tracker at $25/mo below Otterly's $29/mo; ZipTie Starter is listed from $42.75/mo. Peec, Promptwatch, Writesonic, Nightwatch, Promptmonitor, Surfer, Goodie, SE Visible, SE Ranking, LLMrefs, Rankscale and Gumshoe figures were not re-verified in this check (Peec's pricing page did not expose prices).

**Checker notes.** Checked primary pages for Mentions.so, Semrush KB, ZipTie and Ahrefs on 2026-10-06; all numbers in the claim match those pages word for word. Otterly verified only via the cited aeolabs review (updated Oct 5, 2026) because otterly.ai/pricing returned no content; that review adds a caveat the claim omits: Gemini and AI Mode are paid add-ons ($9-$149/mo each). Peec's pricing page rendered without prices, so the Peec/trakkr figures are unverified. Rankability's survey numbers (median $99, average $337, sweet spot $79-$149) are confirmed, but the same article lists cheaper entry tiers ($20 Rankscale, $25 Keyword AI Tracker) than the claimed '$29/mo' floor, which is the main factual error. Also note Mentions.so's $49 tier tracks only 3 LLMs, so 'multi-engine' per-prompt economics at the entry tier are thinner than the headline suggests, and ZipTie's all-7-engine daily cost (~$1.83/prompt/mo) is close to the self-serve range, so the 'AIO-only' $0.30 figure applies only to single-engine checks. The web search for newer price changes could not be run (shared search budget exhausted), so the staleness check relied on the Oct 2 and Oct 5, 2026 dated secondary sources. The core strategic implication (AIO-only scrape alone cannot command ~$2/prompt; entry must be ~$29-$49) still holds.

Evidence:
- https://mentions.so/
- https://www.aeolabs.ai/blog/otterly-ai-review
- https://www.semrush.com/kb/1493-ai-visibility-toolkit
- https://ziptie.ai/pricing/
- https://ahrefs.com/pricing
- https://www.rankability.com/blog/how-much-should-you-pay-for-ai-search-visibility-tracking-tools/

### Verdict: `partially_wrong`

**Original claim.** Mentions.so (the tool Jake Ward names in the thread, and which his own site lists as 'Mentions for AI visibility insights') is a daily brand-mention monitor priced $49-$399/mo; it tracks 'AI Overview' as one of eight surfaces, offers a Kanban 'Insights/To-do/Done' recommendations board, and does not advertise per-snapshot answer archives, diffs, cited-page analysis, or briefs.

**Corrected claim.** Mentions.so (the tool Jake Ward names in the thread, and which jakeward.io lists as 'Mentions for AI visibility insights') is a daily brand-mention monitor priced $49-$399/mo (Starter $49: 25 prompts, 1 site, 3 LLMs; Pro $99: 50 prompts, 5 sites, all LLMs; Business $199: 100 prompts, 10 sites; Agency $399: 300 prompts, unlimited sites, white label; 'updated daily' on every tier; /pricing returns 404, pricing lives on the homepage). It tracks 'AI Overview' as one of eight surfaces (ChatGPT, Perplexity, Claude, Grok, Gemini, DeepSeek, AI Overview, Llama). It offers a Kanban-style 'Insights' board whose columns are Backburner / Ideas / To-do / Doing / Done (not 'Insights/To-do/Done'), with cards tagged Source, Citation, Audit, Sentiment, Narrative. It advertises sentiment analysis, citation/source tracking with source-level percentages, AI traffic and crawler analytics, and an AI agent for week-over-week visibility charts; it does not advertise per-snapshot answer archives, answer diffs/change history, deep per-URL cited-page analysis, or content briefs. Trakkr's review (verified Aug 1, 2026) describes it as 'a lean monitoring tool, not an enterprise-grade source forensics or workflow platform', with 'tailored insights on Pro and above' that only 'help translate monitoring into basic next steps', and cons of modest prompt ceilings (300 max), thin enterprise proof, and a Starter tier limited to 3 LLMs.

**Checker notes.** Checked directly on 2026-10-06. Confirmed word-for-word: all four tiers/prices/prompt/site/LLM limits, daily updates, the eight surfaces including 'AI Overview', /pricing 404, jakeward.io wording 'Mentions for AI visibility insights', Trakkr verification date and cons. Two corrections: (1) the Kanban board columns on the homepage are Backburner / Ideas / To-do / Doing / Done (the board is labelled 'Insights'; there is no column named 'Insights'); (2) 'does not advertise cited-page analysis' is slightly overstated since the homepage does advertise citation/source tracking with source-level percentages, though not per-URL page forensics. Trakkr's features page explicitly notes no snapshots, diffs, cited-page breakdowns, or content briefs are described. The 'launched mid-2025' claim from geoly.ai was not independently verified. Freshness search (WebSearch) could not be run because the shared per-turn search budget was exhausted; the latest third-party data point is Trakkr's Aug 1, 2026 verification, which matches the live homepage today, so no evidence of a pricing change after Jan 2026.

Evidence:
- https://mentions.so/
- https://mentions.so/pricing
- https://trakkr.ai/reviews/mentions-so-review
- https://trakkr.ai/reviews/mentions-so-review/features
- https://jakeward.io/

## Findings

### 1. No competitor I could verify does Jake Ward's full loop (daily AIO capture with full text + per-claim citations -> day-to-day diff -> LLM frequency analysis of recurring claims/entities/formats/sources -> reverse-engineering of the most-cited pages -> content brief -> post-publish re-tracking). The closest partial implementations are SEOmonitor (full AIO text + all citation sources stored daily, desktop and mobile, no LLM analysis or briefs), SE Ranking (cached SERP copies; API returns answer text + sources, no analysis), ZipTie (full answer + sources kept, LLM Trends, briefs as a $20/mo add-on, 'Content Impact since the day you published'), and Writesonic (daily tracking, citation analysis, Action Center, AI articles).

_Confidence: medium_ **[plan-critical]**

SEOmonitor help doc: it 'capture[s] the full AIO answer, including content hidden behind the Show more button' 'daily on both devices' and 'extract[s] all citation sources' mapped to domains and URLs; its change tracking is a scorecard comparing 'the selected date with the previous one', not a text diff or pattern analysis. SE Ranking's API GET /airt/prompts/answer returns 'text', 'sources' (url + position), 'brands', and 'organic_urls' for google_ai_overview; nothing maps sources to claims. ZipTie: 'ziptie.ai keeps the full answer and the sources behind it'; 'LLM Trends' is cross-engine performance trends; Content Generation add-on is '$20/mo per context' giving '8 briefs and 4 content pieces'. Writesonic: Citation Analysis shows 'top cited pages, competitor citations, source type breakdowns' and an Action Center to 'Fix gaps with content, outreach, and technical optimization'. Profound's AI Marketer 'Goes from insight to brief to finished content' but is enterprise/custom-priced as of today. Page-audit features at Rankscale ('94+ technical checkpoints'), Scrunch, Otterly and Writesonic audit YOUR pages for AI readiness; none analyse the cited competitors' pages for answer speed, entities, structure, evidence, tables or gaps. A therankmasters roundup on 'answer change detection' (updated May 25, 2026) found no tool that natively offers answer diffs; saving before/after snapshots is described as a manual step. Caveat: I could not log into paid dashboards, so an undocumented feature could exist.

Sources:
- https://help.seomonitor.com/en/articles/9375479-daily-ai-overview-insights
- https://seranking.com/api/project/ai-result-tracker/
- https://ziptie.ai/
- https://ziptie.ai/pricing/
- https://writesonic.com/ai-visibility
- https://www.tryprofound.com/
- https://rankscale.ai/
- https://www.therankmasters.com/insights/ai-visibility/best-ai-visibility-tools-answer-change-detection

### 2. Typical self-serve price is $1.2-$2.0 per tracked prompt per month for daily, multi-engine tracking; SEO-suite add-ons run $3-$4 per prompt; raw AIO-only daily checks retail at roughly $0.30-$0.62 per prompt per month. Entry tiers now start at $29/mo.

_Confidence: high_ **[plan-critical]**

Computed from list prices read on vendor pages (monthly billing unless noted): Mentions.so $49/25=$1.96, $99/50=$1.98, $199/100=$1.99, $399/300=$1.33. Otterly $29/15=$1.93, $189/100=$1.89, $489/400=$1.22. Peec (USD per trakkr, Oct 1 2026) $95/50=$1.90, $245/150=$1.63, $495/350=$1.41 (3 engines). Promptwatch $95/50=$1.90, $579/350=$1.65. Writesonic $79/50=$1.58, $399/200=$2.00. Nightwatch EUR79/50=EUR1.58. Promptmonitor $29/25=$1.16, $129/150=$0.86. Semrush AI Visibility Toolkit $99/25=$3.96; Semrush Starter $199/50=$3.98. Surfer Pro $182/50=$3.64; Goodie Core $399/120=$3.33. SE Visible $99/200=$0.50 (5 engines daily); SE Ranking AI Search add-on $89/200=$0.45 on top of $129 Core. LLMrefs $79/500=$0.16 but weekly refresh. ZipTie: 'One prompt, one engine, one check: $0.01, or $0.0087 a check on all 7 engines' -> a daily AIO-only prompt is ~$0.30/mo; Ahrefs custom prompts '$50/mo' for '+2,500 checks/mo' = $0.02/check (~$0.60/mo per daily prompt); Rankscale Pro $99 for 'up to 4,800 AI engine answers' = ~$0.021/answer. Gumshoe is $0.10 per conversation pay-as-you-go. A missiongrowth.io cost-per-check guide (updated 2026-10-04) independently puts the range at '$0.010 on Ahrefs prompt packages to $0.11 per daily prompt-check on Semrush Starter'. Rankability's Oct 2, 2026 survey of 20 tools: median '$99/month', average '$337/month', sweet spot '$79-$149/month'. Implication: an AIO-only product cannot charge $2/prompt for the scrape alone; it must charge for the analysis + brief (a per-query 'campaign') and keep entry at $29-$49.

Sources:
- https://mentions.so/
- https://www.aeolabs.ai/blog/otterly-ai-review
- https://trakkr.ai/reviews/peec-review
- https://www.promptwatch.com/pricing
- https://writesonic.com/pricing
- https://nightwatch.io/pricing/
- https://promptmonitor.io/
- https://www.semrush.com/kb/1493-ai-visibility-toolkit
- https://www.semrush.com/pricing/
- https://surferseo.com/pricing/
- https://higoodie.com/pricing
- https://visible.seranking.com/
- https://seranking.com/pricing.html
- https://llmrefs.com/pricing
- https://ziptie.ai/pricing/
- https://ahrefs.com/pricing
- https://rankscale.ai/pricing
- https://gumshoe.ai/
- https://missiongrowth.io/blog/best-ai-rank-tracking-tools
- https://www.rankability.com/blog/how-much-should-you-pay-for-ai-search-visibility-tracking-tools/

### 3. Mentions.so (the tool Jake Ward names in the thread, and which his own site lists as 'Mentions for AI visibility insights') is a daily brand-mention monitor priced $49-$399/mo; it tracks 'AI Overview' as one of eight surfaces, offers a Kanban 'Insights/To-do/Done' recommendations board, and does not advertise per-snapshot answer archives, diffs, cited-page analysis, or briefs.

_Confidence: high_ **[plan-critical]**

mentions.so homepage (opened 2026-10-06): tracks 'ChatGPT, Perplexity, Claude, Grok, Gemini, DeepSeek, AI Overview, and Llama'; 'Updated daily' on all tiers; Starter $49/mo (25 prompts, 1 site, 3 LLMs), Pro $99/mo (50 prompts, 5 sites, all LLMs), Business $199/mo (100 prompts, 10 sites), Agency $399/mo (300 prompts, unlimited sites, white label); sentiment analysis; 'Visibility this week vs last week' via an AI agent; source-level percentages shown. Trakkr (verified Aug 1, 2026) adds 'Unlimited seats and daily tracking on every plan', AI traffic analytics on all tiers, 'tailored insights on Pro and above' described as 'useful but light', and cons: 'Modest prompt ceilings', 'Thin enterprise proof', Starter limited to 3 LLMs. jakeward.io lists 'Mentions for AI visibility insights' alongside Byword and Kleo; the geoly.ai/search summary says he launched it mid-2025. A /pricing URL returns 404; pricing lives on the homepage. Implication: the thread's author monetises step 2 only (tracking), leaving steps 3-6 as manual ChatGPT/Claude work, which is the product opportunity.

Sources:
- https://mentions.so/
- https://trakkr.ai/reviews/mentions-so-review
- https://trakkr.ai/reviews/mentions-so-review/features
- https://jakeward.io/

### 4. SE Ranking is the closest 'data layer' competitor: its AI Results Tracker (engines chatgpt, google_ai_overview, google_ai_mode, perplexity, gemini) stores the full AI answer text, cited sources with positions, detected brands and (for AIO) organic URLs, exposes them via a documented REST API with daily rankings, and sells it as a +$89/mo add-on (200 prompts on the $129 Core plan) or as the standalone SE Visible at $99/mo for 200 prompts across 5 engines.

_Confidence: high_ **[plan-critical]**

API docs: 'GET /airt/prompts/answer' returns 'text' (full AI answer), 'sources' (array with URL and position), 'brands', and 'organic_urls' (Google AI Overview only); 'GET /airt/prompts/rankings' returns daily 'url_position', 'mention_position', 'mentions_count', 'organic_overlap' across date ranges; retrieving answers 'does not consume API credits or subscription quota'. Pricing page: Core '$103.20' annual / '$129.00' monthly with '2k keywords & 100 prompts to track daily'; Growth '$223.20'/'$279.00' with '5k keywords & 250 prompts'; AI Search add-on '+$71.20/mo' annual / '+$89.00/mo' monthly for '200 prompts' (Core), '450' (Growth), '1000' (Enterprise), covering 'AI Overviews, AI Mode, Perplexity, ChatGPT'. AIO Tracker page: 'Track AI Overview presence and see where your website ranks within it', 'Analyze domains or individual URLs used as sources in AIOs', cached SERP copies, 'Historical AIO data for your keywords'. SE Visible (visible.seranking.com, pricing anchor #pricing): Basic $99/mo 200 prompts 3 projects ~30,000 answers; Core $189/mo 450 prompts; Plus $355/mo 1,000 prompts; engines 'ChatGPT, Gemini, AI Mode, Perplexity, AI Overview'; collects 'real AI responses using a browser and graphical user interface'. No LLM pattern analysis, no claim-level citations, no briefs. Note for build: this API could also be a buy-vs-build data option, though that belongs to the data-sourcing dimension.

Sources:
- https://seranking.com/api/project/ai-result-tracker/
- https://seranking.com/pricing.html
- https://seranking.com/ai-overviews-tracker.html
- https://visible.seranking.com/

### 5. Semrush's AI Visibility Toolkit is $99/mo standalone for 1 domain, 25 tracked prompts (daily), 300 daily AI Analysis queries; AI tracking is also bundled into Semrush plans ($139 SEO, $199 Starter with 50 daily prompts, $299 Pro+ 100, $549 Advanced 200). Reviews consistently complain about the 25-prompt cap, per-domain pricing, generic recommendations, and opaque methodology.

_Confidence: high_ **[plan-critical]**

Semrush KB (opened): '$99/month' including '1 domain for Brand Performance analysis', '300 daily queries in AI Analysis reports and 1000 daily queries in Prompt Research', '25 prompts for Prompt Tracking', 'AI Search Checks in Site Audit for up to 100 pages'; 'Prompt tracking: updated daily'; 'Brand Performance reports: updated weekly'; no free trial. Semrush pricing page: SEO '$117.33 monthly' annual (instead of $139) with '500 keywords to track daily' and 'Track performance in AI search'; Starter '$165.17/mo billed annually instead of $199 monthly' with '50 prompts to track daily'; Pro+ '$248.17/mo' (vs $299) '100 prompts'; Advanced '$455.67/mo' (vs $549) '200 prompts'; platforms 'Google Search, ChatGPT, Perplexity, Gemini & more'. Founderpass review (Nov 24, 2025): 'prompt-tracking is limited', suggestions 'feel broad and could apply to many businesses'. Search-aggregated reviews: 'each additional domain and each sub-user is another $99/mo license'; 'visibility is modeled from Semrush-fired synthetic prompts'. Codeless investigation called Semrush recommendations 'contradictory' and 'generic'.

Sources:
- https://www.semrush.com/kb/1493-ai-visibility-toolkit
- https://www.semrush.com/pricing/
- https://www.founderpass.com/reviews/my-review-of-the-semrush-ai-visibility-toolkit
- https://codeless.io/ai-search-deception/

### 6. Ahrefs tracks AI Overviews mainly from a modeled keyword database (Brand Radar 'AI Overviews 309.3M prompts'), with custom prompt checks sold as packages from $50/mo (+2,500 checks) and 5/10/20 tracked AI prompts bundled into Lite $129 / Standard $249 / Advanced $449; it shows AIO citation history in Site Explorer and Rank Tracker but is not a per-query daily answer archive.

_Confidence: high_ **[plan-critical]**

ahrefs.com/brand-radar: 'AI Overviews (309.3M prompts)', 'AI Mode (17.3M prompts)', ChatGPT/Gemini/Perplexity/Copilot ~30M each; 'Every prompt is modeled from real user searches in Ahrefs' keyword database'; Custom Prompts 'Starts at $50/month', 'Free for every paid Ahrefs Lite plan and above'; AI Visibility Index '$199/month'. ahrefs.com/pricing: Lite '$129 /mo' with '5 tracked AI prompts'; Standard '$249 /mo' '10 tracked AI prompts'; Advanced '$449 /mo' '20 tracked AI prompts'; Enterprise '$1,499 /mo'; packages Basic '$50/mo' '+2,500 checks/mo', Growth '$100/mo' '+7,000 checks/mo', Scale '$250/mo' '+25,000 checks/mo'. Ahrefs blog (Jan 26, 2026): 'track how your AI Overview performance is trending over time, with history data in Site Explorer Overview'; Brand Radar gives 'a full report of the citations you've won over time-including ... AI Overview responses'. Implication: Ahrefs owns the breadth/database angle; a new entrant should not compete on index size but on depth per query.

Sources:
- https://ahrefs.com/brand-radar
- https://ahrefs.com/pricing
- https://ahrefs.com/blog/how-to-track-ai-overviews

### 7. Otterly.ai: Lite $29/mo (15 prompts), Standard $189/mo (100), Premium $489/mo (400), Enterprise ~$1,000+; base engines ChatGPT, Google AI Overviews, Perplexity, Copilot; Gemini and AI Mode are paid add-ons ($9-$149/mo by tier), Claude $29-$439/mo; daily tracking, citations, GEO audits, predictive citability score, API/MCP. Complaints: learning curve, $29->$189 cliff, slow loading, weak filtering, and wanting 'clearer guidance on which actions to take'.

_Confidence: medium_ **[plan-critical]**

otterly.ai pages render client-side and returned empty to my fetcher, so figures come from SoftwareAdvice's listing (Lite $29/15 search prompts, Standard $189/100, Premium $489/400, Enterprise custom, 14-day trial; 'Daily tracking of brand mentions and citations'; engines 'ChatGPT, Google AI Overviews, Google AI Mode, Gemini, Perplexity, Microsoft Copilot') and the aeolabs review updated Oct 5, 2026 ('Base coverage is ChatGPT, Google AI Overviews, Perplexity, and Microsoft Copilot; Google Gemini and Google AI Mode are paid add-ons'; add-ons 'Google Gemini: $9-$149/mo', 'Google AI Mode: $9-$149/mo', 'Claude: $29-$439/mo'; cons '15 prompts on Lite is a narrow window', 'a steep cliff between tiers'). Trakkr features page: 'prompt research, AI search analytics, content audits and optimization guidance', REST API, MCP, Looker Studio; 'A predictive audit score is a recommendation, not proof that a page will be cited.' G2 cons (via search summary of g2.com, which returned 403 to me): learning curve, 'slow loading time for data', 'more advanced filtering and customizable reporting', 'clearer guidance on which actions to take from the findings'. Otterly was acquired/partnered with Semrush (Semrush newsroom result) and a Reddit r/seogrowth user called the Otterly Semrush app 'useless'.

Sources:
- https://www.softwareadvice.com/product/522152-Otterly-AI/
- https://www.aeolabs.ai/blog/otterly-ai-review
- https://trakkr.ai/reviews/otterly-review/features

### 8. Profound's public pricing page on 2026-10-06 lists only a free Trial (50 prompts, 'Daily for 7 days', ChatGPT/Gemini/Google AI Overviews, 'No data history or exports', no API) and Enterprise (custom; 9 engines; 'All time' history; API; SSO); the former self-serve Starter $99/mo (ChatGPT only, 50 prompts) and Growth $399/mo (ChatGPT, Perplexity, AIO; 100 prompts; 9,000 responses), both annual-only, were still documented on Aug 29, 2026. Agency workspaces are '$399/mo each' with '400 credits per month per client workspace'.

_Confidence: high_ **[plan-critical]**

tryprofound.com/pricing (opened): Trial 'Daily for 7 days', '50 unique prompts', 'No data history or exports', 'No API access'; Enterprise 'Tailored prompt tracking plan', engines 'ChatGPT, Perplexity, Google AI Mode, Gemini, Microsoft Copilot, DeepSeek, Anthropic Claude, Google AI Overviews, Exa Search', 'All time' history, CSV/JSON, API, SSO/SAML + SOC 2; FAQ: 'Agency Growth plan includes 400 credits per month per client workspace'. get-ryze.ai (Aug 29, 2026): Starter '$99/month, billed yearly ($1,188/yr)' ChatGPT only, 50 prompts, 100 agent credits; Growth '$399/month, billed yearly ($4,788/yr)' 3 engines, 100 unique prompts, 9,000 monthly responses, 'no API access, no SSO', 'one language, one region'; 'Agency Client Workspace: $399/mo each'. Homepage: AI Marketer 'Goes from insight to brief to finished content', 'Citation Analytics: Sources cited across answers', FactCheck, Agent Analytics; customers 'a third of the Fortune 100'. G2/press cons: 'expensive and difficult to justify month-to-month', 'data-heavy' UI, $99 seen as 'a funnel toward the $399 Growth plan'. Implication: the enterprise leader has vacated the sub-$500 self-serve slot.

Sources:
- https://www.tryprofound.com/pricing
- https://www.get-ryze.ai/blog/profound-pricing-2026
- https://www.tryprofound.com/
- https://digiday.com/marketing/marketers-question-expensive-ai-visibility-tools-as-inconsistent-results-fuel-skepticism/

### 9. Peec AI runs prompts daily, stores URL-level sources, has an API/MCP and Looker connector, and (per the most recent third-party check, Oct 1 2026) prices brand plans at $95/50 prompts, $245/150, $495/350 monthly (15% off annual), with only 3 of 6 engines (ChatGPT, AI Mode, AI Overviews, Copilot, Perplexity, Gemini) included and extra engines as paid add-ons; agency plans $245-$795. Exact prices are not rendered on peec.ai/pricing and third-party figures conflict (EUR 85/205/425 vs USD 95/245/495), so treat as approximate.

_Confidence: medium_ **[plan-critical]**

peec.ai/pricing (opened twice) shows tier names Starter/Pro/Advanced/Enterprise, 'tracked daily against competitors', 'Source analytics, Domain & URL detail view, Subdomain tracking', 'tracked prompts by active models and tracking frequency', 'Trusted by 3000+ brands and agencies' but no numbers. docs.peec.ai: 'Peec AI runs your prompts across AI platforms like ChatGPT, Gemini, and Copilot daily, then analyzes patterns over time, since AI responses naturally vary day to day'; 'The basis for all these metrics is Sources'. trakkr (verified Oct 1, 2026): Starter $95/mo ($80.75 annual), Pro $245 ($208.25), Advanced $495 ($420.75); 50/150/350 prompts; 'Self-serve brand plans include three selected models from six defaults'; 'No retroactive historical data'; agency Essential $245 (10,000 credits, 3 projects), Growth $495, Scale $795. generatemore.ai (updated Aug 2026): Starter EUR70/mo annual, Pro EUR180, Advanced EUR360; engine pool 'ChatGPT, Google AI Mode, Google AI Overviews, Microsoft Copilot, Perplexity, Gemini'; add-on engines EUR25/55/115 per month by tier. workduo (Feb 25, 2026) still quoted the 2025 EUR89/199 pricing. G2 cons (via search summaries): no Google Analytics integration, model gating is a 'subscription wall', wants 'a content workflow component, similar to AirOps', lacks ROI attribution.

Sources:
- https://peec.ai/pricing
- https://peec.ai/
- https://docs.peec.ai/intro-to-peec-ai
- https://trakkr.ai/reviews/peec-review
- https://generatemore.ai/blog/peec-ai-review
- https://www.workduo.ai/blog/peec-ai-pricing

### 10. ZipTie (ziptie.dev now redirects to ziptie.ai) is the most transparent usage-priced competitor: $0.01 per prompt-engine-check ($0.0087 on all 7 engines), daily/weekly/monthly cadences priced proportionally, unlimited seats/projects, keeps full answers and sources, GSC integration, REST API + MCP for +$10/mo, Content Generation add-on $20/mo per context (8 briefs + 4 pieces), UGC/Reddit analysis +80%; presets from $42.75/mo (Starter) to $659.59 (Professional) and $3,137.09 (Enterprise); 7-day trial with 25 daily prompts, no card.

_Confidence: high_ **[plan-critical]**

ziptie.ai/pricing: 'Pay only for the prompts you monitor and the engines you run them on. Unlimited teammates, unlimited projects.'; 'One prompt, one engine, one check: $0.01, or $0.0087 a check on all 7 engines.'; 'A prompt is a slot you hold, not a meter that counts down.'; 'a weekly prompt costs a seventh of a daily one, a monthly prompt a thirtieth'; engines 'ChatGPT, Google AI Overviews, Perplexity, Google AI Mode, Microsoft Copilot, Bing AI Overview, and Google Gemini'; discounts quarterly -5%, semi-annual -10%, annual -20%; add-ons 'Content Generation: +$20/mo per context', 'API & MCP Access: +$10/mo', 'UGC Impact Analysis: +80%'. ziptie.ai: 'keeps the full answer and the sources behind it'; 'Your history starts with your first check: no engine publishes what it said before'; 'Link your pages to prompts to see which content wins citations' and 'how that changed since the day you published'; 'REST and Model Context Protocol access at api.ziptie.ai', docs at docs.ziptie.ai. Implication: ZipTie sets the floor for scrape pricing and already does post-publish tracking (step 6), but still no pattern analysis or cited-page reverse engineering.

Sources:
- https://ziptie.ai/pricing/
- https://ziptie.ai/

### 11. Reviewers and the trade press complain about the same four things across vendors: inconsistent/non-deterministic results ('three different tools... three different answers'), opaque vanity scores, generic non-actionable recommendations, and tight prompt caps with steep tier cliffs; several explicitly ask for a content workflow and 'what to do next'. This maps directly onto Jake's steps 3-5.

_Confidence: high_ **[plan-critical]**

Digiday (May 1, 2026): Paul Dyer (/prompt) 'If you use three different tools and give them the same prompts, you get three different answers'; Ryan Mason (Markacy) 'There's really not much an AI tool can do or tell you to do. It's just a benchmarker'; Heather Physioc (VML) most tools give 'point in time' results; Joseph Levi (Noise Media Group) 'We don't know enough of these companies to be charging what they're charging'; price range '$99-$1,000+ monthly'. Canonry (Jun 30, 2026): one scraped answer is 'one account, one prompt set, one location, one model state'; 'Mass scraping adds more bias'; same brand scores '20% mention-based share of voice, 16.8% position-weighted..., and 31.4% citation-based' depending on method; 'A single global visibility rank is often meaningless' for local intent; model drift confounds measurement. Codeless investigation (through Jan 2026): 'built on unproven assumptions, opaque methodologies'; sentiment for QuickBooks scored 0, 50 and 100 across runs; AI referrals '1.08% of all referral traffic'. G2-derived cons (search summaries; G2 itself returned 403): Otterly 'clearer guidance on which actions to take', 'slow loading', '15 prompts... not for serious monitoring'; Peec no GA integration, 'subscription wall', wants content workflow; Profound 'overwhelming for new users', expensive; Semrush 25-prompt cap and per-domain $99 licenses, 'broad' action plans. Reddit could not be crawled (reddit.com blocks Anthropic's agent); one indirect quote: r/seogrowth user found the Otterly Semrush app 'useless'. Build implications: sample each query multiple times per day and show variance; store the raw snapshot so counts are auditable; present frequencies and diffs rather than a proprietary score; make the brief the hero output.

Sources:
- https://digiday.com/marketing/marketers-question-expensive-ai-visibility-tools-as-inconsistent-results-fuel-skepticism/
- https://canonry.ai/blog/ai-visibility-tools-are-lying
- https://codeless.io/ai-search-deception/
- https://www.aeolabs.ai/blog/otterly-ai-review
- https://trakkr.ai/reviews/peec-review
- https://www.founderpass.com/reviews/my-review-of-the-semrush-ai-visibility-toolkit

### 12. SEOmonitor is the strongest incumbent on step 2 alone: it stores the complete AI Overview (including 'Show more' content) daily on desktop and mobile for every keyword in a project, extracts every citation source to domain/URL, and shows presence trends; but it is an agency rank-tracking suite without LLM pattern analysis or briefs, and its pricing page rate-limited my fetch.

_Confidence: high_ **[plan-critical]**

help.seomonitor.com: 'capture[s] the full AIO answer, including content hidden behind the Show more button' 'daily on both devices, when we process the ranking data'; 'extract[s] all citation sources, including ones behind the Show more button' and maps 'them to domains and URLs'; 'Trends over time. The percentage change you see in the Scorecard compares your presence in AIOs on the selected date with the previous one'; Visibility Trend Explainer lists keywords where citation status changed. Retention period not stated. seomonitor.com main pages returned HTTP 429 twice, so plan prices are unverified (search listing says plans exist at seomonitor.com/pricing). Implication: device-level capture (desktop vs mobile) is table stakes; the diff/frequency analysis layer on top is the differentiator.

Sources:
- https://help.seomonitor.com/en/articles/9375479-daily-ai-overview-insights

### 13. Rankscale.ai: credit-based; Essentials $17/mo (yearly only, 0 credits), Pro $99/mo (1,200 credits = up to 4,800 answers, 10 dashboards, 50 page audits), Pro+ $229 (3,000 credits, API), Growth $385 (5,500 credits, white-label), Enterprise $780 (12,000 credits); cadence 'Hourly, daily, weekly, or monthly'; 17+ engines incl. AI Overviews and AI Mode; citation analysis; 'page audits' are 94+ technical AI-readiness checks of your own site, not content reverse-engineering; recommendations are beta.

_Confidence: high_

rankscale.ai/pricing: Pro '$99/mo ($84/mo yearly)', '1,200 credits monthly', 'Tracks up to 4,800 AI engine answers', '10 brand dashboards', '50 page audits'; Pro+ '$229/mo', '3,000 credits', 'REST API + 5 monthly prompt researches'; Growth '$385/mo', '5,500 credits', 'White-label'; Enterprise '$780/mo', '12,000 credits'; engines 'ChatGPT, Perplexity AI, Google AI Mode, AI Overviews, Gemini, DeepSeek AI, Mistral AI, Anthropic Claude, Microsoft Copilot' plus more; 'Hourly, daily, weekly, or monthly with optional bi-cadence'. rankscale.ai: Citation Analysis 'Discover where AI search engines cite your brand', 'Monitor citation frequency across all supported AI models'; page audits '94+ technical checkpoints' for 'AI bot crawlability, site hierarchy, and technical SEO signals'; 'Actionable recommendations (beta)'.

Sources:
- https://rankscale.ai/pricing
- https://rankscale.ai/

### 14. Nightwatch bundles AI prompts into rank-tracking plans: Starter EUR79/mo (500 keywords, 50 AI prompts, 1,500 AI answers/mo), Professional EUR159 (2,500 kw, 150 prompts), Agency EUR399 (7,500 kw, 500 prompts, 15,000 answers); tracks ChatGPT, Claude, Gemini, Perplexity, AI Mode, AI Overview; citation analysis; 'Full SERP archives retained for 3 years'.

_Confidence: high_

nightwatch.io/pricing (opened): Starter 'EUR79/mo (EUR948/year) - 500 keywords, 50 AI prompts', '1,500 AI answers / mo'; Professional 'EUR159/mo', '2,500 keywords, 150 AI prompts'; Agency 'EUR399/mo', '7,500 keywords, 500 AI prompts', '15,000 AI answers / mo'; Enterprise custom '20,000+ keywords, unlimited AI prompts'; 'Tracked daily, in any location or language'; 'Citation analysis-Which sources AI answers cite, and how often'; 'Full SERP archives retained for 3 years'. A third-party roundup (llmpulse, updated Sep 28, 2026) cites an older $39 Starter; the vendor page today shows EUR79.

Sources:
- https://nightwatch.io/pricing/
- https://llmpulse.ai/blog/best-google-ai-overviews-trackers/

### 15. AccuRanker: Professional $224/mo (2,000-5,000 keywords, daily), Expert $764/mo (10,000-25,000), Enterprise custom; its AccuLLM module tracks ChatGPT, Perplexity, AI Overviews and AI Mode with share of citations, sentiment, 'web search rate' and competitor benchmarking; AccuLLM pricing is not published; third parties say its keyword table exposes the AI Overview text and cited URLs on the daily pull.

_Confidence: medium_

accuranker.com/pricing: Professional '$224/month', 'Daily updates'; Expert '$764/month'; mentions 'AI CTR' and 'AI Search Volume'. accuranker.com/features/accullm: 'Track your visibility across prompts, monitor sentiment, learn which sources are cited, and analyze your competitors'; 'track which domains and landing pages the LLMs cite most often'; 'learn how often LLMs search the web to answer your tracked prompts'; no refresh frequency, pricing or history details. Search summaries (llmpulse, coruzant) describe 'AI Overview citation detection with on-demand refresh' and 'a keyword table that exposes the Overview text'; pricing for AccuLLM 'require[s] direct inquiry'.

Sources:
- https://www.accuranker.com/pricing/
- https://www.accuranker.com/features/accullm/
- https://accuranker.com/
- https://llmpulse.ai/blog/best-google-ai-overviews-trackers/

### 16. Advanced Web Ranking includes AI Visibility Tracking on every paid plan (Pro $139/mo 7,000 keywords, Agency $279 14,500, Enterprise $699 35,500, Ent Plus $980 50,000) with no add-on fee; tracking an AI platform for a keyword consumes keyword quota; engines Google+AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini; on-demand or daily/weekly/biweekly/monthly; alerts on citation/mention/sentiment shifts; API.

_Confidence: high_

advancedwebranking.com/pricing: Pro '$139/mo' '7,000 keywords'; Agency '$279/mo' '14,500 keywords'; Enterprise '$699/mo' '35,500 keywords'; Ent Plus 50k '$980/mo'; cadences 'daily, weekly, bi-weekly, monthly' plus 'on-demand'; 'AI Visibility tracking' and 'AI Citations and Mentions' in Pro. advancedwebranking.com/ai-visibility-tracking: 'Tracking an AI platform for a keyword uses your existing keyword quota, just like adding another search engine or location would'; 'On-demand anytime, or on a schedule: daily, weekly, biweekly, or monthly'; 'Compare AI Visibility %, Brand Share of Voice, and AI Traffic Potential across up to 50 domains'; 'New AI platforms are added as they reach meaningful search volume'.

Sources:
- https://www.advancedwebranking.com/pricing
- https://www.advancedwebranking.com/ai-visibility-tracking

### 17. aioverviewtrack.com (a Semust product) is a Google-AI-Overview-only tracker: 'Triggered / Not Triggered status for every keyword, every day', 'Full list of cited domains per keyword, per day', 'Day-by-day position history for your domain'; no LLM analysis or briefs; no pricing on the landing page (its /pricing is 404; registration at app.semust.com). Third-party listings put Semust plans at $19/$35/$59 per month.

_Confidence: medium_

aioverviewtrack.com: monitors 'every domain Google is citing inside it'; alerts and trend visualization; audiences 'SEO Agencies, Small Businesses, In-House SEO Teams, Content Strategists'; suggests strategists 'study the format and structure of consistently featured pages' but does not do it for them. Capterra (via search) lists Semust: Free 15 keyword searches/14 days; Starter $19/mo 100 keyword searches; Business $35/mo 250; Enterprise $59/mo 500. Implication: the pure AIO-tracker niche exists at very low prices; the differentiator must be analysis.

Sources:
- https://aioverviewtrack.com/
- https://aioverviewtrack.com/pricing

### 18. Mid-market monitoring suites all include Google AI Overviews but none target single-query optimisation: Scrunch Starter $300 m-t-m / $250 annual (350 custom + 1,000 industry prompts, 5 page audits), Growth $500/$417 (700 + 2,500, 10 audits); Writesonic Starter $79 (50 prompts, 50 answers/day, ChatGPT/Gemini/AIO), Basic $199, Growth $399 (200 prompts, 600 answers/day, Action Center 5 off-page + 5 on-page actions/mo, 50 AI articles); Promptwatch Essential $95 (50 prompts, 4 models, 6,000 responses), Professional $245 (150 prompts, 5 AEO articles), Business $579 (350 prompts, 10 AEO articles); Goodie Core $399 (120 prompts, 5 models, 50 optimizations), Pro $999 (250 prompts, 8 models), Agency Growth $275; LLMrefs $79 flat for 500 prompts weekly across all engines with API.

_Confidence: high_

scrunch.com/pricing: Starter '$250 per month (billed annually) or $300 month-to-month', '350 custom prompts, 1,000 industry prompts'; Growth '$417 per month (billed annually) or $500 month-to-month', '700 custom prompts, 2,500 industry prompts'; engines 'ChatGPT, Claude, Gemini, Perplexity, Google AI Mode and AI Overviews, and Meta'. writesonic.com/pricing: Starter $79, Basic $199, Growth $399; prompts 50/100/200; answers daily 50/300/600; 'Sentiment Analysis (available on Growth)'; Growth '5 off-page + 5 on-page actions/mo'; articles 15/25/50 per month. promptwatch.com/pricing: Essential '$95/month', '50 Prompts', '6,000 Responses', 'Track 4 models'; Professional '$245/month', '150 Prompts', '5 AEO Articles/mo'; Business '$579/month', '350 Prompts', '10 AEO Articles/mo'; 'Daily'; engines include 'Google AI Overviews'. higoodie.com/pricing: Core '$399/month', '120 prompts', '5 core models tracked' (ChatGPT, AI Overview, Perplexity, AI Mode, Copilot), '50 optimizations / mo'; Pro '$999/month', '250 prompts', '8 models'; Agency Growth '$275/month'. llmrefs.com/pricing: 'All in One Plan: $79/month', 'Track 500 prompts', 'updated in the dashboard at least once per week', engines include 'Google AI Overviews, AI Mode', 'Access all AI search engines with no additional fees', API.

Sources:
- https://scrunch.com/pricing
- https://writesonic.com/pricing
- https://writesonic.com/ai-visibility
- https://www.promptwatch.com/pricing
- https://higoodie.com/pricing
- https://llmrefs.com/pricing

### 19. Content-optimisation incumbents have added AI tracking but still analyse Google's organic top results, not AI Overview citations: Surfer AI Tracker (Standard $99 25 prompts weekly; Pro $182 50 prompts daily; Peace of Mind $299 100 daily; AI Search Analytics $82 50 daily; +$18 per 10 prompts; engines Gemini, AIO, AI Mode, ChatGPT, Perplexity; 'real scraping'), Frase ($39-$239/mo, AI visibility for ChatGPT and Google AI at Starter/Pro, more engines at Scale), Clearscope (Essentials $129: 50 tracked queries/50 pages/20 topic explorations; Business $399: 300/300/50; query tracking across ChatGPT, Gemini, Claude; 'query fan-out awareness').

_Confidence: high_

surferseo.com/pricing: 'AI Search Analytics: $82 USD per month', 'Track 50 AI Prompts', 'Daily prompt refresh'; Standard '$99' 'Track 25 AI Prompts' 'Weekly prompt refresh'; Pro '$182' 50 daily; Peace of Mind '$299' 100 daily. docs.surferseo.com: 'Your data and charts refresh daily on Pro, Peace of Mind, Enterprise, and AI Search Analytics plans. And it refreshes weekly on the Standard plan'; 'self-consistency method'; extra prompts 'packs of 10 for $18 monthly'. surferseo.com/ai-tracker: 'the only AI visibility tool that uses real scraping'; shows 'the exact sources LLMs trust'; links to Content Editor and Topical Map. frase.io/pricing: Starter $39 yearly/$49 monthly; Professional $103/$129; Scale $239/$299; 'AI Visibility' tracks 'whether AI engines cite you'. clearscope.io/pricing: Essentials '$129/month' '50 Tracked Queries' '50 Pages' '20 monthly Topic Explorations'; Business '$399/month' '300 Tracked Queries'; 'See the web searches AI platforms trigger to construct their answers'. clearscope.io: query tracking covers 'ChatGPT, Gemini, and Claude' (no AIO mentioned).

Sources:
- https://surferseo.com/pricing/
- https://docs.surferseo.com/en/articles/11667466-ai-tracker
- https://surferseo.com/ai-tracker/
- https://www.frase.io/pricing
- https://www.clearscope.io/pricing
- https://www.clearscope.io/

### 20. Enterprise/data-science vendors (seoClarity ArcAI, Evertune, Bluefish, Similarweb, Athena, AirOps) are quote-driven or $300-$800+/mo and optimise for breadth (hundreds of thousands of modeled prompts, panels, attribution), not per-query depth; Similarweb's AI Search Intelligence ($99/mo annual, 150 prompts, 1 user, 3 months history) tracks ChatGPT, Perplexity, Gemini and AI Mode but not AI Overviews for brand visibility.

_Confidence: high_

seoclarity.net/ai-seo/pricing: three ArcAI packages (Core, Discovery, Accuracy) all 'Ask for a Quote'; 'Prompt Queries (starts at 500)'; 'AI Content Optimizer (include 20 analyses)'; distinguishes 'AI Mode tracking' vs 'AI Overviews tracking analyzes AI-generated summaries within the SERP'; third parties put entry at ~$750-$3,000/mo and default weekly checks. evertune.ai/pricing: Pro '$800 / month', '100,000 prompts tracked across 11 AI models', 'Daily, weekly or monthly tracking frequency', '25 AI-optimized articles per month'; homepage: 'samples each prompt 100 times across every AI model', 'EverPanel... over 150 million user prompts', tracks 'AI Overview' and 'AI Mode'. bluefishai.com: 'The Agentic Marketing Engine for the Fortune 500', '10+ LLMs tracked daily', no public pricing. aisearch.similarweb.com: 'AEO Intelligence - $99/month: 1 user, 3 months historical data, 150 tracked prompts'; $333 and $542 bundles; engines 'ChatGPT, Perplexity, Gemini, AI Mode'. athenahq.ai/pricing: Essential free ('300 credits'), Starter '$295/month' '3,600 credits' '11 models' incl. Google AI Overviews, Enterprise custom with 'Athena Citation Engine (ACE)'. airops.com/pricing: Solo free '35,000 tasks/month' 'ChatGPT Insights Only'; Pro '100,000 tasks/month' 'Insights Across 7+ Answer Engines' overage '$0.025 per task'; workflow/content platform rather than a tracker.

Sources:
- https://www.seoclarity.net/ai-seo/pricing
- https://www.evertune.ai/pricing
- https://www.evertune.ai/
- https://www.bluefishai.com/
- https://aisearch.similarweb.com/
- https://www.athenahq.ai/pricing
- https://www.airops.com/pricing

### 21. Low-cost/PAYG entrants set the price floor: Gumshoe $0.10 per conversation PAYG, Starter $99/project (weekly snapshots), Pro $299/project (daily), 11 models incl. Google AI Overview, citations + site audit + gap content; Promptmonitor $29/mo (25 prompts), $39 (50), $129 (150), daily, 8 models incl. AI Overview and AI Mode, source-author extraction for outreach; Keyword.com sells AI credits from $7.83/mo (annual $94, 20+ credits) and a 360 plan from $26/mo with AIO/AI Mode among 9 engines (unit definitions unclear).

_Confidence: medium_

gumshoe.ai: 'how AI talks about your brand, 6 models per audit drawn from 11 tracked'; 'Starter: $99/month per project', 'Pro: $299/month per project'; monthly full audits with weekly (Starter) or daily (Pro) snapshots; search summary: '$0.10 per conversation, no monthly minimum'. promptmonitor.io: 'ChatGPT, Claude, Gemini, Deepseek, Grok, Perplexity, Google AI Overview and AI Mode'; Starter $29/mo 25 prompts 2,250 responses; Growth $39/mo 50 prompts; Pro $129/mo 150 prompts; 'See every source, who wrote it, and whether they mention your brand'. keyword.com/pricing: 'AI Visibility' '$7.83/month' (annual $94) '20 through 2000 credits'; '360 Visibility' '$26/month' (annual $312) '1000 & 15 credits through 10000 & 250 credits'; Custom from '$490/month'; engines 'ChatGPT, Perplexity, AI Mode, AI Overview, Gemini, Mistral, DeepSeek, Microsoft Copilot, Claude'; the page's unit semantics (per-credit vs per-plan) were ambiguous to my fetcher, so treat Keyword.com numbers as low confidence.

Sources:
- https://gumshoe.ai/
- https://promptmonitor.io/
- https://keyword.com/pricing/

### 22. Nozzle is usage-priced per SERP pull with a calculator (no fixed tiers on its pricing page), captures every element of the SERP including AI Overviews, and is the kind of 'raw SERP archive' a rank-tracking buyer would use rather than an AIO optimisation product.

_Confidence: low_

nozzle.io/pricing (opened) shows only a calculator ('Use the calculator above to figure out how many SERPs you will need'), customer logos (Mayo Clinic, Home Depot, Wayfair) and FAQ; no tiers. Third-party aggregators (via search) quote ~$49-$599/mo for 10,000-130,000 pulls and 'AI Overview Result Tracking as a shipped feature', with 'pixels from top' and 'SERP real estate percentage' metrics. Low confidence on prices.

Sources:
- https://nozzle.io/pricing

## Recommendations from this dimension

- Position the product as a query-centric 'AI Overview playbook engine' (one query -> 7+ day evidence -> brief -> re-track), not another brand-visibility dashboard; every incumbent sells breadth across engines, and reviewers' top complaint is 'what do I do next', which is exactly the brief.
- Make the differentiators concrete and visible in the UI: (1) per-claim citation mapping (which chip supports which bullet), (2) a frequency table across snapshots for claims, entities, formats and sources with day-to-day diff view, (3) reverse-engineered profiles of the top-cited pages (time-to-answer, entities covered, structure, evidence, tables/lists, gaps), (4) a brief that separates 'baseline to match' from 'new things to give Google to cite', (5) post-publish tracking that flags the first day the user's URL appears. No competitor I checked exposes items 1-4.
- Price for the analysis, not the scrape: scrape cost is commoditised at ~$0.01/check retail (ZipTie) and $0.02/check (Ahrefs). Credible ladder: Free (1 query, 7 days, no brief), Starter $29-$49/mo (5-10 queries, daily, 1 locale), Pro $99/mo (25-50 queries, 3 samples/day, briefs, API), Agency $249-$299/mo (150+ queries, white-label, client workspaces). Alternatively sell per-query 'campaigns' at $10-$20/query/month including the brief; this undercuts the $1.2-$2/prompt norm on a per-prompt basis while capturing more value per query.
- Start AIO-only (Google AI Overviews) with locale + device parameters, add Google AI Mode second; skip ChatGPT/Perplexity/Claude at launch. Multi-engine coverage is where incumbents compete on add-on fees (Otterly charges $9-$439/mo per extra engine, Peec gates 3 of 6) and it adds scraping complexity without serving Jake's loop.
- Design for non-determinism up front: capture each query at least 2-3 times per day (Evertune samples 100x to reach a +/-2 point margin), store the raw snapshot (HTML/JSON + full text + citations) so every count in the frequency table links to evidence, and report counts and percentages rather than a proprietary 'visibility score' (Seer and Digiday sources call such scores vanity metrics).
- Ship a documented REST API and an MCP server from day one (ZipTie charges +$10/mo; SE Ranking and Peec have APIs; Peec/Otterly/ZipTie/Goodie advertise MCP) since the founder's own build and agency buyers both want programmatic access; this is cheap in TypeScript and is a review-visible differentiator at the $29-$99 tier.
- Copy the pricing transparency that reviewers praise (Mentions.so, ZipTie) and avoid the two things they punish: steep tier cliffs ($29 -> $189 at Otterly) and per-domain/per-seat multipliers (Semrush $99 per extra domain). Offer unlimited seats and a smooth prompt ladder.
- Treat SE Ranking's AI Results Tracker API (returns 'text', 'sources' with positions, daily rankings for google_ai_overview) and SEOmonitor as the benchmarks for the capture layer; whatever capture path the data-sourcing dimension picks must at least match 'full text incl. Show more, all citation URLs, desktop and mobile, daily' or the product loses on step 2 before it can win on steps 3-5.
- Do not compete with Ahrefs/Semrush on index size or with Profound/seoClarity/Evertune on enterprise panels; instead integrate with them (CSV/GSC import of candidate queries, export of briefs to Surfer/Frase/Clearscope-style editors) and target the SMB/agency buyer who was orphaned when Profound removed its $99/$399 self-serve plans.
- Use the founder's own manual workflow as the marketing wedge: the thread's author sells Mentions.so for step 2 only and tells readers to paste answers into ChatGPT/Claude for steps 3-5; a product that automates steps 3-6 for the same $49-$99 is an obvious 'next step' upsell story for that audience.

## Open questions

- Reddit (r/SEO, r/bigseo, r/seogrowth) could not be crawled by this agent (reddit.com blocks it); the only Reddit signal obtained was second-hand ('Otterly Semrush app was useless'). A manual read of recent threads on AI Overview tracking tools is still needed before relying on the complaints list.
- G2 pages returned HTTP 403; the G2 cons for Otterly, Peec and Profound were taken from search-engine summaries of G2 and from third-party reviews (aeolabs, trakkr), not from G2 itself. Rating counts (e.g. Peec 4.8/5 on 18 reviews) are unverified.
- Peec AI's current list prices could not be read from peec.ai/pricing (client-rendered); third-party sources disagree (USD 95/245/495 on Oct 1 2026 vs EUR 70/180/360 annual in Aug 2026 vs EUR 89/199/499 in Feb 2026) and on whether Google AI Overviews is inside the self-serve engine pool. Needs a logged-in check.
- Otterly.ai's own site is client-rendered and returned nothing; plan-level refresh cadence (is Lite daily?) and whether it stores full AIO text per check are unconfirmed beyond third-party claims.
- SEOmonitor's pricing page rate-limited the fetch (HTTP 429 twice); its AIO capture features are confirmed from its help centre but plan prices are unknown.
- AccuRanker's AccuLLM pricing is not public; it is unclear whether it is included in the $224/mo Professional plan or sold separately.
- Whether any tool maps citations to individual claims inside its paid UI (not just a sources list per answer) could not be verified without accounts; the 'no one does it' claim rests on public docs, APIs and reviews.
- Keyword.com's pricing page semantics ($3/mo, $7.83/mo, $26/mo) were ambiguous to the fetcher; the actual monthly totals per keyword/credit bundle should be re-checked.
- Mentions.so does not document whether it archives full answer text and citations per daily snapshot or only aggregates; a trial sign-up would settle this and sharpen the differentiation claim.
