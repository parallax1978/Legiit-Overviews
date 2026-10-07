// Table primitives: a bordered scroll container plus styled thead/tbody/tr/th/td.
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Card-styled wrapper that scrolls horizontally on narrow screens, around a full-width table. */
export function Table({ className, wrapperClassName, ...props }: HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-card border border-line bg-white shadow-card", wrapperClassName)}>
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

/** Table head row group with a tinted background. */
export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-line bg-surface-alt", className)} {...props} />;
}

/** Table body with dividers between rows. */
export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Hover tint for clickable rows. */
  interactive?: boolean;
}

/** Table row. */
export function TR({ interactive = false, className, ...props }: TRProps) {
  return <tr className={cn(interactive && "cursor-pointer transition-colors hover:bg-surface-alt", className)} {...props} />;
}

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
}

/** Header cell: uppercase 11px tracked ink-muted. */
export function TH({ align = "left", className, ...props }: THProps) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
  /** Muted text. */
  muted?: boolean;
  /** Tabular numbers, right aligned by default. */
  numeric?: boolean;
}

/** Body cell. */
export function TD({ align, muted = false, numeric = false, className, ...props }: TDProps) {
  const a = align ?? (numeric ? "right" : "left");
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        muted ? "text-ink-muted" : "text-ink",
        numeric && "tabular-nums whitespace-nowrap",
        a === "right" && "text-right",
        a === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}
