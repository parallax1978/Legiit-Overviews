// Task C batch work: tag each parsed page that a report at stage 'pages' needs.
// Pending: parse_status 'ok' and tag_status 'none' (or tags older than the parse). The result sets
// pages.tags and measures.words_before_answer, located from Claude's verbatim answer sentence.
import { type BatchItemResult, type BatchRequest, customId, parseCustomId } from "../batch-work.ts";
import { parseStructured, structuredParams } from "../claude.ts";
import { must, serviceClient } from "../db.ts";
import { outlineFromMarkdown, wordsBefore } from "../passage.ts";
import { PAGE_TAG_MAX_CHARS, PAGE_TAG_SYSTEM, pageTagUser, trimMarkdown } from "../prompts/page-tag.ts";
import { type PageTagInput, PageTagOutput } from "../schemas.ts";
import type { OutlineItem } from "../types.ts";
import { chunks, errorText, failureMessage, type ScopedWork, type WorkScope } from "./common.ts";

export const PAGE_TAG_MAX_TOKENS = 8000;
const MAX_OUTLINE = 200;
const MAX_EXCERPT = 300;

export interface PendingPage {
  id: string;
  url_key: string;
  url: string;
  markdown: string | null;
  outline: OutlineItem[] | null;
  keyword: string;
  language: string;
  passages: string[];
}

/** The task C input for one page. */
export function pageTagInput(p: PendingPage): PageTagInput {
  const markdown = trimMarkdown(p.markdown ?? "", PAGE_TAG_MAX_CHARS);
  const outline = Array.isArray(p.outline) && p.outline.length ? p.outline : outlineFromMarkdown(p.markdown);
  return {
    keyword: p.keyword,
    language: p.language,
    url: p.url,
    outline: outline.slice(0, MAX_OUTLINE).map((o) => ({ level: o.level, text: o.text })),
    markdown,
    google_passages: (p.passages ?? []).slice(0, 10),
  };
}

/** Keeps excerpts short: cut at a word boundary when Claude exceeded the limit. */
export function clampTags(tags: PageTagOutput): PageTagOutput {
  return {
    ...tags,
    evidence: tags.evidence.map((e) => {
      if (e.excerpt.length <= MAX_EXCERPT) return e;
      const cut = e.excerpt.slice(0, MAX_EXCERPT);
      const space = cut.lastIndexOf(" ");
      return { ...e, excerpt: (space > MAX_EXCERPT / 2 ? cut.slice(0, space) : cut).trimEnd() };
    }),
  };
}

async function failTag(pageId: string): Promise<void> {
  must(
    await serviceClient().from("pages").update({ tag_status: "failed", tagged_at: new Date().toISOString() })
      .eq("id", pageId).eq("tag_status", "submitted"),
    "mark page tag failed",
  );
}

export const pageTagWork: ScopedWork = {
  kind: "page_tag",

  async collect(limit: number, scope?: WorkScope): Promise<BatchRequest[]> {
    const rows = must(
      await serviceClient().rpc("page_tag_pending", {
        p_limit: limit,
        p_series_ids: scope?.seriesIds ?? null,
        p_max_chars: PAGE_TAG_MAX_CHARS + 10_000,
      }),
      "page_tag_pending",
    ) as PendingPage[];
    return rows.map((p) => ({
      custom_id: customId("page_tag", p.id),
      target_id: p.id,
      refs: {},
      params: structuredParams({
        task: "pageTag",
        system: PAGE_TAG_SYSTEM,
        user: pageTagUser(pageTagInput(p)),
        schema: PageTagOutput,
        maxTokens: PAGE_TAG_MAX_TOKENS,
      }),
    }));
  },

  async markSubmitted(customIds: string[]): Promise<void> {
    const ids = customIds.map((c) => parseCustomId(c).id);
    for (const part of chunks(ids, 150)) {
      must(
        await serviceClient().from("pages").update({ tag_status: "submitted" }).in("id", part).neq("tag_status", "submitted"),
        "mark page tag submitted",
      );
    }
  },

  async handleResult(cid: string, result: BatchItemResult): Promise<void> {
    const { id } = parseCustomId(cid);
    if (result.type !== "succeeded") {
      await failTag(id);
      throw new Error(failureMessage(result));
    }
    let tags: PageTagOutput;
    try {
      tags = clampTags(parseStructured(result.message, PageTagOutput));
    } catch (e) {
      await failTag(id);
      throw e;
    }
    const page = must(
      await serviceClient().from("pages").select("markdown, tag_status").eq("id", id).maybeSingle(),
      "load page",
    ) as { markdown: string | null; tag_status: string } | null;
    if (!page) throw new Error(`page ${id} not found`);
    if (page.tag_status !== "submitted") return; // already applied, or re-parsed since submission
    let words: number | null;
    try {
      words = wordsBefore(page.markdown, tags.answer_sentence);
    } catch (e) {
      console.error(`wordsBefore ${id}: ${errorText(e)}`);
      words = null;
    }
    must(
      await serviceClient().rpc("apply_page_tag", { p_page_id: id, p_tags: tags, p_words_before_answer: words }),
      "apply_page_tag",
    );
  },
};
