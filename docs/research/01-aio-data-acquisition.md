# Capturing Google AI Overviews programmatically

_Research dimension: Programmatic capture of Google AI Overviews (text + citations) daily, per query, per country/language/device: provider comparison, Google constraints, AIO prevalence/volatility, self-hosting risk, cost model_

Gathered 2026-10-06. See [README.md](README.md) for method and caveats.

## Summary

Google offers no official API for AI Overviews (AIOs): the Custom Search JSON API returns only web/image results, is closed to new customers and is discontinued on January 1, 2027; Search Central says AIO/AI Mode have no API, markup or Search Console report; and Gemini "Grounding with Google Search" returns the model's own synthesized answer with url_citation annotations, not Google's AIO. Every viable path is a third-party SERP scraper, and these fall into two shapes: single-call browser-rendered capture (DataForSEO with load_async_ai_overview, Bright Data brd_ai_overview=2, Oxylabs render=html, Traject Data include_ai_overview, Apify actors) versus two-step capture where the first SERP call may return a short-lived page_token that must be redeemed on a dedicated ai_overview engine within 1-4 minutes (SerpApi, SearchApi, HasData, ScrapingDog); SerpApi states in writing that the two-step path "will count as two SerpApi searches". Only some providers map text chunks to citations: SerpApi, SearchApi, HasData and Bright Data expose reference_indexes per text block; Oxylabs maps references per sentence fragment; DataForSEO attaches references per ai_overview_element and also returns full markdown; Traject Data and the Apify official actor return text and a flat source list only; Serper returns no AIO at all; Zenserp lists "AI Overview (3 credits)" on pricing but its docs say "Coming Soon". On cost, DataForSEO's Standard queue is by far the cheapest fully-structured option at $0.0006/SERP plus $0.0006 for load_async_ai_overview (refunded if no async AIO), i.e. roughly $1.20 per 1,000 captures versus $10-25 per 1,000 on SerpApi, $1-4 on SearchApi, $1.50 on Bright Data, ~$1.35 on Oxylabs (JS render), and DataForSEO also supports device, os, location_coordinate (lat,long,radius), 2,000 API calls/min with 100 tasks per POST, and postback_url delivery, which fits a nightly batch perfectly. Localisation across providers has converged on gl + hl + uule/location + device because Google dropped ccTLD routing in 2025 (SearchApi deprecated google_domain on April 15, 2025; Bright Data routes everything through google.com). AIO prevalence is high but query-mix dependent and unstable: Similarweb puts it at 43% of US searches (July 2026, up from 15%), Conductor measured 23% (Sept 2025) to 47% (Jan 2026) then 34% (Feb 2026) across 274M US searches, Semrush's 10M-keyword panel went 6.49% (Jan 2025) to 24.61% (Jul 2025) to 15.69% (Nov 2025), and Pew's real-user panel saw 18% (March 2025), so the product must validate that a query triggers an AIO at add-time and model "AIO absent" as a first-class daily state. Run-to-run variance is large: Ahrefs (43k keywords, Nov 2025) found a 70% chance the AIO changes between observations, 45.5% of citations change on each update, two incognito captures two minutes apart differed, yet semantic similarity stayed at 0.95; BrightEdge found signed-out users see 10-20% fewer AIOs (90% fewer on ecommerce), and all APIs scrape signed-out, so e-commerce AIOs will be under-captured. That volatility is exactly why Jake Ward's 7-day method works, and it argues for 2 captures/day on both desktop and mobile with set-based (not string-based) diffing. Self-hosting a Playwright scraper is materially riskier: since Jan 15-17, 2025 Google requires JavaScript (SearchGuard), plain HTTP returns an empty shell page, a tested requests+residential-proxy setup succeeded on only 31/50 queries (12 CAPTCHAs, 5 HTTP 429s), residential bandwidth lists at $8/GB on Bright Data, Google's ToS (effective July 30, 2026) bars automated access in violation of robots.txt, and Google sued SerpApi under DMCA 1201 on December 19, 2025 seeking $200-$2,500 per act (partly dismissed with prejudice July 20, 2026, amended complaint Aug 10, 2026, still live), whereas SerpApi's Legal Shield (plans >= $150/mo) contractually assumes that liability. Recommendation: DataForSEO Standard queue as primary (with Live mode for instant add-time validation), SerpApi as fallback/second-opinion provider (best docs, official Node SDK, Legal Shield, device=tablet), Bright Data brd_ai_overview=2 as a third browser-rendered fallback; estimated provider cost at one capture/day/query is roughly $4 / $36 / $365 per month at 100 / 1,000 / 10,000 queries on DataForSEO, versus $75 / $725 / $2,750 on SerpApi and $40 / $250 / $900 on SearchApi, before multiplying by the number of locale x device x time-of-day variants tracked.

## Fact-check results

Independent skeptics tried to refute the top plan-critical claims. Where a claim was `partially_wrong`, the corrected claim below is authoritative.

### Verdict: `confirmed`

**Original claim.** Google provides no official API for AI Overviews. The Custom Search JSON API returns only web/image search results, is closed to new customers, and existing customers must migrate by January 1, 2027; Google Search Central states there is no API, markup, or separate Search Console report for AIO/AI Mode; Gemini 'Grounding with Google Search' returns the model's own answer with url_citation annotations, not Google's AIO.

**Corrected claim.** Google provides no official API for retrieving AI Overviews. The Custom Search JSON API (developers.google.com/custom-search/v1/overview) is "closed to new customers"; "Existing Custom Search JSON API customers have until January 1, 2027 to transition to an alternative solution"; it returns "web search or image search results in JSON format" with 100 free queries/day and "$5 per 1000 queries, up to 10k queries per day." Google Search Central's AI features page (last updated 2025-12-10) says "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary," that "You don't need to create new machine readable files, AI text files, or markup... There's also no special schema.org structured data," and that sites appearing in AI Overviews/AI Mode "are included in the overall search traffic in Search Console" (no separate report; the Performance report help page likewise has no AI Overview/AI Mode filter or search type). Gemini "Grounding with Google Search" (ai.google.dev, last updated 2026-09-23, now documented against the Interactions API) returns the model's "synthesized answer with inline citations" using url_citation annotations (start_index/end_index -> source URL) plus google_search_call queries and google_search_result search_suggestions; it does not return the AI Overview shown on google.com. Build implication stands: the capture layer must use a third-party SERP scraper behind a provider-abstraction interface.

**Checker notes.** Word-by-word check against the three primary sources on 2026-10-06: all quoted strings, the Jan 1, 2027 date, $5/1000 queries, 10k/day cap, and field names (url_citation, google_search_call) match the live pages. Staleness check: the Search Central updates log through mid-2026 shows only guidance changes (May 15 2026 AI optimization guide, May 27 2026 preferred sources rolling out to AI Overviews/AI Mode, June 15 2026 clarification) and no new AI Overview API or dedicated Search Console report; the Search Console Performance report help page has no AI Overview/AI Mode filter or search type. Minor nuances: (a) the Search Central page does not literally say "there is no API" -- it says no markup/files/structured data are needed and that AI traffic is folded into overall Search Console data; the absence of an API is an accurate inference, not a quote. (b) The Gemini grounding doc has since been rewritten around the Interactions API (updated 2026-09-23); url_citation/google_search_call naming still matches, and the page never mentions AI Overviews. (c) The WebSearch tool's per-turn budget was exhausted, so the newer-announcements check relied on Google's own updates log and help pages rather than a broad web search; a follow-up search for third-party reporting (e.g., any Search Console AI Mode report announced after June 2026) could be run if desired.

