import { assert, assertEquals, assertRejects } from "@std/assert";
import { customId } from "../batch-work.ts";
import { collectAll, submitAll } from "../batches.ts";
import { must, serviceClient } from "../db.ts";
import type { ExtractInput } from "../schemas.ts";
import { extractWork } from "./extract.ts";
import { cleanup, dataOf, extractEcho, seedSeries, seedSnapshot, sentences, stubAnthropic } from "./test-helpers.ts";

const db = () => serviceClient();
const opts = { sanitizeOps: false, sanitizeResources: false };

async function snapshot(id: string) {
  return must(
    await db().from("snapshots").select("extraction, extraction_attempts, formats").eq("id", id).single(),
    "load snapshot",
  ) as { extraction: string; extraction_attempts: number; formats: Record<string, unknown> };
}

async function claimsOf(id: string) {
  return must(
    await db().from("claims").select("group_id, sentence, text, citation_idx").eq("snapshot_id", id).order("sentence"),
    "load claims",
  ) as { group_id: string; sentence: number; text: string; citation_idx: number[] }[];
}

async function mentionsOf(id: string) {
  return must(
    await db().from("entity_mentions").select("entity_id, role, sentences, entities(name)").eq("snapshot_id", id),
    "load mentions",
  ) as unknown as { entity_id: string; role: string; sentences: number[]; entities: { name: string } }[];
}

async function liveGroups(seriesId: string) {
  return must(
    await db().from("claim_groups").select("id, label").eq("series_id", seriesId).is("merged_into", null).order("created_at"),
    "load groups",
  ) as { id: string; label: string }[];
}

async function liveEntities(seriesId: string) {
  return must(
    await db().from("entities").select("id, name").eq("series_id", seriesId).is("merged_into", null).order("created_at"),
    "load entities",
  ) as { id: string; name: string }[];
}

const JOTFORM = "Jotform is the best form builder for most teams.";

