# Legiit Overviews: the everyday-user surface

Save as `docs/design-spec.md`. This is the spec for PLAN.md §12 sessions 5 and 6 (`docs/progress.md` items 5 and 6). It starts from the judge's winner, "Six Steps: the thread as the product surface", grafts the fourteen ideas the judge picked from the other two proposals, and fixes the sixteen everyday-user blockers. It changes labels, order, visibility and one route in `web/`. It changes nothing in the database, the RPCs or the Edge Functions.

## 1. Rules that do not change

1. **Every number opens its evidence.** A count in a sentence is an `EvidenceTrigger` that opens the captures drawer (`metric_evidence`) for claim, unsupported, entity, source, domain, format, presence and overlap. A number with no drawer kind (answer changed between checks, sources per answer, your-page counts, draft sub-scores, page facts) links to the list it was counted from: the checks timeline on Google's answer, the 28-day strip and events on Is your page in?, the score result, the page row. Nothing shows a bare percentage: every share reads `x of y answers` or `x of y checks`, the percent second and in brackets when shown at all.
2. **Counts come from SQL** (`series_metrics`, `tracking_summary`, `my_queries`, `metric_evidence`, the `reports` tables). Sentences are built in pure functions from those numbers. The only Claude prose on a page passes through `withoutFigures()` (`web/lib/query/prose.ts`). Denominators stay explicit: points, brands and layouts are over answers the AI has read (`extracted`); pages, websites and "Google showed an answer" are over answers (`present`) or checks (`renders`); failed checks are never counted.
3. **All six thread steps are reachable** from one search: the search page has six numbered cards, one per step, and each card links to its detail page (§10 maps them).
4. **Brand**: `docs/brand.md`. Inter, plum hero, white 12px cards, numbered rows with the `brand-faint` circle, status chips with dots, 6px progress bars, title-case pill buttons ("Open the Brief", "Check a Draft"), uppercase section labels, 864px app column, page header with kicker, 24px title, meta line and 18px summary. Copy in the Legiit Keywords voice: short sentences, the decision first, then the proof; "Nothing is invented"; "the evidence, one click away".

## 2. The shape

One search is one page with the six steps on it. A strip at the top says where you are. One headline sentence says what to do now, with a date. Six cards follow, in Jake Ward's order, titled in his words, each with one plain paragraph built from SQL, its headline count inline, the rest behind "Show the evidence", and one button. The detail pages are the existing tabs, reordered and relabelled, at the paths the notify function already writes (`/patterns`, `/pages`, `/brief`, `/draft`, `/tracking`); only Live moves, to `/live`, because the index becomes the steps page.

Labels on the strip are plain questions. Jake's titles sit on the cards.

