import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { locatePassage } from "../supabase/functions/_shared/passage.ts";
import { normalizeUrl } from "../supabase/functions/_shared/normalize.ts";
import { demoOwnPage, pageContent, pageFor, pageMarkdown, relatedKeywordsFor, serpResult, SLOT_MS, slotStart } from "./scenario.ts";

const END = Date.parse("2026-10-07T00:00:00Z");

function week(keyword: string, device = "desktop", slots = 56, end = END) {
  return Array.from({ length: slots }, (_, k) => {
    const at = new Date(end - (slots - k) * SLOT_MS);
    return serpResult({ keyword, location_code: 2840, language_code: "en", device, at });
  });
}

function overview(r: Record<string, unknown>): any {
  return (r.items as any[]).find((i) => i.type === "ai_overview") ?? null;
}

function stats(keyword: string, end = END) {
  const renders = week(keyword, "desktop", 56, end);
  const present = renders.map(overview).filter(Boolean);
  let repeats = 0;
  for (let i = 1; i < present.length; i++) if (JSON.stringify(present[i]) === JSON.stringify(present[i - 1])) repeats++;
  const citing = new Map<string, number>();
  for (const o of present) {
    for (const key of new Set((o.references as any[]).map((r) => normalizeUrl(r.url)))) citing.set(key, (citing.get(key) ?? 0) + 1);
  }
  const share = [...citing.entries()].map(([k, n]) => [k, n / present.length] as const);
  return {
    renders,
    present,
    presence: present.length / renders.length,
    repeatRate: repeats / Math.max(1, present.length - 1),
    core: share.filter(([, s]) => s >= 0.8).map(([k]) => k),
    recurring: share.filter(([, s]) => s >= 0.4 && s < 0.8).map(([k]) => k),
    rotating: share.filter(([, s]) => s < 0.4).map(([k]) => k),
  };
}

Deno.test("serpResult is deterministic per series and slot", () => {
  const at = new Date("2026-10-06T13:37:00Z");
  const a = serpResult({ keyword: "best form builder", location_code: 2840, language_code: "en", device: "desktop", at });
  const b = serpResult({ keyword: "Best  Form Builder", location_code: 2840, language_code: "en", device: "desktop", at });
  assertEquals(JSON.stringify(overview(a)), JSON.stringify(overview(b)));
  const sameSlot = serpResult({ keyword: "best form builder", location_code: 2840, language_code: "en", device: "desktop", at: new Date("2026-10-06T14:59:00Z") });
  assertEquals(JSON.stringify(overview(a)), JSON.stringify(overview(sameSlot)));
  assertEquals(a.datetime, "2026-10-06 13:37:00 +00:00");
  const slot = serpResult({ keyword: "best form builder", location_code: 2840, language_code: "en", device: "desktop", at: slotStart(Math.floor(at.getTime() / SLOT_MS)) });
  assertEquals(slot.datetime, "2026-10-06 12:00:00 +00:00");
  const mobile = week("best form builder", "mobile").map((r) => JSON.stringify(overview(r)));
  const desktop = week("best form builder", "desktop").map((r) => JSON.stringify(overview(r)));
  assertNotEquals(mobile, desktop);
});

