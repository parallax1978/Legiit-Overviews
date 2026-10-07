// Runs the fake Claude over a simulated series built the way the real pipeline builds its inputs:
// scenario SERPs -> parseCapture -> extractInput -> fakeExtract (with growing known claims),
// consolidateInput -> fakeConsolidate, pages -> pageTagInput -> fakePageTag, metrics -> briefInput ->
// fakeBrief -> renderBrief checks, and the brief -> fakeDraftScore. Every output is validated with
// the real zod schemas.
import { assert, assertEquals } from "@std/assert";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { renderBrief } from "../supabase/functions/_shared/brief-render.ts";
import { normalizeUrl, regDomain } from "../supabase/functions/_shared/normalize.ts";
import { parseCapture } from "../supabase/functions/_shared/parse-serp.ts";
import { outlineFromMarkdown, wordsBefore } from "../supabase/functions/_shared/passage.ts";
import { BriefOutput, ConsolidateOutput, DraftScoreOutput, ExtractOutput, PageTagOutput } from "../supabase/functions/_shared/schemas.ts";
import { briefContext, briefInput, type BriefRow } from "../supabase/functions/_shared/work/brief.ts";
import { consolidateInput } from "../supabase/functions/_shared/work/consolidate.ts";
import { extractInput } from "../supabase/functions/_shared/work/extract.ts";
import { pageTagInput } from "../supabase/functions/_shared/work/page-tag.ts";
import { detectTask, exampleFromSchema, fakeBrief, fakeConsolidate, fakeDraftScore, fakeExtract, fakeOutput, fakePageTag } from "./fake-claude.ts";
import { pageFor, pageMarkdown, serpResult, SLOT_MS } from "./scenario.ts";

const KEYWORD = "best form builder";
const END = Date.parse("2026-10-07T00:00:00Z");

interface Group {
  id: string;
  label: string;
  snapshots: Set<number>;
  cited: number;
  occurrences: number;
}

interface Entity {
  id: string;
  name: string;
  aliases: string[];
  snapshots: Set<number>;
  recommended: Set<number>;
  labels: Set<string>;
}

function simulate(keyword: string) {
  const groups: Group[] = [];
  const entities: Entity[] = [];
  const formats = new Map<string, number>();
  const words: number[] = [];
  const citing = new Map<string, { url: string; count: number; passages: string[] }>();
  const hashes = new Map<string, number>();
  let renders = 0;
  let present = 0;
  let reused = 0;
  for (let k = 0; k < 56; k++) {
    const result = serpResult({ keyword, location_code: 2840, language_code: "en", device: "desktop", at: new Date(END - (56 - k) * SLOT_MS) });
    const parsed = parseCapture(result);
    renders++;
    if (parsed.status !== "present") continue;
    const snap = present++;
    words.push(parsed.formats!.word_count);
    for (const c of new Set(parsed.citations.map((c) => c.url_key))) {
      const cit = parsed.citations.find((x) => x.url_key === c)!;
      const entry = citing.get(c) ?? { url: cit.url, count: 0, passages: [] };
      entry.count++;
      if (cit.passage && !entry.passages.includes(cit.passage)) entry.passages.push(cit.passage);
      citing.set(c, entry);
    }
    const first = hashes.get(parsed.content_hash!);
    let output: ExtractOutput;
    if (first !== undefined) {
      reused++;
      output = outputs.get(first)!;
    } else {
      hashes.set(parsed.content_hash!, snap);
      const input = extractInput(
        { id: `s${snap}`, series_id: "x", sentences: parsed.sentences },
        { keyword, language: "en", claims: groups.map((g) => ({ id: g.id, label: g.label })), entities: entities.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases })) },
      );
      const raw = fakeExtract(input);
      const check = ExtractOutput.safeParse(raw);
      assert(check.success, `extract output invalid: ${check.success ? "" : check.error.message}`);
      output = check.data;
      // The refs the prompt used: C<n> -> groups[n-1], E<n> -> entities[n-1], as knownRefs builds them.
      const refGroup = new Map(input.known_claims.map((c, i) => [c.ref, groups[i]]));
      const refEntity = new Map(input.known_entities.map((e, i) => [e.ref, entities[i]]));
      for (const c of output.claims) {
        assert(c.group_ref === null || refGroup.has(c.group_ref), `unknown claim ref ${c.group_ref}`);
        assert(c.group_ref !== null || c.new_label, "new claims need a label");
        assert(parsed.sentences.some((s) => s.i === c.sentence), `claim points at sentence ${c.sentence}`);
        (c as any).group = c.group_ref ? refGroup.get(c.group_ref)! : undefined;
      }
      for (const e of output.entities) assert(e.entity_ref === null || refEntity.has(e.entity_ref), `unknown entity ref ${e.entity_ref}`);
      // Apply like apply_extraction: new labels become groups, unknown entities become rows.
      for (const c of output.claims) {
        if (!(c as any).group) {
          let g = groups.find((x) => x.label === c.new_label);
          if (!g) groups.push(g = { id: `g${groups.length}`, label: c.new_label!, snapshots: new Set(), cited: 0, occurrences: 0 });
          (c as any).group = g;
        }
      }
      for (const e of output.entities) {
        let ent = e.entity_ref ? refEntity.get(e.entity_ref) : entities.find((x) => x.name.toLowerCase() === e.name.toLowerCase());
        if (!ent) entities.push(ent = { id: `e${entities.length}`, name: e.name, aliases: [], snapshots: new Set(), recommended: new Set(), labels: new Set() });
        (e as any).entity = ent;
      }
      outputs.set(snap, output);
    }
    for (const c of output.claims) {
      const g = (c as any).group as Group;
      g.snapshots.add(snap);
      g.occurrences++;
      if (parsed.sentences[c.sentence]?.citations.length) g.cited++;
    }
    for (const e of output.entities) {
      const ent = (e as any).entity as Entity;
      ent.snapshots.add(snap);
      if (e.role === "recommended") ent.recommended.add(snap);
      if (e.label) ent.labels.add(e.label);
    }
    for (const f of output.format_labels) formats.set(f, (formats.get(f) ?? 0) + 1);
  }
  return { groups, entities, formats, words, citing, renders, present, reused };
}