Evidence:
- https://developers.google.com/custom-search/v1/overview
- https://developers.google.com/search/docs/appearance/ai-features
- https://ai.google.dev/gemini-api/docs/google-search
- https://developers.google.com/search/updates
- https://support.google.com/webmasters/answer/7042828

### Verdict: `partially_wrong`

**Original claim.** DataForSEO's Google Organic SERP API (Advanced) returns a top-level item of type 'ai_overview' with a full 'markdown' field, an 'items' array of typed sub-elements (ai_overview_element, ai_overview_expanded_element, ai_overview_table_element, ai_overview_video_element) each carrying 'references' (type, source, domain, url, title, text), and an 'asynchronous_ai_overview' boolean; setting 'load_async_ai_overview: true' fetches lazily-loaded AIOs for one extra base price, refunded when no async AIO is present; 'expand_ai_overview: true' expands the block.

**Corrected claim.** DataForSEO's Google Organic SERP API (Advanced) returns a top-level item of type 'ai_overview' with fields type, rank_group, rank_absolute, page, position, xpath, asynchronous_ai_overview (boolean), markdown (full text), items[] (typed sub-elements: ai_overview_element, ai_overview_expanded_element, ai_overview_table_element, ai_overview_video_element), references[] and rectangle. Each ai_overview_element has title, text, markdown, links, images, references; ai_overview_expanded_element has components[] (each with title, text, markdown, images, links, references). References are {type:'ai_overview_reference', source, domain, url, title, text}. Setting 'load_async_ai_overview: true' fetches asynchronously-loaded AIOs (default false = cache only) for an extra $0.002 per Live Advanced call or $0.0006 per task_post call, refunded if the element is absent or has asynchronous_ai_overview: false. 'expand_ai_overview: true' (default false) is documented only on the task_post endpoint and applies only to HTML task results; it is not a documented parameter on the Live Advanced endpoint. Localisation: location_code / location_name / location_coordinate ('latitude,longitude,radius', max 7 decimals, radius 199–199999 mm), language_code / language_name, device desktop|mobile, os windows|macos (desktop) or android|ios (mobile). Citation mapping is per element/component, not per sentence.

**Checker notes.** Checked both cited doc pages as of 2026-10-06 (Live Advanced page read in full across four offsets). All field names, element types, reference fields, the asynchronous_ai_overview boolean, the markdown field, and the exact load_async_ai_overview wording and prices ($0.002 Live / $0.0006 task_post, refunded when absent or asynchronous_ai_overview: false) match verbatim. The one inaccuracy: expand_ai_overview appears only in the task_post docs with the note "this parameter applies only to HTML task results"; it is absent from the Live Advanced page, so the claim's framing of it as a general Advanced parameter that "expands the block" is misleading for a builder using Live Advanced (JSON results). Also note the undocumented-in-claim 'rectangle' field exists on the item. Staleness check via WebSearch could not be performed: the turn's shared web-search budget was exhausted, so no newer pricing/deprecation announcements were searched; the live docs themselves were the verification basis.

Evidence:
- https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/
- https://docs.dataforseo.com/v3/serp/google/organic/task_post/

### Verdict: `confirmed`

**Original claim.** DataForSEO Google Organic SERP pricing as of 2026-10-06: Standard queue $0.0006/SERP ($0.60 per 1k, ~5 min turnaround), Priority queue $0.0012/SERP ($1.20 per 1k, ~1 min), Live $0.002/SERP ($2 per 1k, ~6 s); load_async_overview adds one base price; rate limit 2,000 API calls/min with up to 100 tasks per POST; $50 minimum payment; Standard results kept 30 days, Live results not stored, HTML kept 7 days.

**Corrected claim.** DataForSEO Google Organic SERP pricing as of 2026-10-06 (per vendor pricing page, 1 SERP = 10 results): Standard queue $0.0006/SERP ($0.60 per 1K, ~5 min avg turnaround), Priority queue $0.0012/SERP ($1.20 per 1K, up to ~1 min avg), Live $0.002/SERP ($2 per 1K, up to ~6 s avg). Multipliers: search operators x5 per parameter, calculate_rectangles +1 base price, depth multiplies per each 10 results, max_crawl_pages multiplies per SERP, load_async_overview +1 base price, people_also_ask_click_depth +$0.00015 per click. Rate limit: up to 2,000 POST and GET API calls per minute in total, each POST call containing no more than 100 tasks; pingback_url and postback_url supported (postback function regular|advanced|html). Minimum payment $50. Standard task results kept 30 days; Live task results are not stored; HTML results of Standard-mode SERP tasks kept 7 days. Worst-case cost per daily capture on Standard with load_async_overview = $0.0012. Terms of Service s.7.1 bars using SERP data to compete with or adversely affect the business interests of the search engine providers; s.7.2 makes the customer indemnify DataForSEO for violations. Google AI Mode SERP API: Standard $0.0012, Priority $0.0024, Live $0.004 per SERP.

**Checker notes.** All six cited primary sources were fetched live on 2026-10-06 and every number, limit, parameter name and quoted phrase in the claim matched word-for-word: $0.0006/$0.0012/$0.002 per SERP with 5 min / up to 1 min / up to 6 s turnarounds; 'load_async_overview: Add one base price'; '2000 POST and GET API calls per minute ... no more than 100 tasks'; '$50 minimum payment amount'; 30-day Standard retention, Live results not kept, HTML 7 days; ToS 7.1/7.2 language; AI Mode $0.0012/$0.0024/$0.004. The only minor nuance: the vendor phrases Priority and Live turnarounds as 'up to 1 minute' and 'up to 6 seconds on average', so '~1 min' and '~6 s' are fair paraphrases. Caveat: the second check (searching for post-January-2026 pricing changes or deprecations) could not be performed because the per-turn WebSearch budget was exhausted; however, since the live vendor pages themselves were read today, they represent current pricing, which is the strongest available evidence. The user may re-run a search in a follow-up to confirm no announced-but-not-yet-effective changes exist. Note that DataForSEO pricing is pay-as-you-go and can change without notice, so a SaaS plan should treat these as current figures to re-verify at launch.

Evidence:
- https://dataforseo.com/pricing/google-serp/google-organic-serp-api
- https://docs.dataforseo.com/v3/serp/overview/
- https://dataforseo.com/help-center/how-long-do-you-keep-results
- https://dataforseo.com/pricing
- https://dataforseo.com/pricing/serp/google-ai-mode-serp-api
- https://dataforseo.com/terms-of-service

## Findings