| Step | Strip label (plain question) | Card title (Jake's words) | Detail route |
|---|---|---|---|
| 1 | Your search | Pick one search you want to win | card only (anchor `#step-1`) |
| 2 | Google's answer | Track how Google answers it | `/queries/[id]/live` |
| 3 | What keeps showing up | Find what keeps showing up | `/queries/[id]/patterns` |
| 4 | The pages Google cites | Find what Google is rewarding | `/queries/[id]/pages` |
| 5 | Your brief | Build something better | `/queries/[id]/brief` (+ `/draft`) |
| 6 | Is your page in? | Publish and track | `/queries/[id]/tracking` |

## 3. Screens, in order

Each screen lists: purpose, the key sentences verbatim, what it shows, what sits behind "Show the evidence", and the files.

### 3.1 Home (`/`, marketing)

**Purpose.** Say the promise and the six steps in the same words the app uses, so day 0 reads like the landing page. Carry the typed search into step 1.

**Key sentences.**
- Eyebrow: *The six steps, run for you every 3 hours*
- H1 (unchanged): *Track what Google's AI Overview says, then get cited*
- Hero paragraph: *Add one search. Every 3 hours we save Google's answer and its sources, count what keeps coming back, and read the pages it cites. On day 3 you get a brief that says what to write. When your page is in, we tell you.*
- Hero note: *Sign in with your email. The first check runs while you wait, then every 3 hours.*
- Proof strip: *Checked every 3 hours · Every number opens the answers behind it · Counted in the database, not guessed · An alert the first time your page is cited*
- How it works H2: *Six steps from a search to a cited page*
- Step cards (title / foot): *Pick one search you want to win · About a minute* / *Track how Google answers it · 8 checks a day, 56 in the first week* / *Find what keeps showing up · Every count opens the answers behind it* / *Find what Google is rewarding · The 10 pages Google cites most* / *Build something better · First brief on day 3, full brief on day 7* / *Publish and track · An alert the first time your page is cited*
- What you get H2: *Six steps on every search*
- Evidence H2: *Every number opens the answers behind it*
- FAQ "Is the AI making up the numbers?": *No. Claude reads each answer and matches its points to ones seen before. The database does the counting, and every number opens the answers and sentences behind it.*
- FAQ "Do I need to know SEO?": *No. You add a search and read six plain steps. If you do know SEO, every count, page fact and source table is one click away.*

**Shows.** Plum hero with the search input and *Start Tracking* (unchanged GET form to `/queries/new?keyword=`). `HeroReportCard` redrawn as the real search page top: the `StepStrip` with step 2 current, the headline *Day 2 of 7. Nothing to do yet: we check 8 times a day, and your first brief arrives on Oct 10.*, then three `StepCard` rows (step 2 with the first two answer sentences and numbered source chips, step 3 with two points and *In nearly every answer* chips, step 6 with *Cited in 27 of 48 answers this week*). Six step cards with `NumberBadge` solid. `PatternsSample` and `PageSample` rendered from the same `StepCard` and row components as the app, chips *In nearly every answer* / *In most answers* / *Comes and goes*, shares as *40 of 49 answers*. `EvidenceSample` with *In 40 of 49 answers, Sep 30 to Oct 6*. Seven FAQs reworded (no "render", "match level", "n=", "Preliminary", "Draft score", "six match levels"). Dark CTA.

**Behind "Show the evidence".** Static samples; the sample disclosure is open so the pattern is visible on the landing page.

**Files.** `web/app/(marketing)/page.tsx` (PROOF, STEPS, EXTRAS, FAQ arrays, the H2s), `web/app/(marketing)/_components/samples.tsx` (rebuilt on `StepStrip`, `StepCard`, `EvidenceDisclosure`), `web/components/ui/header.tsx` and `footer.tsx` unchanged.

### 3.2 Sign in (`/login`)

**Purpose.** Unchanged magic-link flow. Only the left pitch names the six steps.

**Key sentences.**
- *See what the AI Overview cites. Then get your page in it.* (unchanged)
- Bullets: *Pick a search and we check Google in a minute · What keeps showing up, the pages Google cites and a brief by day 3 · An alert the first time you're cited*
- *Email Me a Sign-In Link* · *No password needed. New here? We'll set up your account from the link.*
- *Check your email. We sent a sign-in link to {email}. It works once and expires in an hour.*

**Files.** `web/app/login/page.tsx` (bullets only). `login-form.tsx`, `web/app/auth/confirm/route.ts`, `web/app/auth/callback/route.ts`, `web/lib/supabase/proxy.ts`, `web/lib/safe-next.ts` unchanged.

### 3.3 Your searches (`/queries`)

**Purpose.** One row per search that says what to do now, in the same sentence the search page uses, so a user with three searches knows which one needs them without opening any.

**Key sentences.**
- Kicker *Your searches* · Title *Searches* · Button *Add a Search*
- Meta: *3 searches · 2 tracking · 1 waiting for an AI Overview · your page is cited on 1*
- Row line 1: the search, `StatusChip` (*Tracking* / *Waiting for an AI Overview* / *Paused*), `LevelChip` (*Cited* / *Your site cited*)
- Row line 2: `StepDots` (six dots, current filled) + the headline from `stepHeadline()` (§4), e.g. *Day 2 of 7. Nothing to do yet: your first brief arrives on Oct 10.* / *Your brief is ready. Write the page.* / *Your page was cited in 27 of 48 answers this week.* / *Google isn't showing an AI Overview for this search yet. We check every 3 hours.*
- Row line 3: *United States · English · Desktop · Checked 2 hours ago*
- Right column: *Google showed an answer · 49 of 56 checks this week* with the bar
- Empty: *Track your first search. Add a search buyers type when they are ready to choose. We check Google right away, then 8 times a day.* · *Add Your First Search*

**Shows.** `PageHeader`, the row list (no `StatGrid`), `EmptyState`, `ErrorCard` with Try Again.

**Behind "Show the evidence".** Nothing on the list; the row opens the search page, where the numbers open their drawers.

**Files.** `web/app/(app)/queries/page.tsx` rewritten (QueryRow, ReportLine replaced by `StepDots` + headline; StatGrid removed); `web/lib/queries.ts` `getMyQueries` unchanged; `web/lib/query/steps.ts` `fromMyQuery()` adapter; `languageName()` from `web/lib/format.ts` for the language.

### 3.4 Add a search (`/queries/new`)

**Purpose.** Jake's step 1 in the product's words: pick one buying-intent search that already shows an AI Overview, one device, and tell us your page now if you have one so step 6 starts on day 0.

**Key sentences.**
- Kicker *Step 1 of 6* · Title *Pick one search you want to win*
- Subline: *Best: a search a buyer types when they are ready to choose, and one that already shows an AI Overview. We check that right away.*
- Search hint: *One search, the way people type it, like "best crm for small business". No special search symbols.*
- Device: *Desktop* / *Mobile* · hint *One search, one device. You can add the mobile version later from the search's menu.*
- Divider *Your page (optional)* · Page address hint: *Already have a page for this search? Paste its address and we check every answer for it from day one.* · Brand names hint: *Up to 10 names, so we also spot when the answer names you without a link.*
- Button *Check Google and Start Tracking* · *Cancel*
- Side card *What happens next*: *1. We check Google now, about a minute. 2. If an AI Overview shows, we save the answer every 3 hours. 3. Your first brief arrives on day 3, the full brief on day 7.* · *If someone else already tracks this exact search, you start with their history.*
- Waiting card step 1: *Checking Google for an AI Overview for "{search}"… this takes up to a minute.*
- Waiting card step 2 (only with a page address): *Reading your page… up to a minute.* · link *Skip, add it later*
- Page failure: *Saved the search, but we couldn't read your page. Add it again in step 6 once it loads without a login.*
- No overview: chip *Waiting for an AI Overview* · *Google isn't showing an AI Overview for "{search}" right now. We added it and will check every 3 hours; you get a notification when one appears.* · *These similar searches show one now:* (pills with monthly volume) · *Pick one to check it with the same country, language and device.* · *Open "{search}"*

**Shows.** Form card (Search, Country, Language, Device with two options, Your page fields, buttons), side card, waiting card with the asymptotic bar and seconds (150 s timeout), `WatchingResult` with sibling pills.

**Behind "Show the evidence".** Nothing.

**Files.** `web/app/(app)/queries/new/page.tsx` (kicker, title, NEXT_STEPS); `add-query-form.tsx` (`DeviceChoice` loses `"both"`, reads `?device=` and `?keyword=`, calls `set-own-page` with `SetOwnPageRequest` after `add-query` returns `tracked_query_id`, then `router.push`); new `web/components/query/own-page-fields.tsx` lifted from `tracking-own-page.tsx` (URL input + brand token input, no card); `web/components/ui/form.tsx`, `segmented-control.tsx` unchanged; `AddQueryRequest.devices` stays a one-element array.

### 3.5 The search page: six steps (`/queries/[id]`)

**Purpose.** The home of one search. The strip, the headline, six cards. Every list row, notification and daily summary links here.

**Key sentences.**
- Back link *Searches* · Kicker *AI Overview* · Title: the search · `StatusChip`
- Meta: *United States · English · Desktop · Checked 56 times since Oct 1* (or *· We already had checks since Sep 20*, hover: *Someone else tracked this search first, so you start with their history*)
- Headline (18px summary, from `stepHeadline()`, §4), one of:
  - *The first check is running. It usually lands within a few minutes.*
  - *Day 0 of 7. Nothing to do yet: we check 8 times a day, and your first brief arrives on Oct 10.*
  - *Day 2 of 7. Nothing to do yet: we check 8 times a day, and your first brief arrives on Oct 10.*
  - *Your first brief is being written. Usually ready within an hour.*
  - *Your first brief is ready. Write the page; the full brief arrives on Oct 14. When the page is live, add its address in step 6.*
  - *Your full brief is ready. Write or update the page; when it's live, add its address in step 6.*
  - *Your latest draft scores 72 of 100. Fix the top item, publish, then add the address in step 6.*
  - *We're looking for yoursite.com/best-crm in every check. Not cited yet in 48 answers this week.*
  - *Your page was cited in 27 of 48 answers this week. Google last quoted the "Pricing" section 3 hours ago.*
  - *Your page dropped out on Oct 9. Google changed many answers that day, so this may not be about your page.*
  - *Google isn't showing an AI Overview for this search yet. We check every 3 hours and tell you when one appears.*
  - *Paused. We're not checking this search for you right now. Your history stays; resume from the menu.*
  - *We already had 12 days of checks for this search, so your brief is being written now.*
- Strip cells (label · state line): *1 Your search · Done | Waiting for Google | Paused* — *2 Google's answer · First check running | Day 2 of 7 | 7 days and counting* — *3 What keeps showing up · Reading the answers | 46 answers read* — *4 The pages Google cites · Opens on Oct 10 | Reading 10 pages | 10 pages studied | Failed, retries Oct 14* — *5 Your brief · Arrives Oct 10 | Being written | Ready | Draft 72 of 100* — *6 Is your page in? · Add your page | Looking for it | Cited 27 of 48 | Not cited this week*
- Card 1, *Pick one search you want to win*: *Google shows an AI Overview for this search in the United States, in English, on desktop: in 49 of 56 checks this week.* | *Google hasn't shown an AI Overview for this search yet. We check every 3 hours and tell you the moment one appears; the next check is in 2 hours.* · *Pick a Different Search* | shared: *We already had 12 days of checks for this search, so you start with them.*
- Card 2, *Track how Google answers it*: constant small line under the title: *A check is one load of Google's results for this search. We run one every 3 hours, 8 a day, and keep the answer, its sources and the time.* Body: *The first check is running.* | *Day 2 of 7. Checked 16 times so far; Google showed an AI Overview in 14 of them, and the answer changed between 9 of 15 checks.* | *7 days and counting. Checked 56 times this week; Google showed an AI Overview in 49 of them.* Then *Latest answer · 2 hours ago* with the answer (whole answer while the search has under 1 day of history, the first 4 sentences after) and *See the Latest Answer*.
- Card 3, *Find what keeps showing up*: *The AI is reading the first answers. What keeps showing up appears within a few hours of a check.* | *In the 46 answers read so far, 4 points, 3 brands and 5 pages come back in most of them. The answer is usually a numbered list.* · rows *1 Tally is the best free option · In 40 of 46 answers* (up to 3, with the *Said without a source* chip where it applies) · chip *Early · 6 checks* / *Getting there · 14 checks* / *Solid · 56 checks* · note *3 answers are still being read by the AI; they're counted soon.* · *See What Keeps Showing Up*
- Card 4, *Find what Google is rewarding*: *Opens on Oct 10 (day 3). Then we read the 10 pages Google cites most and work out what they all do and what none of them covers.* · *See the Pages So Far* | *Reading the 10 pages Google cites most: 6 of 10 read, 3 tagged. Usually done within an hour.* | *We read the 10 pages Google cited most from Sep 30 to Oct 7. 4 things every one of them does; 3 gaps none of them fills. Your page is number 7.* (first 3 of "what every winner has" as a check list) · *See What Google Rewards* | *The page study failed on our side. It runs again on Oct 14 (day 7); your checks are safe. If it fails again, email help@legiit.com.*
- Card 5, *Build something better*: *Your brief is written from the page study on Oct 10: the answer to open with, the topics and names to cover, the layout, and what no cited page has yet.* | *Writing your brief. Usually within an hour.* | *Your brief is ready: open with one answer, cover 6 topics and 4 names, use a comparison table, and add 3 things no cited page has.* · *Open the Brief* · second paragraph, always: *When you have a draft, paste it or its address and get a score out of 100 with the fixes in order. About a minute.* · *Check a Draft* | after a score: *Your last draft scored 72 of 100: close, a few fixes away. 3 fixes are listed.* | *Your brief was updated on Nov 4. See what changed since the first one.*
- Card 6, *Publish and track*: no page yet: *When your page is live, add its address. From then on every check looks for it. We tell you the first time Google cites it, if it drops out (2 days without a citation) and when it's back. You can add it before you publish; we just won't find it yet.* + inline form *Page address · Brand names (optional) · Save* | page set: *We look for yoursite.com/best-crm in every check. Not cited yet in 48 answers this week; your brand was named in 2.* | *Your page was cited in 27 of 48 answers this week, last 2 hours ago, quoted from "Pricing". Another page on your site was cited in 3 more.* | *Your page dropped out on Oct 9 after being cited in 12 answers. Google changed many answers that day, so this may not be about your page.* · always: *Still winning: hubspot.com, cited in 45 of 49 answers this week.* · *See What Changed This Week* · *See Tracking*
- Closed details at the bottom, *How we count*: *A check is one load of Google's results, every 3 hours. An answer is a check that showed an AI Overview. Claude reads each answer and matches its points, brands and sources to the ones seen before; the database does the counting, and every number opens the answers behind it. Points, brands and layouts are counted over the answers the AI has read so far; pages, websites and "Google showed an answer" over every answer or check. Failed checks are never counted. In nearly every answer means 80% or more of the answers in the period; in most answers 40 to 80%; comes and goes under 40%. Early means under 10 checks, Getting there 10 to 20, Solid over 20. Google's normal results are the blue links under the AI Overview. A big site (YouTube, Reddit, Wikipedia) is counted as a source but not read as a page. Days run on universal time (UTC); hover a day for its exact bounds.*
- Actions menu: *Pause Tracking · Resume Tracking · Also Track on Mobile · Remove Search* · dialog *Your brief, draft scores and alerts for this search are deleted. The checks stay with anyone else tracking the same search.*

**Shows.** `PageHeader` with the headline in its `summary` prop. `StepStrip`: six cells, `NumberBadge` (green check when done, solid brand when current, faint brand when ready, grey when locked or waiting, red when failed), label, state line; on phones two rows of three with the label only (the state is on the card), no horizontal scroll; cells link to the detail routes. Six `StepCard`s (Card, CardHeader with eyebrow *Step N* and Jake's title, state chip on the right, one paragraph, optional `NumberedList` of up to 3 evidence rows or the answer preview, `EvidenceDisclosure`, one primary pill, at most one text link). Step 6 renders `OwnPageFields` inline while `own_url` and `brand_names` are empty. `ExtractionPendingNote` inside card 3. Each card inside its own `Suspense` with a skeleton, and its own `ErrorCard` on failure so one RPC never blanks the page. Watching and paused alerts in plain words. The *How we count* details.

**Behind "Show the evidence".**
- Card 1: *Google showed an answer in 49 of 56 checks (88%)* → presence drawer with the *All / Answer shown / No answer* filter.
- Card 2: *The answer changed between 34 of 55 checks* and *4.2 sources per answer (49 answers)* → `/live#timeline`; *Solid · 56 checks*.
- Card 3: the three rows' *In 40 of 46 answers* → claim drawer; *3 brands* → `/patterns#entities`; *5 pages* → `/patterns#sources`; *numbered list* → format drawer; the period dates.
- Card 4: *4 things* → `/pages#common`; *3 gaps* → `/pages#gaps`; *number 7* → `/pages#page-<key>`; the brief's period dates.
- Card 5: *6 topics · 4 names · 3 new things · about 1,800 words* → `/brief#brief-must-cover`, `#brief-entities`, `#brief-new`; *72 of 100* → `/draft?score=<id>`; the sub-scores with weights.
- Card 6: *Cited in 27 of 48 answers (56%) this week · 30 of 48 counting other pages on your site · last 4 weeks: 61 of 180 · brand named in 9 of 48* → `/tracking` (the strip and events are the per-check evidence); *45 of 49* → source drawer.

**Files.** New `web/app/(app)/queries/[id]/page.tsx` (steps page) and `loading.tsx`; the current page and loading move to `web/app/(app)/queries/[id]/live/`. New `web/lib/query/steps.ts` (§4). New `web/components/query/step-strip.tsx` (`StepStrip`, `StepDots`) and `step-card.tsx`. `web/app/(app)/queries/[id]/layout.tsx`: `Tabs` replaced by `StepStrip` with plain labels only (no state lines; the index passes states), meta with `languageName()` and *Checked N times*, `metadata` template unchanged. `query-actions.tsx`: *Also Track on Mobile* opens `/queries/new?keyword=<keyword>&device=mobile` (hidden when the series device is mobile). Loaders, all request-cached and run in `Promise.all` per card: `getTrackedQuery`, `getMyQueries` (for `history_days`), `getSeriesMetrics` (7d), `getLatestCaptures`, `getCaptureStatuses`, `getReports` + `getPageProgress` or `getReportDetail`, `getDraftScores`, `getTrackingData`. Reused: `OverviewText`, `SourceList`, `EvidenceTrigger`, `presenceEvidence`, `ExtractionPendingNote`, `OwnPageFields`, `QueryActions`, `StatusChip`, `LocalTime`, `CheckList`, `Alert`, `ErrorCard`.

### 3.6 Google's answer (`/queries/[id]/live`, was the Live tab)

**Purpose.** Jake's step 2 in full: the latest answer as Google showed it, every check, what changed.

**Key sentences.**
- Kicker *Step 2 · Google's answer* · Title *Track how Google answers it* · meta *A check is one load of Google's results, every 3 hours.*
- Summary: *Checked 56 times this week; Google showed an AI Overview in 49 of them. The answer changed between 34 of 55 checks, with 4.2 sources per answer.* [Solid · 56 checks]
- *Latest check · Oct 7, 9:02 AM (2 hours ago)* [AI Overview shown] · *5 sources · 212 words* · *Sources cited (5)*
- Stale: *Google showed no AI Overview in the latest check. Below is the last answer we saw, from Oct 7, 6:02 AM.* | *The latest check failed, so it isn't counted.*
- *The checks, Oct 1 to Oct 7 · 49 of 56 checks showed an AI Overview; 1 check failed and isn't counted.* Legend: *AI Overview shown · No AI Overview · Check failed · No check · Not due yet · Before tracking started · newest day first*
- Day labels: *Oct 7 (still being collected)*, *Oct 6*, …; hover: *Oct 6, 00:00 to 24:00 UTC*
- *What changed on Oct 6 · Against Oct 5: 7 answers in 8 checks. Oct 7 is still being collected (3 checks so far), so it's compared tomorrow.* | *Changes show once two full days are collected: we compare each day with the one before.* | *Nothing changed. The answer used the same points, brands and sources as on Oct 5.* · *6 more*
- *Google's normal results, top 10 · 3 of the top 10 normal results (the blue links) are also cited in the answer.*
- Waiting: *Waiting for an AI Overview. Google hasn't shown one in 5 checks so far. We check every 3 hours; the next check is in 2 hours. When one appears, the other steps start on their own.*
- Before any check: *The first check is on its way. It usually lands within a few minutes; the next scheduled check is in 2 hours.*

**Shows.** Strip (cell 2 current), summary sentence, latest answer card (`OverviewText` with numbered citation chips: hover shows the site and the part Google quoted, click opens the source; `SourceList`), `CaptureTimeline`, `DayDiff` chips, `OrganicList` with *Cited* chips, `WatchingCard`.

**Behind "Show the evidence".** *49 of 56* → presence drawer. Timeline squares: hover gives the check's time and status. *6 more* → `/patterns#daily`.

**Files.** Current `web/app/(app)/queries/[id]/page.tsx` → `live/page.tsx`; `StatRow` becomes the sentence; `TimelineCard`, `ChangesCard`, `OrganicCard`, `WatchingCard` relabelled. `timeline.tsx` (day labels from the UTC day string, UTC bounds in `title`), `day-diff.tsx` (`completeDays`, `cutFirstDay` unchanged; notes reworded), `capture-status.tsx` (*Check failed*), `organic-list.tsx`, `overview.tsx`, `pending-note.tsx`; `metrics.ts`, `window.ts` unchanged.

### 3.7 What keeps showing up (`/queries/[id]/patterns`)

**Purpose.** Jake's five things in his order, one sentence first, counts with denominators, the rest folded.

**Key sentences.**
- Kicker *Step 3 · What keeps showing up* · Title *Find what keeps showing up* · Period pills *This week · Last 4 weeks · All time* · meta *Oct 1 to Oct 7 · 56 checks, 49 with an AI Overview, 46 read by the AI*
- Summary: *In 46 answers, 4 points, 3 brands and 5 pages come back in most of them. The answer is usually a numbered list of about 210 words and gets to the point by the 2nd sentence.* [Solid · 56 checks]
- *1 · Points Google keeps making* · row: *Tally is the best free option* [In nearly every answer] [Said without a source, when it applies] · *In 40 of 46 answers · backed by a source 41 of 46 times · first seen Oct 1 · last seen today* · type tags · *Show all 23 points*
- *2 · Brands and products it names* · legend *Recommended / Just named* · *Tally · Recommended in 29 of 46 answers, just named in 10 · Google calls it: free, unlimited*
- *3 · Pages and websites Google cites* · columns *# · Page · How often · In how many answers · Also in Google's top 10 normal results* · *Big site* tag · *Websites: any page on the site counts*
- *4 · How the answer is laid out* · *Numbered list in 40 of 46 answers · Table in 12 · Steps in 3 · Typical length 210 words · How fast Google gets to the answer: opens with it in 30 of 46, usually by the 2nd sentence*
- *5 · What changed, day by day* · *Oct 6 · 7 answers in 8 checks · +3 −2* (last 3 days, *Show all days*) · *Oct 7 is still being collected, so it's compared tomorrow.* · *Only part of this day is in the period* (hover: the UTC bounds)
- More detail (closed): *Said without a source (your opening): 2 points Google makes with no source in any check. A page that backs one with proof is an opening.* · *Same sources keep coming back: the same pages in 31 of 49 answers, the same websites in 38 of 49.* · *Also in Google's normal results: 62 of 203 cited pages ranked in that check's top 10.*
- *How we count* (closed, same text as §3.5)
- Empty: *No AI Overview in this period. Google showed none in 8 checks here; a longer period may have some.* | *No checks in this period yet.*
- Pending: *3 answers are still being read by the AI; they're counted soon.*

**Behind "Show the evidence".** Every *N of M answers* → its drawer (claim, unsupported, entity, source, domain, format, presence, overlap). Day-by-day chips → claim, entity or source drawers. Per point: the progress bar, backed-by-a-source count, first and last seen.

**Files.** `web/app/(app)/queries/[id]/patterns/page.tsx` (summary sentence from `SeriesMetrics`: claims and entities with bucket core or recurring, `formats[0]`, `median_word_count`, `answer_lead.median_sentence`, core domains; section order; the brand `Alert` and footer merged into the closed details); `patterns-sections.tsx` (`ClaimsSection`, `EntitiesSection`, `SourcesSection`, `FormatsSection` relabelled with `initial` caps of 5; `DailySection` capped at 3 days; `OverlapSection`, `UnsupportedSection` and the citation-stability line under More detail; `BucketLegend` removed); `window-control.tsx` + `window.ts` `WINDOW_LABELS` / `WINDOW_SHORT_LABELS` (*This week / Last 4 weeks / All time*, keys unchanged); `show-more.tsx`; `hash-scroll.tsx`; `metrics.ts` unchanged.

### 3.8 The pages Google cites (`/queries/[id]/pages`)

**Purpose.** Jake's step 4 with the conclusion first: what every cited page has, what none covers, who covers what, then the pages collapsed.

**Key sentences.**
- Kicker *Step 4 · The pages Google cites* · Title *Find what Google is rewarding* · *The 10 pages Google cited most from Sep 30 to Oct 7, read and measured. Your page is number 7.* [Full brief (day 7) · Ready]
- Summary: *Every cited page answers within its first 40 words and uses a comparison table. No page covers pricing for teams under five.* (from `common_to_all[0]` and `gaps[0]` through `withoutFigures`)
- *1 · What every cited page has* (check list)
- *2 · What no page covers (your opening)* · gap · why · chips *in 40 of 46 answers*
- *3 · Who covers what* · *Covered · Partly · Missing* · *Scroll sideways to see all pages*
- *4 · How each page differs*
- *5 · The pages, most cited first* · row: *1 tally.so · Best form builders in 2026* [In nearly every answer] [Your page] · *Cited in 40 of 49 answers · Answers within 32 words · Comparison table: yes · Google quotes "Pricing"* · *All page facts* (expands: Words, Words before it answers, Sections and depth, Tables and rows, List items, Side-by-side comparisons, How much data it uses, Author, Updated, FAQ section, Links; topics, brands, proof kinds, questions answered; the parts Google quoted with the heading and how far down)
- *Big sites like YouTube and Reddit are counted as sources but not read as pages.*
- Not yet: *The page study opens on Oct 10 (day 3). 1.6 days so far. It runs again on day 7, then monthly.* | *Reading the pages: 6 of 10 read, 3 tagged.* | *This study failed on our side. It runs again on Oct 14 (day 7).* | *A newer study is on its way: writing your brief. Below is the last finished one.*
- Page states: *This page is being read.* · *The AI is tagging this page's topics, names and proof, usually under an hour.* · *We couldn't read this page, so it has no facts.*

**Behind "Show the evidence".** *Cited in 40 of 49 answers* → source drawer (Google's quote per check). Gap chips → claim drawers. *All page facts* → the 11 measures, tags and passages. Matrix hover: host; cell: covered / partly / missing.

**Files.** `web/app/(app)/queries/[id]/pages/page.tsx` (order: common, gaps, matrix, differences, pages; `pagesIntro` without "Measured in code, tagged by Claude"; `NoReport`, `ProgressCard`, `PlatformNote` reworded); `page-card.tsx` (collapsed row; `<details>` *All page facts* around `PageMeasuresBlock`, tags and `Passages`; *Measures* → *Page facts*; the merged-variants note into a `title`); `coverage-matrix.tsx` legend; `brief-refs.tsx`, `page-anchor.ts`, `labels.ts`, `scroll-fade.tsx`; `pages.ts`, `ref-metrics.ts`, `prose.ts` unchanged.

### 3.9 Your brief (`/queries/[id]/brief`)

**Purpose.** Jake's step 5 as eight numbered decisions in the order a writer works, with the evidence, three ways to get the page written, the draft check handoff, and the QA folded away.

**Key sentences.**
- Kicker *Step 5 · Your brief* · Title *Build something better* · eyebrow *Full brief (day 7) · Sep 30 to Oct 7* · select label *Brief* with options *First brief (day 3) · Sep 30 to Oct 3* / *Full brief (day 7) · Sep 30 to Oct 7* / *Monthly update · Oct 7 to Nov 4 · being written*
- Claude's summary paragraph (figures stripped) · *From 56 checks · 49 with an AI Overview · 10 cited pages read* [Solid · 56 checks]
- Period note (small, under the meta): *Counts in this brief are over its own period, Sep 30 to Oct 7, so they can differ from this week's on the other steps.*
- Buttons: *Download the Brief · Copy the Brief*
- Counts line (replaces the four stat cards): *Cover 6 topics · Name 4 brands · Add 3 new things · About 1,800 words*
- *1 · Open with this answer* · blockquote · *Start the direct answer within the first 40 words, like the cited pages do.*
- *2 · Cover these 6 topics* · topic · why · *in 40 of 46 answers*
- *3 · Name these brands and products* · *Tally* [Recommended] · note · *Recommended in 29 of 46 answers*
- *4 · Lay it out like this* · structure · *Table columns* · *Main list: 5 items*
- *5 · Sections, in order* · *Section / Sub-section* · purpose · *about 400 words* · *Covers*
- *6 · Include the proof the cited pages have* · what · page chips → step 4
- *7 · Add something new that no cited page has* · idea [Original data / First-hand test / New statistics / Better comparison / Useful table / Unanswered question / Better examples] · *Why Google lacks it* · evidence chips
- *8 · Questions to answer, then before you publish* · questions · checklist · *Leave out*
- *Changes since the first brief* (monthly update): added green, removed red
- *How we checked this brief* (closed details): *5 checks passed* or *1 check failed*, plain check names; no ref codes
- *Get it written* card: *Write it yourself from the brief, hand the brief to your writer, or find one on Legiit.* · *Download the Brief* · *Copy the Brief* · *Find a Writer on Legiit* (external, `https://legiit.com/categories/writing/web-content`)
- *Check your draft* card: *Paste what you've written, or the address of the page once it's live, and get a score out of 100 with the fixes in order. About a minute.* · *Check a Draft* · *Last check: 72 of 100, 2 days ago · See it*
- Handoff: *When the page is live, add its address in step 6 and we tell you the first time Google cites it.* · *Add the Address*
- Locked: *Your brief arrives on Oct 10 (day 3). 1.4 days of checks so far.* Day 0 / Day 3 / Day 7 bar · *Briefs start on the hour; reading the cited pages and writing usually take about an hour more.*
- Building: *Reading the cited pages · 6 of 10 read · Tagging topics, names and proof · Writing the brief · Usually within an hour · This page updates when you reload it.*
- Failed: *The full brief for Sep 30 to Oct 7 failed on our side. Your checks are safe; the next brief is written at its milestone, on Nov 4.*

**Behind "Show the evidence".** Topic chips → claim drawers over the brief's period (same n as the chip). Name chips → entity drawers. Page chips → the page rows on step 4. The counts line → the sections. The brief checks data and the `BriefDiff`.

**Files.** `web/app/(app)/queries/[id]/brief/page.tsx` (stat grid → counts line; `optionLabel`; period note; `BriefChecks` in `<details>`; Get it written and Check your draft cards; handoff); `brief-view.tsx` (section titles, numbering, outline rows as Section / Sub-section); `brief-status.tsx` (copy; `days` from `history_days`, §4); `brief-export.tsx` (labels; `brief_markdown` unchanged); `brief-report-select.tsx` (label *Brief*); `brief-checks.tsx` unchanged inside the details; `brief-diff.tsx`, `brief-refs.tsx`; `report.ts`, `ref-metrics.ts`, `prose.ts` unchanged; `format.ts` `REPORT_KIND_LABELS`, `REPORT_STAGE_LABELS`.

### 3.10 Check your draft (`/queries/[id]/draft`)

**Purpose.** Step 5's feedback loop, kept at its path so notification links work.

**Key sentences.**
- Kicker *Step 5 · Your brief* · Title *Check your draft* · *A draft is anything you've written for this search: paste the text, or give the address of the page once it's live. We measure it like a cited page and score it against the full brief (Sep 30 to Oct 7).*
- *Paste text / Page address* · *The page must load without a login.* · *Check Draft*
- *Checking your draft… this takes about a minute* · *Reading your page → Comparing it with the brief and the cited pages → Scoring and writing your fixes*
- Long wait: *This is taking longer than usual. Check back in a few minutes; the result appears under Earlier checks.* · *Keep Waiting · Refresh · Check Another Draft*
- Result: *72 of 100 · Close: a few fixes away from what the cited pages do.* · scores *Topics covered 25% · Names included 10% · Layout matches 10% · Answers quickly 15% · Proof 15% · Basics (author, date, FAQ) 5% · Something new 10% · Clear writing 10%* · *Fixes, most important first* · *Your draft and a typical cited page* (table) · *Earlier checks*
- Locked: *Draft checking opens with your first brief, on Oct 10.* | *Your brief is being written. See its progress.*
- Busy: *A draft for this search is already being checked.*

**Behind "Show the evidence".** Topic, name and something-new statuses link to the brief's chips (`/brief#brief-must-cover` etc.) for their evidence; the measures table to `/pages`.

**Files.** `web/app/(app)/queries/[id]/draft/page.tsx` (kicker, titles, intro), `draft-scorer.tsx` (reads `?url=` to prefill the address mode), `draft-result.tsx` (`SUBSCORES` labels; `WEIGHTS` unchanged), `draft-history.tsx` (*Earlier checks*), `brief-status.tsx`; `score-draft` unchanged.

### 3.11 Is your page in? (`/queries/[id]/tracking`)

**Purpose.** Jake's step 6: one yes/no sentence, which part gets quoted, what happened, what keeps winning, the loop back to improving, and the page form.

**Key sentences.**
- Kicker *Step 6 · Is your page in?* · Title *Publish and track* · *Every check looks for your page in the sources and your brand in the answer.*
- Summary: *Your page was cited in 27 of 48 answers this week. Google last quoted the "Pricing" section 3 hours ago.* | *Google hasn't cited your page yet. We've checked 48 answers this week and check 8 times a day.* | *Add the page you want Google to cite and we tell you the first time it's in.*
- *1 · Is your page in?* · chip *Cited / Your site cited / Not cited* · *Cited in 27 of 48 answers this week; another page on your site in 3 more. Last 4 weeks: 61 of 180. Brand named in 12 answers this week.* · strip *Last 28 days, one column per day* · legend *Your page · A page in the same part of your site · Another page on your site · Not cited · dot = brand named* · *Days fill in as checks arrive, 8 a day.*
- *2 · Which part Google quotes* · *"Pricing" · quoted in 12 answers this week* | *Not quoted yet*
- *3 · What happened* · *Cited for the first time · Oct 5 · quoted from "Pricing"* · *Dropped out · Oct 9 · 2 days without a citation. Google changed many answers that day, so we didn't count it as your loss* · *Back in · Oct 11* · *Your brand was named · Oct 3* · *Earlier address* · empty: *No events yet. We log the first time Google cites your page, when it drops out (2 days without a citation) and when it's back.*
- *4 · What keeps winning* · *Still winning: hubspot.com, cited in 45 of 49 answers this week. forbes.com in 28.* · *See What Changed This Week*
- *5 · Keep improving* · *Score the live page again (about a minute) and compare with your last check.* · *Check the Live Page*
- *6 · Your page and brand* · *Page address · The page you want Google to cite. We read it 2 days ago.* · *Brand names · Press Enter or a comma to add a name. Up to 10.* · *Save · Remove Address* · *Reading your page and re-checking the last 4 weeks of answers. This can take up to a minute.* · *Saved and your page was read.* | *Saved, but we couldn't read the page. Citations still match by address; to see which part Google quoted, make sure the page loads without a login.* | *Saved without an address. We keep checking the answer for your brand names.* · *12 answers from the last 4 weeks cite your page or name your brand.* | *No answer from the last 4 weeks cites your page or names your brand yet. We check every new one.*
- Explainer (replaces the five-level list): *We count your page itself, a page in the same part of your site, and any other page on your site, and we look for your brand name in the answer.*
- Banner: *Google changed many answers on Oct 5. A drop that day is more likely Google's change than your page.*

**Behind "Show the evidence".** *27 of 48*, *61 of 180*, *12 answers* → the strip (hover a column: checks, cited, closest match, brand named) and the events list. *45 of 49* → source drawer. Each event: time, match, quoted heading, why it was held.

**Files.** `web/app/(app)/queries/[id]/tracking/page.tsx` (order, summary from `tracking_summary` `present_7d`, `cited_exact_7d`, `cited_7d`, `brand_7d`, `latest`; What keeps winning from `getSeriesMetrics` 7d top non-platform sources; Keep improving card to `/draft?url=`); `tracking-stats.tsx` (`TrackingStats` → the one-line form; `TrackingExplainer` one sentence); `tracking-strip.tsx` (`LEVEL_FILL` keeps four fills; `same_host` and `same_domain` share the label and a tooltip that says which); `tracking-events.tsx` (`KINDS`, `heldNote`); `tracking-own-page.tsx` (labels; uses `OwnPageFields`); `format.ts` `MATCH_LEVEL_LABELS`, `matchLevelLabel`; `chip.tsx` `LevelChip`; `tracking.ts` unchanged.

### 3.12 Show the evidence (disclosure and drawer, not routes)

**Purpose.** The two-layer rule. A card's headline count is inline and clickable. Secondary numbers sit in a closed `EvidenceDisclosure`. Every number in either place opens the drawer or the list it came from.

**Key sentences.**
- Summary text: *Show the evidence* / *Hide the evidence*
- Drawer eyebrows (`KIND_EYEBROWS`): claim *Where this point appeared* · unsupported *Said without a source* · entity *Where this brand appeared* · source *Where this page was cited* · domain *Where this website was cited* · format *Answers laid out this way* · presence *The checks* · overlap *Cited pages in Google's normal results*
- Description: *In 40 of 49 answers (82%)*, recomputed from what loaded
- Filter: *All · AI Overview shown · No AI Overview*
- Count line: *40 checks behind this number, newest first.*
- Note labels (`NOTE_LABELS`): *What the AI picked out of this sentence* · *How it was mentioned: Recommended (free, unlimited)* · *The part Google quoted* · *Pages cited* · *Cited pages and their place in the normal results*
- *Showing 50 of 120 · Load More* · empty *No check in this period shows this. It may have appeared outside the period you picked.* · error *The checks didn't load.* · *Try Again*

**Shows.** `EvidenceDisclosure`: a `<details>` with a 12px ink-muted summary and chevron, closed by default, contents in a tinted `Card`. The `Drawer` unchanged in behaviour.

**Files.** New `web/components/ui/evidence-disclosure.tsx`. `evidence.tsx` (`KIND_EYEBROWS`, `NOTE_LABELS`, `countLine`, `emptyText`, `describe`; the `metric_evidence(p_series_id, p_kind, p_key, p_from, p_to, p_limit)` call unchanged). `share-value.tsx` renders *40 of 49* with *(82%)* muted. `format.ts`: `formatOf(count, n, noun)` → *40 of 49 answers*; `formatShare` → *40 of 49 answers (82%)*. `drawer.tsx`, `use-modal.ts` unchanged.

### 3.13 Notifications (`/notifications`), Settings (`/settings`), system states

**Key sentences.**
- Notifications: kicker *Inbox* · *3 unread · latest 100* · *Mark All Read* · kind chips *Cited for the first time · Back in · Dropped out · Your brand was named · Brief ready · Google changed many answers · Daily summary* · empty *No notifications yet. You'll hear here the first time your page is cited, if it drops out or comes back, when a brief is ready, and once a day with what changed.*
- Settings: *Sign out. Your searches keep being checked.*
- Errors: *This search didn't load. Checking continues in the background; try again in a moment.* · per page *Google's answer didn't load* / *What keeps showing up didn't load* / *The pages didn't load* / *The brief didn't load* / *Draft checks didn't load* / *Tracking didn't load*, the raw error inside a closed *Details* summary, *Try Again*
- 404: *This page isn't in the overview.*

**Shows.** Rows link into the search page or the step the event belongs to (`/queries/<id>`, `/patterns`, `/pages`, `/brief`, `/draft`, `/tracking`, all kept). The stored titles and bodies are shown as written by the notify function until the backend copy pass (§12).

**Files.** `web/app/(app)/notifications/notifications-list.tsx` (`KINDS` labels), `notifications/page.tsx`, `header-parts.tsx` unchanged; `settings/*` unchanged except the sign-out line; `feedback.tsx` `ErrorCard` (detail inside a closed `<details>`); per-page `loading.tsx` reshaped.

## 4. The step model: `web/lib/query/steps.ts`

Pure functions, no I/O, unit-tested.

**Inputs.** `TrackedQueryDetail` (status, renders, present, first_captured_at, last_captured_at, own_url, brand_names, series.next_capture_at, created_at), `history_days` from the query's `my_queries` row, `SeriesMetrics` for the 7-day window (or null), `LatestCaptures` (or null), `ReportSummary[]` + `PageProgress` + the ready `ReportDetail.analysis` (or null), `DraftScoreSummary[]`, `TrackingSummaryData` + `CitationEventRow[]` + `platformEvents` (or null), `now`.

**Output.** `{ headline: string; steps: Step[6] }` where `Step = { n, label, title, state: "done" | "now" | "ready" | "waiting" | "locked" | "failed", short, sentence, action?: { label, href } }`.

**The day.** `history_days` comes from `my_queries` (the stretch rule in `docs/architecture.md` "Reports": the first present snapshot after any 36-hour gap), the same number `build-reports` uses. The index page calls `getMyQueries()` (request-cached) and picks its row; `brief-status.tsx` and `pages/page.tsx` take `days` from the same number. `historyDays(first_captured_at)` in `window.ts` keeps choosing the default period only. The list and the page can no longer disagree.

**Dates.** First brief date = today + (3 − history_days) days; full brief = today + (7 − history_days); monthly update = latest refresh or full `created_at` + 28 days. Rendered with `<LocalTime format="date">`, never a time. When the date has passed and no report of that kind exists, the copy says *is being written*.

**"Now" rule, in order.** `paused` → no step is now, headline *Paused…*. `watching` → step 1 now. No report at stage `ready` → step 2 now (step 3 is never "now"; it reports). A ready report, no draft score, `own_url` null → step 5 now; the headline names both actions (*Write the page… then add its address in step 6*). A ready report and (a draft score or `own_url` set) → step 6 now. The strip shows exactly one "now" cell.

**Step states.**

| Step | done | now / ready | waiting / locked | failed |
|---|---|---|---|---|
| 1 | tracking or paused | — | watching: *Waiting for Google* | — |
| 2 | history_days ≥ 7 (*7 days and counting*) | tracking, < 7 days: *Day N of 7* | no capture yet: *First check running* | — |
| 3 | extracted ≥ 1 and extraction_pending = 0 | extracted ≥ 1: *N answers read* | extracted = 0: *Reading the answers* | — |
| 4 | newest report ready | stage pages or brief: *Reading N pages* | no report: *Opens on {date}* | stage failed: *Failed, retries {date}* |
| 5 | ready and a draft score exists | ready: *Ready* / *Draft 72 of 100* | *Arrives {date}* / *Being written* | failed |
| 6 | own_url set and cited_exact_7d > 0: *Cited 27 of 48* | own_url set, not cited: *Looking for it* | own_url null: *Add your page* | — |

**Shared series.** If `history_days ≥ 3` on the day the query was created and no report exists yet, step 1 adds *We already had N days of checks for this search, so you start with them* and the headline says the brief is being written now.

**Sentences never mix denominators.** *of N checks* for presence and change rate, *of N answers* for pages and websites, *of N answers read* for points, brands and layouts (the phrase *the AI has read* appears in card 3 and How we count). A Claude sentence (`common_to_all[0]`, `brief.summary`) passes `withoutFigures()`; if that leaves it empty the card falls back to the count-only sentence.

**Tests** (`web/lib/query/steps.test.ts`, vitest): 0 checks; 1 check with an answer; 1 check without; watching; paused; day 2 with extraction pending; day 3 building; day 3 ready; day 7 full ready; failed preliminary; shared series with 12 days at creation; own page set and never cited; cited this week; dropped out on a platform-event day; a claim share of exactly 0.4 and 0.8.

## 5. Vocabulary

| Internal term (where) | User-facing term |
|---|---|
| query / Queries / Add Query (nav, `/queries`, header, dialog) | search / Searches / Add a Search; the form field stays *Search*; paths stay `/queries` |
| render, capture, `n=56`, `82% · n=56` (`formatShare`, `plural(renders,"render")`) | check; *checked 56 times*, *in 40 of 49 answers*, *49 of 56 checks (88%)*; `n=` never appears |
| overview as the counted thing (*overviews analysed*, *share of overviews*) | answer; *AI Overview* stays as the feature name |
| Overview shown / presence / `presence_rate` | *Google showed an answer in 49 of 56 checks*; drawer filter *AI Overview shown / No AI Overview* |
| tracking / watching / paused (`STATUS_LABELS`) | Tracking / Waiting for an AI Overview / Paused |
| Change rate | *The answer changed between 34 of 55 checks* |
| Citations per overview | *4.2 sources per answer* (how many pages each answer cites) |
| Confidence low / medium / high (`confidenceForRenders`) | chip *Early · 6 checks* / *Getting there · 14 checks* / *Solid · 56 checks*; tooltip *Under 10 checks: the counts can still move a lot* / *10 to 20 checks* / *Over 20 checks* |
| Citation stability (URLs; domains) | *Same sources keep coming back: the same pages in 31 of 49 answers, the same websites in 38 of 49* (More detail) |
| Survival bucket core / recurring / rotating; CORE / RECURRING / ROTATING chips; *Survival* column | *In nearly every answer* / *In most answers* / *Comes and goes* (sentence case, same tones); column *How often*; tooltip *80% or more of the answers in this period* etc. |
| claim / Recurring claims / claim group | point / *Points Google keeps making* |
| Claim as extracted (drawer note) | *What the AI picked out of this sentence* |
| `cited_share` *Cited 89% · n=46* | *backed by a source 41 of 46 times* |
| Unsupported claims / Uncited claim evidence | *Said without a source* (chip on the point and a list under More detail: *your opening*) |
| entity / Entities / Brands and entities / Entities to name / Entity coverage | brands and products / *Brands and products it names* / *Name these brands and products* / *Names included* |
| Recommended vs Mentioned only | Recommended vs Just named |
| Formats / format labels / median length / `answer_lead` | *How the answer is laid out* / typical length / *How fast Google gets to the answer: usually by the 2nd sentence*; *Ranked list* → *Numbered list* |
| Organic / organic top 10 / blue links / Organic overlap | *Google's normal results (the blue links)* / *Also in Google's top 10 normal results* |
| Sources vs Domains / `reg_domain` / *Any URL on the domain counts* | *Pages Google cites* vs *Websites Google cites* / *any page on the site counts* |
| Platform / Platform pages | *Big site* tag: *YouTube, Reddit and the like, counted as a source, not read as a page* |
| UTC days / Hours in UTC / full UTC days / *window starts at 13:00 UTC* | dates (*Oct 6*), *Oct 7 (still being collected)*; *Only part of this day is in the period*; UTC bounds in hover titles; *Days run on universal time (UTC)* once in How we count |
| Window 7d / 28d / all (*Last 7 days*, *Since start*) | Period: *This week* / *Last 4 weeks* / *All time*; `?window=` keys unchanged |
| extraction pending / *still being analysed* / *overviews analysed* | *3 answers are still being read by the AI; they're counted soon* / *46 answers read by the AI* |
| Report (artefact), Preliminary report / Full report / Day-28 refresh | Brief everywhere: *First brief (day 3)* / *Full brief (day 7)* / *Monthly update*; selector label *Brief*; *First brief arrives on Oct 10*; *Brief ready* |
| Report stage pages / brief / ready / failed | *Reading the pages* / *Writing your brief* / *Ready* / *Failed* |
| Pages tab / cited pages / winners / *What every winner has* / `winners_median` | *The pages Google cites* / *What every cited page has* / *a typical cited page* |
| Measures / *Measured in code, tagged by Claude* / words_before_answer / comparison_blocks / numbers_per_100_words / outline depth / links | *Page facts* / *Answers within 32 words* / *Side-by-side comparisons* / *How much data it uses* / *Sections and depth* / links only inside *All page facts* |
| Passages / *Where Google quotes this page* / *text variants are merged* / *x% down the page* | *The part Google quoted*, under its heading, *about a third of the way down*; the merge note in a tooltip |
| Coverage matrix / Covered, Partly covered, Missing / Topic, Entity rows | *Who covers what* / Covered, Partly, Missing / Topics, Brands and products |
| ref / page refs / *Refs that matched nothing* / `claim:<uuid>` | page numbers only; ref codes never shown |
| Answer first / Word budget / `max_words` | *Open with this answer* / *within the first 40 words* |
| Must cover / Evidence to match / New to cite / Outline / Publishing checklist / Avoid / Questions to answer | *Cover these N topics* / *Include the proof the cited pages have* / *Add something new that no cited page has* / *Sections, in order* / *Before you publish* / *Leave out* / *Questions to answer* |
| Why Google lacks it | *Why Google lacks it* (kept) |
| Checks on this brief / `must_cover_recurrence` / Removed by checks | *How we checked this brief* (closed; plain check names) |
| Markdown / Download .md / Copy Markdown | *Download the Brief* / *Copy the Brief* |
| Draft score (tab) / Score Draft / subscores | *Check your draft* / *Check Draft* / *Topics covered, Names included, Layout matches, Answers quickly, Proof, Basics (author, date, FAQ), Something new, Clear writing* |
| draft (the word) | explained on first use: *anything you've written for this search: paste the text, or give the address of the page once it's live* |
| Match level exact_url / path_prefix / same_host / same_domain; *any match level*; `LevelChip` *Cited: Exact URL* | *Your page* / *A page in the same part of your site* / *Another page on your site* (host and domain share the label; the strip keeps four fills); chips *Cited* / *Your site cited* / *Not cited*; *counting other pages on your site* |
| Tracking (tab) / *How often Google cites you* / `survival_7d` | *Is your page in?* / *Cited in 27 of 48 answers this week* |
| Google-wide change / platform event / Alert held | *Google changed many answers that day, so we didn't count it as your loss* |
| Events first_seen / lost / regained / brand_mention | *Cited for the first time* / *Dropped out (2 days without a citation)* / *Back in* / *Your brand was named* |
| Notification kinds report_ready / platform_event / digest | *Brief ready* / *Google changed many answers* / *Daily summary* |
| Series / shared captures / *History since* vs *Added* | *We already had checks since Sep 20*; hover *Someone else tracked this search first, so you start with their history* |
| language_code *en* / *Location 2840* | *English* / *United States* (`languageName()`, location name) |
| *No operators like site: or quotes* | *No special search symbols* |
| Timeline *Capture failed* / *failed captures aren't counted* | *Check failed* / *failed checks are never counted* |
| Live tab / Latest capture / Organic top 10 | *Google's answer* / *Latest check*, *Latest answer* / *Google's normal results, top 10* |
| Remove Query dialog *Captures stay…* | *Remove Search*; *The checks stay with anyone else tracking the same search* |

## 6. Waiting states

### Day 0 (overview found, about 2 minutes after landing)
- **List row:** *The first check is running.* then *Day 0 of 7. Nothing to do yet: your first brief arrives on Oct 10.* · *Checked just now* · right column *1 of 1 check*.
- **Headline:** *Day 0 of 7. Nothing to do yet: we check 8 times a day, and your first brief arrives on Oct 10.*
- **Strip:** 1 Done · 2 Day 0 of 7 (now) · 3 Reading the answers · 4 Opens on Oct 10 · 5 Arrives Oct 10 · 6 Add your page.
- **Card 1:** *Google shows an AI Overview for this search…: in 1 of 1 checks.* **Card 2:** *Day 0 of 7. Checked once so far; Google showed an AI Overview.* + the whole answer with numbered sources (the day-0 value). **Card 3:** *The AI is reading the first answer. What keeps showing up appears within a few hours of a check.* chip *Early · 1 check*. **Card 4:** *Opens on Oct 10 (day 3)…* · *See the Pages So Far* (the five cited pages at *1 of 1 answer*). **Card 5:** *Your brief is written from the page study on Oct 10…* **Card 6:** the form, or *We look for yoursite.com/best-crm in every check. Not cited yet in 1 answer.*
- **Detail pages:** Google's answer: the answer, a timeline with one square, *Changes show once two full days are collected*. What keeps showing up: *All time* period, points/brands/layout *appear once the AI has read the first answers, usually within a few hours*; pages table filled. The pages Google cites: *The page study opens on Oct 10 (day 3). 0.0 days so far.* Your brief: *Your brief arrives on Oct 10 (day 3). 0.0 days of checks so far.* Check your draft: *Draft checking opens with your first brief, on Oct 10.* Is your page in?: the form and the one-sentence explainer.
- **Within hours:** card 3 flips to the counts with *3 answers are still being read by the AI*; after 13:00 UTC the first daily summary arrives.

### Day 1
- **List row / headline:** *Day 1 of 7. Nothing to do yet: we check 8 times a day, and your first brief arrives on Oct 10.*
- **Card 2:** *Day 1 of 7. Checked 12 times so far; Google showed an AI Overview in 11 of them, and the answer changed between 7 of 11 checks.* chip *Getting there · 12 checks* at 10. **Card 3:** counts over the answers read, with the pending note. **Card 4/5:** *Opens on Oct 10* / *Arrives Oct 10*.
- **Google's answer:** *What changed*: *Changes show once two full days are collected* (the first comparison appears on day 2). **What keeps showing up:** day-by-day: *Oct 8 is still being collected, so it's compared tomorrow.*

### Day 3 (plus about an hour)
- **Building (from the first `build-reports` run on the hour):** headline *Your first brief is being written. Usually ready within an hour.* Strip: 4 *Reading 10 pages*, 5 *Being written*. Card 4: *Reading the 10 pages Google cites most: 6 of 10 read, 3 tagged.* Card 5: *Writing your brief. Usually within an hour.* The pages Google cites: *Reading the pages: 6 of 10 read, 3 tagged.* Your brief: the three-step card and *This page updates when you reload it.* Check your draft: *Your brief is being written. See its progress.* List row: *Your first brief is being written.*
- **Ready:** notification *Brief ready* (stored title as written by the function). Headline *Your first brief is ready. Write the page; the full brief arrives on Oct 14. When the page is live, add its address in step 6.* Strip: 4 *10 pages studied*, 5 *Ready* (now). Card 4 shows the three common traits; card 5 the summary and *Open the Brief* / *Check a Draft*. Your brief: eight decisions, Get it written, Check your draft. Check your draft: open. List row: *Your first brief is ready. Write the page.*
- **Failed:** strip 4 *Failed, retries Oct 14*; card 4 the failure sentence with the help address; cards 5 and 6 unchanged and usable.

### Day 7 (plus about an hour)
- Notification *Brief ready*. Headline *Your full brief is ready. Write or update the page; when it's live, add its address in step 6.* (or, after a draft check, *Your latest draft scores 72 of 100…*). Strip: 2 *7 days and counting* (done), 5 *Ready*. Card 2: *7 days and counting. Checked 56 times this week…* Your brief: the *Brief* select lists both; What keeps showing up defaults to *This week*. Card 6 waits for the address; once saved: *We look for … in every check. Not cited yet in 48 answers this week.*
- **First citation (any later day):** notification *Cited for the first time*; headline *Your page was cited in 3 of 8 answers today. Google quoted the "Pricing" section.*; strip 6 *Cited 3 of 8*; list row *Your page was cited in 3 of 8 answers today.* **Day 28:** card 5 *Your brief was updated on Nov 4. See what changed since the first one.*

### Other waits
- **No overview on add:** the amber card with sibling pills; the search page headline *Google isn't showing an AI Overview for this search yet…*; strip 1 *Waiting for Google* (now), cells 2 to 6 grey with *Starts when Google shows an AI Overview*; Google's answer shows the last 8 checks and the next check time.
- **Shared series (history ≥ 3 days at creation):** headline *We already had 12 days of checks for this search, so your brief is being written now.*; card 1 says so; steps 2 and 3 open as done; step 4 reads *Reading the pages* within the hour.
- **Paused:** info alert and headline *Paused…*; no cell is "now"; the brief's locked card reads *Briefs are built from fresh checks. Resume from the menu…*
- **Saving your page (any step 6 form):** *Saving…* then *Reading your page and re-checking the last 4 weeks of answers. This can take up to a minute.* then one of the three outcomes.
- **Draft check:** *Checking your draft… about a minute* with the three step names; after 3 minutes the longer-than-usual card.
- **Drawer:** skeleton rows, then *40 checks behind this number, newest first.*; on failure *The checks didn't load.* with Try Again.

## 7. Remove

- The six `Tabs` on the search page and the Live tab as the index (`web/app/(app)/queries/[id]/layout.tsx`, `page.tsx`); `tabs.tsx` stays as a primitive.
- The four stat cards opening Live, Patterns, Brief and Tracking, and the `StatGrid` on the Searches list; their numbers become one sentence with inline evidence links or lines inside the disclosure.
- `n=` everywhere (`formatShare`, `ShareValue`, `queries/page.tsx`, the Live `StatRow`, `tracking-stats.tsx` captions, the brief meta, `brief-status.tsx` *Built from 56 renders*, marketing). The word *render* and the render/capture split. Raw language codes and the *Location 2840* fallback.
- Uppercase CORE / RECURRING / ROTATING chips, the *Survival* column, `BucketLegend`, the Patterns footer sentence about buckets; thresholds move into *How we count* and chip tooltips.
- The *Confidence* stat card and *High confidence* wording.
- The *Both* device option (`DeviceChoice`), replaced by *Also Track on Mobile* in the Actions menu and the `?device=` parameter.
- The *How these numbers are made* alert and the methodology footnote on Patterns as always-visible blocks (one closed details).
- Organic overlap, citation stability, *Where the answer sits* and Unsupported claims as top-level Patterns sections (folded: the first three under More detail; the fourth into a chip plus a More-detail list; the answer-lead sentence into section 4).
- UTC in titles and captions: *Captures, Oct 1 to Oct 7 (UTC days)*, *Hours in UTC, newest day first*, *full UTC days*, *The window starts at 13:00 UTC this day*, *One column per day (UTC)* and the partial-day notes (`page.tsx` TimelineCard/ChangesCard, `timeline.tsx`, `day-diff.tsx`, `patterns-sections.tsx` DailySection, `tracking-strip.tsx`).
- The 11-fact *Measures* grid, tag rows and merged-quote notes as the default view of every page card; *Measured in code, tagged by Claude*.
- *Checks on this brief*, *Removed by checks* and monospace ref codes from the default brief view; the brief's four stat cards.
- The *Report* selector label and *Preliminary report / Full report / Day-28 refresh* wording; *First report in 2 days* on the list; *Report ready* as a chip label.
- The five-level `TrackingExplainer` with *canonical tag*, *redirects*, *path prefix*, *subdomain* and the platform-domain paragraph; the *Latest match: Exact URL* stat card; *at any match level* captions.
- The *Overview shown, 7 days* column label and the *Your page cited: add your URL on a query* aggregate card on the list.
- Marketing: *Five things on every query*, *Every count shows its n*, *56 renders in the first week*, *six match levels*, *Draft score*, *Preliminary report*.
- Raw database errors shown open on every error card (moved into a closed *Details* summary).

## 8. Routes and components

### Routes
| Route | Change |
|---|---|
| `/` , `/login`, `/auth/*`, `/queries`, `/queries/new`, `/notifications`, `/settings` | kept; copy and components change as above |
| `/queries/[id]` | **changed**: the six-steps page (new `page.tsx`, `loading.tsx`) |
| `/queries/[id]/live` | **new**: the former Live tab, moved (`page.tsx`, `loading.tsx`) |
| `/queries/[id]/patterns`, `/pages`, `/brief`, `/draft`, `/tracking` | kept at their paths (the notify function links to them); content reordered and relabelled |
| `?window=7d\|28d\|all`, `?score=`, `#daily`, `#page-<key>`, `#brief-*` | kept; new `?url=` on `/draft`, `?device=` and `?keyword=` on `/queries/new`, anchors `#step-1` … `#step-6`, `#common`, `#gaps`, `#entities`, `#sources`, `#timeline` |

### Components and modules
| File | Status |
|---|---|
| `web/lib/query/steps.ts`, `steps.test.ts` | **new**: `computeSteps`, `stepHeadline`, `fromMyQuery` |
| `web/components/query/step-strip.tsx` (`StepStrip`, `StepDots`), `step-card.tsx` | **new** |
| `web/components/ui/evidence-disclosure.tsx` | **new** |
| `web/components/query/own-page-fields.tsx` | **new**, lifted from `tracking-own-page.tsx` |
| `web/lib/format.ts` | **changed**: `formatOf`, `formatShare`, `STATUS_LABELS`, `MATCH_LEVEL_LABELS`, `matchLevelLabel` (*Not cited*), `REPORT_KIND_LABELS`, `REPORT_STAGE_LABELS`, `BUCKET_LABELS`, confidence labels and tooltips, `plural` callers |
| `web/components/ui/chip.tsx` | **changed**: `BucketChip` sentence case with tooltip, `ConfidenceChip` with the count, `LevelChip` *Cited / Your site cited* |
| `share-value.tsx`, `evidence.tsx` (labels only), `pending-note.tsx`, `window-control.tsx`, `web/lib/query/window.ts` (labels only) | **changed** |
| `timeline.tsx`, `day-diff.tsx`, `tracking-strip.tsx` (labels, day labels, tooltips), `tracking-stats.tsx`, `tracking-events.tsx`, `tracking-own-page.tsx` | **changed** |
| `patterns-sections.tsx` (labels, `initial` caps, sections moved), `page-card.tsx` (collapsed), `coverage-matrix.tsx` (legend) | **changed** |
| `brief-view.tsx`, `brief-status.tsx`, `brief-export.tsx`, `brief-report-select.tsx`, `brief-diff.tsx` (labels) | **changed** |
| `draft-scorer.tsx` (`?url=`), `draft-result.tsx` (`SUBSCORES` labels), `draft-history.tsx` | **changed** |
| `query-actions.tsx` (*Also Track on Mobile*, *Remove Search*), `queries/[id]/layout.tsx` | **changed** |
| `queries/page.tsx`, `queries/new/page.tsx`, `add-query-form.tsx`, `notifications-list.tsx`, `login/page.tsx`, `(marketing)/page.tsx`, `samples.tsx`, `feedback.tsx` (`ErrorCard`) | **changed** |
| `overview.tsx`, `organic-list.tsx`, `capture-status.tsx` (one label), `section-card.tsx`, `show-more.tsx`, `hash-scroll.tsx`, `page-anchor.ts`, `labels.ts`, `brief-refs.tsx`, `brief-checks.tsx`, `drawer.tsx`, `use-modal.ts`, `number-badge.tsx`, `typography.tsx`, `card.tsx`, `button.tsx`, `stat-card.tsx`, `progress-bar.tsx`, `scroll-fade.tsx`, `local-time.tsx` | **reused unchanged** |
| `web/lib/queries.ts`, `metrics.ts`, `report.ts`, `tracking.ts`, `pages.ts`, `ref-metrics.ts`, `prose.ts`, `supabase/*`, `safe-next.ts` | **reused unchanged** |
| `StatGrid` usage on the list and tabs, `BucketLegend`, `TrackingExplainer`'s five-level list, the Live `StatRow`, the brief stat cards, `DeviceChoice "both"` | **deleted** |
| `supabase/**` | **untouched** |

## 9. Sessions

Each session ends with `npm run lint` and `npm run build` green in `web/` and the check below. S1 and S2 are `docs/progress.md` item 5; S3, S4 and S5 are item 6. Tick an item when both its sessions' checks pass.

**S1 · Words, primitives and the step model.** Add `vitest` as a devDependency and a `test` script. Rewrite the label maps and `formatOf`/`formatShare` in `format.ts`; `chip.tsx`, `share-value.tsx`, `evidence.tsx` labels, `window.ts` labels, `timeline.tsx`/`tracking-strip.tsx`/`tracking-events.tsx`/`notifications-list.tsx` labels. Add `evidence-disclosure.tsx`, `step-strip.tsx`, `step-card.tsx`, `own-page-fields.tsx`, `steps.ts` with the tests in §4. **Check:** `npm test` passes the §4 cases; the existing tabs still render on the seeded series with the new words; `grep -rn "n=" web/components web/lib` finds no user-visible string.

**S2 · The searches list, the add form and the steps page.** Rewrite `queries/page.tsx`; update `queries/new/*` (one device, `?device=`, optional page, second waiting step); move Live to `/live`; write the steps `page.tsx` with per-card Suspense and ErrorCards; swap `Tabs` for `StepStrip` in the layout; add *Also Track on Mobile*. **Check:** on the real searches from PLAN §12 session 3, the headline and the six cards read correctly on a day-0, day-1 and day-3 search, a watching search and a paused search; every count on the page opens its drawer or its list; at 375px the strip shows two rows of three with no horizontal scroll and the first card is above the fold; the list row and the page show the same headline for the same search.

**S3 · Google's answer, What keeps showing up, The pages Google cites.** Restructure `live/page.tsx`, `patterns/page.tsx` + `patterns-sections.tsx`, `pages/page.tsx` + `page-card.tsx`; day labels from UTC day strings with bounds in titles; the closed *How we count* and More detail. **Check:** for one real series, every `EvidenceTrigger` on the three pages calls `metric_evidence` with the same kind, key and window as before and the drawer's *x of y* matches the trigger's; no caption contains "UTC" outside a `title` attribute and *How we count*.

**S4 · Your brief, Check your draft, Is your page in?** `brief/page.tsx` + `brief-view.tsx` + `brief-status.tsx` (days from `history_days`), the Get it written and Check your draft cards, the period note, `BriefChecks` in details; `draft/page.tsx` + `draft-scorer.tsx` (`?url=`) + `draft-result.tsx`; `tracking/page.tsx` + stats/strip/events/own-page. **Check:** walk one real search from the ready brief to a draft check to saving the live address to the events list; the *Dropped out (2 days without a citation)* rule appears before any event; the four strip fills still render for all four levels with two labels; the brief's chip counts equal the drawer counts over the brief's window.

**S5 · Inbox, marketing, login, cleanup.** `notifications-list.tsx`, the marketing page and samples built from `StepStrip`/`StepCard`, login bullets, `ErrorCard` details, static marketing rendering, robots, sitemap and Open Graph (PLAN §12 item 6), `docs/architecture.md` route list and `docs/brand.md` "App / report pages" updated to the steps page. **Check:** `grep -rniE "n=|render|survival|rotating|preliminary|exact url|match level|organic|UTC days" web/app web/components` finds no user-visible string; a reviewer who has never seen the product reads every screen of a real search and says what to do next without help; each of the six thread steps is reached from the steps page in one click; the marketing hero and the real day-2 steps page use the same sentences; tick items 5 and 6 in `docs/progress.md`.

## 10. The six steps and the evidence rule, by screen

| Thread step | Where it is reachable | Headline count (inline) | Behind Show the evidence |
|---|---|---|---|
| 1 Pick one search | `/queries/new`; card 1 | *in 49 of 56 checks* → presence drawer | period dates |
| 2 Track how Google answers it | card 2; `/live` | *Checked 56 times · AI Overview in 49* → presence drawer | changed between checks and sources per answer → timeline |
| 3 Find what keeps showing up | card 3; `/patterns` (points, brands, pages and websites, layout, day by day) | *In 40 of 46 answers* → claim drawer | backed-by-a-source, first/last seen, bars; brands, formats, sources, domains, overlap drawers |
| 4 Find what Google is rewarding | card 4; `/pages` (common, gaps, who covers what, differences, pages) | *Cited in 40 of 49 answers* → source drawer | page facts, quotes, matrix cells; gap chips → claim drawers |
| 5 Build something better | card 5; `/brief`, `/draft` | *6 topics · 4 names · 3 new things* → brief sections; *72 of 100* → the result | topic/name chips → drawers over the brief's window; sub-scores and the measures table |
| 6 Publish and track | card 6; `/tracking` (is it in, which part, what happened, what keeps winning, keep improving) | *Cited in 27 of 48 answers* → strip and events | 4-week counts, brand count, per-day columns; *still winning* → source drawer |

## 11. Where each judge blocker is fixed

| Blocker | Fix |
|---|---|
| *Patterns* / *Winners* as strip labels | plain-question labels on the strip and dots (§2); Jake's titles on the cards |
| three counters in one headline; two definitions of *day* | one counter plus a date (§3.5, §4); the day comes from `my_queries.history_days` everywhere |
| *check* never defined | the constant line under card 2's title, the meta line on `/live`, and *How we count* |
| Early / Getting there / Solid and the frequency chips unexplained on the index | the count inside the chip, a tooltip with the threshold, *How we count* on the index |
| *regular results*, *Big site*, *section*, *sources per answer*, *ranked list*, *answers read* | *Google's normal results (the blue links)*; the Big site tooltip; *a page in the same part of your site*; *how many pages each answer cites*; *numbered list*; *the answers the AI has read so far*; all defined in *How we count* |
| denominator-free percentages under More detail | `formatOf` everywhere: *the same pages in 31 of 49 answers*, *62 of 203 cited pages* |
| two periods on one search | every card and page states its period; the brief carries the period note (§3.9) |
| step 4 Failed with nothing to do | the sentence names the retry date and the help address; steps 5 and 6 stay usable; a retry button is a backend follow-up (§12) |
| step 5 assumes the user can write | the *Get it written* card: download, copy for your writer, *Find a Writer on Legiit* |
| *Score the Next Draft* presumes a draft | *Check a Draft* with the explaining sentence on card 5 and at the top of `/draft` |
| mobile tracking hidden | *Also Track on Mobile* in the Actions menu; the device hint on the add form |
| six cells scroll sideways on a phone | two rows of three, labels only, states on the cards |
| steps 5 and 6 both open | the "now" rule in §4; one headline names both actions |
| *Yesterday* / *Today so far* are UTC days | dates only, *(still being collected)* for the open day, UTC bounds in titles, one line in *How we count* |
| notifications and emails keep the old words | kind chips relabelled now; the stored titles and bodies are a backend follow-up (§12) |
| *Dropped out* rule never stated beforehand | card 6 and the tracking page state it before any event |

## 12. Backend follow-ups (outside these sessions, no change to this spec)

- `supabase/functions/notify` and the event writers: titles, bodies and the digest line still say *report*, *capture*, *render*; rewrite to the vocabulary in §5 (`Brief ready`, `check`, `answer`).
- A user-triggered retry of a failed report (`build-reports` replaces a failed report only at the next milestone today).
- A `metric_evidence` kind for the own page and for change between checks, so those counts open a drawer instead of the per-check lists.
- `series_history_start` in `my_queries` (or the page's capture list) so the brief dates can be computed from the stretch start rather than *today + (3 − history_days)*.