const outputs = new Map<number, ExtractOutput>();
const sim = simulate(KEYWORD);

Deno.test("extraction validates, reuses known claims and recurs like the scenario", () => {
  assert(sim.present >= 45, `present ${sim.present}`);
  assert(sim.reused >= 8, `identical captures reused: ${sim.reused}`);
  const shares = sim.groups.map((g) => g.snapshots.size / sim.present).sort((a, b) => b - a);
  assert(shares[0] >= 0.8, `top claim share ${shares[0]}`);
  assert(shares.filter((s) => s >= 0.4).length >= 4, `recurring claims: ${shares.slice(0, 10)}`);
  assert(sim.groups.length < 120, `claim groups ${sim.groups.length}`);
  const names = sim.entities.map((e) => e.name);
  for (const n of ["Jotform", "Typeform", "Google Forms", "Tally", "Tally Forms"]) assert(names.includes(n), `entity ${n}`);
  assert(!names.some((n) => /^(pricing|integrations|compliance|logic and payments)$/i.test(n)), `criteria are not entities: ${names}`);
  const jot = sim.entities.find((e) => e.name === "Jotform")!;
  assert(jot.recommended.size / sim.present > 0.8, "Jotform is recommended");
  assert(jot.labels.has("best overall"), `Jotform labels ${[...jot.labels]}`);
  assert((sim.formats.get("ranked_list") ?? 0) > 0 && (sim.formats.get("bullets") ?? 0) > 0, `formats ${[...sim.formats]}`);
  assert((sim.formats.get("table") ?? 0) > 0, "table format");
});

Deno.test("an identical capture maps every claim to a known group", () => {
  const result = serpResult({ keyword: KEYWORD, location_code: 2840, language_code: "en", device: "desktop", at: new Date(END - 3 * SLOT_MS) });
  const parsed = parseCapture(result);
  assertEquals(parsed.status, "present");
  const knowledge = { keyword: KEYWORD, language: "en", claims: sim.groups.map((g) => ({ id: g.id, label: g.label })), entities: sim.entities.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases })) };
  const out = fakeExtract(extractInput({ id: "again", series_id: "x", sentences: parsed.sentences }, knowledge));
  assert(out.claims.length > 3);
  assert(out.claims.every((c) => c.group_ref !== null), "all claims matched");
  assert(out.entities.every((e) => e.entity_ref !== null), "all entities matched");
  assertEquals(out.answer_lead_sentence, 0);
});

