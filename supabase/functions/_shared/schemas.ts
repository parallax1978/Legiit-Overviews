// Claude structured-output schemas (zod v4). These are the contract between prompts, the batch
// collector, the mock Anthropic server and the app. All fields are required; use nullable, never
// optional, to stay inside structured-output limits. No recursion, no minItems above 1.
//
// Inputs to Claude carry short references instead of UUIDs: canonical claims are "C<n>", entities
// "E<n>", pages "P<n>", sentences are integers. Code maps references back to rows.
//
// Every Claude input embeds its data as one JSON document between <data> and </data> tags.

import { z } from "zod";
import { CLAIM_TYPES, FORMAT_LABELS } from "./types.ts";

// ------------------------------------------------------------------ A. extract and match (per unique capture)

export const ExtractOutput = z.object({
  claims: z.array(z.object({
    sentence: z.number().int(), // sentence index from the input
    text: z.string(), // one self-contained atomic claim
    type: z.enum(CLAIM_TYPES),
    group_ref: z.string().nullable(), // "C<n>" of an existing canonical claim, or null
    new_label: z.string().nullable(), // canonical wording when group_ref is null
  })),
  entities: z.array(z.object({
    entity_ref: z.string().nullable(), // "E<n>" of an existing entity, or null
    name: z.string(),
    role: z.enum(["recommended", "mentioned"]),
    label: z.string().nullable(), // e.g. "best free option"
    sentences: z.array(z.number().int()),
  })),
  format_labels: z.array(z.enum(FORMAT_LABELS)),
  answer_lead_sentence: z.number().int().nullable(),
});
export type ExtractOutput = z.infer<typeof ExtractOutput>;

/** The JSON placed between <data> tags for task A. */
export interface ExtractInput {
  keyword: string;
  language: string;
  sentences: { i: number; kind: string; text: string; cited: boolean }[];
  known_claims: { ref: string; label: string }[];
  known_entities: { ref: string; name: string; aliases: string[] }[];
}

// ------------------------------------------------------------------ B. consolidate (nightly per series)

export const ConsolidateOutput = z.object({
  claim_merges: z.array(z.object({
    keep: z.string(), // "C<n>"
    merge: z.array(z.string()), // "C<n>" refs that mean the same claim
  })),
  entity_merges: z.array(z.object({
    keep: z.string(), // "E<n>"
    merge: z.array(z.string()),
    aliases: z.array(z.string()), // names to record as aliases of the kept entity
  })),
});
export type ConsolidateOutput = z.infer<typeof ConsolidateOutput>;

export interface ConsolidateInput {
  keyword: string;
  language: string;
  claims: { ref: string; label: string; renders: number }[];
  entities: { ref: string; name: string; aliases: string[]; renders: number }[];
}

// ------------------------------------------------------------------ C. tag a cited page

export const EVIDENCE_KINDS = ["original_data", "test_result", "screenshot", "quote", "pricing", "spec", "review", "example"] as const;

export const PageTagOutput = z.object({
  topics: z.array(z.string()),
  entities: z.array(z.string()),
  evidence: z.array(z.object({
    kind: z.enum(EVIDENCE_KINDS),
    description: z.string(),
    excerpt: z.string(), // at most ~200 characters, verbatim from the page
  })),
  questions_answered: z.array(z.string()),
  answer_sentence: z.string().nullable(), // verbatim first sentence that directly answers the query
  approach: z.string(), // 1-2 sentences: how this page answers the query
});
export type PageTagOutput = z.infer<typeof PageTagOutput>;

export interface PageTagInput {
  keyword: string;
  language: string;
  url: string;
  outline: { level: number; text: string }[];
  markdown: string; // trimmed page markdown
  google_passages: string[]; // passages Google quoted from this page
}

// ------------------------------------------------------------------ D. coverage matrix and brief (per report)

