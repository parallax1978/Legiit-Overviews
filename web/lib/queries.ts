// Server data loaders for the query pages, deduplicated per request with React cache() so the
// query layout and each tab page can call them without extra round trips. RLS scopes every read.
import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { LocationRow, MyQuery, SeriesRow, TrackedQueryRow } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical UUID string. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** A tracked query with its series, location and capture counts. */
export interface TrackedQueryDetail extends TrackedQueryRow {
  series: SeriesRow;
  location: LocationRow | null;
  /** Non-error renders captured for the series (all time). */
  renders: number;
  /** Renders that showed an AI Overview (all time). */
  present: number;
  /** First and latest non-error capture of the series, or null before the first capture. */
  first_captured_at: string | null;
  last_captured_at: string | null;
}

export type Loaded<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Loads one tracked query of the signed-in user. Returns data null with error null when the id is
 * not a UUID or the query doesn't exist or belongs to someone else (render notFound()).
 */
export const getTrackedQuery = cache(async (id: string): Promise<{ data: TrackedQueryDetail | null; error: string | null }> => {
  if (!isUuid(id)) return { data: null, error: null };
  const supabase = await createClient();
  const { data: tq, error } = await supabase
    .from("tracked_queries")
    .select("*, series:series_id(*, location:locations(*))")
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!tq) return { data: null, error: null };

  const { series: seriesWithLocation, ...row } = tq as TrackedQueryRow & {
    series: SeriesRow & { location: LocationRow | null };
  };
  const { location, ...series } = seriesWithLocation;

  const snapshots = () => supabase.from("snapshots").select("id", { count: "exact", head: true }).eq("series_id", series.id);
  const [renders, present, first, last] = await Promise.all([
    snapshots().neq("status", "error"),
    snapshots().eq("status", "present"),
    supabase
      .from("snapshots")
      .select("captured_at")
      .eq("series_id", series.id)
      .neq("status", "error")
      .order("captured_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("snapshots")
      .select("captured_at")
      .eq("series_id", series.id)
      .neq("status", "error")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    data: {
      ...row,
      series,
      location,
      renders: renders.count ?? 0,
      present: present.count ?? 0,
      first_captured_at: (first.data as { captured_at: string } | null)?.captured_at ?? null,
      last_captured_at: (last.data as { captured_at: string } | null)?.captured_at ?? null,
    },
    error: null,
  };
});

/** The signed-in user's queries from `my_queries()`. */
export const getMyQueries = cache(async (): Promise<Loaded<MyQuery[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_queries");
  if (error) return { data: null, error: error.message };
  return { data: Array.isArray(data) ? (data as MyQuery[]) : [], error: null };
});

/** Number of unread notifications for the signed-in user (0 on error). */
export const getUnreadCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return error ? 0 : (count ?? 0);
});

/** Countries offered when adding a query, by name. */
export const getLocations = cache(async (): Promise<Loaded<LocationRow[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("locations").select("*").order("name");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as LocationRow[], error: null };
});
