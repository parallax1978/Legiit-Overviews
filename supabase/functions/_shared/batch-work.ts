// The contract between the batch runner (submit-batches / collect-batches) and the four kinds of
// Claude work. Each kind lives in its own module under _shared/work/ and implements BatchWork.
//
//   extract      _shared/work/extract.ts      (claims and entities per unique capture)
//   consolidate  _shared/work/consolidate.ts  (nightly merges per series)
//   page_tag     _shared/work/page-tag.ts     (topics, entities, evidence per cited page)
//   brief        _shared/work/brief.ts        (coverage matrix and brief per report)
//
// custom_id format: `${kind}-${id}` built by customId(), where id is the row the result belongs to
// (snapshot id, series id, pages.id, report id). Max 64 chars, [a-zA-Z0-9_-] only.

import type Anthropic from "@anthropic-ai/sdk";

export type WorkKind = "extract" | "consolidate" | "page_tag" | "brief";

export type BatchRequest = {
  custom_id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
};

export type BatchItemResult =
  | { type: "succeeded"; message: Anthropic.Messages.Message }
  | { type: "errored"; error: unknown }
  | { type: "canceled" }
  | { type: "expired" };

export interface BatchWork {
  kind: WorkKind;
  /** Up to `limit` requests for pending work. Must not mark anything; markSubmitted does that. */
  collect(limit: number): Promise<BatchRequest[]>;
  /** Called after the batch is created, with the custom_ids it contains. */
  markSubmitted(customIds: string[], batchId: string): Promise<void>;
  /** Applies one result. Must be idempotent: a result may be delivered twice. */
  handleResult(customId: string, result: BatchItemResult): Promise<void>;
}

/** Splits `${kind}-${id}`. Kinds contain no dash, so the first dash separates them. */
export function parseCustomId(customId: string): { kind: WorkKind; id: string } {
  const i = customId.indexOf("-");
  return { kind: customId.slice(0, i) as WorkKind, id: customId.slice(i + 1) };
}

/** custom_id allows only [a-zA-Z0-9_-]{1,64}; ids that are UUIDs fit after the prefix. */
export function customId(kind: WorkKind, id: string): string {
  const cid = `${kind}-${id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (cid.length > 64) throw new Error(`custom_id too long: ${cid}`);
  return cid;
}
