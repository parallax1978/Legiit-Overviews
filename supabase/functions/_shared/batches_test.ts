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

async function sameAsOf(id: string): Promise<string | null> {
  return (must(await db().from("snapshots").select("same_as").eq("id", id).single(), "s") as { same_as: string | null }).same_as;
}

Deno.test({
  name: "collectAll: reused snapshots copy a done original; the copies of a failed original are promoted, not all re-extracted",
  ...opts,
  async fn() {
    stubAnthropic().reset();
    const seriesId = await seedSeries("runner-reused");
    try {
      const done = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]), extraction: "done" });
      const group = must(await db().from("claim_groups").insert({ series_id: seriesId, label: "Tally is free." }).select("id").single(), "group") as { id: string };
      must(await db().from("claims").insert({ snapshot_id: done, group_id: group.id, sentence: 0, text: "Tally is free.", type: "fact", citation_idx: [0] }), "claim");
      const copy = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [4]]), extraction: "reused", same_as: done });
      const hash = crypto.randomUUID();
      const failed = await seedSnapshot(seriesId, { sentences: sentences(["Gone.", []]), extraction: "failed", content_hash: hash });
      const first = await seedSnapshot(seriesId, { sentences: sentences(["Gone.", []]), extraction: "reused", same_as: failed, content_hash: hash });
      const second = await seedSnapshot(seriesId, { sentences: sentences(["Gone.", []]), extraction: "reused", same_as: failed, content_hash: hash });

      const res = await collectAll({ batchIds: [], seriesIds: [seriesId] });
      assertEquals(res.reused, { copied: 1, reset: 2 });
      assertEquals((await extraction(copy)).extraction, "done");
      const claims = must(await db().from("claims").select("group_id, citation_idx").eq("snapshot_id", copy), "claims") as {
        group_id: string;
        citation_idx: number[];
      }[];
      assertEquals(claims, [{ group_id: group.id, citation_idx: [4] }]);
      // The earliest copy becomes the original; the other copy now reuses it.
      assertEquals(await extraction(first), { extraction: "pending", extraction_attempts: 0 });
      assertEquals(await sameAsOf(first), null);
      assertEquals((await extraction(second)).extraction, "reused");
      assertEquals(await sameAsOf(second), first);

      // Once two originals of the same content have failed, the remaining copies fail too.
      must(await db().from("snapshots").update({ extraction: "failed" }).eq("id", first), "fail first");
      const third = await seedSnapshot(seriesId, { sentences: sentences(["Gone.", []]), extraction: "reused", same_as: first, content_hash: hash });
      const again = await collectAll({ batchIds: [], seriesIds: [seriesId] });
      assertEquals(again.reused, { copied: 0, reset: 2 });
      assertEquals((await extraction(second)).extraction, "failed");
      assertEquals((await extraction(third)).extraction, "failed");
    } finally {
      await cleanup({ seriesIds: [seriesId] });
    }
  },
});

Deno.test({
  name: "submitAll: a lost creation response is not retried; the unrecorded batch is cancelled and the work stays pending",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    stub.loseCreateResponse = true;
    const seriesId = await seedSeries("runner-orphan");
    try {
      const a = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]) });
      const b = await seedSnapshot(seriesId, { sentences: sentences(["Jotform is popular.", [0]]) });
      const before = new Set(stub.batches.keys());
      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
      assertEquals(sub.counts.extract, 0);
      assertEquals(sub.errors.map((e) => e.kind), ["extract"]);
      const orphans = [...stub.batches.keys()].filter((id) => !before.has(id));
      assertEquals(orphans.length, 1, "the batch was created once, not once per retry");
      assert(stub.canceled.has(orphans[0]), "the orphan was cancelled");
      assertEquals((await extraction(a)).extraction, "pending");
      assertEquals((await extraction(b)).extraction, "pending");
      const recorded = must(await db().from("batches").select("id").in("id", orphans), "batches") as unknown[];
      assertEquals(recorded.length, 0);
    } finally {
      await cleanup({ seriesIds: [seriesId] });
    }
  },
});

Deno.test({
  name: "submitAll: pages through pending work, one batch per full page",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    stub.responder = (_cid, data) => ({ type: "succeeded", output: extractEcho(data) });
    const seriesId = await seedSeries("runner-pages");
    const batchIds: string[] = [];
    try {
      for (const text of ["A is fast.", "B is slow.", "C is free.", "D is paid.", "E is new."]) {
        await seedSnapshot(seriesId, { sentences: sentences([text, [0]]) });
      }
      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"], limits: { extract: 2 } });
      batchIds.push(...sub.batches.map((b) => b.id));
      assertEquals(sub.errors, []);
      assertEquals(sub.counts.extract, 5);
      assertEquals(sub.batches.map((b) => b.requests), [2, 2, 1]);
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"], limits: { extract: 2 } })).counts.extract, 0);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds });
    }
  },
});

Deno.test({
  name: "collectAll: applied and failed items drop their refs; old batches are purged; a failed consolidation records the attempt",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    stub.responder = (cid, data) => cid.endsWith("-bad") ? { type: "expired" } : { type: "succeeded", output: extractEcho(data) };
    const seriesId = await seedSeries("runner-refs");
    const oldId = `msgbatch_old_${crypto.randomUUID().replaceAll("-", "")}`;
    const consolidateId = `msgbatch_cons_${crypto.randomUUID().replaceAll("-", "")}`;
    const batchIds: string[] = [oldId, consolidateId];
    try {
      const group = must(await db().from("claim_groups").insert({ series_id: seriesId, label: "Tally is free." }).select("id").single(), "group") as { id: string };
      const snap = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]) });
      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["extract"] });
      batchIds.push(...sub.batches.map((b) => b.id));
      const refsBefore = (must(await db().from("batch_items").select("refs").eq("batch_id", sub.batches[0].id).single(), "refs") as { refs: Record<string, string> }).refs;
      assertEquals(refsBefore, { C1: group.id });

      const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
      must(await db().from("batches").insert({ id: oldId, kind: "extract", item_count: 0, status: "collected", created_at: old, collected_at: old }), "old batch");
      must(await db().from("batches").insert({ id: consolidateId, kind: "consolidate", item_count: 1, status: "collected", collected_at: new Date().toISOString() }), "cons batch");
      must(
        await db().from("batch_items").insert({ batch_id: consolidateId, custom_id: customId("consolidate", seriesId), kind: "consolidate", target_id: seriesId, status: "failed", error: "timeout" }),
        "cons item",
      );

      const res = await collectAll({ batchIds: [...sub.batches.map((b) => b.id), oldId, consolidateId], seriesIds: [seriesId] });
      assertEquals((await extraction(snap)).extraction, "done");
      const refsAfter = (must(await db().from("batch_items").select("refs").eq("batch_id", sub.batches[0].id).single(), "refs") as { refs: Record<string, string> }).refs;
      assertEquals(refsAfter, {});
      assert((res.purged ?? 0) >= 1);
      assertEquals((must(await db().from("batches").select("id").eq("id", oldId), "old") as unknown[]).length, 0);
      assertEquals(res.released?.series, 1);
      const series = must(await db().from("series").select("consolidated_at").eq("id", seriesId).single(), "series") as { consolidated_at: string | null };
      const batch = must(await db().from("batches").select("created_at").eq("id", consolidateId).single(), "batch") as { created_at: string };
      assertEquals(Date.parse(series.consolidated_at!), Date.parse(batch.created_at));
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds });
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