### 1. Google provides no official API for AI Overviews. The Custom Search JSON API returns only web/image search results, is closed to new customers, and existing customers must migrate by January 1, 2027; Google Search Central states there is no API, markup, or separate Search Console report for AIO/AI Mode; Gemini 'Grounding with Google Search' returns the model's own answer with url_citation annotations, not Google's AIO.

_Confidence: high_ **[plan-critical]**

developers.google.com/custom-search/v1/overview: 'Existing Custom Search JSON API customers have until January 1, 2027 to transition to an alternative solution'; API 'closed to new customers'; returns 'web search or image search results in JSON format'; $5 per 1000 queries up to 10k/day. developers.google.com/search/docs/appearance/ai-features: 'There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary'; AI-feature traffic is 'included in the overall search traffic in Search Console' (no separate report). ai.google.dev/gemini-api/docs/google-search: response is 'the model's synthesized answer with inline citations' via url_citation annotations plus google_search_call queries — it is not the AIO shown on google.com. Build implication: the capture layer must be a third-party SERP scraper; design a provider-abstraction interface from day one.

Sources:
- https://developers.google.com/custom-search/v1/overview
- https://developers.google.com/search/docs/appearance/ai-features
- https://ai.google.dev/gemini-api/docs/google-search

### 2. DataForSEO's Google Organic SERP API (Advanced) returns a top-level item of type 'ai_overview' with a full 'markdown' field, an 'items' array of typed sub-elements (ai_overview_element, ai_overview_expanded_element, ai_overview_table_element, ai_overview_video_element) each carrying 'references' (type, source, domain, url, title, text), and an 'asynchronous_ai_overview' boolean; setting 'load_async_ai_overview: true' fetches lazily-loaded AIOs for one extra base price, refunded when no async AIO is present; 'expand_ai_overview: true' expands the block.

_Confidence: high_ **[plan-critical]**

docs.dataforseo.com Live Advanced + task_post: ai_overview item fields: type, rank_group, rank_absolute, page, position, xpath, asynchronous_ai_overview, markdown, items[], references[] where each reference is {type:'ai_overview_reference', source, domain, url, title, text}. ai_overview_element = {title, text, markdown, links, images, references}; expanded element has components[] with nested references. load_async_ai_overview description: 'set to true to obtain ai_overview items in SERPs even if they are loaded asynchronously; if set to false, you will only obtain ai_overview items from cache' and 'you will be charged extra $0.002 (Live) / $0.0006 (task_post) for using this parameter; if the element is absent or contains asynchronous_ai_overview: false, all extra charges will be returned to your account balance'. expand_ai_overview: 'set to true to expand the ai_overview item in HTML results (default false)'. Localisation: location_code / location_name / location_coordinate ('latitude,longitude,radius'), language_code / language_name, device desktop|mobile, os windows|macos|android|ios. Caveat: citation mapping is per element (paragraph/expanded component), not per sentence index; the markdown field gives the full text for LLM analysis. Build implication: this is the richest single-call structure at the lowest price; normalise its element-level references into the canonical schema.

Sources:
- https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/
- https://docs.dataforseo.com/v3/serp/google/organic/task_post/

### 3. DataForSEO Google Organic SERP pricing as of 2026-10-06: Standard queue $0.0006/SERP ($0.60 per 1k, ~5 min turnaround), Priority queue $0.0012/SERP ($1.20 per 1k, ~1 min), Live $0.002/SERP ($2 per 1k, ~6 s); load_async_overview adds one base price; rate limit 2,000 API calls/min with up to 100 tasks per POST; $50 minimum payment; Standard results kept 30 days, Live results not stored, HTML kept 7 days.

_Confidence: high_ **[plan-critical]**

dataforseo.com/pricing/google-serp/google-organic-serp-api: 'Standard Queue (5 min avg turnaround) Per 1K SERPs: $0.6', 'Priority Queue (1 min avg) $1.2', 'Live Mode (6 sec avg) $2'; multipliers: search operators x5, calculate_rectangles +1 base, depth per extra 10 results, 'load_async_overview: Add one base price'. docs overview: 'You can send up to 2000 POST and GET API calls per minute in total, with each POST call containing no more than 100 tasks'; pingback_url / postback_url (gzip POST with postback_data regular|advanced|html). dataforseo.com/pricing: '$50 minimum payment amount'. Help center: Standard 'task results are kept for 30 days'; 'we do not keep the results of Live tasks, so you can only get them once'; HTML 'kept for 7 days only'. Effective worst-case cost per daily capture with async AIO on Standard = $0.0012. Terms of Service s.7.1: SERP data 'shall not be used to compete with or adversely affect the business interests of the search engine providers' and s.7.2 customer indemnifies DataForSEO. Google AI Mode endpoint ('ai_mode'): Live $0.004, Standard $0.0012, Priority $0.0024 per SERP.

Sources:
- https://dataforseo.com/pricing/google-serp/google-organic-serp-api
- https://docs.dataforseo.com/v3/serp/overview/
- https://dataforseo.com/help-center/how-long-do-you-keep-results
- https://dataforseo.com/terms-of-service
- https://dataforseo.com/pricing/serp/google-ai-mode-serp-api
- https://dataforseo.com/pricing

### 4. SerpApi returns an 'ai_overview' object inside the Google Search API response with 'text_blocks' (types paragraph, heading, list, table, expandable, comparison, top_stories; fields snippet, snippet_highlighted_words, snippet_links, reference_indexes, nested list/table/text_blocks) and 'references' (index, title, link, snippet, source); when Google lazy-loads the AIO the block instead contains 'page_token' + 'serpapi_link' which 'will expire within 1 minute' and must be redeemed on engine=google_ai_overview, and SerpApi states this two-call path 'will count as two SerpApi searches'.

_Confidence: high_ **[plan-critical]**

serpapi.com/ai-overview documents the block structure and 'Separate Request Required' case; serpapi.com/google-ai-overview-api: engine 'google_ai_overview', required api_key + page_token, 'ai_overview.page_token expires within 1 minute of the search and should be used immediately', 'error' string when unavailable, no_cache, async, output json|html|md. serpapi.com/blog/understanding-ai-overview-data-from-serpapi (Sept 12 2025): 'For many queries, the Google Search API returns an AI Overview directly in the initial response' and for 'less common or more complex queries' a page_token is returned; 'because this involves two API calls, it will count as two SerpApi searches.' Older SerpApi blog posts (Jul 2025, 2024/25 update) say ~4 minutes expiry; current docs say 1 minute — design for 60 s. Localisation (serpapi.com/search-api): location, uule, google_domain, gl, hl, device = desktop (default) | tablet (iPads) | mobile. Cache: 'A cache is served only if the query and all parameters are exactly the same. Cache expires after 1h.' 'Cached searches are free, and are not counted towards your searches per month.' Use no_cache=true for every tracking capture. Build implication: redeem page_token synchronously inside the same worker invocation (never across a queue hop); budget up to 2 searches per capture.

Sources:
- https://serpapi.com/ai-overview
- https://serpapi.com/google-ai-overview-api
- https://serpapi.com/blog/understanding-ai-overview-data-from-serpapi/
- https://serpapi.com/search-api
- https://github.com/serpapi/google-AI-overview-scraper

