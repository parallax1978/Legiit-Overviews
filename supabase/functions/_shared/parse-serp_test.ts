import { assert, assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { normalizeUrl, stripTextFragment } from "./normalize.ts";
import { parseCapture, parsedCapturedAt, sentenceSpans, sha256Hex, stripImages } from "./parse-serp.ts";
import type { ParsedCapture } from "./types.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

function fixture(name: string): any {
  return JSON.parse(Deno.readTextFileSync(new URL(name, FIXTURES))).tasks[0].result[0];
}

function serpFixtures(): string[] {
  return [...Deno.readDirSync(FIXTURES)]
    .map((e) => e.name)
    .filter((n) => n === "dfs-doc-live-advanced.json" || /^synthetic-.*\.json$/.test(n))
    .sort();
}

const words = (s: string) => new Set(s.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** Every reference, video and marker URL anywhere in the overview items. */
function sourceUrls(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => sourceUrls(v, out));
  else if (value && typeof value === "object") {
    const o = value as any;
    if (o.type === "ai_overview_reference" || o.type === "ai_overview_video_element") out.push(o.url);
    if (typeof o.markdown === "string") {
      for (const m of o.markdown.matchAll(/\[\[\d+\]\]\((https?:\/\/[^)\s]+)\)/g)) out.push(m[1]);
    }
    Object.values(o).forEach((v) => sourceUrls(v, out));
  }
  return out;
}

/**
 * Every piece of text the overview items carry (images and markers removed). An item's markdown
 * stands in for its plain text when it has any (DataForSEO's text spells out formulas for screen readers).
 */
function itemTexts(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => itemTexts(v, out));
  else if (value && typeof value === "object") {
    const o = value as any;
    if (o.type === "ai_overview_reference" || o.type === "link_element" || o.type === "images_element") return out;
    const md = typeof o.markdown === "string" ? stripImages(o.markdown).replace(/\[\[\d+\]\]\([^)]*\)/g, " ") : "";
    if (words(md).size) out.push(md);
    for (const k of ["title", "snippet", ...(words(md).size ? [] : ["text"])]) if (typeof o[k] === "string") out.push(o[k]);
    if (Array.isArray(o.table?.table_content)) out.push(o.table.table_content.flat().join(" "));
    for (const [k, v] of Object.entries(o)) if (k !== "markdown" && k !== "table") itemTexts(v, out);
  }
  return out;
}