Deno.test("consolidation merges Tally and Tally Forms and validates", () => {
  const { input, refs } = consolidateInput({
    series_id: "x",
    keyword: KEYWORD,
    language: "en",
    claims: sim.groups.map((g) => ({ id: g.id, label: g.label, renders: g.snapshots.size })),
    entities: sim.entities.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, renders: e.snapshots.size })),
  });
  const out = ConsolidateOutput.parse(fakeConsolidate(input));
  const tally = sim.entities.find((e) => e.name === "Tally")!;
  const forms = sim.entities.find((e) => e.name === "Tally Forms")!;
  const merge = out.entity_merges.find((m) => [m.keep, ...m.merge].some((r) => refs[r] === tally.id))!;
  assert(merge, "a merge group for Tally");
  assertEquals(new Set([merge.keep, ...merge.merge].map((r) => refs[r])), new Set([tally.id, forms.id]));
  assertEquals(refs[merge.keep], tally.id);
  assert(merge.aliases.includes("Tally Forms"));
  for (const m of out.claim_merges) for (const r of [m.keep, ...m.merge]) assert(refs[r], `claim ref ${r} resolves`);
  const grouped = new Set(out.entity_merges.flatMap((m) => [m.keep, ...m.merge]).map((r) => refs[r]));
  for (const name of ["Jotform", "Typeform", "Google Forms"]) assert(!grouped.has(sim.entities.find((e) => e.name === name)!.id), `${name} is not merged`);
});

function topPages(n = 10) {
  return [...sim.citing.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, n);
}

Deno.test("page tags validate and quote the page verbatim", () => {
  let answered = 0;
  const top = topPages(16);
  for (const [key, c] of top) {
    const md = pageMarkdown(pageFor(c.url));
    const input = pageTagInput({ id: key, url_key: key, url: c.url, markdown: md, outline: outlineFromMarkdown(md), keyword: KEYWORD, language: "en", passages: c.passages });
    const out = PageTagOutput.parse(fakePageTag(input));
    assert(out.topics.length > 0, `topics for ${key}`);
    for (const e of out.evidence) assert(md.includes(e.excerpt), `excerpt not verbatim in ${key}: ${e.excerpt}`);
    if (out.answer_sentence) assert(md.includes(out.answer_sentence), `answer sentence not verbatim in ${key}`);
    if (out.answer_sentence) answered++;
  }
  assert(answered / top.length >= 0.7, `pages with an answer sentence: ${answered} of ${top.length}`);
});

Deno.test("brief validates, uses only input refs and passes the code checks", () => {
  const pages = topPages(10).map(([key, c]) => {
    const md = pageMarkdown(pageFor(c.url));
    const tags = PageTagOutput.parse(fakePageTag(pageTagInput({ id: key, url_key: key, url: c.url, markdown: md, outline: null, keyword: KEYWORD, language: "en", passages: c.passages })));
    return { url_key: key, url: c.url, measures: { words_before_answer: wordsBefore(md, tags.answer_sentence) }, tags };
  });
  const bucket = (s: number) => (s >= 0.8 ? "core" : s >= 0.4 ? "recurring" : "rotating") as "core" | "recurring" | "rotating";
  const claims = sim.groups.map((g) => {
    const share = g.snapshots.size / sim.present;
    return { group_id: g.id, label: g.label, renders: g.snapshots.size, share, bucket: bucket(share), first_seen: "", last_seen: "", cited_share: g.cited / g.occurrences, types: [] };
  });
  const metrics = {
    renders: sim.renders,
    present: sim.present,
    median_word_count: sim.words.sort((a, b) => a - b)[Math.floor(sim.words.length / 2)],
    claims,
    entities: sim.entities.map((e) => ({ entity_id: e.id, name: e.name, renders: e.snapshots.size, share: e.snapshots.size / sim.present, recommended_renders: e.recommended.size, recommended_share: e.recommended.size / sim.present, labels: [...e.labels], bucket: bucket(e.snapshots.size / sim.present) })),
    sources: [...sim.citing.entries()].map(([key, c]) => ({ url_key: key, url: c.url, reg_domain: regDomain(key.split("/")[0]), title: null, renders: c.count, share: c.count / sim.present, bucket: bucket(c.count / sim.present), platform: /reddit|youtube/.test(key), organic_top10_share: 0 })),
    domains: [],
    formats: [...sim.formats.entries()].map(([label, n]) => ({ label, renders: n, share: n / sim.present })),
    unsupported_claims: claims.filter((c) => c.cited_share === 0 && c.share >= 0.4).map((c) => ({ group_id: c.group_id, label: c.label, share: c.share })),
  };
  assert(metrics.unsupported_claims.length >= 1, "the uncited support sentence recurs");
  const row: BriefRow = {
    id: "r1", kind: "full", stage: "brief", tracked_query_id: "t1", series_id: "x",
    window_start: new Date(END - 7 * 86400_000).toISOString(), window_end: new Date(END).toISOString(), renders: sim.renders,
    metrics: metrics as any, page_urls: pages.map((p) => p.url_key), page_details: [], keyword: KEYWORD, language: "en",
    display_keyword: KEYWORD, own_url_key: normalizeUrl("https://www.jotform.com/blog/best-form-builder/"), pages,
  };
  const { input, refs } = briefInput(row);
  const out = BriefOutput.parse(fakeBrief(input));
  const used = [
    ...out.matrix.topics.flatMap((t) => [...t.claim_refs, ...t.cells.map((c) => c.page_ref)]),
    ...out.matrix.entities.flatMap((e) => [e.entity_ref ?? "", ...e.cells.map((c) => c.page_ref)]).filter(Boolean),
    ...out.gaps.flatMap((g) => g.claim_refs),
    ...out.page_notes.map((p) => p.page_ref),
    ...out.brief.must_cover.flatMap((m) => m.claim_refs),
    ...out.brief.entities.map((e) => e.entity_ref ?? "").filter(Boolean),
    ...out.brief.evidence_to_match.flatMap((e) => e.page_refs),
    ...out.brief.new_to_cite.flatMap((n) => n.evidence_refs),
  ];
  for (const r of used) assert(refs[r], `ref ${r} is not in the input`);
  assert(out.brief.must_cover.length >= 3, "must cover");
  assert(out.brief.new_to_cite.length >= 3 && out.brief.new_to_cite.every((n) => n.evidence_refs.length > 0), "new to cite with evidence");
  const rendered = renderBrief(out, briefContext(row, refs, {}));
  assert(rendered.checks.passed, JSON.stringify(rendered.checks, null, 1));
  assert(rendered.markdown.length > 500);
});

