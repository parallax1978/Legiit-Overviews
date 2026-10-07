// Human labels for the values the query tabs show: overview formats, claim types, page evidence kinds
// and capture statuses.
import { humanize } from "@/lib/format";
import type { SnapshotStatus } from "@/lib/types";

export const FORMAT_LABEL_NAMES: Record<string, string> = {
  ranked_list: "Ranked list",
  bullets: "Bullets",
  table: "Table",
  pros_cons: "Pros and cons",
  best_for_labels: "Best-for labels",
  steps: "Steps",
  comparison: "Comparison",
  definition_first: "Definition first",
  faq: "FAQ",
};

/** "best_for_labels" -> "Best-for labels". */
export function formatLabelName(label: string): string {
  return FORMAT_LABEL_NAMES[label] ?? humanize(label);
}

export const CLAIM_TYPE_NAMES: Record<string, string> = {
  recommendation: "Recommendation",
  fact: "Fact",
  comparison: "Comparison",
  definition: "Definition",
  step: "Step",
  caveat: "Caveat",
};

export function claimTypeName(type: string): string {
  return CLAIM_TYPE_NAMES[type] ?? humanize(type);
}

export const PAGE_EVIDENCE_NAMES: Record<string, string> = {
  original_data: "Original data",
  test_result: "Test result",
  screenshot: "Screenshot",
  quote: "Quote",
  pricing: "Pricing",
  spec: "Spec",
  review: "Review",
  example: "Example",
};

export function pageEvidenceName(kind: string): string {
  return PAGE_EVIDENCE_NAMES[kind] ?? humanize(kind);
}

export const CAPTURE_STATUS_NAMES: Record<SnapshotStatus, string> = {
  present: "Overview shown",
  absent: "No overview",
  error: "Capture failed",
};
