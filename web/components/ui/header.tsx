// Header: the sticky white 52px bar, in a marketing variant (section links + CTA) and an app variant
// (Queries, Notifications with unread count, account menu).
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ButtonLink } from "./button";
import { AccountMenu, HeaderNavLink, NotificationsLink } from "./header-parts";
import { Logo } from "./logo";

export type HeaderProps =
  | {
      variant: "marketing";
      /** Signed-in visitors get "Open App" instead of "Sign In" and the trial CTA. */
      signedIn: boolean;
      className?: string;
    }
  | {
      variant: "app";
      email: string;
      unreadCount: number;
      className?: string;
    };

/** White 90% header with backdrop blur, content constrained to max-w-5xl. */
export function Header(props: HeaderProps) {
  return (
    <header className={cn("sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur", props.className)}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Logo href={props.variant === "app" ? "/queries" : "/"} />
        {props.variant === "marketing" ? (
          <nav aria-label="Main" className="flex items-center gap-5 text-sm">
            <Link className="hidden text-ink-muted hover:text-ink sm:inline" href="/#how">
              How It Works
            </Link>
            <Link className="hidden text-ink-muted hover:text-ink sm:inline" href="/#features">
              What You Get
            </Link>
            <Link className="hidden text-ink-muted hover:text-ink sm:inline" href="/#faq">
              FAQ
            </Link>
            {props.signedIn ? (
              <ButtonLink href="/queries" size="sm" glow>
                Open App
              </ButtonLink>
            ) : (
              <>
                <Link className="hidden text-ink-muted hover:text-ink sm:inline" href="/login">
                  Sign In
                </Link>
                <ButtonLink href="/login?next=%2Fqueries%2Fnew" size="sm" glow>
                  Start Tracking
                </ButtonLink>
              </>
            )}
          </nav>
        ) : (
          <nav aria-label="Main" className="flex items-center gap-4 text-sm sm:gap-5">
            <HeaderNavLink href="/queries">Queries</HeaderNavLink>
            <NotificationsLink unreadCount={props.unreadCount} />
            <AccountMenu email={props.email} />
          </nav>
        )}
      </div>
    </header>
  );
}
