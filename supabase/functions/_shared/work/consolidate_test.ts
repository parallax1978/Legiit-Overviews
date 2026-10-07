import { assert, assertEquals } from "@std/assert";
import { customId } from "../batch-work.ts";
import { collectAll, submitAll } from "../batches.ts";
import { must, serviceClient } from "../db.ts";
import type { ConsolidateInput, ConsolidateOutput } from "../schemas.ts";
import { consolidateWork } from "./consolidate.ts";
import { cleanup, seedSeries, seedSnapshot, sentences, stubAnthropic } from "./test-helpers.ts";

const db = () => serviceClient();
const opts = { sanitizeOps: false, sanitizeResources: false };

async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  return must(await db().from(table).insert(row).select("*").single(), `insert ${table}`) as T;
}

/** The answer a careful consolidator gives for the seeded series, plus noise the SQL must ignore. */
function respond(input: ConsolidateInput): ConsolidateOutput {
  const c = (label: string) => input.claims.find((x) => x.label === label)!.ref;
  const e = (name: string) => input.entities.find((x) => x.name === name)!.ref;
  return {
    claim_merges: [
      { keep: c("Tally is the best free option."), merge: [c("Tally Forms is the best free option."), "C999"] },
      // A chain (X=Y, Y=Z) must not merge anything.
      { keep: c("X is fast."), merge: [c("Y is fast.")] },
      { keep: c("Y is fast."), merge: [c("Z is fast.")] },
      { keep: "C404", merge: [c("Jotform is popular.")] },
    ],
    entity_merges: [
      { keep: e("Tally"), merge: [e("Tally Forms"), e("Tally")], aliases: ["Tally Forms", "tally.so"] },
    ],
  };
}

