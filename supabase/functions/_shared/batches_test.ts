import { assert, assertEquals } from "@std/assert";
import { customId } from "./batch-work.ts";
import { collectAll, submitAll } from "./batches.ts";
import { must, serviceClient } from "./db.ts";
import { cleanup, extractEcho, seedSeries, seedSnapshot, seedUser, sentences, stubAnthropic } from "./work/test-helpers.ts";

const db = () => serviceClient();
const opts = { sanitizeOps: false, sanitizeResources: false };

async function extraction(id: string) {
  return must(await db().from("snapshots").select("extraction, extraction_attempts").eq("id", id).single(), "snapshot") as {
    extraction: string;
    extraction_attempts: number;
  };
}

async function items(batchId: string) {
  const rows = must(await db().from("batch_items").select("custom_id, status, error").eq("batch_id", batchId), "items") as {
    custom_id: string;
    status: string;
    error: string | null;
  }[];
  return Object.fromEntries(rows.map((r) => [r.custom_id, r]));
}

Deno.test({
  name: "submitAll: when batch creation fails nothing is recorded or marked",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    stub.failCreate = 400;
    const seriesId = await seedSeries("runner-create-fails");
    try {
      const snap = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]) });
      const before = stub.batches.size;
      const sub = await submitAll({ scope: { seriesIds: [seriesId] } });
      assertEquals(sub.counts, { extract: 0, consolidate: 0, page_tag: 0, brief: 0 });
      assertEquals(sub.errors.map((e) => e.kind), ["extract"]);
      assertEquals(stub.batches.size, before);
      assertEquals((await extraction(snap)).extraction, "pending");
      const recorded = must(await db().from("batch_items").select("batch_id").eq("target_id", snap), "items") as unknown[];
      assertEquals(recorded.length, 0);
    } finally {
      await cleanup({ seriesIds: [seriesId] });
    }
  },
});

Deno.test({
  name: "collectAll: waits for in-progress batches; one bad or missing result doesn't stop the batch",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const seriesId = await seedSeries("runner-collect");
    const batchIds: string[] = [];
    try {
      const a = await seedSnapshot(seriesId, { sentences: sentences(["Jotform has templates.", [0]]) });
      const bad = await seedSnapshot(seriesId, { sentences: sentences(["Typeform has logic.", [0]]) });
      const c = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]) });
      const missing = await seedSnapshot(seriesId, { sentences: sentences(["Google Forms is free.", [0]]) });
      stub.responder = (cid, data) =>
        cid === customId("extract", bad)
          ? { type: "succeeded", output: { claims: "not a list" } }
          : { type: "succeeded", output: extractEcho(data) };
      stub.dropLines.add(customId("extract", missing));

      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
      assertEquals(sub.counts.extract, 4);
      batchIds.push(...sub.batches.map((b) => b.id));

      stub.processing = "in_progress";
      const waiting = await collectAll({ batchIds, seriesIds: [seriesId] });
      assertEquals(waiting.batches[0].status, "in_progress");
      assertEquals((await extraction(a)).extraction, "submitted");
      const row = must(await db().from("batches").select("status").eq("id", batchIds[0]).single(), "batch") as { status: string };
      assertEquals(row.status, "in_progress");

      stub.processing = "ended";
      const done = await collectAll({ batchIds, seriesIds: [seriesId] });
      assertEquals(done.errors, []);
      assertEquals(done.batches[0], { id: batchIds[0], kind: "extract", status: "collected", applied: 2, failed: 2, skipped: 0 });

      assertEquals((await extraction(a)).extraction, "done");
      assertEquals((await extraction(c)).extraction, "done");
      assertEquals(await extraction(bad), { extraction: "pending", extraction_attempts: 1 });
      assertEquals(await extraction(missing), { extraction: "pending", extraction_attempts: 1 });
      const it = await items(batchIds[0]);
      assertEquals(it[customId("extract", a)].status, "applied");
      assert(it[customId("extract", bad)].error?.includes("failed validation"));
      assertEquals(it[customId("extract", missing)].error, "missing from batch results");

      const batch = must(await db().from("batches").select("status, ended_at, collected_at, usage").eq("id", batchIds[0]).single(), "batch") as {
        status: string;
        ended_at: string | null;
        collected_at: string | null;
        usage: Record<string, number>;
      };
      assertEquals(batch.status, "collected");
      assert(batch.ended_at && batch.collected_at);
      assertEquals(batch.usage.input_tokens, 3000);
      assertEquals(batch.usage.output_tokens, 600);

      // A collected batch is not collected again.
      assertEquals((await collectAll({ batchIds, seriesIds: [seriesId] })).batches, []);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds });
    }
  },
});

