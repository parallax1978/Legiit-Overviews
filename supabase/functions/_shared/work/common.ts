// Helpers shared by the BatchWork modules.
import type { BatchItemResult, BatchRequest, BatchWork } from "../batch-work.ts";

/** Restricts which rows a collect() may pick up. Production passes nothing; tests pass their series. */
export interface WorkScope {
  seriesIds?: string[];
}

/** A BatchWork whose collect() also accepts a scope. */
export interface ScopedWork extends BatchWork {
  collect(limit: number, scope?: WorkScope): Promise<BatchRequest[]>;
}

/** A readable reason for a result that carries no usable message. */
export function failureMessage(result: Exclude<BatchItemResult, { type: "succeeded" }>): string {
  if (result.type !== "errored") return `request ${result.type}`;
  const e = result.error as { error?: { type?: string; message?: string }; type?: string; message?: string } | null;
  const inner = e?.error ?? e;
  return `request errored: ${inner?.type ?? "error"}${inner?.message ? `: ${inner.message}` : ""}`.slice(0, 1000);
}

export function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 1000);
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Rounds a share to 3 decimals for prompts. */
export function round3(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0;
}
