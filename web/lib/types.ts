// Types shared by the app.
// The first part is copied from supabase/functions/_shared/types.ts (keep in sync when that file changes).
// The second part describes the RPC results, Edge Function payloads and table rows the app reads.

// ------------------------------------------------------------------ copied from _shared/types.ts

export type SentenceKind = "paragraph" | "list_item" | "heading" | "table_row" | "expanded";

/** One sentence of an AI Overview, with the citations attached to it. */
export interface ParsedSentence {
  i: number;
  text: string;
  block: number;
  kind: SentenceKind;
  citations: number[];
}

export type SectionKind = "element" | "expanded" | "table" | "video" | "unknown";

export interface ParsedOrganic {
  rank: number;
  url: string;
  url_key: string;
  reg_domain: string;
  title: string | null;
}

/** Format facts measured in code from the overview itself. */
export interface CodeFormats {
  word_count: number;
  has_table: boolean;
  list_items: number;
  headings: number;
  sentences: number;
}

export const FORMAT_LABELS = [
  "ranked_list",
  "bullets",
  "table",
  "pros_cons",
  "best_for_labels",
  "steps",
  "comparison",
  "definition_first",
  "faq",
] as const;
export type FormatLabel = (typeof FORMAT_LABELS)[number];

/** What snapshots.formats holds after extraction. */
export interface SnapshotFormats extends CodeFormats {
  labels?: FormatLabel[];
  answer_lead_sentence?: number | null;
}