### 5. SerpApi pricing as of 2026-10-06: Free 250 searches (50/hr); Starter $25/1,000; Developer $75/5,000; Production $150/15,000 (3,000/hr); Big Data $275/30,000 (6,000/hr); Searcher $725/100,000 (20,000/hr); Volume $1,475/250,000 (50,000/hr); Infrastructure $2,750/500,000 (100,000/hr); Cloud 1M $3,750/1,000,000 (110,000/hr); only successful searches count; Legal Shield (up to $2M liability assumption) from Production tier up; search data retained 31 days, ZeroTrace available.

_Confidence: high_ **[plan-critical]**

serpapi.com/pricing: per-search price falls from $25/1k (Starter) to $15/1k (Developer) to $10/1k (Production) to ~$1.97/1k (Cloud 54M); 'Only successful searches are counted toward your monthly searches. Cached, errored, and failed searches are not.' serpapi.com/legal: 'For all recurring plans except the Free, Starter, and Developer plans, SerpApi will assume the liabilities of scraping and parsing search engine results ... with up to $2 million in coverage (U.S. Legal Shield), provided your use of the data or service is not illegal'; 'Search data is retained for 31 days'; ZeroTrace 'prevents search parameters, queries, and results from being stored on our systems entirely'. ToS prohibits reselling 'the Service' but does not restrict storing returned JSON. Build implication: SerpApi is 8-20x DataForSEO's price per capture, but is the only provider contractually indemnifying the customer; sensible as fallback / legal-cover tier rather than primary at 10k queries/day.

Sources:
- https://serpapi.com/pricing
- https://serpapi.com/legal

### 6. AIO prevalence in 2026 is high but highly method-dependent and unstable month to month: Similarweb 43% of US Google searches (July 2026, up from 15% a year earlier); Conductor 23% (Sept 2025) -> 47% (Jan 2026) -> 34% (Feb 2026) across 274,524,214 US searches; Semrush 10M-keyword panel 6.49% (Jan 2025), 24.61% (Jul 2025), 15.69% (Nov 2025); Pew real-user panel 18% (March 2025); Bright Data says its AIO parameter yields AIOs in '~15-20%+ of results'.

_Confidence: high_ **[plan-critical]**

