// CoverageMatrix: a heatmap table of rows (topics or entities) against the analysed pages, each cell
// covered (brand), partial (brand-soft) or missing (sunken with a dash). Sticky first column; the table
// scrolls inside its own container on narrow screens.
import { cn } from "@/lib/cn";
import { Hint } from "./hint";

export type CellState = "covered" | "partial" | "missing";

export interface MatrixColumn {
  url_key: string;
  ref: string;
  host: string;
  isOwn: boolean;
}

export interface MatrixRow {
  key: string;
  label: string;
  /** State by url_key; pages without a cell show as missing. */
  cells: Record<string, CellState>;
}

const CELL: Record<CellState, string> = {
  covered: "bg-brand text-white",
  partial: "bg-brand-soft text-brand-strong",
  missing: "bg-surface-sunken text-ink-soft",
};

const CELL_NAMES: Record<CellState, string> = { covered: "Covered", partial: "Partly covered", missing: "Missing" };

export function MatrixLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted", className)}>
      {(Object.keys(CELL) as CellState[]).map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[9px]", CELL[s])}>
            {s === "missing" ? "–" : null}
          </span>
          {CELL_NAMES[s]}
        </li>
      ))}
    </ul>
  );
}

export function CoverageMatrix({ rowLabel, rows, columns, className }: { rowLabel: string; rows: MatrixRow[]; columns: MatrixColumn[]; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto [--matrix-label:9.5rem] sm:[--matrix-label:20rem]", className)}>
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        style={{ minWidth: `calc(var(--matrix-label) + ${columns.length * 3.25}rem)` }}
      >
        <colgroup>
          <col className="w-[var(--matrix-label)]" />
          {columns.map((c) => (
            <col key={c.url_key} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-line bg-surface-alt px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-soft"
            >
              {rowLabel}
            </th>
            {columns.map((c, i) => (
              <th key={c.url_key} scope="col" className="border-b border-line bg-surface-alt px-1 py-2 text-center last:pr-4">
                <Hint side="bottom" align={i < columns.length / 2 ? "start" : "end"} focusable content={c.isOwn ? `${c.host} (your page)` : c.host}>
                  <span className={cn("inline-block min-w-8 rounded px-1 text-[11px] font-semibold tabular-nums", c.isOwn ? "text-good" : "text-ink-muted")}>
                    {c.ref}
                  </span>
                </Hint>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-line bg-white px-4 py-1.5 text-left text-[13px] font-medium leading-5 text-ink"
              >
                <span className="line-clamp-3 break-words" title={r.label}>
                  {r.label}
                </span>
              </th>
              {columns.map((c) => {
                const state = r.cells[c.url_key] ?? "missing";
                return (
                  <td key={c.url_key} className="border-b border-line px-1 py-1.5 last:pr-4">
                    <span className={cn("mx-auto flex h-7 w-full max-w-14 items-center justify-center rounded-md text-xs", CELL[state])} title={`${c.ref}: ${CELL_NAMES[state]}`}>
                      {state === "missing" ? <span aria-hidden="true">–</span> : null}
                      <span className="sr-only">
                        {c.ref}: {CELL_NAMES[state]}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
