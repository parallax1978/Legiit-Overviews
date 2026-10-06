# Source spec: Jake Ward's AI Overview process

This product automates the process Jake Ward (@jakezward) described in an X thread on 6 October 2026.

Original: https://x.com/jakezward/status/2107453596107219294

The thread is reproduced below verbatim (fetched 2026-10-06) so the spec does not depend on X staying reachable. The attached image on the first tweet is a screenshot of the Google AI Overview for the query "best form builder": a five-bullet "Best for ..." list where the first bullet ("Best Free / Unlimited Overall: Tally ...") and its citation chip ("Tally Forms +1") are highlighted, with the Tally source card shown below the answer.


## Thread text

```text
--- [1] https://x.com/jakezward/status/2107453596107219294  (Tue Oct 06 12:51:06 +0000 2026)
I’m begging you:

- Pick ONE Google AI Overview
- Track how it changes over 7 days
- Find the patterns with AI
- Reverse engineer the citations
- Build your page around the findings

I’ve used this process to rank in 1,000s of AI Overviews.

Here’s how it works:

--- [2] https://x.com/jakezward/status/2107453608195215721  (Tue Oct 06 12:51:09 +0000 2026)
1. Pick one search you actually want to win

Ideally a buying-intent query that already triggers an AI Overview.

--- [3] https://x.com/jakezward/status/2107453612599197738  (Tue Oct 06 12:51:10 +0000 2026)
2. Track how Google answers it

Collect the AI Overview over 7+ days (more the better).

You can do this in 2 ways:

FREE

Search it manually every day and save:

- The full answer
- Citations
- Date

--- [4] https://x.com/jakezward/status/2107453622887850218  (Tue Oct 06 12:51:12 +0000 2026)
PAID

Add the prompt to a tool like https://Mentions.so and automatically track the answers + citations over time.

--- [5] https://x.com/jakezward/status/2107453631788204255  (Tue Oct 06 12:51:15 +0000 2026)
3. Find what keeps showing up

Put all the answers into ChatGPT or Claude and look for:

- Recurring claims
- Repeated entities
- Common formats
- Frequent sources
- Important differences

--- [6] https://x.com/jakezward/status/2107453639090417863  (Tue Oct 06 12:51:16 +0000 2026)
Then count how often each one appears.

You’re basically building a picture of what Google consistently includes for that search.

--- [7] https://x.com/jakezward/status/2107453649764925687  (Tue Oct 06 12:51:19 +0000 2026)
4. Find what Google is rewarding

Now study the pages that get cited most frequently.

Look at what they cover, how they answer the question and what they do differently.

--- [8] https://x.com/jakezward/status/2107453658921099351  (Tue Oct 06 12:51:21 +0000 2026)
You want to understand both what they have in common AND what’s missing.

Pay attention to:

- How quickly they answer
- Topics and entities they cover
- How they structure the information
- Data or evidence they include
- Tables, lists or comparisons
- Gaps between the different sources

--- [9] https://x.com/jakezward/status/2107453662448493011  (Tue Oct 06 12:51:22 +0000 2026)
5. Build something better

Use everything you found to create or improve your page.

- Cover the important topics
- Include the important entities
- Use the right format
- Answer questions immediately
- Make the information incredibly clear

--- [10] https://x.com/jakezward/status/2107453664948375753  (Tue Oct 06 12:51:22 +0000 2026)
But don’t just copy what’s already winning, use it as the baseline and then make yours better.

Give Google something NEW to cite:

- Original data
- First-hand experience
- Better examples
- New statistics
- Better comparisons
- Useful tables
- Questions nobody else answered

--- [11] https://x.com/jakezward/status/2107453669780107767  (Tue Oct 06 12:51:24 +0000 2026)
6. Publish and track

Monitor the same search over time.

- Does your page start appearing?
- Which sections seem to perform?
- What sources keep winning?
- What changes in the AI Overview?

Then use what you learn to keep improving the page.

--- [12] https://x.com/jakezward/status/2107453672330293711  (Tue Oct 06 12:51:24 +0000 2026)
That’s basically it.

No magic AEO/GEO prompt.

Just track what Google is doing, find the patterns, then use them to build a better result.

--- [13] https://x.com/jakezward/status/2107453675127853413  (Tue Oct 06 12:51:25 +0000 2026)
If you enjoyed this thread:

1. Follow me @jakezward for more
2. RT the tweet below to share it with others

https://x.com/jakezward/status/2107453596107219294
```


## The six steps, restated as product requirements

| Step | Jake's instruction | What the product must do |
|---|---|---|
| 1 | Pick one buying-intent search that already triggers an AI Overview | Let the user add a query (with country, language, device) and confirm an AI Overview exists for it before tracking starts |
| 2 | Collect the AI Overview over 7+ days: full answer, citations, date | Capture a daily snapshot of the AI Overview text and every cited source, timestamped, for as long as the query is tracked |
| 3 | Find recurring claims, entities, formats, sources, and important differences; count how often each appears | Run LLM analysis across all snapshots to extract claims, entities, format features and sources, cluster them, and count recurrence; show day-to-day diffs |
| 4 | Study the most-cited pages: coverage, answer speed, structure, evidence, tables/lists/comparisons, gaps between sources | Fetch the most-cited pages, extract their structure and content features, and build a common-vs-gap comparison |
| 5 | Build a better page: cover the topics and entities, use the right format, answer immediately, and add something NEW to cite | Generate a content brief with baseline requirements plus "new to cite" opportunities; optionally score a draft against it |
| 6 | Publish and keep tracking: does your page appear, which sections perform, what sources keep winning, what changes | Keep tracking the query after publish, detect the user's domain in citations, and report changes and wins over time |
