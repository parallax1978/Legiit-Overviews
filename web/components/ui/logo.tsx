// Logo: the gradient sparkle mark plus the "Legiit" + "Overviews" wordmark, for light or dark backgrounds.
import Link from "next/link";
import { cn } from "@/lib/cn";
import { OverviewGlyph } from "./icons";

export interface LogoMarkProps {
  /** sm = 28px (headers), md = 32px (login, footer), lg = 40px. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** The 28/32/40px gradient rounded square with the white sparkle glyph. */
export function LogoMark({ size = "sm", className }: LogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "brand-gradient inline-flex shrink-0 items-center justify-center text-white shadow-glow",
        size === "sm" && "h-7 w-7 rounded-lg",
        size === "md" && "h-8 w-8 rounded-lg",
        size === "lg" && "h-10 w-10 rounded-xl",
        className,
      )}
    >
      <OverviewGlyph className={cn(size === "sm" && "h-4 w-4", size === "md" && "h-[18px] w-[18px]", size === "lg" && "h-5 w-5")} />
    </span>
  );
}

export interface WordmarkProps {
  /** light = ink + brand on white; dark = white + brand-soft on plum. */
  tone?: "light" | "dark";
  size?: "sm" | "md";
  className?: string;
}

/** "Legiit" + "Overviews" in bold tight type. */
export function Wordmark({ tone = "light", size = "sm", className }: WordmarkProps) {
  return (
    <span
      className={cn(
        "font-bold tracking-tight",
        size === "sm" ? "text-[15px]" : "text-base",
        tone === "light" ? "text-ink" : "text-white",
        className,
      )}
    >
      Legiit<span className={tone === "light" ? "text-brand" : "text-brand-soft"}>Overviews</span>
    </span>
  );
}

export interface LogoProps {
  href?: string;
  tone?: "light" | "dark";
  size?: "sm" | "md";
  /** Hide the mark and show only the wordmark (footer). */
  wordmarkOnly?: boolean;
  className?: string;
}

/** Mark plus wordmark, linked (to "/" by default). */
export function Logo({ href = "/", tone = "light", size = "sm", wordmarkOnly = false, className }: LogoProps) {
  return (
    <Link href={href} aria-label="Legiit Overviews" className={cn("inline-flex items-center gap-2", className)}>
      {!wordmarkOnly && <LogoMark size={size} />}
      <Wordmark tone={tone} size={size} />
    </Link>
  );
}
