// Footer: wordmark with "· A Legiit product", a links row, and (marketing) a divider and copyright.
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";

export interface FooterProps {
  /** marketing: full footer. app: one compact row. */
  variant?: "marketing" | "app";
  className?: string;
}

const MARKETING_LINKS = [
  { href: "/#how", label: "How It Works" },
  { href: "/#features", label: "What You Get" },
  { href: "/#faq", label: "FAQ" },
  { href: "mailto:help@legiit.com", label: "Support" },
  { href: "/login", label: "Sign In" },
];

const APP_LINKS = [
  { href: "/queries", label: "Queries" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
  { href: "mailto:help@legiit.com", label: "Support" },
];

/** Site footer on white with a top border. */
export function Footer({ variant = "marketing", className }: FooterProps) {
  const links = variant === "marketing" ? MARKETING_LINKS : APP_LINKS;
  return (
    <footer className={cn("border-t border-line bg-white", className)}>
      <div className={cn("mx-auto max-w-5xl px-4 text-sm text-ink-muted", variant === "marketing" ? "py-8" : "py-6")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex flex-wrap items-center gap-2">
            <Logo wordmarkOnly />
            <span>
              · A{" "}
              <a href="https://legiit.com" target="_blank" rel="noreferrer noopener" className="font-medium hover:text-ink">
                Legiit
              </a>{" "}
              product
            </span>
          </p>
          <nav
            aria-label="Footer"
            className="grid w-full grid-cols-3 gap-x-4 gap-y-2 whitespace-nowrap sm:flex sm:w-auto sm:items-center sm:gap-4"
          >
            {links.map((l) =>
              l.href.startsWith("mailto:") ? (
                <a key={l.href} href={l.href} className="hover:text-ink">
                  {l.label}
                </a>
              ) : (
                <Link key={l.href} href={l.href} className="hover:text-ink">
                  {l.label}
                </Link>
              ),
            )}
          </nav>
        </div>
        {variant === "marketing" && (
          <p className="mt-6 border-t border-line pt-5 text-xs">© {new Date().getUTCFullYear()} Superstar SEO LLC. All rights reserved.</p>
        )}
      </div>
    </footer>
  );
}