export const CLAIM_TYPES = ["recommendation", "fact", "comparison", "definition", "step", "caveat"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export interface OutlineItem {
  level: number;
  text: string;
}

/** Measured in code from a parsed page (DataForSEO content_parsing). */
export interface PageMeasures {
  word_count: number;
  headings: number;
  outline_depth: number;
  tables: number;
  table_rows: number;
  max_table_columns: number;
  lists: number;
  list_items: number;
  comparison_blocks: number;
  numbers_per_100_words: number;
  author: string | null;
  published: string | null;
  updated: string | null;
  internal_links: number;
  external_links: number;
  has_faq: boolean;
  words_before_answer: number | null;
}

/** Where Google's quoted passage sits in a page. */
export interface PassageLocation {
  url_key: string;
  passage: string;
  found: boolean;
  heading: string | null;
  position: number | null;
  match_score: number;
}

export type Confidence = "low" | "medium" | "high";
export type Bucket = "core" | "recurring" | "rotating";

export interface ClaimMetric {
  group_id: string;
  label: string;
  renders: number;
  share: number;
  bucket: Bucket;
  first_seen: string;
  last_seen: string;
  cited_share: number;
  types: ClaimType[];
}

export interface EntityMetric {
  entity_id: string;
  name: string;
  renders: number;
  share: number;
  recommended_renders: number;
  recommended_share: number;
  labels: string[];
  bucket: Bucket;
}

export interface SourceMetric {
  url_key: string;
  url: string;
  reg_domain: string;
  title: string | null;
  renders: number;
  share: number;
  bucket: Bucket;
  platform: boolean;
  organic_top10_share: number;
}

export interface DomainMetric {
  reg_domain: string;
  renders: number;
  share: number;
  bucket: Bucket;
  platform: boolean;
}

export interface FormatMetric {
  label: string;
  renders: number;
  share: number;
}

export interface DailyDiff {
  day: string;
  renders: number;
  present: number;
  claims_added: { group_id: string; label: string }[];
  claims_dropped: { group_id: string; label: string }[];
  entities_added: { entity_id: string; name: string }[];
  entities_dropped: { entity_id: string; name: string }[];
  citations_added: { url_key: string; reg_domain: string }[];
  citations_dropped: { url_key: string; reg_domain: string }[];
}

export interface SeriesMetrics {
  window: { from: string; to: string };
  renders: number;
  present: number;
  errors: number;
  days: number;
  // The three fields below are missing from metrics stored before they existed.
  /** Present renders whose extraction is done: the denominator of claim, entity, format and answer-lead shares. */
  extracted?: number;
  /** Present renders still awaiting extraction ("n captures still being analysed"). */
  extraction_pending?: number;
  /** Where the direct answer sits, over extracted renders: share opening with it, share with none, median sentence index. */
  answer_lead?: { n: number; answer_first_share: number | null; no_answer_share: number | null; median_sentence: number | null };
  presence_rate: number | null;
  change_rate: number | null;
  confidence: Confidence;
  citation_stability: { url: number | null; domain: number | null };
  citations_per_render: number | null;
  median_word_count: number | null;
  organic_overlap: { top10: number | null; top20: number | null };
  claims: ClaimMetric[];
  entities: EntityMetric[];
  sources: SourceMetric[];
  domains: DomainMetric[];
  formats: FormatMetric[];
  unsupported_claims: { group_id: string; label: string; share: number }[];
  daily: DailyDiff[];
}

export type MatchLevel = "exact_url" | "path_prefix" | "same_host" | "same_domain";

export interface DraftScoreResult {
  score: number;
  subscores: {
    topic_coverage: number;
    entity_coverage: number;
    format_match: number;
    answer_first: number;
    evidence: number;
    checklist: number;
    // Missing from scores stored before they were added.
    new_to_cite?: number; // over the brief's new-to-cite ideas (1 when it has none)
    clarity?: number; // Claude's clarity score / 10
  };
  measures: PageMeasures;
  winners_median: Partial<PageMeasures>;
  topics: { topic: string; status: "covered" | "partial" | "missing"; note: string }[];
  entities: { name: string; present: boolean }[];
  new_to_cite: { idea: string; status: "covered" | "partial" | "missing"; note: string }[];
  clarity?: { score: number; note: string }; // 0..10; missing from scores stored before it was added
  fixes: { priority: number; fix: string }[];
}

// ------------------------------------------------------------------ enums used by the app

export type Device = "desktop" | "mobile";
export type TrackedQueryStatus = "watching" | "tracking" | "paused";
export type SnapshotStatus = "present" | "absent" | "error";
export type CaptureStatus = "pending" | "submitted" | "received" | "error";
export type ReportKind = "preliminary" | "full" | "refresh";
export type ReportStage = "pages" | "brief" | "ready" | "failed";
export type NotificationKind = "first_seen" | "lost" | "regained" | "brand_mention" | "report_ready" | "platform_event" | "digest";
export type CitationEventKind = "first_seen" | "lost" | "regained" | "brand_mention";
export type EvidenceKind = "claim" | "unsupported" | "entity" | "source" | "domain" | "format" | "presence" | "overlap";

// ------------------------------------------------------------------ RPC results (docs/architecture.md)

/** One row of `my_queries()`. */
export interface MyQuery {
  tracked_query_id: string;
  display_keyword: string;
  series_id: string;
  keyword: string;
  location_code: number;
  location_name: string;
  language_code: string;
  device: Device;
  status: TrackedQueryStatus;
  created_at: string;
  history_days: number;
  renders_7d: number;
  present_7d: number;
  presence_rate_7d: number | null;
  last_captured_at: string | null;
  last_status: SnapshotStatus | null;
  own_url: string | null;
  own_level_7d: MatchLevel | null;
  report: { id: string; kind: ReportKind; stage: ReportStage } | null;
}

/** One capture behind a metric, from `metric_evidence(...)`. */
export interface EvidenceItem {
  snapshot_id: string;
  captured_at: string;
  sentences: { i: number; text: string; citations: number[] }[];
  note: string | null;
  /** Kind `presence` only: whether the overview showed in this capture. */
  status?: SnapshotStatus;
}

/** Result of `metric_evidence(p_series_id, p_kind, p_key, p_from, p_to, p_limit)`. */
export interface MetricEvidence {
  total: number;
  items: EvidenceItem[];
  /** Kind `overlap` only: cited (render, URL) pairs ranking in the organic cut, and all cited pairs (organic_overlap's numerator and denominator). */
  citations?: number;
  occurrences?: number;
}

export interface TrackingDay {
  day: string;
  renders: number;
  present: number;
  cited: number;
  best_level: MatchLevel | null;
  brand: number;
}

/** Result of `tracking_summary(p_tracked_query_id)`. */
export interface TrackingSummary {
  own_url: string | null;
  brand_names: string[];
  renders_7d: number;
  cited_7d: number;
  /** Renders citing the exact own URL (level exact_url), a subset of cited_7d. */
  cited_exact_7d: number;
  survival_7d: number | null;
  renders_28d: number;
  cited_28d: number;
  cited_exact_28d: number;
  survival_28d: number | null;
  brand_7d: number;
  latest: { captured_at: string; level: MatchLevel | null; quoted_heading: string | null } | null;
  daily: TrackingDay[];
}

// ------------------------------------------------------------------ Edge Function payloads

export interface AddQueryRequest {
  keyword: string;
  location_code: number;
  language_code: string;
  devices: Device[];
}

export interface AddQueryResult {
  device: Device;
  tracked_query_id: string;
  series_id: string;
  status: TrackedQueryStatus;
  is_new_series: boolean;
  overview_present: boolean;
}

export interface AddQueryResponse {
  results: AddQueryResult[];
  siblings: { keyword: string; search_volume: number | null }[];
}

export interface SetOwnPageRequest {
  tracked_query_id: string;
  own_url: string | null;
  brand_names: string[];
}

export interface SetOwnPageResponse {
  ok: true;
  parsed: boolean;
  matches: number;
}

export interface ScoreDraftRequest {
  tracked_query_id: string;
  source: "url" | "text";
  input: string;
}

export interface ScoreDraftResponse {
  draft_score_id: string;
}

// ------------------------------------------------------------------ table rows (supabase/migrations)

export interface LocationRow {
  code: number;
  name: string;
  country_iso: string;
  default_language: string;
  timezone: string;
}

export interface SeriesRow {
  id: string;
  keyword: string;
  location_code: number;
  language_code: string;
  device: Device;
  next_capture_at: string;
  consolidated_at: string | null;
  created_at: string;
}

export interface TrackedQueryRow {
  id: string;
  user_id: string;
  series_id: string;
  display_keyword: string;
  own_url: string | null;
  own_url_key: string | null;
  brand_names: string[];
  status: TrackedQueryStatus;
  created_at: string;
}

export interface CaptureRow {
  id: string;
  series_id: string;
  scheduled_at: string;
  source: "scheduled" | "live";
  task_id: string | null;
  attempts: number;
  status: CaptureStatus;
  submitted_at: string | null;
  received_at: string | null;
  last_error: string | null;
}

export interface SnapshotRow {
  id: string;
  series_id: string;
  capture_id: string | null;
  captured_at: string;
  status: SnapshotStatus;
  overview_markdown: string | null;
  sentences: ParsedSentence[];
  content_hash: string | null;
  same_as: string | null;
  raw_path: string | null;
  organic: ParsedOrganic[];
  formats: Partial<SnapshotFormats>;
  extraction: "pending" | "submitted" | "done" | "reused" | "none" | "failed";
  extraction_attempts: number;
  created_at: string;
}

export interface SectionRow {
  id: string;
  snapshot_id: string;
  position: number;
  kind: SectionKind;
  title: string | null;
  text: string;
  citation_idx: number[];
}

export interface CitationRow {
  id: string;
  snapshot_id: string;
  idx: number;
  url: string;
  url_key: string;
  host: string;
  reg_domain: string;
  title: string | null;
  source: string | null;
  passage: string | null;
}

export interface ClaimGroupRow {
  id: string;
  series_id: string;
  label: string;
  merged_into: string | null;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  snapshot_id: string;
  group_id: string;
  sentence: number;
  text: string;
  type: ClaimType;
  citation_idx: number[];
}

export interface EntityRow {
  id: string;
  series_id: string;
  name: string;
  aliases: string[];
  merged_into: string | null;
  created_at: string;
}

export interface EntityMentionRow {
  id: string;
  entity_id: string;
  snapshot_id: string;
  role: "recommended" | "mentioned";
  label: string | null;
  sentences: number[];
}

export interface PageRow {
  url_key: string;
  id: string;
  url: string;
  reg_domain: string;
  parse_status: "pending" | "ok" | "failed";
  parsed_at: string | null;
  parse_error: string | null;
  markdown: string | null;
  outline: OutlineItem[] | null;
  measures: PageMeasures | null;
  tags: unknown;
  tag_status: "none" | "submitted" | "done" | "failed";
  tagged_at: string | null;
}

export interface ReportPageDetail {
  url_key: string;
  ref: string;
  share: number;
  passages: PassageLocation[];
}

export interface BriefChecks {
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  dropped_refs: string[];
}

export interface ReportRow {
  id: string;
  tracked_query_id: string;
  series_id: string;
  kind: ReportKind;
  window_start: string;
  window_end: string;
  renders: number;
  metrics: SeriesMetrics | null;
  page_urls: string[];
  page_details: ReportPageDetail[] | null;
  analysis: unknown;
  brief_markdown: string | null;
  brief_checks: BriefChecks | null;
  stage: ReportStage;
  brief_submitted: boolean;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftScoreRow {
  id: string;
  tracked_query_id: string;
  report_id: string | null;
  source: "url" | "text";
  input: string;
  status: "running" | "done" | "failed";
  result: DraftScoreResult | null;
  error: string | null;
  created_at: string;
}

export interface OwnPageRow {
  tracked_query_id: string;
  url: string;
  resolved_url: string | null;
  parsed_at: string | null;
  markdown: string | null;
  outline: OutlineItem[] | null;
}

export interface OwnMatchRow {
  tracked_query_id: string;
  snapshot_id: string;
  level: MatchLevel | null;
  brand_mentioned: boolean;
  citation_idx: number | null;
  quoted_heading: string | null;
}

export interface CitationEventRow {
  id: string;
  tracked_query_id: string;
  snapshot_id: string | null;
  kind: CitationEventKind;
  level: string | null;
  quoted_heading: string | null;
  held_for_platform_event: boolean;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  tracked_query_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  emailed_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface PlatformEventRow {
  id: string;
  day: string;
  metrics: Record<string, unknown>;
  created_at: string;
}
