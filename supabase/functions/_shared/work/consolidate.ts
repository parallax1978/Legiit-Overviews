// Task B batch work: nightly merge of duplicate claim groups and entities per series.
// Pending: new groups or entities since consolidated_at, at most once per 20 hours (consolidate_pending).
// Applied by apply_consolidation (SQL). A failed request still records the attempt so the series is
// retried the next night instead of every 15 minutes.
import { type BatchItemResult, type BatchRequest, customId, parseCustomId } from "../batch-work.ts";
import { parseStructured, structuredParams } from "../claude.ts";
import { must, serviceClient } from "../db.ts";
import { CONSOLIDATE_SYSTEM, consolidateUser } from "../prompts/consolidate.ts";
import { type ConsolidateInput, ConsolidateOutput } from "../schemas.ts";
import { failureMessage, type ScopedWork, type WorkScope } from "./common.ts";

export const CONSOLIDATE_MAX_TOKENS = 16000;

export interface PendingConsolidation {
  series_id: string;
  keyword: string;
  language: string;
  claims: { id: string; label: string; renders: number }[];
  entities: { id: string; name: string; aliases: string[]; renders: number }[];
}

/** The task B input and its ref map for one series. */
export function consolidateInput(p: PendingConsolidation): { input: ConsolidateInput; refs: Record<string, string> } {
  const refs: Record<string, string> = {};
  const claims = p.claims.map((c, i) => {
    refs[`C${i + 1}`] = c.id;
    return { ref: `C${i + 1}`, label: c.label, renders: c.renders };
  });
  const entities = p.entities.map((e, i) => {
    refs[`E${i + 1}`] = e.id;
    return { ref: `E${i + 1}`, name: e.name, aliases: e.aliases ?? [], renders: e.renders };
  });
  return { input: { keyword: p.keyword, language: p.language, claims, entities }, refs };
}

async function recordAttempt(seriesId: string): Promise<void> {
  must(await serviceClient().rpc("mark_consolidated", { p_series_id: seriesId }), "mark_consolidated");
}

export const consolidateWork: ScopedWork = {
  kind: "consolidate",

  async collect(limit: number, scope?: WorkScope): Promise<BatchRequest[]> {
    const rows = must(
      await serviceClient().rpc("consolidate_pending", { p_limit: limit, p_series_ids: scope?.seriesIds ?? null }),
      "consolidate_pending",
    ) as PendingConsolidation[];
    return rows.map((p) => {
      const { input, refs } = consolidateInput(p);
      return {
        custom_id: customId("consolidate", p.series_id),
        target_id: p.series_id,
        refs,
        params: structuredParams({
          task: "consolidate",
          system: CONSOLIDATE_SYSTEM,
          user: consolidateUser(input),
          schema: ConsolidateOutput,
          maxTokens: CONSOLIDATE_MAX_TOKENS,
        }),
      };
    });
  },

  // Nothing to mark: the submitted batch item itself keeps the series out of consolidate_pending.
  async markSubmitted(): Promise<void> {},

  async handleResult(cid: string, result: BatchItemResult, refs: Record<string, string>): Promise<void> {
    const { id } = parseCustomId(cid);
    if (result.type !== "succeeded") {
      await recordAttempt(id);
      throw new Error(failureMessage(result));
    }
    let output: ConsolidateOutput;
    try {
      output = parseStructured(result.message, ConsolidateOutput);
    } catch (e) {
      await recordAttempt(id);
      throw e;
    }
    must(
      await serviceClient().rpc("apply_consolidation", { p_series_id: id, p_output: output, p_refs: refs ?? {} }),
      "apply_consolidation",
    );
  },
};