thekeyword.co (Similarweb analysis, reported July 29 2026): '43% of Google searches now display an AI Overview', 'up from 15% one year prior'. conductor.com volatility analysis: coverage 'nearly doubled from 23% in September 2025 to 47% in January 2026, then corrected sharply to 34% in February'; Energy swung +62.2% then -46.0% MoM; Real Estate lowest six-month average 20.0%. semrush.com study (10M+ keywords): 6.49% Jan 2025, 24.61% Jul 2025, 15.69% Nov 2025; intent mix Oct 2025: informational 57.1%, commercial 18.57%, transactional 13.94%, navigational 10.33%. pewresearch.org: 900 US adults, 68,879 searches March 2025, 18% produced an AI summary; link clicks 8% with summary vs 15% without; 1% clicked a link inside the summary. tom-riley.co.uk compilation notes keyword panels 'over-represent commercially interesting terms' vs behavioural panels. Build implication: at query-add time run a live capture (DataForSEO Live or SerpApi) to confirm an AIO triggers; store 'present=false' snapshots as data (the thread's 'does the AIO still appear?' is itself a tracked signal); expect buying-intent queries to trigger less often than informational ones.

Sources:
- https://www.thekeyword.co/news/google-ai-overviews-search-share
- https://www.conductor.com/academy/ai-overviews-industry-volatility-analysis/
- https://www.semrush.com/blog/semrush-ai-overviews-study/
- https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/
- https://tom-riley.co.uk/blog/google-ai-overviews-statistics/
- https://docs.brightdata.com/api-reference/serp/google-search/ai-overview

### 7. AIOs vary run-to-run and day-to-day even with identical parameters: Ahrefs (43,000+ keywords, Nov 2025) found a '70% chance of changing from one observation to the next', average persistence 2.15 days, '45.5% of citations change when AI Overviews update' (54.5% URL overlap), two incognito captures two minutes apart differed in wording and structure, yet cosine similarity of meaning was 0.95; Detailed.com (1,300+ prompts x 28 days) found only ~half of AIO-cited pages are cited again next day; Oxylabs docs warn 'AI-generated answers may vary over time, even with identical parameters.'

_Confidence: high_ **[plan-critical]**

ahrefs.com/blog/ai-overview-change (Nov 11 2025): 43k keywords each with >=16 observations; 70% change probability; 2.15-day persistence; 45.5% citation churn / 54.5% overlap (~1 URL swap per regeneration); 'renters insurance' example captured 'two minutes apart in incognito mode'; semantic cosine 0.95; search volume vs change rate correlation -0.014 (popular queries no more stable). detailed.com/ai-volatility: 70k+ responses, 1,300+ prompts daily, 28 days; AIO leading brand present 89% of days; 'On AI Overviews, it was around half' of cited pages re-cited next day; identical brand/domain list on two random days '<3% of the time'. seranking.com AI Mode research (June 20 2025): same-day repeats matched only 9.2% of URLs (14.7% domains); AIO vs AI Mode exact-URL overlap 10.7%, domain overlap 16%; 'results across all parses were similar' between logged-in and non-logged-in. Build implication: the 7-day aggregation and frequency counting in the thread is the correct statistical response; capture >=2 samples/day; diff on sets of (claim, entity, cited URL/domain) rather than raw string; surface 'citation stability %' per source as the core 'reverse-engineer the citations' metric.

Sources:
- https://ahrefs.com/blog/ai-overview-change/
- https://detailed.com/ai-volatility/
- https://seranking.com/blog/ai-mode-research/
- https://developers.oxylabs.io/products/web-scraper-api/targets/search-engines/google/ai-overviews.md

### 8. Self-hosting a Playwright/headless scraper is materially riskier and not cheaper: Google has required JavaScript ('SearchGuard') since Jan 15-17, 2025, plain HTTP returns a ~91 KB shell with zero result headings, a tested requests+rotating-residential-proxy setup succeeded on only 31/50 queries (12 CAPTCHAs, 5 HTTP 429), residential bandwidth lists at $8/GB on Bright Data, Google's ToS (effective July 30, 2026) prohibits automated access in violation of robots.txt, and Google is actively litigating scraping under DMCA 1201 (Google v. SerpApi, N.D. Cal., filed Dec 19, 2025, $200-$2,500 statutory damages per act).

_Confidence: high_ **[plan-critical]**

apiserpent.com/blog/google-search-requires-javascript: Google to TechCrunch 'Enabling JavaScript allows us to better protect our services and users from bots and evolving forms of abuse and spam'; July 2026 test: HTTP 200 with '~91 KB of HTML', 'Zero <h3> result headings', 31/50 success with proxies. searchengineland / safaridigital (Jan 16-20 2025): data blackouts at Semrush, SE Ranking, Similarweb, Rank Ranger, ZipTie. brightdata.com residential pricing: '$8/GB' PAYG (promo $4), $7/GB at $499/mo, $5/GB at $1,999/mo. policies.google.com/terms (effective July 30 2026): forbids 'using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files...)'. ipwatchdog.com: complaint filed Dec 19 2025 under 17 U.S.C. 1201(a)(1)(A) and 1201(a)(2) over SearchGuard circumvention; statutory damages 'at least $200 and up to $2,500 for each' violation; Google calls the model 'parasitic'. Search summary (ppc.land / almcorp): July 20 2026 Chief Judge Gonzalez Rogers granted SerpApi's motion to dismiss with prejudice for results with no copyrighted content, allowed amendment on licensed-content results; Google amended Aug 10 2026, SerpApi moved to dismiss again Aug 25 2026 (status details: medium confidence, from secondary reports). Build implication: a one-founder SaaS should not run its own Google scraper; buy capture from providers (ideally one with Legal Shield as fallback) and keep the provider layer swappable in case a vendor is enjoined.

Sources:
- https://apiserpent.com/blog/google-search-requires-javascript
- https://brightdata.com/pricing/proxy-network/residential-proxies
- https://policies.google.com/terms
- https://ipwatchdog.com/2025/12/26/google-sues-serpapi-parasitic-scraping-circumvention-protection-measures/

### 9. SearchApi.io mirrors SerpApi's shape at 2.5-6x lower price: the google engine returns 'ai_overview' with 'text_blocks' (type paragraph|header|unordered_list, answer, link, answer_highlight, reference_indexes, items), 'markdown' with numbered citations, and 'reference_links' (index, title, link, snippet, source); lazily-loaded AIOs return 'error' + 'page_token' to redeem on engine=google_ai_overview ('Page tokens expire in less than 1 minute'); plans Developer $40/10k ($4/1k), Production $100/35k ($3/1k), BigData $250/100k ($2.50/1k), Scale $500/250k ($2/1k), Octo 500K $900, Octo 1M $1,500 ($1.50/1k), Octo 5M $5,000 ($1/1k); only HTTP-200 searches are billed; 'You can utilize only up to 20% of your plan's credits each hour.'

_Confidence: high_

searchapi.io/docs/google-ai-overview-api: parameters engine, page_token, link, api_key, zero_retention; response text_blocks / markdown / reference_links. searchapi.io/docs/google: device desktop|mobile|tablet; location (canonical), uule (not with location), latitude/longitude, gl (default us), hl (default en), lr, cr; 'google_domain: Phased out as of April 15, 2025, when Google discontinued ccTLD support'. searchapi.io/pricing: table as stated; AI Overview/AI Mode have no separate price (one search = one credit). Not documented: whether the google_ai_overview redemption is billed as a second search (assume yes). The 20%-per-hour rule matters for a nightly batch: a 10k-query daily run needs a plan with >=50k credits to complete within one hour. Google AI Mode API is listed in SearchApi's nav.

Sources:
- https://www.searchapi.io/docs/google-ai-overview-api
- https://www.searchapi.io/docs/google
- https://www.searchapi.io/pricing
- https://www.searchapi.io/google-ai-overview-api

### 10. Bright Data SERP API captures the AIO in a single call with brd_ai_overview=2 (adds ~5-10 s because 'it launches a browser'), returning 'ai_overview' with 'texts' [{type: paragraph|list, snippet, reference_indexes, image}] and 'references' [{href, title, source, index}]; pricing $1.5/1k PAYG, Scale $499/mo for 380k requests ($1.3/1k extra), 5K free requests/month, 'no limit to the number of concurrent requests'; localisation gl, hl, uule (canonical name or beta 'lat,lon,radius'), brd_mobile (0, 1, ios, ipad, android, android_tablet), brd_browser; all requests route via google.com; Google deprecated 'num' on Sept 11, 2025.

_Confidence: high_

docs.brightdata.com AI overview page: 'brd_ai_overview=2 will increase the likelihood of receiving Google's Generative AI Overviews in your SERP responses, typically appearing in ~15-20%+ of results'; 'Expect an extra ~5-10 seconds of latency'; 'No second request is required'. docs.brightdata.com Google query parameters: brd_json=1|html; 'All requests route through google.com regardless of TLD specified; localization depends solely on gl and hl'; uule beta coordinates. brightdata.com/pricing/serp: '$1.5/1K requests', '$499 /month 380K requests included $1.3/1K additional', '5K records per month' free, 'Pay only for success', 'JavaScript Rendering, CAPTCHA Solving' included. Bright Data lists a 'Google AI Mode' scraper in its AI-scrapers library but no SERP-API parameter is documented. Build implication: good third fallback because it is browser-rendered and single-call; the '~15-20%' note suggests its trigger rate trails what DataForSEO/SerpApi report, so compare presence rates across providers during a pilot.

Sources:
- https://docs.brightdata.com/api-reference/serp/google-search/ai-overview
- https://docs.brightdata.com/scraping-automation/serp-api/query-parameters/google
- https://brightdata.com/pricing/serp

### 11. Oxylabs Web Scraper API returns AIOs with the finest citation granularity of any provider: with source=google_search, render=html, user_agent_type=desktop|mobile, parse=true, the parsed 'ai_overviews' array holds 'answer_text' [{fragments: [{text, references: [{source, url}]}], pos}], 'bullet_list', 'source_panel' {items: [{url, source, title, pos}]}, 'info_list', 'pos_overall', with context option 'expand_aio'; Google results cost $1.00/1k but JS-rendered results (required for AIO) $1.35/1k on Micro ($49/mo), $1.30 on Starter ($99), $1.25 on Advanced ($249, up to 622,500 results); 50 req/s on Micro; free trial 2,000 results.

_Confidence: high_

developers.oxylabs.io ai-overviews.md: required 'source: google_search or google_ads', 'render: html', 'user_agent_type: desktop or mobile'; optional geo_location, locale, start_page, pages, limit, context[expand_aio, filter, safe_search, udm, tbm, tbs, fpstate, nfpr], callback_url (push-pull); 'AI-generated answers may vary over time, even with identical parameters'; AIOs unavailable in France, China, Iran, Syria, Cuba, North Korea; response array may hold multiple AI blocks. ai-mode.md: source 'google_ai_mode', render html, query <=400 symbols, content.response_text, content.links, content.citations. oxylabs.io pricing page: tiers as stated, 'JS rendering: $1.35/1K' etc. Build implication: strong alternative primary if sentence-level citation mapping is a product differentiator; async push-pull fits batch jobs; cost sits between DataForSEO and SearchApi.

Sources:
- https://developers.oxylabs.io/products/web-scraper-api/targets/search-engines/google/ai-overviews.md
- https://developers.oxylabs.io/products/web-scraper-api/targets/search-engines/google/ai-mode.md
- https://oxylabs.io/products/scraper-api/serp/pricing

### 12. Serper.dev does not return AI Overviews at all (no aiOverview field in any documented response), so it is unusable for this product despite being the cheapest SERP API: $50/50k ($1.00/1k, 50 qps), $375/500k ($0.75/1k, 100 qps), $1,250/2.5M ($0.50/1k), $3,750/12.5M ($0.30/1k, 300 qps), credits valid 6 months, 2,500 free queries.

_Confidence: high_

serper.dev homepage pricing section quoted verbatim; response examples show organic, knowledgeGraph, answerBox, peopleAlsoAsk, places, images, news, shopping only. Third-party comparisons (apiserpent, cloro, scrapingdog) consistently say Serper returns no structured AIO/citations. Build implication: exclude; could at most serve as a cheap organic-rankings sidecar for 'does my page rank' checks.

Sources:
- https://serper.dev

### 13. HasData Google SERP API returns 'aiOverview' with 'textBlocks' [{type paragraph|list|table|carousel|code|video, snippet, snippetHighlightedWords, referenceIndexes, list, thumbnail}] and 'references' [{index, title, link, snippet, source}]; when lazily loaded it returns 'pageToken' + 'hasdataLink' to redeem at POST /scrape/google/ai-overview (10 credits), with token expiry stated as 4 minutes on one doc page and 1 minute on another; SERP request = 10 credits; plans Free 1,000 credits/1 concurrency, Startup $49/200k/5, Basic $99/1M/15, Growth $208/3M/50; params location, uule, domain, gl, hl, deviceType desktop|mobile|tablet; Google AI Mode endpoint /scrape/google/ai-mode at 10 credits.

_Confidence: high_

docs.hasdata.com rich-snippets/ai-overview.md and apis/google-serp/ai-overview: 'pageToken and hasdataLink expire within 4 minutes of the original search' vs 'Token from aiOverview block in Google SERP API. Valid for 1 minute' — treat as 60 s. Pricing reference table: Google SERP API 10 credits / $0.83 CPM; AI Overview API 10 credits. hasdata.com/pricing: effective $2.46/1k (Startup), $0.99/1k (Basic), $0.69/1k (Growth) per SERP before the AIO follow-up. 'Unused credits do not roll over.' Build implication: viable budget two-step fallback with the same block/reference shape as SerpApi; low concurrency caps (5-50) constrain nightly batch size.

Sources:
- https://docs.hasdata.com/apis/google-serp-api/rich-snippets/ai-overview.md
- https://docs.hasdata.com/apis/google-serp/ai-overview
- https://docs.hasdata.com/apis/google-serp-api/api-params.md
- https://docs.hasdata.com/basics/pricing
- https://hasdata.com/pricing
- https://docs.hasdata.com/apis/google-ai-mode/quickstart.md

### 14. ScrapingDog: Google Search API costs 5 credits (10 with mob_search=true or advance_search=true) and returns an 'ai_overview' object with either embedded content or a 'url'/'scrapingdog_link' that must be redeemed at GET https://api.scrapingdog.com/google/ai_overview (5 credits) within 2 minutes; AIO response has text_blocks [{type paragraph|heading|list, snippet, snippet_highlighted_words}] and references [{title, link, snippet, source, index}]; plans Lite $40/200k credits ($1/1k Google searches), Standard $90/1M ($0.45/1k), Pro $200/3M ($0.333/1k, 100 threads), Premium $350/6M; Google AI Mode API 10 credits.

_Confidence: medium_

scrapingdog.com/documentation/google-ai-overview-api: 'Each successful request costs 5 API credits'; 'Both url and scrapingdog_link expire 2 minutes after the original search'. Google Search API docs: params country, language, domain, location (city level recommended), uule, mob_search. Pricing page: 28 tiers; concurrency 1 thread (Free) to 2,200 (Nova Pro). Caveat: the AIO docs' text_blocks example did not show reference_indexes, so chunk-to-citation mapping is unverified for ScrapingDog (medium confidence on mapping).

Sources:
- https://www.scrapingdog.com/documentation/google-ai-overview-api/
- https://www.scrapingdog.com/documentation/google-search-api/
- https://www.scrapingdog.com/pricing

### 15. Traject Data (VALUE SERP, Scale SERP, SerpWow) returns AIOs in a single call with include_ai_overview=true as 'ai_overview_banner', 'ai_overview_contents' [{type: header|list, text}] and 'ai_overview_sources' [{source_title, source_description, source_url, source_image, source_name}] — a flat source list with no chunk-to-citation mapping; originally desktop + US/.com only (Nov 11, 2024), the July 7, 2025 guide says device=mobile and 200+ Google domains / 40+ languages are supported; VALUE SERP plans $50/25k credits ($1.60/1k, 250/min), $240/200k ($1.20/1k, 1,000/min), $1,000/1M ($1.00/1k, 1,500/min); Scale SERP $66/10k, $199/50k, $599/250k, 15,000 parallel searches, batches up to 10,000; AIO credit surcharge not published.

_Confidence: medium_

trajectdata.com/capture-google-ai-overviews-data-with-our-serp-apis (Nov 11 2024): 'Make sure domain is set to .com (or input a US location)' and 'do not make it a mobile search (desktop only!)'. trajectdata.com/how-to-scrape-google-ai-overviews-serp-api (Jul 7 2025): 'device=mobile', 'supports 200+ Google domains and 40+ languages'. The valueserp.com docs URL for ai-overview 301s to docs.trajectdata.com and 404s there, so the exact field list was taken from the vendor blog posts. Build implication: usable as a cheap single-call fallback for presence/sources, but it cannot feed a per-claim citation map; Scale SERP's Batch API (10k batches, scheduled) is a natural fit for daily tracking if its AIO output proves adequate.

Sources:
- https://trajectdata.com/capture-google-ai-overviews-data-with-our-serp-apis/
- https://trajectdata.com/how-to-scrape-google-ai-overviews-serp-api/
- https://trajectdata.com/pricing/value-serp-api
- https://trajectdata.com/pricing/scale-serp-api

### 16. Zenserp's pricing page lists 'AI Overview (3 credits each)' on all paid plans (Small $49.99/25k, Medium $149.99/100k, Large $299.99/250k, Premium $499.99/500k, Enterprise $899/1M; ~400 concurrent connections; 20% annual discount) but its public docs page marks AI Overview as 'Coming Soon' and no response schema for citations is published.

_Confidence: low_

zenserp.com/pricing: 'An AI Overview request uses 3 searches'. zenserp.com/docs and /google-ai-overview-api: AI Overview listed under AI Search as 'Coming Soon'; real documentation sits behind app.zenserp.com/documentation (login). Build implication: do not plan around Zenserp until its AIO schema (and whether citations/mapping are returned) can be verified from inside an account.

Sources:
- https://zenserp.com/pricing/
- https://zenserp.com/docs/
- https://zenserp.com/google-ai-overview-api/

### 17. Apify offers several Google AIO actors with pay-per-event pricing: the first-party 'apify/google-ai-overviews-scraper' at 'from $1.00 / 1,000 google ai overviews' returns {query, type: live|static, text, sources[{url, title, description}]} with no chunk mapping and writes non-triggering queries to an errors dataset; the community 'brilliant_gum/google-serp-scraper' charges $0.002/search page + $0.005 per AIO and returns aiOverview.text, sources[{domain, url, title, citationIndex}] and a captureType of static_html | async_pending | not_present | rendered; the first-party 'apify/google-search-scraper' is 'from $1.80 / 1,000 scraped search result pages' with countryCode, languageCode, locationUule, mobileResults and maxConcurrency=10.

_Confidence: medium_

Pages fetched as cited. Apify platform subscription fees (on top of per-event prices) were not verified. Localisation on the official AIO actor is only 'queries' in the README (other options referenced but not detailed). Build implication: Apify actors are the cheapest nominal price but are individually maintained (community actors can break or be unpublished), add platform overhead, and the official AIO actor lacks citation-to-text mapping; treat as experimental fallback, not primary.

Sources:
- https://apify.com/apify/google-ai-overviews-scraper
- https://apify.com/brilliant_gum/google-serp-scraper
- https://apify.com/apify/google-search-scraper

### 18. AIOs differ by logged-in state and device: BrightEdge (Sept 2024) found AIOs 'show more often for signed in users and show 10-20% less for signed-out users', 90% less on ecommerce, 21% less education, 17% less B2B tech, 16% less healthcare; Semrush data puts ~59% of AIO occurrences on desktop vs ~39% on smartphones; Google's help page says AIOs appear 'when our systems determine that generative AI can be especially helpful' and are 'available on mobile devices in all regions and languages where AI Overviews and AI Mode are supported', and cannot be turned off; all third-party APIs capture the signed-out experience.

_Confidence: medium_

digitalinformationworld.com (reporting BrightEdge, Sept 22 2024) quoted verbatim; original BrightEdge PDF returned 404. Semrush device split from third-party compilation of Semrush data (seoprofy / search summary) — medium confidence. support.google.com/websearch/answer/14901683: 'AI Overviews are a core Google Search feature, like knowledge panels. Features cannot be turned off'; Web filter shows text-only results; 100+ languages listed. Google blog Oct 28 2024: rollout to 'more than 100 countries and territories', languages English, Hindi, Indonesian, Japanese, Portuguese, Spanish. SE Ranking (AI Mode, June 2025): logged-in and logged-out parses 'were similar'. Build implication: track desktop and mobile as separate series (cost x2); disclose to users that captures are signed-out so e-commerce AIOs may appear less often than for a logged-in shopper; let users pin gl/hl/location per query (and optionally lat/long radius on DataForSEO/Bright Data/SearchApi).

Sources:
- https://www.digitalinformationworld.com/2024/09/google-ai-overviews-show-up-more-on.html
- https://support.google.com/websearch/answer/14901683
- https://blog.google/products/search/ai-overviews-search-october-2024/
- https://seranking.com/blog/ai-mode-research/

### 19. Google AI Mode is exposed by most of the same providers as a separate engine: SerpApi engine=google_ai_mode (q, hl, gl, location, continuable, subsequent_request_token; text_blocks, references, reconstructed_markdown; cached searches free); DataForSEO 'ai_mode' endpoints (Live $0.004, Standard $0.0012, Priority $0.0024 per SERP; structured 'identically to the ai_overview element'; launched July 1, 2025, English-only at launch); Oxylabs source=google_ai_mode (query <=400 symbols; content.response_text, content.citations); HasData /scrape/google/ai-mode (10 credits); ScrapingDog AI Mode (10 credits); SearchApi lists a Google AI Mode API; Bright Data lists an AI Mode scraper but documents no SERP-API parameter. AI Mode and AIO citations overlap only ~10.7% at URL level (SE Ranking).

_Confidence: high_

Sources as cited. Build implication: AI Mode tracking is a cheap v2 add-on on the same provider abstraction (same block/reference schema), but it should be a separate series because its citations differ from the AIO's.

Sources:
- https://serpapi.com/google-ai-mode-api
- https://dataforseo.com/update/track-ai-mode-with-google-serp-api
- https://dataforseo.com/pricing/serp/google-ai-mode-serp-api
- https://developers.oxylabs.io/products/web-scraper-api/targets/search-engines/google/ai-mode.md
- https://docs.hasdata.com/apis/google-ai-mode/quickstart.md
- https://www.scrapingdog.com/pricing
- https://seranking.com/blog/ai-mode-research/

### 20. Freshness and caching differ by provider and must be controlled: SerpApi serves a 1-hour cache unless no_cache=true (cached searches are free); DataForSEO with load_async_ai_overview=false returns async AIOs 'only from cache' while true forces a live fetch; DataForSEO Live results are never stored server-side and Standard results expire after 30 days; SerpApi retains search data 31 days (ZeroTrace disables retention); SearchApi offers zero_retention; so the product must persist every raw payload itself at capture time.

_Confidence: high_

serpapi.com/search-api: 'Cache expires after 1h'; DataForSEO task_post/live docs and help center as quoted; searchapi.io AIO API lists 'zero_retention' parameter. Build implication: always pass no_cache=true (SerpApi) / load_async_ai_overview=true (DataForSEO); store raw JSON (and HTML where offered: DataForSEO html endpoint, Bright Data brd_json=html) in object storage keyed by (query, gl, hl, location, device, captured_at, provider) so historical diffs never depend on vendor retention.

Sources:
- https://serpapi.com/search-api
- https://docs.dataforseo.com/v3/serp/google/organic/task_post/
- https://dataforseo.com/help-center/how-long-do-you-keep-results
- https://serpapi.com/legal

### 21. Estimated monthly provider cost for one capture per query per day (≈3,040 / 30,400 / 304,000 captures per month at 100 / 1,000 / 10,000 tracked queries), as of 2026-10-06: DataForSEO Standard + async AIO ≈ $4 / $36 / $365 (Live ≈ $12 / $122 / $1,216); SerpApi assuming 1.5 searches per capture ≈ $75 (Developer) / $725 (Searcher) / $2,750 (Infrastructure); SearchApi ≈ $40 / $250 / $900; Bright Data ≈ $5 / $46 / $456 (or Scale $499 flat); Oxylabs JS-rendered ≈ $49 (Micro minimum) / $49 / ~$380-410; HasData (SERP + AIO follow-up, 20 credits) ≈ $49 / $99 / ~$420+ (exceeds Growth 3M credits); ScrapingDog (10 credits) ≈ $40 / $90 / $350; Apify official AIO actor ≈ $3 / $30 / $304 plus platform fees; Zenserp (3 credits) ≈ $50 / $150 / $899; VALUE SERP ≈ $50 / $240 / $1,000. Multiply by the number of device x locale x samples-per-day variants (recommended 2 samples x 2 devices = 4x).

_Confidence: medium_ **[plan-critical]**

Derived arithmetically from the fetched price tables cited in the other findings: DataForSEO $0.0006 + $0.0006 (Standard) or $0.002 + $0.002 (Live) per SERP; SerpApi plan ladder ($75/5k, $725/100k, $2,750/500k) with 50% of captures assumed to need the page_token second call (share not published by SerpApi — if 0% the 10k tier still needs Infrastructure since 304k > Volume's 250k); SearchApi Developer 10k / BigData 100k / Octo 500K; Bright Data $1.5/1k PAYG; Oxylabs $1.35-1.25 per 1k JS-rendered; HasData 20 credits/capture against 200k/1M/3M plans; ScrapingDog 10 credits/capture against 200k/1M/6M-credit plans; Zenserp 3 credits against 25k/100k/1M plans; VALUE SERP 1 credit (AIO surcharge unknown). LLM analysis and page-fetch costs are outside this dimension.

Sources:
- https://dataforseo.com/pricing/google-serp/google-organic-serp-api
- https://serpapi.com/pricing
- https://www.searchapi.io/pricing
- https://brightdata.com/pricing/serp
- https://oxylabs.io/products/scraper-api/serp/pricing
- https://hasdata.com/pricing
- https://www.scrapingdog.com/pricing
- https://apify.com/apify/google-ai-overviews-scraper
- https://zenserp.com/pricing/
- https://trajectdata.com/pricing/value-serp-api

## Recommendations from this dimension

- Primary capture provider: DataForSEO Google Organic SERP API, Standard queue (priority 1) with load_async_ai_overview=true, expand_ai_overview=true, device + os set explicitly, location_code or location_coordinate, language_code, and postback_url (postback_data=advanced) into a webhook; batch up to 100 tasks per POST and stay under 2,000 calls/min. Cost ≈ $0.0012 per capture. Use the Live Advanced endpoint ($0.004 with async AIO) only for the interactive 'add query → confirm an AIO triggers' step and for on-demand re-checks.
- Fallback / second-opinion provider: SerpApi (engine=google with no_cache=true, then engine=google_ai_overview if ai_overview.page_token is present — redeem inside the same worker call within 60 s; budget 2 searches per capture). Subscribe at Production ($150/mo) or higher so the U.S. Legal Shield applies, and use the official `serpapi` npm package. Trigger the fallback automatically when DataForSEO returns no ai_overview for a query that had one in the prior 3 days, and run a 5% random dual-capture sample to measure cross-provider presence and citation agreement.
- Third fallback (browser-rendered, single call): Bright Data SERP API with brd_json=1&brd_ai_overview=2 (PAYG $1.5/1k, 5k free/month, unlimited concurrency). Consider Oxylabs (render=html, parse=true, context expand_aio) instead if fragment-level citation mapping becomes a product differentiator.
- Do not self-host a Playwright/residential-proxy scraper for v1: Google's JS requirement (SearchGuard, Jan 2025), CAPTCHA/429 rates, $5-8/GB residential bandwidth, Google ToS, and the live Google v. SerpApi DMCA case make it slower, costlier and legally exposed for a solo founder. Keep the provider adapter interface narrow (captureAIO(query, gl, hl, location, device) → CanonicalSnapshot) so any vendor can be swapped if one is enjoined or changes schema.
- Define one canonical snapshot schema and normalise every provider into it: {query_id, provider, captured_at, gl, hl, location, uule, device, aio_present:boolean, markdown, blocks:[{type, text, reference_indexes[]}], references:[{index, url, domain, title, snippet}], raw_json_uri, raw_html_uri}. Store raw payloads in object storage at capture time because DataForSEO Live results are never retained and Standard/SerpApi retention is 30-31 days.
- Capture cadence: at least 2 samples per day (e.g., 06:00 and 18:00 local to the target market) on both desktop and mobile per tracked locale; Ahrefs shows a 70% change probability between observations and 45.5% citation churn, so single daily samples under-count consistency. Diff snapshots as sets (claims/entities/cited URLs/domains) rather than string diffs, and compute per-source citation stability % over the 7+ day window as the core 'reverse-engineer the citations' metric.
- Treat 'AIO absent' as first-class data: record aio_present=false snapshots, show presence rate over time, and warn users at add-time if the live check finds no AIO (commercial/transactional queries trigger less often: 18.6% / 13.9% of AIOs in Semrush's Oct 2025 mix). Disclose that captures are signed-out, so e-commerce AIOs may appear up to 90% less often than for signed-in shoppers (BrightEdge).
- Localisation model: store gl + hl + location (canonical name or uule) + device per tracked query; do not rely on Google ccTLD domains (deprecated by Google in 2025; SearchApi phased out google_domain April 15, 2025; Bright Data routes everything via google.com). Offer optional lat/long/radius targeting via DataForSEO location_coordinate, SearchApi latitude/longitude, or Bright Data uule=lat,lon,radius.
- Pricing/unit-economics: plan on roughly $0.005 per tracked query per day of capture spend on the DataForSEO primary with 2 samples x 2 devices ($0.0012 x 4), i.e. about $0.15/query/month, leaving headroom to price the SaaS per tracked query; reserve a SerpApi budget line (~$150-725/mo) for fallback and legal cover.
- Add Google AI Mode tracking as a v2 series using the same adapters (DataForSEO ai_mode at $0.0012 Standard, SerpApi google_ai_mode, Oxylabs google_ai_mode); keep it a separate series since AI Mode and AIO citations overlap only ~11% at URL level.
- Verify before committing: (1) run a 1-week pilot of 50 real buying-intent queries across DataForSEO Standard vs Live vs SerpApi to measure AIO presence rate, page_token share, and citation agreement; (2) confirm with SearchApi/HasData support whether the token redemption call is billed; (3) confirm DataForSEO's TypeScript client (dataforseo-client on npm) is current, otherwise generate from their OpenAPI spec.

## Open questions

- What share of SerpApi/SearchApi/HasData searches for buying-intent queries actually return a page_token (two-step) versus an embedded AIO? SerpApi says 'many' are embedded but publishes no percentage; this changes the effective SerpApi cost by up to 2x.
- Does SearchApi bill the google_ai_overview page_token redemption as a second search credit? Not stated in its docs or pricing page.
- Is DataForSEO Standard-queue AIO capture (5-min queue, load_async_ai_overview) as complete as Live for the same queries, and does expand_ai_overview materially change the reference set? Needs a pilot comparison.
- HasData's token expiry is documented as both '4 minutes' and 'valid for 1 minute' on different pages; which is correct?
- Zenserp: is AI Overview actually live (pricing lists 3 credits) or still 'Coming Soon' (docs), and does its response include citations mapped to text?
- Apify platform subscription fees on top of per-event actor prices were not verified; what is the real all-in cost for the official AIO actor?
- Outcome of Google v. SerpApi (amended complaint Aug 10, 2026; renewed motion to dismiss Aug 25, 2026): an adverse ruling could affect SerpApi and, by extension, every third-party SERP provider's risk posture.
- Google's blog/help pages do not state whether signed-out users see fewer AIOs; the only quantified evidence is BrightEdge's Sept 2024 study (10-20% fewer, 90% fewer on ecommerce) — is that gap still present in 2026?
- Which provider's AIO presence rate is closest to what a real signed-out user in the target locale sees? Bright Data's own note of '~15-20%+' suggests providers differ in trigger rates; a side-by-side pilot is needed.
- Does any provider expose the 'Show more' expanded AIO content and the 'Dive deeper in AI Mode' hand-off links in a way that distinguishes collapsed vs expanded text (DataForSEO expand_ai_overview, Oxylabs expand_aio appear to, others unclear)?
