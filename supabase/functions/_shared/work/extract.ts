// Task A batch work: claims, entities and format labels for every unique capture.
// Pending: snapshots.extraction = 'pending' with fewer than 3 attempts. Applied by apply_extraction
// (SQL), which also copies the result into reused snapshots.
import { type BatchItemResult, type BatchRequest, customId, parseCustomId } from "../batch-work.ts";
import { parseStructured, structuredParams } from "../claude.ts";
import { must, serviceClient } from "../db.ts";
import { extractUser, EXTRACT_SYSTEM } from "../prompts/extract.ts";
import { type ExtractInput, ExtractOutput } from "../schemas.ts";
import type { ParsedSentence } from "../types.ts";
import { chunks, failureMessage, type ScopedWork, type WorkScope } from "./common.ts";

export const EXTRACT_MAX_TOKENS = 16000;
/** Known claims (and entities) per series sent with each capture. */
export const MAX_KNOWN = 800;

export interface PendingSnapshot {
  id: string;
  series_id: string;
  sentences: ParsedSentence[];
}

export interface SeriesKnowledge {
  keyword: string;
  language: string;
  claims: { id: string; label: string }[];
  entities: { id: string; name: string; aliases: string[] }[];
}

interface Known {
  refs: Record<string, string>;
  known_claims: ExtractInput["known_claims"];
  known_entities: ExtractInput["known_entities"];
}

function knownRefs(k: SeriesKnowledge): Known {
  const refs: Record<string, string> = {};
  const known_claims = k.claims.map((c, i) => {
    refs[`C${i + 1}`] = c.id;
    return { ref: `C${i + 1}`, label: c.label };
  });
  const known_entities = k.entities.map((e, i) => {
    refs[`E${i + 1}`] = e.id;
    return { ref: `E${i + 1}`, name: e.name, aliases: e.aliases ?? [] };
  });
  return { refs, known_claims, known_entities };
}

/** The task A input for one snapshot. */
export function extractInput(snapshot: PendingSnapshot, k: SeriesKnowledge, known = knownRefs(k)): ExtractInput {
  return {
    keyword: k.keyword,
    language: k.language,
    sentences: (snapshot.sentences ?? []).map((s) => ({
      i: s.i,
      kind: s.kind,
      text: s.text,
      cited: Array.isArray(s.citations) && s.citations.length > 0,
    })),
    known_claims: known.known_claims,
    known_entities: known.known_entities,
  };
}

function request(snapshot: PendingSnapshot, k: SeriesKnowledge, known: Known): BatchRequest {
  return {
    custom_id: customId("extract", snapshot.id),
    target_id: snapshot.id,
    refs: known.refs,
    params: structuredParams({
      task: "extract",
      system: EXTRACT_SYSTEM,
      user: extractUser(extractInput(snapshot, k, known)),
      schema: ExtractOutput,
      maxTokens: EXTRACT_MAX_TOKENS,
    }),
  };
}

async function failAttempt(snapshotId: string): Promise<void> {
  must(await serviceClient().rpc("fail_extraction", { p_snapshot_id: snapshotId }), "fail_extraction");
}

export const extractWork: ScopedWork = {
  kind: "extract",

  async collect(limit: number, scope?: WorkScope): Promise<BatchRequest[]> {
    const data = must(
      await serviceClient().rpc("extract_pending", {
        p_limit: limit,
        p_series_ids: scope?.seriesIds ?? null,
        p_max_known: MAX_KNOWN,
      }),
      "extract_pending",
    ) as { snapshots: PendingSnapshot[]; series: Record<string, SeriesKnowledge> };
    const bySeries = new Map<string, Known>();
    const out: BatchRequest[] = [];
    for (const s of data.snapshots) {
      const k = data.series[s.series_id];
      if (!k) continue;
      let known = bySeries.get(s.series_id);
      if (!known) bySeries.set(s.series_id, known = knownRefs(k));
      out.push(request(s, k, known));
    }
    return out;
  },

  async markSubmitted(customIds: string[]): Promise<void> {
    const ids = customIds.map((c) => parseCustomId(c).id);
    for (const part of chunks(ids, 150)) {
      must(
        await serviceClient().from("snapshots").update({ extraction: "submitted" }).in("id", part).eq("extraction", "pending"),
        "mark extraction submitted",
      );
    }
  },

  async handleResult(cid: string, result: BatchItemResult, refs: Record<string, string>): Promise<void> {
    const { id } = parseCustomId(cid);
    if (result.type !== "succeeded") {
      await failAttempt(id);
      throw new Error(failureMessage(result));
    }
    let output: ExtractOutput;
    try {
      output = parseStructured(result.message, ExtractOutput);
    } catch (e) {
      await failAttempt(id);
      throw e;
    }
    must(
      await serviceClient().rpc("apply_extraction", { p_snapshot_id: id, p_output: output, p_refs: refs ?? {} }),
      "apply_extraction",
    );
  },
};
