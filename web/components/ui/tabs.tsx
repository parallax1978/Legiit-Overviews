"use client";
// Tabs: a link-based tab bar with a brand underline on the active tab; scrolls sideways on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  href: string;
  label: ReactNode;
  /** Optional count or chip after the label. */
  badge?: ReactNode;
  /** Active only on an exact path match (use for the index tab). Default: active on the path and below. */
  exact?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Accessible name for the nav, e.g. "Query sections". */
  label: string;
  className?: string;
}

function isActive(pathname: string, tab: TabItem): boolean {
  const href = tab.href.split("?")[0].replace(/\/$/, "") || "/";
  if (tab.exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation tabs as links; the current route gets aria-current="page". */
export function Tabs({ tabs, label, className }: TabsProps) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  return (
    <nav aria-label={label} className={cn("-mx-4 border-b border-line px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "border-brand text-ink" : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {tab.label}
                {tab.badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
