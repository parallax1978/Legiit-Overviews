import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { answerBudget, type BriefContext, briefMarkdown, renderBrief, stripFigures } from "./brief-render.ts";
import { BriefOutput } from "./schemas.ts";

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";
const G3 = "33333333-3333-4333-8333-333333333333";
const G3_SURVIVOR = "44444444-4444-4444-8444-444444444444";
const E1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const E3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function ctx(over: Partial<BriefContext> = {}): BriefContext {
  return {
    displayKeyword: "Best form builder",
    reportKind: "full",
    window: { from: "2026-09-30T00:00:00Z", to: "2026-10-07T00:00:00Z" },
    renders: 56,
    present: 48,
    refs: { C1: G1, C2: G2, C3: G3, E1: E1, E2: E2, E3: E3, P1: "jotform.com/blog/best-form-builder", P2: "zapier.com/blog/forms" },
    claims: {
      [G1]: { label: "Jotform is the best form builder for most teams.", share: 0.75, renders: 36 },
      [G2]: { label: "Typeform suits conversational surveys.", share: 0.2, renders: 10 },
      [G3]: { label: "Tally is free.", share: 0.5, renders: 24 },
    },
    entities: {
      [E1]: { name: "Jotform", share: 0.81, renders: 39 },
      [E2]: { name: "Formstack", share: 0.02, renders: 1 },
      [E3]: { name: "Tally", share: 0.6, renders: 29 },
    },
    pages: {
      "jotform.com/blog/best-form-builder": { url: "https://www.jotform.com/blog/best-form-builder/" },
      "zapier.com/blog/forms": { url: "https://zapier.com/blog/forms (2026)" },
    },
    survivors: { [G3]: G3_SURVIVOR },
    answerBudget: 45,
    ...over,
  };
}

function output(): BriefOutput {
  return BriefOutput.parse({
    summary: "The overview rewards a ranked list led by Jotform, with free options called out.",
    matrix: {
      topics: [
        { topic: "Best overall", claim_refs: ["C1", "C42"], cells: [{ page_ref: "P1", state: "covered" }, { page_ref: "P9", state: "missing" }] },
      ],
      entities: [
        { entity: "Jotform", entity_ref: "E1", cells: [{ page_ref: "P2", state: "partial" }] },
        { entity: "Ghost", entity_ref: "E77", cells: [] },
      ],
    },
    common_to_all: ["Ranked list"],
    gaps: [{ gap: "No hands-on tests", why: "No page shows test results.", claim_refs: ["c3"] }],
    page_notes: [
      { page_ref: "P1", does_differently: "Vendor's own list." },
      { page_ref: "P9", does_differently: "Unknown page." },
    ],
    brief: {
      answer_first: { text: "Jotform is the best form builder for most teams; Tally is the best free option.", max_words: 999 },
      must_cover: [
        { topic: "Best overall pick", why: "In three quarters of overviews.", claim_refs: ["C1"] },
        { topic: "Free options", why: "Half the overviews.", claim_refs: ["C3"] },
        { topic: "Survey tools", why: "Sometimes.", claim_refs: ["C2"] },
        { topic: "Made up", why: "No ref.", claim_refs: ["C99"] },
      ],
      entities: [
        { name: "Jotform", entity_ref: "E1", role: "recommended", note: "Lead with it." },
        { name: "Formstack", entity_ref: "E2", role: "mentioned", note: "Rare." },
        { name: "tally", entity_ref: null, role: "recommended", note: "Best free option." },
        { name: "Nowhere", entity_ref: "C1", role: "mentioned", note: "Wrong kind of ref." },
      ],
      format: { structure: "Ranked list with a comparison table.", table_columns: ["Tool", "Free plan", "Best for"], list_items: 7 },
      evidence_to_match: [{ what: "Pricing per plan", page_refs: ["P1", "P2", "P3"] }],
      new_to_cite: [{
        idea: "Run a timed build test",
        why_google_lacks_it: "No cited page measures build time.",
        how_to_produce: "first_hand_test",
        evidence_refs: ["P1", "E1", "C1", "X1"],
      }],
      questions: ["Which form builder is free?"],
      outline: [
        { heading: "Best form builders in 2026", level: 1, purpose: "Answer first.", target_words: 120, covers: ["best overall pick"] },
        { heading: "Jotform", level: 2, purpose: "Top pick.", target_words: 300, covers: ["Best overall pick"] },
      ],
      checklist: ["Indexable, no noindex", "Author and date visible"],
      avoid: ["Long history of online forms"],
    },
  });
}

