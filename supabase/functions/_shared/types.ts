// Shared contracts. Every module codes against these types; change them only with care.

// ------------------------------------------------------------------ capture parsing

export type SentenceKind = "paragraph" | "list_item" | "heading" | "table_row" | "expanded";

/** One sentence of an AI Overview, with the citations attached to it. */
export interface ParsedSentence {
  i: number; // 0-based index within the snapshot; claims reference this
  text: string; // plain text, citation markers and images removed
  block: number; // index of the paragraph / list item / table row it came from
  kind: SentenceKind;
  citations: number[]; // ParsedCitation.idx values
}

export type SectionKind = "element" | "expanded" | "table" | "video" | "unknown";

/** One DataForSEO ai_overview item, kept for structure and format detection. */
export interface ParsedSection {
  position: number;
  kind: SectionKind;
  title: string | null;
  text: string;
  citation_idx: number[];
}

export interface ParsedCitation {
  idx: number; // 0-based, unique within the snapshot
  url: string; // as returned (text fragments like #:~:text= removed)
  url_key: string; // normalizeUrl(url)
  host: string; // lowercased, without leading www.
  reg_domain: string; // registrable domain via tldts, e.g. "zapier.com"
  title: string | null;
  source: string | null;
  passage: string | null; // reference.text: the passage Google used
}

export interface ParsedOrganic {
  rank: number; // rank_group of organic results, 1-based
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

export interface ParsedCapture {
  status: "present" | "absent";
  asynchronous: boolean | null;
  markdown: string | null; // cleaned markdown (images stripped)
  sentences: ParsedSentence[];
  sections: ParsedSection[];
  citations: ParsedCitation[];
  organic: ParsedOrganic[];
  formats: CodeFormats | null;
  content_hash: string | null; // sha256 over sentences + their citation url_keys; null when absent
}

/** What snapshots.formats holds after extraction. */
export interface SnapshotFormats extends CodeFormats {
  labels?: FormatLabel[];
  answer_lead_sentence?: number | null;
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
export type FormatLabel = typeof FORMAT_LABELS[number];

export const CLAIM_TYPES = ["recommendation", "fact", "comparison", "definition", "step", "caveat"] as const;
export type ClaimType = typeof CLAIM_TYPES[number];

// ------------------------------------------------------------------ pages

export interface OutlineItem {
  level: number; // 1..6
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
  comparison_blocks: number; // tables with 3+ columns or lists naming 2+ known entities
  numbers_per_100_words: number;
  author: string | null;
  published: string | null; // ISO date if found in the text
  updated: string | null;
  internal_links: number;
  external_links: number;
  has_faq: boolean;
  words_before_answer: number | null; // filled after Claude tags the answer sentence
}

/** Where Google's quoted passage sits in a page. */
export interface PassageLocation {
  url_key: string;
  passage: string;
  found: boolean;
  heading: string | null; // nearest heading above the passage
  position: number | null; // 0..1, character offset / page length
  match_score: number; // 0..1
}

// ------------------------------------------------------------------ metrics (returned by SQL function series_metrics)

export type Confidence = "low" | "medium" | "high";
export type Bucket = "core" | "recurring" | "rotating";

export interface ClaimMetric {
  group_id: string;
  label: string;
  renders: number; // renders containing the claim
  share: number; // renders / present renders
  bucket: Bucket;
  first_seen: string;
  last_seen: string;
  cited_share: number; // share of occurrences whose sentence carries a citation
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
  organic_top10_share: number; // share of its citing renders where it also ranked top 10
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
  day: string; // YYYY-MM-DD (UTC)
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
  renders: number; // non-error renders
  present: number;
  errors: number;
  days: number; // distinct UTC days with a non-error render
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

// ------------------------------------------------------------------ tracking

export type MatchLevel = "exact_url" | "path_prefix" | "same_host" | "same_domain";

export interface OwnMatch {
  level: MatchLevel | null;
  citation_idx: number | null;
  brand_mentioned: boolean;
}

// ------------------------------------------------------------------ draft score

export interface DraftScoreResult {
  score: number; // 0..100
  subscores: {
    topic_coverage: number; // 0..1
    entity_coverage: number;
    format_match: number;
    answer_first: number;
    evidence: number;
    checklist: number;
  };
  measures: PageMeasures;
  winners_median: Partial<PageMeasures>;
  topics: { topic: string; status: "covered" | "partial" | "missing"; note: string }[];
  entities: { name: string; present: boolean }[];
  new_to_cite: { idea: string; status: "covered" | "partial" | "missing"; note: string }[];
  fixes: { priority: number; fix: string }[];
}
