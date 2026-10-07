import { assert, assertEquals } from "@std/assert";
import { locatePassage, outlineFromMarkdown, wordsBefore } from "./passage.ts";

const PAGE = `# The 7 best form builders in 2026

Picking a form builder comes down to price and logic.

## Our top pick

**Jotform** is the best form builder for most teams because it has 10,000+ templates and a generous free plan.
See [their pricing](https://www.jotform.com/pricing/) for details.

## Best free option

Tally lets you create unlimited forms and collect unlimited responses for free.

\`\`\`
# not a heading
\`\`\`

### FAQ
Is Google Forms free? Yes.
`;

Deno.test("exact passage is found under the right heading", () => {
  const r = locatePassage(PAGE, "Tally lets you create unlimited forms and collect unlimited responses for free.");
  assert(r.found);
  assertEquals(r.heading, "Best free option");
  assertEquals(r.match_score, 1);
  assert(r.position! > 0.5 && r.position! < 0.9);
});

Deno.test("paraphrased passage with punctuation and case changes is still found", () => {
  const r = locatePassage(PAGE, "Jotform is the best form builder for most teams, because it has 10,000+ templates");
  assert(r.found);
  assertEquals(r.heading, "Our top pick");
});

Deno.test("a passage with a prefix the page lacks is placed at its first matched word", () => {
  const page = `# Form builder reviews

## Jotform

Jotform is the best form builder for most teams because it has a generous free plan.

## Typeform

Reviewers rate Typeform highly for its design and conversational forms.
`;
  const passage = "Sep 18, 2026 — Reviewers rate Typeform highly for its design and conversational forms.";
  const r = locatePassage(page, passage);
  assert(r.found);
  // Aligning the whole passage would start three words early, inside the Jotform section.
  assertEquals(r.heading, "Typeform");
  assertEquals(r.token_index, 21);
  assert(r.position! > page.indexOf("## Typeform") / page.length);
  assertEquals(wordsBefore(page, passage), 16);
});

Deno.test("unrelated passage is not found", () => {
  const r = locatePassage(PAGE, "Salesforce is the leading CRM for enterprise sales teams worldwide.");
  assertEquals(r.found, false);
  assertEquals(r.heading, null);
});

Deno.test("outline skips code fences and strips inline markdown", () => {
  assertEquals(outlineFromMarkdown(PAGE), [
    { level: 1, text: "The 7 best form builders in 2026" },
    { level: 2, text: "Our top pick" },
    { level: 2, text: "Best free option" },
    { level: 3, text: "FAQ" },
  ]);
});

Deno.test("words before the answer exclude heading words", () => {
  const n = wordsBefore(PAGE, "Jotform is the best form builder for most teams");
  // "Picking a form builder comes down to price and logic" = 10 words
  assertEquals(n, 10);
  assertEquals(wordsBefore(PAGE, "nothing like this appears anywhere at all"), null);
});