Deno.test({
  name: "extract: claims on every pending capture, copies on reused ones, groups and entities reused via refs",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const seen: ExtractInput[] = [];
    stub.responder = (_cid, data: ExtractInput) => {
      seen.push(data);
      return { type: "succeeded", output: extractEcho(data) };
    };
    const seriesId = await seedSeries("extract");
    const batchIds: string[] = [];
    try {
      const a = await seedSnapshot(seriesId, {
        sentences: sentences([JOTFORM, [0]], ["Tally is the best free option.", [1, 2]], ["Google Forms is free.", []]),
      });
      const b = await seedSnapshot(seriesId, {
        sentences: sentences([JOTFORM, [0]], ["Tally is the best free option.", [1, 2]], ["Google Forms is free.", []]),
        extraction: "reused",
        same_as: a,
      });
      const c = await seedSnapshot(seriesId, {
        sentences: sentences(["Tally Forms is the best free option.", [0]], [JOTFORM, [1]]),
      });

      const submitted = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
      assertEquals(submitted.errors, []);
      assertEquals(submitted.counts.extract, 2);
      batchIds.push(...submitted.batches.map((x) => x.id));
      assertEquals((await snapshot(a)).extraction, "submitted");
      assertEquals((await snapshot(b)).extraction, "reused");
      assertEquals((await snapshot(c)).extraction, "submitted");
      const items = must(await db().from("batch_items").select("custom_id, target_id, refs").eq("batch_id", batchIds[0]), "items") as {
        custom_id: string;
        target_id: string;
        refs: Record<string, string>;
      }[];
      assertEquals(items.map((i) => i.target_id).sort(), [a, c].sort());
      assertEquals(items[0].refs, {});

      // A capture submitted while in flight is not submitted twice.
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] })).counts.extract, 0);

      const collected = await collectAll({ batchIds, seriesIds: [seriesId] });
      assertEquals(collected.errors, []);
      assertEquals(collected.batches[0].status, "collected");
      assertEquals(collected.batches[0].applied, 2);

      for (const id of [a, b, c]) assertEquals((await snapshot(id)).extraction, "done");
      const ca = await claimsOf(a);
      const cb = await claimsOf(b);
      const cc = await claimsOf(c);
      assertEquals(ca.length, 3);
      assertEquals(cb.map((x) => [x.group_id, x.sentence, x.text]), ca.map((x) => [x.group_id, x.sentence, x.text]));
      assertEquals(cc.length, 2);
      assertEquals(ca[1].citation_idx, [1, 2]);
      assertEquals(ca[2].citation_idx, []);
      // The same label in two captures of one batch lands in one group.
      assertEquals(cc[1].group_id, ca[0].group_id);
      assertEquals((await liveGroups(seriesId)).length, 4);

      const names = (await liveEntities(seriesId)).map((e) => e.name).sort();
      assertEquals(names, ["Google Forms", "Jotform", "Tally", "Tally Forms"]);
      assertEquals((await mentionsOf(a)).length, 3);
      assertEquals((await mentionsOf(b)).length, 3);
      assertEquals((await snapshot(a)).formats.labels, ["bullets"]);
      assertEquals((await snapshot(b)).formats.labels, ["bullets"]);
      assertEquals((await snapshot(a)).formats.word_count, 20);

      const batch = must(await db().from("batches").select("status, usage, collected_at").eq("id", batchIds[0]).single(), "batch") as {
        status: string;
        usage: Record<string, number>;
      };
      assertEquals(batch.status, "collected");
      assertEquals(batch.usage.input_tokens, 2000);
      assertEquals(batch.usage.cache_read_input_tokens, 1600);

      // Round 2: the new capture sees the series' claims and entities as refs and reuses them.
      seen.length = 0;
      const d = await seedSnapshot(seriesId, {
        sentences: sentences([JOTFORM, [0]], ["Tally offers unlimited forms.", [1]]),
      });
      const round2 = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
      batchIds.push(...round2.batches.map((x) => x.id));
      assertEquals(round2.counts.extract, 1);
      await collectAll({ batchIds: round2.batches.map((x) => x.id), seriesIds: [seriesId] });
      assertEquals(seen.length, 1);
      assertEquals(seen[0].known_claims.length, 4);
      assertEquals(seen[0].known_entities.length, 4);
      assertEquals(seen[0].sentences.map((s) => s.cited), [true, true]);
      const jotformRef = seen[0].known_claims.find((k) => k.label === JOTFORM)!.ref;
      const out = extractEcho(seen[0]);
      assertEquals(out.claims[0].group_ref, jotformRef);

      const cd = await claimsOf(d);
      assertEquals(cd[0].group_id, ca[0].group_id);
      assertEquals((await liveGroups(seriesId)).length, 5);
      const tally = (await liveEntities(seriesId)).find((e) => e.name === "Tally")!;
      const md = await mentionsOf(d);
      assertEquals(md.length, 2);
      assertEquals(md.find((m) => m.entities.name === "Tally")?.entity_id, tally.id);
      assertEquals((await liveEntities(seriesId)).length, 4);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds });
    }
  },
});