Deno.test("draft score validates and tracks the brief's topics", () => {
  const brief = BriefOutput.parse(fakeBrief({
    keyword: KEYWORD, language: "en", own_domain: null, window: { from: "", to: "", renders: 56, present: 50 },
    claims: [{ ref: "C1", label: "Jotform is best overall, with more than 10,000 templates and conditional logic on every plan.", share: 0.9, bucket: "core", cited_share: 1 }, { ref: "C2", label: "Google Forms is the best free option, with unlimited forms and responses.", share: 0.7, bucket: "recurring", cited_share: 0.5 }],
    entities: [{ ref: "E1", name: "Jotform", share: 0.9, recommended_share: 0.9, labels: ["best overall"] }, { ref: "E2", name: "Google Forms", share: 0.8, recommended_share: 0.8, labels: ["best free option"] }],
    formats: [{ label: "ranked_list", share: 0.7 }, { label: "table", share: 0.3 }], median_word_count: 160, unsupported_claims: [], platform_sources: [], pages: [],
  }));
  const good = `# The best form builder\n\n${brief.brief.answer_first.text}\n\n## Jotform\n\nJotform is best overall, with more than 10,000 templates and conditional logic on every plan.\n\n## Google Forms\n\nGoogle Forms is the best free option, with unlimited forms and responses.`;
  const scored = DraftScoreOutput.parse(fakeDraftScore({ keyword: KEYWORD, language: "en", brief: brief.brief, draft_markdown: good }));
  assert(scored.topics.every((t) => t.status === "covered"), JSON.stringify(scored.topics));
  assertEquals(scored.answer_first.status, "covered");
  assert(scored.clarity.score >= 0 && scored.clarity.score <= 10);
  const empty = DraftScoreOutput.parse(fakeDraftScore({ keyword: KEYWORD, language: "en", brief: brief.brief, draft_markdown: "Hello." }));
  assert(empty.topics.every((t) => t.status === "missing"));
  assert(empty.fixes.length > 0 && empty.fixes[0].priority === 1);
});

Deno.test("tasks are detected from the SDK's JSON schemas; unknown schemas still get valid output", () => {
  const cases = [[ExtractOutput, "extract"], [ConsolidateOutput, "consolidate"], [PageTagOutput, "page_tag"], [BriefOutput, "brief"], [DraftScoreOutput, "draft_score"]] as const;
  for (const [schema, task] of cases) {
    const json = zodOutputFormat(schema).schema;
    assertEquals(detectTask(json), task);
    const example = exampleFromSchema(json);
    assert(schema.safeParse(example).success, `example for ${task}: ${JSON.stringify(example)}`);
  }
  assertEquals(detectTask({ type: "object", properties: { foo: {} } }), null);
  const viaParams = fakeOutput({
    messages: [{ role: "user", content: [{ type: "text", text: `Consolidate.\n\n<data>\n${JSON.stringify({ keyword: "k", language: "en", claims: [], entities: [] })}\n</data>` }] }],
    output_config: { format: { schema: zodOutputFormat(ConsolidateOutput).schema } },
  });
  assertEquals(viaParams?.task, "consolidate");
});
