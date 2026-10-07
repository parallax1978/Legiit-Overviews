"use client";
// Client pieces of the app header: nav links with active state, the notifications link and the account menu.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BellIcon, ChevronDownIcon, LogOutIcon, SettingsIcon } from "./icons";
import { Menu } from "./menu";

function useActive(href: string): boolean {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Header nav link: ink-muted, ink and medium weight when its section is open. */
export function HeaderNavLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const active = useActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("transition-colors hover:text-ink", active ? "font-medium text-ink" : "text-ink-muted", className)}
    >
      {children}
    </Link>
  );
}

/** "Notifications" with an unread count badge; a bell icon on phones. */
export function NotificationsLink({ unreadCount }: { unreadCount: number }) {
  const active = useActive("/notifications");
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex items-center gap-1.5 transition-colors hover:text-ink",
        active ? "font-medium text-ink" : "text-ink-muted",
      )}
    >
      <BellIcon className="sm:hidden" />
      <span className="hidden sm:inline">Notifications</span>
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-none text-white tabular-nums",
            "absolute -right-2.5 -top-2 sm:static",
          )}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

/** Avatar button opening Settings and Sign out. */
export function AccountMenu({ email }: { email: string }) {
  const initial = (email.trim()[0] ?? "?").toUpperCase();
  return (
    <Menu
      label="Account"
      triggerClassName="inline-flex items-center gap-1 rounded-full text-ink-muted transition-colors hover:text-ink"
      trigger={
        <>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-faint text-xs font-bold text-brand-strong">
            {initial}
          </span>
          <ChevronDownIcon className="hidden h-3.5 w-3.5 sm:block" />
        </>
      }
      header={
        <>
          <span className="block">Signed in as</span>
          <span className="block truncate font-medium text-ink">{email || "your account"}</span>
        </>
      }
      items={[
        { label: "Settings", href: "/settings", icon: <SettingsIcon /> },
        "separator",
        { label: "Sign Out", formAction: "/auth/signout", icon: <LogOutIcon /> },
      ]}
    />
  );
}