Deno.test({
  name: "extract: duplicate deliveries change nothing; refusals count attempts and fail at 3",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const seriesId = await seedSeries("extract-retry");
    const batchIds: string[] = [];
    try {
      const ok = await seedSnapshot(seriesId, { sentences: sentences([JOTFORM, [0]], ["Typeform is the best for surveys.", [1]]) });
      const refused = await seedSnapshot(seriesId, { sentences: sentences(["Something Google declines to explain.", []]) });
      const copy = await seedSnapshot(seriesId, {
        sentences: sentences(["Something Google declines to explain.", []]),
        extraction: "reused",
        same_as: refused,
      });
      const refusedId = customId("extract", refused);
      stub.duplicateLines = true;
      stub.responder = (cid, data) => cid === refusedId ? { type: "refusal" } : { type: "succeeded", output: extractEcho(data) };

      const s1 = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
      batchIds.push(...s1.batches.map((x) => x.id));
      const c1 = await collectAll({ batchIds: s1.batches.map((x) => x.id), seriesIds: [seriesId] });
      assertEquals(c1.batches[0].applied, 1);
      assertEquals(c1.batches[0].failed, 1);
      assertEquals(c1.batches[0].skipped, 2);

      assertEquals((await snapshot(ok)).extraction, "done");
      const r1 = await snapshot(refused);
      assertEquals([r1.extraction, r1.extraction_attempts], ["pending", 1]);
      assertEquals((await snapshot(copy)).extraction, "reused");
      const failedItem = must(
        await db().from("batch_items").select("status, error").eq("batch_id", s1.batches[0].id).eq("custom_id", refusedId).single(),
        "item",
      ) as { status: string; error: string };
      assertEquals(failedItem.status, "failed");
      assert(failedItem.error.includes("refusal"));

      // Delivering the same results again changes nothing.
      const before = await claimsOf(ok);
      const groupsBefore = await liveGroups(seriesId);
      const batch = stub.batches.get(s1.batches[0].id)!;
      const okReq = batch.requests.find((r) => r.custom_id === customId("extract", ok))!;
      const message = {
        id: "msg_dup",
        type: "message",
        role: "assistant",
        model: "stub",
        content: [{ type: "text", text: JSON.stringify(extractEcho(dataOf(okReq.params))), citations: null }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      } as any;
      await extractWork.handleResult(customId("extract", ok), { type: "succeeded", message }, {});
      assertEquals(await claimsOf(ok), before);
      assertEquals(await liveGroups(seriesId), groupsBefore);
      await assertRejects(() =>
        extractWork.handleResult(refusedId, { type: "succeeded", message: { ...message, content: [], stop_reason: "refusal" } }, {})
      );
      assertEquals((await snapshot(refused)).extraction_attempts, 1);

      // Two more refusals: the third attempt fails the capture and frees its reused copy.
      for (let i = 0; i < 2; i++) {
        const s = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
        assertEquals(s.counts.extract, 1);
        batchIds.push(...s.batches.map((x) => x.id));
        await collectAll({ batchIds: s.batches.map((x) => x.id), seriesIds: [seriesId] });
      }
      const r3 = await snapshot(refused);
      assertEquals([r3.extraction, r3.extraction_attempts], ["failed", 3]);
      assertEquals((await snapshot(copy)).extraction, "pending");
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"], limits: { extract: 10 } })).batches.length, 1);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds: [...batchIds, ...stub.batches.keys()] });
    }
  },
});

Deno.test({
  name: "extract: invalid sentence indexes and unknown refs are handled in SQL",
  ...opts,
  async fn() {
    const seriesId = await seedSeries("extract-sql");
    try {
      const snap = await seedSnapshot(seriesId, {
        sentences: sentences(["Tally is free.", [3]], ["Jotform has 10,000 templates.", []]),
        extraction: "submitted",
      });
      const output = {
        claims: [
          { sentence: 0, text: "Tally is free.", type: "fact", group_ref: "C7", new_label: null },
          { sentence: 9, text: "Out of range.", type: "fact", group_ref: null, new_label: "Out of range." },
          { sentence: 1, text: "Jotform has 10,000 templates.", type: "fact", group_ref: null, new_label: "  jotform HAS 10,000   templates " },
          { sentence: 1, text: "Jotform offers templates.", type: "fact", group_ref: null, new_label: "Jotform has 10,000 templates." },
        ],
        entities: [
          { entity_ref: "E1", name: "Tally", role: "mentioned", label: null, sentences: [0, 7] },
          { entity_ref: null, name: "tally", role: "recommended", label: "best free", sentences: [1] },
        ],
        format_labels: ["bullets", "bullets", "table"],
        answer_lead_sentence: 12,
      };
      const r = must(
        await db().rpc("apply_extraction", { p_snapshot_id: snap, p_output: output, p_refs: { C7: crypto.randomUUID(), E1: "not-a-uuid" } }),
        "apply",
      ) as Record<string, number>;
      assertEquals(r.claims, 3);
      assertEquals(r.dropped, 1);
      assertEquals(r.new_groups, 2);
      const claims = await claimsOf(snap);
      assertEquals(claims[0].citation_idx, [3]);
      assertEquals(claims[1].group_id, claims[2].group_id);
      const mentions = await mentionsOf(snap);
      assertEquals(mentions.length, 1);
      assertEquals(mentions[0].role, "recommended");
      assertEquals(mentions[0].sentences, [0, 1]);
      const s = await snapshot(snap);
      assertEquals(s.formats.labels, ["bullets", "table"]);
      assertEquals(s.formats.answer_lead_sentence, null);
      const again = must(await db().rpc("apply_extraction", { p_snapshot_id: snap, p_output: output, p_refs: {} }), "apply again") as {
        skipped: boolean;
      };
      assertEquals(again.skipped, true);
    } finally {
      await cleanup({ seriesIds: [seriesId] });
    }
  },
});
