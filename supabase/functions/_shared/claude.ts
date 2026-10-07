// Claude client, model IDs and structured-output helpers. Model IDs are defined here and nowhere else.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "./env.ts";

export const MODELS = {
  extract: "claude-opus-5-5",
  consolidate: "claude-opus-5-5",
  pageTag: "claude-opus-5-5",
  brief: "claude-opus-5-5",
  draftScore: "claude-opus-5-5",
} as const;
export type ModelTask = keyof typeof MODELS;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Effort per task. Drop a task's effort if its model is moved to Haiku 4.5, which rejects it. */
export const EFFORT: Record<ModelTask, Effort> = {
  extract: "low",
  consolidate: "low",
  pageTag: "low",
  brief: "high",
  draftScore: "medium",
};

/** Draft scoring retries a declined request on another model. Not available on batches. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic({
      apiKey: env.anthropicApiKey(),
      baseURL: env.anthropicBaseUrl(),
      maxRetries: 3,
    });
  }
  return cached;
}

/** Wraps data as the single JSON document between <data> tags that every prompt expects. */
export function dataBlock(data: unknown, instruction?: string): string {
  const body = `<data>\n${JSON.stringify(data)}\n</data>`;
  return instruction ? `${instruction}\n\n${body}` : body;
}

export interface StructuredRequest {
  task: ModelTask;
  system: string;
  user: string;
  schema: z.ZodType;
  maxTokens: number;
}

/**
 * Message params for a structured-output request. The system prompt is cached so batches of the
 * same task share it.
 */
export function structuredParams(r: StructuredRequest): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const fmt = zodOutputFormat(r.schema);
  return {
    model: MODELS[r.task],
    max_tokens: r.maxTokens,
    system: [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: r.user }],
    output_config: { effort: EFFORT[r.task], format: { type: "json_schema", schema: fmt.schema } },
  };
}

export class ClaudeOutputError extends Error {
  constructor(message: string, public readonly stopReason: string | null) {
    super(message);
  }
}

/**
 * Checks stop_reason, then parses and validates the JSON text against the schema.
 * Throws ClaudeOutputError on refusal, truncation, or invalid output.
 */
export function parseStructured<S extends z.ZodType>(message: Anthropic.Messages.Message, schema: S): z.infer<S> {
  const stop = message.stop_reason;
  if (stop !== "end_turn" && stop !== "stop_sequence") {
    throw new ClaudeOutputError(`unexpected stop_reason ${stop}`, stop);
  }
  const text = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ClaudeOutputError(`output is not JSON: ${text.slice(0, 200)}`, stop);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ClaudeOutputError(`output failed validation: ${parsed.error.message.slice(0, 500)}`, stop);
  return parsed.data;
}

/** One live structured request (used by the draft scorer). Sends server-side fallbacks when allowed. */
export async function liveStructured<S extends z.ZodType>(r: StructuredRequest & { schema: S; fallback?: boolean }): Promise<{ output: z.infer<S>; usage: Anthropic.Messages.Usage }> {
  const params = structuredParams(r);
  const message = r.fallback
    ? await anthropic().messages.create(
      { ...params, fallbacks: "default" } as Anthropic.Messages.MessageCreateParamsNonStreaming,
      { headers: { "anthropic-beta": FALLBACK_BETA } },
    )
    : await anthropic().messages.create(params);
  return { output: parseStructured(message, r.schema), usage: message.usage };
}

/** Adds one message's token usage to a running total (stored on batches.usage). */
export function addUsage(total: Record<string, number>, usage: Anthropic.Messages.Usage | null | undefined): Record<string, number> {
  if (!usage) return total;
  for (const k of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"] as const) {
    const v = usage[k];
    if (typeof v === "number") total[k] = (total[k] ?? 0) + v;
  }
  return total;
}