export const CELL_STATES = ["covered", "partial", "missing"] as const;
export const HOW_TO_PRODUCE = [
  "original_data",
  "first_hand_test",
  "new_statistics",
  "better_comparison",
  "useful_table",
  "unanswered_question",
  "better_examples",
] as const;

export const BriefOutput = z.object({
  summary: z.string(), // 2-3 sentences: what the overview rewards for this query
  matrix: z.object({
    topics: z.array(z.object({
      topic: z.string(),
      claim_refs: z.array(z.string()),
      cells: z.array(z.object({ page_ref: z.string(), state: z.enum(CELL_STATES) })),
    })),
    entities: z.array(z.object({
      entity: z.string(),
      entity_ref: z.string().nullable(),
      cells: z.array(z.object({ page_ref: z.string(), state: z.enum(CELL_STATES) })),
    })),
  }),
  common_to_all: z.array(z.string()),
  gaps: z.array(z.object({ gap: z.string(), why: z.string(), claim_refs: z.array(z.string()) })),
  page_notes: z.array(z.object({ page_ref: z.string(), does_differently: z.string() })),
  brief: z.object({
    answer_first: z.object({ text: z.string(), max_words: z.number().int() }),
    must_cover: z.array(z.object({ topic: z.string(), why: z.string(), claim_refs: z.array(z.string()) })),
    entities: z.array(z.object({
      name: z.string(),
      entity_ref: z.string().nullable(),
      role: z.enum(["recommended", "mentioned"]),
      note: z.string(),
    })),
    format: z.object({
      structure: z.string(),
      table_columns: z.array(z.string()),
      list_items: z.number().int().nullable(),
    }),
    evidence_to_match: z.array(z.object({ what: z.string(), page_refs: z.array(z.string()) })),
    new_to_cite: z.array(z.object({
      idea: z.string(),
      why_google_lacks_it: z.string(),
      how_to_produce: z.enum(HOW_TO_PRODUCE),
      evidence_refs: z.array(z.string()), // any of C<n>, E<n>, P<n>
    })),
    questions: z.array(z.string()),
    outline: z.array(z.object({
      heading: z.string(),
      level: z.number().int(),
      purpose: z.string(),
      target_words: z.number().int(),
      covers: z.array(z.string()), // must_cover topics this section covers
    })),
    checklist: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
});
export type BriefOutput = z.infer<typeof BriefOutput>;

export interface BriefInput {
  keyword: string;
  language: string;
  own_domain: string | null;
  window: { from: string; to: string; renders: number; present: number };
  claims: { ref: string; label: string; share: number; bucket: string; cited_share: number }[];
  entities: { ref: string; name: string; share: number; recommended_share: number; labels: string[] }[];
  formats: { label: string; share: number }[];
  median_word_count: number | null;
  unsupported_claims: { ref: string; label: string; share: number }[];
  platform_sources: { reg_domain: string; share: number }[];
  pages: {
    ref: string;
    url: string;
    share: number; // source survival share
    measures: unknown; // PageMeasures
    tags: unknown; // PageTagOutput
    passages: { passage: string; heading: string | null; position: number | null }[];
  }[];
}

// ------------------------------------------------------------------ E. draft score (live request)

export const DraftScoreOutput = z.object({
  topics: z.array(z.object({ topic: z.string(), status: z.enum(CELL_STATES), note: z.string() })),
  new_to_cite: z.array(z.object({ idea: z.string(), status: z.enum(CELL_STATES), note: z.string() })),
  answer_first: z.object({ status: z.enum(CELL_STATES), note: z.string() }),
  clarity: z.object({ score: z.number().int(), note: z.string() }), // 0..10
  fixes: z.array(z.object({ priority: z.number().int(), fix: z.string() })),
});
export type DraftScoreOutput = z.infer<typeof DraftScoreOutput>;

export interface DraftScoreInput {
  keyword: string;
  language: string;
  brief: unknown; // BriefOutput["brief"]
  draft_markdown: string;
}