Deno.test({
  name: "collectAll: a batch Anthropic no longer knows is failed and its work returns to pending",
  ...opts,
  async fn() {
    stubAnthropic().reset();
    const seriesId = await seedSeries("runner-gone");
    const batchId = `msgbatch_gone_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      const snap = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]), extraction: "submitted" });
      must(await db().from("batches").insert({ id: batchId, kind: "extract", item_count: 1 }), "batch");
      must(await db().from("batch_items").insert({ batch_id: batchId, custom_id: customId("extract", snap), kind: "extract", target_id: snap }), "item");
      const res = await collectAll({ batchIds: [batchId], seriesIds: [seriesId] });
      assertEquals(res.batches[0].status, "failed");
      assertEquals(await extraction(snap), { extraction: "pending", extraction_attempts: 1 });
      const batch = must(await db().from("batches").select("status").eq("id", batchId).single(), "batch") as { status: string };
      assertEquals(batch.status, "failed");
      assertEquals((await items(batchId))[customId("extract", snap)].status, "failed");
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds: [batchId] });
    }
  },
});

Deno.test({
  name: "collectAll: reused snapshots copy a done original and reset when the original failed",
  ...opts,
  async fn() {
    stubAnthropic().reset();
    const seriesId = await seedSeries("runner-reused");
    try {
      const done = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]), extraction: "done" });
      const group = must(await db().from("claim_groups").insert({ series_id: seriesId, label: "Tally is free." }).select("id").single(), "group") as { id: string };
      must(await db().from("claims").insert({ snapshot_id: done, group_id: group.id, sentence: 0, text: "Tally is free.", type: "fact", citation_idx: [0] }), "claim");
      const copy = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [4]]), extraction: "reused", same_as: done });
      const failed = await seedSnapshot(seriesId, { sentences: sentences(["Gone.", []]), extraction: "failed" });
      const orphan = await seedSnapshot(seriesId, { sentences: sentences(["Gone.", []]), extraction: "reused", same_as: failed });

      const res = await collectAll({ batchIds: [], seriesIds: [seriesId] });
      assertEquals(res.reused, { copied: 1, reset: 1 });
      assertEquals((await extraction(copy)).extraction, "done");
      const claims = must(await db().from("claims").select("group_id, citation_idx").eq("snapshot_id", copy), "claims") as {
        group_id: string;
        citation_idx: number[];
      }[];
      assertEquals(claims, [{ group_id: group.id, citation_idx: [4] }]);
      assertEquals((await extraction(orphan)).extraction, "pending");
      const sameAs = must(await db().from("snapshots").select("same_as").eq("id", orphan).single(), "s") as { same_as: string };
      assertEquals(sameAs.same_as, failed);
    } finally {
      await cleanup({ seriesIds: [seriesId] });
    }
  },
});

Deno.test({
  name: "collectAll: work whose result failed to apply is released for another attempt",
  ...opts,
  async fn() {
    stubAnthropic().reset();
    const seriesId = await seedSeries("runner-stuck");
    const userId = await seedUser();
    const batchId = `msgbatch_stuck_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      const snap = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]), extraction: "submitted" });
      const inFlight = await seedSnapshot(seriesId, { sentences: sentences(["Jotform is popular.", [0]]), extraction: "submitted" });
      must(await db().from("batches").insert({ id: batchId, kind: "extract", item_count: 2, status: "collected" }), "batch");
      must(
        await db().from("batch_items").insert([
          { batch_id: batchId, custom_id: customId("extract", snap), kind: "extract", target_id: snap, status: "failed", error: "db down" },
          { batch_id: batchId, custom_id: customId("extract", inFlight), kind: "extract", target_id: inFlight, status: "submitted" },
        ]),
        "items",
      );
      const tq = must(await db().from("tracked_queries").insert({ user_id: userId, series_id: seriesId, display_keyword: "x" }).select("id").single(), "tq") as {
        id: string;
      };
      const report = must(
        await db().from("reports").insert({
          tracked_query_id: tq.id,
          series_id: seriesId,
          kind: "full",
          window_start: "2026-09-30T00:00:00Z",
          window_end: "2026-10-07T00:00:00Z",
          renders: 1,
          stage: "brief",
          brief_submitted: true,
        }).select("id").single(),
        "report",
      ) as { id: string };

      const res = await collectAll({ batchIds: [], seriesIds: [seriesId] });
      assertEquals(res.released, { snapshots: 1, pages: 0, briefs: 1, series: 0 });
      assertEquals(await extraction(snap), { extraction: "pending", extraction_attempts: 1 });
      assertEquals((await extraction(inFlight)).extraction, "submitted");
      const r = must(await db().from("reports").select("stage, brief_submitted").eq("id", report.id).single(), "r") as {
        stage: string;
        brief_submitted: boolean;
      };
      assertEquals([r.stage, r.brief_submitted], ["brief", false]);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds: [batchId], userIds: [userId] });
    }
  },
});