Deno.test("renderBrief replaces refs with typed refs and drops unknown ones", () => {
  const { analysis, checks } = renderBrief(output(), ctx());
  assertEquals(analysis.matrix.topics[0].claim_refs, [`claim:${G1}`]);
  assertEquals(analysis.matrix.topics[0].cells, [{ page_ref: "page:jotform.com/blog/best-form-builder", state: "covered" }]);
  assertEquals(analysis.matrix.entities[0].entity_ref, `entity:${E1}`);
  assertEquals(analysis.matrix.entities[1].entity_ref, null);
  // Lower-case refs resolve; merged groups resolve to their survivor.
  assertEquals(analysis.gaps[0].claim_refs, [`claim:${G3_SURVIVOR}`]);
  assertEquals(analysis.page_notes.map((n) => n.page_ref), ["page:jotform.com/blog/best-form-builder"]);
  assertEquals(analysis.brief.evidence_to_match[0].page_refs, ["page:jotform.com/blog/best-form-builder", "page:zapier.com/blog/forms"]);
  assertEquals(analysis.brief.new_to_cite[0].evidence_refs, ["page:jotform.com/blog/best-form-builder", `entity:${E1}`, `claim:${G1}`]);
  assertEquals(checks.dropped_refs, ["C1", "C42", "C99", "E77", "P3", "P9", "X1"]);
  assertEquals(checks.checks.find((c) => c.name === "refs_resolve")?.passed, false);
});

Deno.test("renderBrief drops must-cover topics and entities that fail their checks", () => {
  const { analysis, checks } = renderBrief(output(), ctx());
  const b = analysis.brief;
  assertEquals(b.must_cover.map((m) => m.topic), ["Best overall pick", "Free options"]);
  assertEquals(b.must_cover[1].claim_refs, [`claim:${G3_SURVIVOR}`]);
  assertEquals(b.entities.map((e) => [e.name, e.entity_ref]), [["Jotform", `entity:${E1}`], ["tally", `entity:${E3}`]]);
  assertEquals(b.answer_first.max_words, 45);

  const must = checks.checks.find((c) => c.name === "must_cover_recurrence")!;
  assertEquals(must.passed, false);
  assertStringIncludes(must.detail, "Survey tools (best claim in 20%)");
  assertStringIncludes(must.detail, "Made up (no known claim)");
  const ent = checks.checks.find((c) => c.name === "entity_recurrence")!;
  assertEquals(ent.passed, false);
  assertStringIncludes(ent.detail, "Formstack (1 render)");
  assertStringIncludes(ent.detail, "Nowhere (not in the data)");
  const outline = checks.checks.find((c) => c.name === "outline_covers_must_cover")!;
  assertEquals(outline.passed, false);
  assertStringIncludes(outline.detail, "Free options");
  assertEquals(checks.passed, false);
});

Deno.test("renderBrief passes every check on a clean brief", () => {
  const o = output();
  o.matrix.topics[0].claim_refs = ["C1"];
  o.matrix.topics[0].cells = [{ page_ref: "P1", state: "covered" }];
  o.matrix.entities = [];
  o.gaps = [];
  o.page_notes = [];
  o.brief.must_cover = o.brief.must_cover.slice(0, 2);
  o.brief.entities = [o.brief.entities[0]];
  o.brief.evidence_to_match = [{ what: "Pricing", page_refs: ["P1"] }];
  o.brief.new_to_cite[0].evidence_refs = ["P2"];
  o.brief.outline[1].covers = ["Best overall pick", "Free options!"];
  const { checks } = renderBrief(o, ctx());
  assertEquals(checks.dropped_refs, []);
  assert(checks.checks.every((c) => c.passed), JSON.stringify(checks));
  assertEquals(checks.passed, true);
});

Deno.test("brief Markdown is a clean document with recurrence and n", () => {
  const { markdown, analysis } = renderBrief(output(), ctx());
  assertStringIncludes(markdown, "# Brief: Best form builder\n");
  assertStringIncludes(markdown, "Full report · 7 days to 2026-10-07 · 56 renders, 48 with an AI Overview");
  assertStringIncludes(markdown, "> Jotform is the best form builder for most teams; Tally is the best free option.");
  assertStringIncludes(markdown, "within the first 45 words");
  assertStringIncludes(markdown, "- **Best overall pick** in 75% of AI Overviews (36 of 48). In three quarters of overviews.");
  assertStringIncludes(markdown, "- **Free options** in 50% of AI Overviews (24 of 48).");
  assertStringIncludes(markdown, "- **Jotform** (recommended) in 81% of AI Overviews (39 of 48). Lead with it.");
  assertStringIncludes(markdown, "- Table columns: Tool · Free plan · Best for");
  assertStringIncludes(markdown, "- **Best form builders in 2026** (H1, about 120 words): Answer first.");
  assertStringIncludes(markdown, "  - **Jotform** (H2, about 300 words): Top pick. Covers: Best overall pick.");
  assertStringIncludes(markdown, "[jotform.com](https://www.jotform.com/blog/best-form-builder/)");
  assertStringIncludes(markdown, "[zapier.com](https://zapier.com/blog/forms%20%282026%29)");
  assertStringIncludes(markdown, "1. **Run a timed build test**\n   - Why Google lacks it: No cited page measures build time.\n   - How to produce: First-hand test");
  assertStringIncludes(markdown, "- [ ] Author and date visible");
  assertStringIncludes(markdown, "## Avoid\n\n- Long history of online forms");
  assert(!markdown.includes("Survey tools"));
  assert(!markdown.includes("Formstack"));
  assert(!/\n{3,}/.test(markdown));
  assertEquals(briefMarkdown(analysis, ctx()), markdown);
});

