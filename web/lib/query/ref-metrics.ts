// Counts for the typed refs in a stored brief (claim:<id>, entity:<id>), computed live with series_metrics
// over the report's window so a chip shows the same merge state as the evidence drawer it opens. Refs to
// claim groups or entities merged since the brief was written resolve to their survivors, as
// metric_evidence does. Falls back to the counts stored with the report when the live call fails.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ClaimMetric, EntityMetric, SeriesMetrics } from "@/lib/types";
import { getSeriesMetrics, normalizeMetrics } from "./metrics";
import { parseRef } from "./report";

export interface RefMetrics {
  /** The metrics the chips read: live for the report window, or the stored ones as a fallback. */
  metrics: SeriesMetrics;
  /** Claim metrics by group id, including ids merged into a group since the brief was written. */
  claims: Map<string, ClaimMetric>;
  /** Entity metrics by entity id, including merged ids. */
  entities: Map<string, EntityMetric>;
  /** False when the live call failed and the stored counts are shown. */
  live: boolean;
}

const MAX_HOPS = 10;

/** Follows merged_into from each id to its surviving row; returns id -> survivor for ids that moved. */
async function survivors(supabase: SupabaseClient, table: "claim_groups" | "entities", ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const current = new Map(ids.map((id) => [id, id]));
  for (let hop = 0; hop < MAX_HOPS && current.size > 0; hop++) {
    const { data, error } = await supabase.from(table).select("id, merged_into").in("id", [...new Set(current.values())]);
    if (error) break;
    const next = new Map(((data ?? []) as { id: string; merged_into: string | null }[]).map((r) => [r.id, r.merged_into]));
    for (const [origin, at] of [...current]) {
      const to = next.get(at);
      if (!to) {
        if (at !== origin) out.set(origin, at);
        current.delete(origin);
      } else {
        current.set(origin, to);
      }
    }
  }
  return out;
}

/**
 * Live counts for a report window plus aliases for every ref in `refs` whose row was merged since.
 * `stored` is reports.metrics, used only when series_metrics fails.
 */
export async function getRefMetrics(seriesId: string, from: string, to: string, stored: SeriesMetrics | null, refs: (string | null | undefined)[]): Promise<RefMetrics | null> {
  const live = await getSeriesMetrics(seriesId, from, to);
  const metrics = live.data ?? (stored ? normalizeMetrics(stored) : null);
  if (!metrics) return null;

  const claims = new Map<string, ClaimMetric>(metrics.claims.map((c) => [c.group_id, c]));
  const entities = new Map<string, EntityMetric>(metrics.entities.map((e) => [e.entity_id, e]));

  const missingClaims = new Set<string>();
  const missingEntities = new Set<string>();
  for (const raw of refs) {
    const ref = parseRef(raw);
    if (ref?.kind === "claim" && !claims.has(ref.id)) missingClaims.add(ref.id);
    if (ref?.kind === "entity" && !entities.has(ref.id)) missingEntities.add(ref.id);
  }
  if (missingClaims.size || missingEntities.size) {
    const supabase = await createClient();
    const [claimMoves, entityMoves] = await Promise.all([
      missingClaims.size ? survivors(supabase, "claim_groups", [...missingClaims]) : new Map<string, string>(),
      missingEntities.size ? survivors(supabase, "entities", [...missingEntities]) : new Map<string, string>(),
    ]);
    for (const [id, survivor] of claimMoves) {
      const m = claims.get(survivor);
      if (m) claims.set(id, m);
    }
    for (const [id, survivor] of entityMoves) {
      const m = entities.get(survivor);
      if (m) entities.set(id, m);
    }
  }
  return { metrics, claims, entities, live: live.data !== null };
}
