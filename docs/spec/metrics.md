# Metrics (one definition each)

All metrics are computed in SQL or plain TypeScript over extracted rows. The LLM never counts anything. Every number shown to a user carries its sample size `n` (renders) and a confidence label: `low` under 10 renders, `medium` 10 to 20, `high` 21 or more.

Denominators are renders, never days. A render is a `snapshot` row whose status is `present_full` or `present_collapsed`. "Observable renders" for a claim cluster exclude `present_collapsed` renders when the cluster only ever appeared in expanded content.

## Per series over a window

**Trigger rate** = present renders / all renders with status other than `provider_error`, `blocked`, `timeout` (those are excluded from both numerator and denominator and reported separately as capture failures).

**Citation stability (URL)** = mean pairwise Jaccard similarity of the cited-URL sets across all present renders in the window. Jaccard(A, B) = |A ∩ B| / |A ∪ B| over `url_normalized`. **Citation stability (domain)** = the same over `registrable_domain`. Report both.

**Sources per render** = mean number of references per present render.

**Survival rate (per URL and per domain)** = renders citing it / present renders. Buckets: CORE at or above 0.80, RECURRING 0.40 to 0.80, ROTATING under 0.40. Platform-class domains (video, forum, social, encyclopedia, review platform) are bucketed and shown but flagged "not displaceable by a page".

**Claim recurrence (per cluster)** = `renders_seen / renders_observable`. Same buckets as survival. The cluster's canonical text is the medoid claim.

**Entity recurrence** = renders in which the entity is mentioned / present renders, computed separately for `recommended` entities (named in the answer) and `cited_domain` entities. An entity is self-promotional when it is recommended and every supporting reference resolves to its own registrable domain.

**Format fingerprint** = per render: word count, list type and item count, table presence, heading count, "best for" label structure, answer-lead position. Over the window: the share of renders with each feature and the modal structure.

**Share of citations in organic top 10 / top 20** = cited URLs that appear in the same render's organic results at rank 10 or better (and 20 or better) / cited URLs. Reported per render and averaged.

**Semantic drift** = cosine similarity between the markdown embeddings of consecutive present renders. Expect about 0.95; under 0.85 is flagged as a real change of opinion.

**Important differences** = the day-to-day diff: ordered cluster ids compared with `diffArrays` from jsdiff for added, dropped and reordered claims; set differences for entities and citations; `diffSentences` on block text for display.

## Readiness gates

- `preliminary`: at least 3 capture-days with a present render. Shown with the low-confidence badge.
- `seven_day`: at least 5 capture-days and at least 10 present renders. Every tier gets 2 renders per day for the first 7 days of a series so this is reachable by day 7.
- `weekly`: recomputed every 7 days after the seven-day run; SQL only.
- `post_publish`: after the customer marks a page published; rolling 14 and 28-day windows.

## Post-publish

**Own-page survival** = renders citing the customer's URL at any match level / present renders over the rolling window, bucketed as above.

**Section citations** = for each citing block that references the customer's URL, the page section (heading path) whose embedding is the nearest at cosine at or above 0.8; counts per section over the window; blocks under the threshold go to an "unmatched" bucket.

**Win and loss events** = `first_seen` when the URL is cited for the first time; `lost` when it is absent from at least 3 consecutive present renders after having been cited; `regained` on the next citation after a loss; `brand_mention` when a brand term appears in the answer text without a URL match. Loss events inside an open `model_regime` window are recorded with `suppressed_by_regime = true` and do not email.

## Canary (product-owned)

Across the 100 sentinel series per day: presence rate, sources per render, and global citation Jaccard (today's union of cited domains versus yesterday's). A move of more than 2 standard deviations from the trailing 14 days sets `sigma_flag`, opens a `model_regime` row, and shows the platform-event banner.