Deno.test("brief Markdown escapes emphasis and HTML from model text", () => {
  const o = output();
  o.summary = "Use <script>alert(1)</script> and *stars*";
  const { markdown } = renderBrief(o, ctx());
  assertStringIncludes(markdown, "Use &lt;script>alert(1)&lt;/script> and \\*stars\\*");
});

Deno.test("renderBrief accepts an entity ref only for the entity the model named", () => {
  const o = output();
  o.matrix.entities = [{ entity: "Tally", entity_ref: "E1", cells: [] }];
  o.brief.entities = [
    // E1 is Jotform: the ref is wrong, the name is right, so Tally keeps Tally's figures.
    { name: "Tally", entity_ref: "E1", role: "recommended", note: "Best free option." },
    // An alias of the referenced entity is the same entity.
    { name: "Jotform Forms", entity_ref: "E1", role: "recommended", note: "Lead with it." },
    // Neither the ref nor the name points at an entity in the data.
    { name: "Wufoo", entity_ref: "E3", role: "mentioned", note: "Old." },
  ];
  const c = ctx({
    entities: { ...ctx().entities, [E1]: { name: "Jotform", share: 0.81, renders: 39, aliases: ["Jotform Forms"] } },
  });
  const { analysis, checks, markdown } = renderBrief(o, c);
  assertEquals(analysis.matrix.entities[0].entity_ref, `entity:${E3}`);
  assertEquals(analysis.brief.entities.map((e) => [e.name, e.entity_ref]), [["Tally", `entity:${E3}`], ["Jotform Forms", `entity:${E1}`]]);
  assertStringIncludes(markdown, "- **Tally** (recommended) in 60% of AI Overviews (29 of 48).");
  assert(!markdown.includes("Tally** (recommended) in 81%"));
  assertStringIncludes(checks.checks.find((x) => x.name === "entity_recurrence")!.detail, "Wufoo (not in the data)");
  assert(checks.dropped_refs.includes("E1") && checks.dropped_refs.includes("E3"));
});

Deno.test("renderBrief strips figures the model wrote into prose and records it", () => {
  const o = output();
  o.gaps[0].why = "No page shows test results (n=19).";
  o.brief.entities[0].note = "Lead with it; it is recommended in 62% of AI Overviews.";
  o.brief.new_to_cite[0].why_google_lacks_it = "Only 2 of 10 pages time anything, 20% of pages.";
  const { analysis, checks, markdown } = renderBrief(o, ctx());
  assertEquals(analysis.gaps[0].why, "No page shows test results.");
  assertEquals(analysis.brief.entities[0].note, "Lead with it; it is recommended.");
  assertEquals(analysis.brief.new_to_cite[0].why_google_lacks_it, "Only 2 of 10 pages time anything.");
  assertEquals(analysis.brief.must_cover[0].why, "In three quarters of overviews.", "prose without figures is untouched");
  const check = checks.checks.find((x) => x.name === "no_figures_in_prose")!;
  assertEquals(check.passed, false);
  assertStringIncludes(check.detail, 'gap "No hands-on tests"');
  assertStringIncludes(check.detail, 'entity "Jotform"');
  assertStringIncludes(check.detail, 'new-to-cite "Run a timed build test"');
  assertStringIncludes(markdown, "- **Jotform** (recommended) in 81% of AI Overviews (39 of 48). Lead with it; it is recommended.");
  assert(!markdown.includes("62%") && !markdown.includes("n=19"));
  assertEquals(renderBrief(output(), ctx()).checks.checks.find((x) => x.name === "no_figures_in_prose")!.passed, true);
});

Deno.test("stripFigures removes percentages and n= counts with the words around them", () => {
  assertEquals(stripFigures("Tally is the free pick, named in 40% of overviews."), "Tally is the free pick, named.");
  assertEquals(stripFigures("Named as the best free option (19 of 48, 40%)."), "Named as the best free option.");
  assertEquals(stripFigures("40% of overviews call it the free pick."), "Call it the free pick.");
  assertEquals(stripFigures("Recommended in about 62.5% of AI Overviews; lead with it."), "Recommended; lead with it.");
  assertEquals(stripFigures("iPhone users see it in 30 percent of renders, n = 12."), "iPhone users see it.");
  assertEquals(stripFigures("No cited page measures build time."), null);
});

Deno.test("answerBudget is the median words before the answer, 60 when unknown", () => {
  assertEquals(answerBudget([40, 60]), 50);
  assertEquals(answerBudget([10, null, 30, 200]), 30);
  assertEquals(answerBudget([null, undefined]), 60);
  assertEquals(answerBudget([]), 60);
});