function assertWellFormed(p: ParsedCapture): void {
  p.sentences.forEach((s, i) => {
    assertEquals(s.i, i);
    assert(s.text.trim() === s.text && s.text.length > 0, `sentence ${i} is trimmed and non-empty`);
    assert(!/\[\[\d+\]\]|data:image|!\[/.test(s.text), `sentence ${i} has no markers or images: ${s.text}`);
    for (const c of s.citations) assert(c >= 0 && c < p.citations.length);
    if (i > 0) assert(s.block >= p.sentences[i - 1].block, "blocks never go backwards");
  });
  p.sections.forEach((s, i) => {
    assertEquals(s.position, i);
    for (const c of s.citation_idx) assert(c >= 0 && c < p.citations.length);
  });
  p.citations.forEach((c, i) => {
    assertEquals(c.idx, i);
    assert(!c.url.includes("#:~:"), "text fragments are stripped");
    assertEquals(c.url_key, normalizeUrl(c.url));
    assert(c.host && c.reg_domain);
  });
  assertEquals(new Set(p.citations.map((c) => c.url_key)).size, p.citations.length, "citations are unique by url_key");
  if (p.status === "present") {
    assertMatch(p.content_hash!, /^[0-9a-f]{64}$/);
    assertEquals(p.formats!.sentences, p.sentences.length);
  }
}

Deno.test("every fixture parses and nothing is dropped", () => {
  const names = serpFixtures();
  assert(names.length >= 5, "doc fixture plus synthetic fixtures");
  for (const name of names) {
    const result = fixture(name);
    const p = parseCapture(result);
    assertWellFormed(p);
    const overviews = (result.items ?? []).filter((i: any) => i.type === "ai_overview");
    assertEquals(p.status, overviews.length ? "present" : "absent", name);
    assertEquals(p.organic.length, result.items.filter((i: any) => i.type === "organic").length, name);

    const keys = new Set(p.citations.map((c) => c.url_key));
    for (const url of sourceUrls(overviews)) {
      assert(keys.has(normalizeUrl(stripTextFragment(url))), `${name}: ${url} is a citation`);
    }
    const kept = new Set([...p.sentences.map((s) => s.text), ...p.sections.flatMap((s) => [s.text, s.title ?? ""])].flatMap((t) => [...words(t)]));
    for (const text of itemTexts(overviews.map((o: any) => o.items))) {
      for (const w of words(text)) assert(kept.has(w), `${name}: "${w}" from "${text.slice(0, 60)}" is kept`);
    }
    const nonVideo = overviews.flatMap((o: any) => o.items ?? []).filter((i: any) => i.type !== "ai_overview_video_element");
    assertEquals(p.sections.length, overviews.reduce((n: number, o: any) => n + (o.items?.length ?? 0), 0), name);
    assertEquals(p.sections.filter((s) => s.kind !== "video" && !s.text).length, 0, `${name}: ${nonVideo.length} text sections`);
  }
});

Deno.test("DataForSEO doc fixture: section kinds, marker citations, text fragments", () => {
  const p = parseCapture(fixture("dfs-doc-live-advanced.json"));
  assertEquals(p.sections.map((s) => s.kind), ["element", "expanded", "video", "table"]);
  assertEquals(p.asynchronous, false);
  // Four markers at the end of the paragraph belong to its last sentence; two are not in references[].
  assertEquals(p.sentences[1].citations, [0, 1, 2, 3]);
  assertEquals(p.sentences[0].citations, []);
  assertEquals(p.citations.map((c) => c.reg_domain), ["autoevolution.com", "pistonheads.com", "bmw-m.com", "newcenturybmw.com", "youtube.com"]);
  assertEquals(p.citations[0].url, "https://www.autoevolution.com/cars/bmw-m4-f82-2014.html");
  assert(p.citations[0].passage!.startsWith("The load capacity"));
  assertEquals(p.sections[2].citation_idx, [4]);
  assertEquals(p.sentences.filter((s) => s.kind === "table_row").length, 4);
  assertEquals(p.sentences.find((s) => s.kind === "table_row")!.text, "Aspect | Sanity Testing | Regression Testing");
  assert(p.sentences.some((s) => s.kind === "expanded" && s.text.startsWith("Springfield Division sales in Quarter 1 are $1,500,000.")));
  assert(!p.markdown!.includes("base64"));
  assert(p.markdown!.includes("[[1]](https://www.autoevolution.com"), "markers are kept in the stored markdown");
  assertEquals(p.formats!.has_table, true);
  assertEquals(parsedCapturedAt(fixture("dfs-doc-live-advanced.json")), "2019-11-15T12:57:46.000Z");
});

Deno.test("form builders: list items keep their own citations, duplicates collapse", () => {
  const p = parseCapture(fixture("synthetic-form-builders.json"));
  const by = (start: string) => p.sentences.find((s) => s.text.startsWith(start))!;
  const idxOf = (key: string) => p.citations.find((c) => c.url_key === key)!.idx;

  // Two Zapier references (www and not, different text fragments) are one citation; the first passage wins.
  assertEquals(p.citations.filter((c) => c.reg_domain === "zapier.com").length, 1);
  const zapier = idxOf("zapier.com/blog/best-online-form-builder-software");
  assert(p.citations[zapier].passage!.startsWith("The best form builders let you"));
  assertEquals(p.citations.find((c) => c.reg_domain === "typeform.com")!.url_key, "typeform.com/pricing");

  assertEquals(by("The best form builder").citations, [zapier, idxOf("forbes.com/advisor/business/software/best-form-builder")]);
  assertEquals(by("Jotform:").citations, [idxOf("jotform.com/blog/best-form-builders")]);
  assertEquals(by("Typeform:").citations, [], "the marker at the end of the item goes to its last sentence");
  assertEquals(by("Paid plans start at $25/mo. billed annually.").citations, [idxOf("typeform.com/pricing")]);
  assertEquals(by("Tally:").citations, [idxOf("tally.so/help/pricing")]);
  assertEquals(by("Google Forms:").text, "Google Forms: Free and simple, e.g. for quick internal surveys.");
  assertEquals(by("Google Forms:").citations, [zapier], "a marker URL with a text fragment matches by url_key");
  // A marker whose URL no reference lists still becomes a citation.
  const forrester = idxOf("forrester.com/blogs/no-code-form-builders");
  assertEquals(by("Dr. Jane Smith").text, "Dr. Jane Smith of Forrester notes that approx. 3.5x more teams switched to no-code form tools since 2023.");
  assertEquals(by("Dr. Jane Smith").citations, [forrester]);
  assertEquals(p.citations[forrester].passage, null);

  assertEquals(p.sentences.filter((s) => s.kind === "list_item").length, 5);
  assertEquals(p.formats, { word_count: p.formats!.word_count, has_table: false, list_items: 4, headings: 2, sentences: 10 });
  assertEquals(p.sentences.filter((s) => s.kind === "heading").map((s) => s.text), ["Top form builders", "Key considerations"]);
  assertEquals(p.sections.map((s) => [s.kind, s.title]), [["element", null], ["element", "Top form builders"], ["element", "Key considerations"]]);
  assertEquals(p.sections[2].citation_idx, [forrester]);
  assertEquals(p.asynchronous, true);
  assertEquals(p.organic.map((o) => o.rank), [1, 2, 3, 4]);
  assertEquals(p.organic[0].url_key, "zapier.com/blog/best-online-form-builder-software");
  assertEquals(p.organic[3].reg_domain, "reddit.com");
});

Deno.test("every section type, component references and unknown items", () => {
  const p = parseCapture(fixture("synthetic-sections.json"));
  assertEquals(p.sections.map((s) => s.kind), ["element", "expanded", "table", "video", "unknown"]);
  const by = (text: string) => p.sentences.find((s) => s.text === text)!;
  const idxOf = (key: string) => p.citations.find((c) => c.url_key === key)!.idx;

  // Section references attach to the section's sentences when the markdown carries no markers.
  assertEquals(by("Building a form takes a few minutes in most tools, and the free plans differ mainly in limits.").citations, [idxOf("g2.com/categories/online-form-builder")]);
  assertEquals(by("Sign up for a free account and click Create Form.").citations, [idxOf("jotform.com/help/how-to-create-a-form")]);
  assertEquals(by("Sign up for a free account and click Create Form.").kind, "expanded");
  assertEquals(by("Drag fields onto the canvas.").citations, []);
  assertEquals(by("Publish the form and share the link.").citations, [idxOf("jotform.com/help/form-builder")]);
  assertEquals(by("Jotform | 5 forms | $34/mo").kind, "table_row");
  assertEquals(by("Tool | Free plan | Paid from").kind, "table_row");
  assertEquals(by("Fillout offers unlimited forms and 1,000 responses per month for free.").citations, [idxOf("fillout.com/pricing")]);
  assert(by("Paperform plans start at $24 per month."));

  const video = p.sections[3];
  assertEquals(video.title, "Jotform Tutorial for Beginners");
  assertEquals(p.citations[video.citation_idx[0]].url_key, "youtube.com/watch?v=abc123XYZ");
  assertEquals(p.citations[video.citation_idx[0]].source, "YouTube");
  assertEquals(p.sections[2].text, "Tool | Free plan | Paid from\nJotform | 5 forms | $34/mo\nTypeform | 10 responses/mo | $25/mo");
  assertEquals(p.sections[4].title, "Other tools to consider");
  assert(p.sections[4].text.includes("Paperform plans start at $24 per month."));
  assertEquals(p.sections[1].citation_idx, [idxOf("jotform.com/help/how-to-create-a-form"), idxOf("jotform.com/help/form-builder")]);
  assertEquals(p.markdown, "Building a form takes a few minutes in most tools, and the free plans differ mainly in limits.");
  assertEquals(p.formats!.has_table, true);
});

Deno.test("absent overview: organic only", () => {
  const p = parseCapture(fixture("synthetic-absent.json"));
  assertEquals(p.status, "absent");
  assertEquals([p.content_hash, p.formats, p.markdown, p.asynchronous], [null, null, null, null]);
  assertEquals([p.sentences.length, p.sections.length, p.citations.length], [0, 0, 0]);
  assertEquals(p.organic.length, 4);

  const empty = parseCapture({ items: [{ type: "ai_overview", markdown: "![x](data:image/png;base64,AAAA)", items: [], references: [] }] });
  assertEquals(empty.status, "absent");
  assertEquals(parseCapture(null).status, "absent");
});

Deno.test("German: Intl.Segmenter with abbreviations, ordinals and decimal commas", () => {
  const p = parseCapture(fixture("synthetic-german.json"));
  assertEquals(p.sentences.map((s) => [s.text, s.citations]), [
    ["Die besten Formular-Tools sind z. B. Jotform und Typeform.", [0]],
    ["Jotform: Kostet ca. 34,99 € pro Monat und bietet 5 Formulare gratis.", [1]],
    ["Tally: Seit dem 1. Januar 2024 gibt es unbegrenzte Formulare.", []],
    ["Die Nr. 1 für Notion-Nutzer.", [2]],
    ["Laut Dr. Müller sparen Teams ca. 3,5 Std. pro Woche.", []],
  ]);
  assertEquals(p.sentences[3].block, p.sentences[2].block);
});

Deno.test("sentence splitting keeps decimals, prices and abbreviations", () => {
  const split = (t: string, lang = "en") => sentenceSpans(t, lang).map(([s, e]) => t.slice(s, e).trim());
  assertEquals(split("Jotform costs $34.99 per month. It's approx. 3.5x cheaper than Typeform."), [
    "Jotform costs $34.99 per month.",
    "It's approx. 3.5x cheaper than Typeform.",
  ]);
  assertEquals(split("Dr. Smith said so. Mr. Jones agreed, e.g. the U.S. market is big. See No. 4 vs. Tally."), [
    "Dr. Smith said so.",
    "Mr. Jones agreed, e.g. the U.S. market is big.",
    "See No. 4 vs. Tally.",
  ]);
  assertEquals(split("Version 2.0 is out! Is it good? Yes."), ["Version 2.0 is out!", "Is it good?", "Yes."]);
});

Deno.test("content_hash ignores reference order and image data, but not text or cited URLs", () => {
  const base = fixture("synthetic-form-builders.json");
  const hash = parseCapture(base).content_hash;

  const reordered = structuredClone(base);
  const ov = reordered.items.find((i: any) => i.type === "ai_overview");
  ov.references.reverse();
  for (const item of ov.items) item.references?.reverse();
  const r = parseCapture(reordered);
  assertEquals(r.content_hash, hash);
  assertNotEquals(r.citations.map((c) => c.url_key), parseCapture(base).citations.map((c) => c.url_key));

  const newImage = structuredClone(base);
  const ov2 = newImage.items.find((i: any) => i.type === "ai_overview");
  ov2.markdown = ov2.markdown.replace(/base64,[A-Za-z0-9+/=]+/, "base64,/9j/4AAQSkZJRgABAQAAAQABAAD");
  assertEquals(parseCapture(newImage).content_hash, hash);

  const edited = structuredClone(base);
  const ov3 = edited.items.find((i: any) => i.type === "ai_overview");
  ov3.markdown = ov3.markdown.replace("Best overall", "Best for teams");
  assertNotEquals(parseCapture(edited).content_hash, hash);

  const recited = structuredClone(base);
  const ov4 = recited.items.find((i: any) => i.type === "ai_overview");
  ov4.markdown = ov4.markdown.replace("https://tally.so/help/pricing", "https://tally.so/pricing");
  assertNotEquals(parseCapture(recited).content_hash, hash);
});

Deno.test("items without overview markdown still give sentences; markers without URLs use their number", () => {
  const base = fixture("synthetic-form-builders.json");
  const noMarkdown = structuredClone(base);
  delete noMarkdown.items.find((i: any) => i.type === "ai_overview").markdown;
  const p = parseCapture(noMarkdown);
  assertEquals(p.status, "present");
  const jot = p.sentences.find((s) => s.text.startsWith("Jotform:"))!;
  assertEquals(jot.kind, "paragraph");
  assert(p.sentences.some((s) => s.text === "Key considerations" && s.kind === "heading"));
  // The second element has no markers: its four references go to its last sentence.
  const last = p.sentences.find((s) => s.text.startsWith("Google Forms:"))!;
  assertEquals(last.citations.length, 4);
  assert(p.markdown!.startsWith("The best form builder"));

  const numbered = parseCapture({
    language_code: "en",
    items: [{
      type: "ai_overview",
      markdown: "Tally is free.[[2]] Jotform has templates.[^1]",
      references: [
        { type: "ai_overview_reference", url: "https://www.jotform.com/templates/", title: "Templates", text: "10,000 templates" },
        { type: "ai_overview_reference", url: "https://tally.so/", title: "Tally", text: "Free forms" },
      ],
    }],
  });
  assertEquals(numbered.sentences.map((s) => [s.text, s.citations]), [["Tally is free.", [1]], ["Jotform has templates.", [0]]]);
  assertEquals(numbered.sections.length, 1, "markdown without items is kept as one section");
  assertEquals(numbered.sections[0].citation_idx, [0, 1]);
});

Deno.test("parsedCapturedAt reads DataForSEO datetimes as ISO UTC", () => {
  assertEquals(parsedCapturedAt({ datetime: "2026-10-07 12:00:00 +00:00" }), "2026-10-07T12:00:00.000Z");
  assertEquals(parsedCapturedAt({ datetime: "2026-10-07 14:30:05 +02:00" }), "2026-10-07T12:30:05.000Z");
  assertEquals(parsedCapturedAt({ datetime: "2026-10-07T12:00:00Z" }), "2026-10-07T12:00:00.000Z");
  assertEquals(parsedCapturedAt({ datetime: "yesterday" }), null);
  assertEquals(parsedCapturedAt({}), null);
});

Deno.test("sha256Hex matches crypto.subtle", async () => {
  for (const s of ["", "abc", "a".repeat(55), "b".repeat(56), "c".repeat(64), "Zürich € 🚀 ".repeat(40)]) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
    assertEquals(sha256Hex(s), [...digest].map((b) => b.toString(16).padStart(2, "0")).join(""));
  }
});