for (const keyword of ["best form builder", "best crm for small business"]) {
  Deno.test(`56 slots of "${keyword}" look like a real series`, () => {
    for (const end of [END, END - 9 * 86400_000]) {
      const s = stats(keyword, end);
      assert(s.presence >= 0.78 && s.presence <= 0.98, `presence ${s.presence}`);
      assert(s.repeatRate >= 0.12 && s.repeatRate <= 0.5, `repeat rate ${s.repeatRate}`);
      assert(s.core.length >= 1, `core sources: ${s.core}`);
      assert(s.recurring.length >= 1, `recurring sources: ${s.recurring}`);
      assert(s.rotating.length >= 1, `rotating sources: ${s.rotating}`);
    }
  });

  Deno.test(`every reference passage of "${keyword}" sits verbatim in its page`, () => {
    const pages = new Map<string, string>();
    let checked = 0;
    for (const end of [END, END - 9 * 86400_000]) {
      for (const o of stats(keyword, end).present) {
        const refs = [...o.references, ...o.items.flatMap((i: any) => [...(i.references ?? []), ...(i.components ?? []).flatMap((c: any) => c.references ?? [])])];
        for (const ref of refs) {
          const key = normalizeUrl(ref.url);
          if (!pages.has(key)) pages.set(key, pageMarkdown(pageFor(ref.url)));
          const loc = locatePassage(pages.get(key), ref.text);
          assert(loc.found, `passage not found in ${ref.url}: ${ref.text}`);
          assert(loc.heading, `no heading above passage in ${ref.url}`);
          const bare = ref.text.replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} — /, "").replace(/\.\.\.$/, "");
          assert(pages.get(key)!.includes(bare), `passage is not verbatim in ${ref.url}: ${bare}`);
          checked++;
        }
      }
    }
    assert(checked > 300, `checked ${checked}`);
  });
}

Deno.test("citation markers follow the real fixture format", () => {
  for (const o of stats("best form builder").present) {
    (o.references as any[]).forEach((ref, i) => assert(o.markdown.includes(`[[${i + 1}]](${ref.url})`), `marker ${i + 1} missing`));
    assert(!/\[\[\d+\]\]\([^)]*\)/.test(o.items.map((i: any) => i.text ?? "").join("\n")), "text must not carry markers");
    const elementRefs = o.items.flatMap((i: any) => [...(i.references ?? []), ...(i.components ?? []).flatMap((c: any) => c.references ?? [])]);
    assertEquals(elementRefs.length, o.references.length);
  }
});

Deno.test("section types, aliases and organic overlap all occur", () => {
  const s = stats("best form builder");
  const types = new Set(s.present.flatMap((o) => o.items.map((i: any) => i.type)));
  for (const t of ["ai_overview_element", "ai_overview_table_element", "ai_overview_expanded_element"]) assert(types.has(t), t);
  const all = s.present.map((o) => o.markdown).join("\n");
  assert(all.includes("**Tally Forms**") && all.includes("**Tally**"), "Tally appears under both names");
  assert(s.present.some((o) => o.markdown.includes("#:~:text=")), "some references carry text fragments");
  let overlap = 0;
  for (const r of s.renders) {
    const o = overview(r);
    const organic = (r.items as any[]).filter((i) => i.type === "organic");
    assertEquals(organic.map((i) => i.rank_group), Array.from({ length: 20 }, (_, i) => i + 1));
    if (!o) continue;
    const top10 = new Set(organic.slice(0, 10).map((i) => normalizeUrl(i.url)));
    if (o.references.some((ref: any) => top10.has(normalizeUrl(ref.url)))) overlap++;
  }
  assert(overlap / s.present.length > 0.8, `organic overlap ${overlap}`);
});

Deno.test("login and 'no overview' keywords never show an overview", () => {
  for (const k of ["jotform login", "no overview test keyword"]) assertEquals(week(k).filter(overview).length, 0, k);
  assert(relatedKeywordsFor("no overview test keyword").some((r) => r.ai_overview), "siblings with an overview exist");
});

Deno.test("pages parse into DataForSEO content_parsing shape", () => {
  const own = demoOwnPage("best form builder");
  assertEquals(own.brand, "Jotform");
  const page = pageFor(own.url);
  const content = pageContent(page) as any;
  assert(content.main_topic.length >= 5);
  assertEquals(content.main_topic[0].level, 1);
  assert(content.main_topic.some((t: any) => t.table_content?.[0]?.header?.[0]?.row_cells?.length));
  assert(pageMarkdown(page).startsWith("# "));
  const generic = pageFor("https://www.example.com/blog/our-crm-guide/");
  assert(pageMarkdown(generic).includes("## Pricing"));
});
