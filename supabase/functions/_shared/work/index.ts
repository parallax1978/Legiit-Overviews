// Registry of the Claude batch work kinds, in the order submit-batches runs them.
import type { WorkKind } from "../batch-work.ts";
import { briefWork } from "./brief.ts";
import type { ScopedWork } from "./common.ts";
import { consolidateWork } from "./consolidate.ts";
import { extractWork } from "./extract.ts";
import { pageTagWork } from "./page-tag.ts";

export type { ScopedWork, WorkScope } from "./common.ts";

export const WORK_ORDER: WorkKind[] = ["extract", "consolidate", "page_tag", "brief"];

export const WORK: Record<WorkKind, ScopedWork> = {
  extract: extractWork,
  consolidate: consolidateWork,
  page_tag: pageTagWork,
  brief: briefWork,
};

/**
 * Most requests collected per page; the runner keeps paging (one batch each) while a page is full.
 * Consolidation pages are small because each candidate carries its whole claim and entity list.
 */
export const LIMITS: Record<WorkKind, number> = {
  extract: 1000,
  consolidate: 20,
  page_tag: 200,
  brief: 200,
};
