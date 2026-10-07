"use client";
// ShowMore: shows the first rows of a long server-rendered list or table inside a card, with a button
// to show all. The rows are rendered on the server and passed in as elements.
import { useState, type ReactNode } from "react";
import { Button, ChevronDownIcon, TBody } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

export interface ShowMoreProps {
  /** Rendered rows: <NumberedRow>s for "list", <TR>s for "table", <li>s for "plain" (an unstyled <ol>). */
  items: ReactNode[];
  /** Rows shown before "Show all". Default 25. */
  initial?: number;
  /** Plural noun for the button: "Show all 48 claims". */
  noun: string;
  /** list: a divided <ol> without its own border (sits inside a card). table: a borderless scrolling table. */
  variant?: "list" | "table" | "plain";
  /** Table head (<THead>) for the table variant. */
  head?: ReactNode;
  /** Classes for the list, table scroller or plain wrapper. */
  containerClassName?: string;
  className?: string;
}

export function ShowMore({ items, initial = 25, noun, variant = "list", head, containerClassName, className }: ShowMoreProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, initial);
  const toggle = items.length > initial;

  return (
    <div className={className}>
      {variant === "list" && <ol className={cn("divide-y divide-line", containerClassName)}>{shown}</ol>}
      {variant === "table" && (
        <div className={cn("relative overflow-x-auto", containerClassName)}>
          <table className="w-full border-collapse text-left text-sm">
            {head}
            <TBody>{shown}</TBody>
          </table>
        </div>
      )}
      {variant === "plain" && <ol className={cn("list-none", containerClassName)}>{shown}</ol>}
      {toggle && (
        <div className="flex justify-center border-t border-line px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={expanded}
            iconRight={<ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? `Show top ${formatCount(initial)}` : `Show all ${formatCount(items.length)} ${noun}`}
          </Button>
        </div>
      )}
    </div>
  );
}