Deno.test({
  name: "consolidate: Tally and Tally Forms become one entity with mentions re-pointed; chains and unknown refs ignored",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const inputs: ConsolidateInput[] = [];
    stub.responder = (_cid, data: ConsolidateInput) => {
      inputs.push(data);
      return { type: "succeeded", output: respond(data) };
    };
    const seriesId = await seedSeries("consolidate");
    const batchIds: string[] = [];
    try {
      const s1 = await seedSnapshot(seriesId, { sentences: sentences(["Tally is the best free option.", [0]]), extraction: "done" });
      const s2 = await seedSnapshot(seriesId, {
        sentences: sentences(["Tally Forms is the best free option.", [0]], ["Tally has unlimited forms.", []]),
        extraction: "done",
      });
      const tally = await insert<{ id: string }>("entities", { series_id: seriesId, name: "Tally", aliases: ["TALLY"] });
      const tallyForms = await insert<{ id: string }>("entities", { series_id: seriesId, name: "Tally Forms", aliases: ["Tally forms app"] });
      await insert("entities", { series_id: seriesId, name: "Jotform" });
      const groups: Record<string, string> = {};
      for (const label of ["Tally is the best free option.", "Tally Forms is the best free option.", "X is fast.", "Y is fast.", "Z is fast.", "Jotform is popular."]) {
        groups[label] = (await insert<{ id: string }>("claim_groups", { series_id: seriesId, label })).id;
      }
      await insert("claims", { snapshot_id: s1, group_id: groups["Tally is the best free option."], sentence: 0, text: "Tally is the best free option.", type: "recommendation", citation_idx: [0] });
      await insert("claims", { snapshot_id: s2, group_id: groups["Tally Forms is the best free option."], sentence: 0, text: "Tally Forms is the best free option.", type: "recommendation", citation_idx: [0] });
      await insert("entity_mentions", { entity_id: tally.id, snapshot_id: s1, role: "recommended", label: "best free option", sentences: [0] });
      await insert("entity_mentions", { entity_id: tallyForms.id, snapshot_id: s2, role: "recommended", label: "best free option", sentences: [0] });
      await insert("entity_mentions", { entity_id: tally.id, snapshot_id: s2, role: "mentioned", label: null, sentences: [1] });

      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["consolidate"] });
      assertEquals(sub.errors, []);
      assertEquals(sub.counts.consolidate, 1);
      batchIds.push(...sub.batches.map((b) => b.id));
      // In flight: not submitted again.
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["consolidate"] })).counts.consolidate, 0);

      const col = await collectAll({ batchIds });
      assertEquals(col.batches[0].applied, 1);
      assertEquals(inputs.length, 1);
      const tallyIn = inputs[0].entities.find((x) => x.name === "Tally")!;
      assertEquals(tallyIn.renders, 2);
      assertEquals(inputs[0].claims.find((x) => x.label === "Tally is the best free option.")!.renders, 1);

      const ents = must(await db().from("entities").select("id, name, aliases, merged_into").eq("series_id", seriesId), "entities") as {
        id: string;
        name: string;
        aliases: string[];
        merged_into: string | null;
      }[];
      const kept = ents.find((x) => x.id === tally.id)!;
      assertEquals(kept.merged_into, null);
      assertEquals(ents.find((x) => x.id === tallyForms.id)!.merged_into, tally.id);
      // "TALLY" only differs from the kept name by case, so it is not kept as an alias.
      assertEquals(new Set(kept.aliases), new Set(["Tally Forms", "Tally forms app", "tally.so"]));
      assertEquals(ents.filter((x) => x.merged_into === null).length, 2);

      const mentions = must(await db().from("entity_mentions").select("entity_id, snapshot_id, role, label, sentences").in("snapshot_id", [s1, s2]), "mentions") as {
        entity_id: string;
        snapshot_id: string;
        role: string;
        label: string | null;
        sentences: number[];
      }[];
      assertEquals(mentions.length, 2);
      assert(mentions.every((m) => m.entity_id === tally.id));
      const m2 = mentions.find((m) => m.snapshot_id === s2)!;
      assertEquals([m2.role, m2.label, m2.sentences], ["recommended", "best free option", [0, 1]]);

      const live = must(await db().from("claim_groups").select("id, label, merged_into").eq("series_id", seriesId), "groups") as {
        id: string;
        label: string;
        merged_into: string | null;
      }[];
      const byLabel = Object.fromEntries(live.map((g) => [g.label, g]));
      assertEquals(byLabel["Tally Forms is the best free option."].merged_into, groups["Tally is the best free option."]);
      for (const label of ["X is fast.", "Y is fast.", "Z is fast.", "Jotform is popular."]) assertEquals(byLabel[label].merged_into, null);
      const claims = must(await db().from("claims").select("group_id").in("snapshot_id", [s1, s2]), "claims") as { group_id: string }[];
      assert(claims.every((c) => c.group_id === groups["Tally is the best free option."]));

      const series = must(await db().from("series").select("consolidated_at").eq("id", seriesId).single(), "series") as { consolidated_at: string };
      assert(series.consolidated_at);
      // Consolidated recently: nothing is due.
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["consolidate"] })).counts.consolidate, 0);

      // The same result delivered again changes nothing.
      const req = stub.batches.get(batchIds[0])!.requests[0];
      const refs = (must(await db().from("batch_items").select("refs").eq("batch_id", batchIds[0]).single(), "refs") as { refs: Record<string, string> }).refs;
      const message = {
        id: "msg_dup",
        type: "message",
        role: "assistant",
        model: "stub",
        content: [{ type: "text", text: JSON.stringify(respond(inputs[0])), citations: null }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      } as any;
      const groupsBefore = JSON.stringify(live.sort((a, b) => a.id.localeCompare(b.id)));
      await consolidateWork.handleResult(req.custom_id, { type: "succeeded", message }, refs);
      const after = must(await db().from("claim_groups").select("id, label, merged_into").eq("series_id", seriesId), "groups") as typeof live;
      assertEquals(JSON.stringify(after.sort((a, b) => a.id.localeCompare(b.id))), groupsBefore);
      const mentionsAfter = must(await db().from("entity_mentions").select("entity_id").in("snapshot_id", [s1, s2]), "mentions") as unknown[];
      assertEquals(mentionsAfter.length, 2);
      assertEquals(req.custom_id, customId("consolidate", seriesId));
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds });
    }
  },
});

Deno.test({
  name: "consolidate: a failed request still records the attempt",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    stub.responder = () => ({ type: "errored", error_type: "overloaded_error", message: "busy" });
    const seriesId = await seedSeries("consolidate-fail");
    const batchIds: string[] = [];
    try {
      await insert("entities", { series_id: seriesId, name: "A" });
      await insert("entities", { series_id: seriesId, name: "B" });
      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["consolidate"] });
      batchIds.push(...sub.batches.map((b) => b.id));
      const col = await collectAll({ batchIds });
      assertEquals(col.batches[0].failed, 1);
      const item = must(await db().from("batch_items").select("status, error").eq("batch_id", batchIds[0]).single(), "item") as {
        status: string;
        error: string;
      };
      assertEquals(item.status, "failed");
      assert(item.error.includes("overloaded_error"));
      const series = must(await db().from("series").select("consolidated_at").eq("id", seriesId).single(), "series") as { consolidated_at: string };
      assert(series.consolidated_at);
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["consolidate"] })).counts.consolidate, 0);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds });
    }
  },
});
