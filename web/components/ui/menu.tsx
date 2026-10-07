"use client";
// Menu: a dropdown of links, actions and form posts behind a trigger button, with keyboard support.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  /** Navigates to this path. */
  href?: string;
  /** Runs on click (the menu closes first). */
  onSelect?: () => void;
  /** Posts a form to this URL (e.g. "/auth/signout"). */
  formAction?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
}

export interface MenuProps {
  /** Contents of the trigger button. */
  trigger: ReactNode;
  /** Accessible name of the trigger. */
  label: string;
  items: (MenuItem | "separator")[];
  /** Non-interactive block at the top (e.g. the signed-in email). */
  header?: ReactNode;
  /**
   * Which edge of the trigger the menu lines up with. "start-end" opens to the right of a trigger on the
   * left of a phone screen and lines up with the right edge from sm, for triggers that move sides.
   */
  align?: "left" | "right" | "start-end";
  triggerClassName?: string;
  className?: string;
}

const ITEM =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-surface-sunken hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50";

/** Dropdown menu. Arrow keys move, Esc closes and returns focus, outside clicks close. */
export function Menu({ trigger, label, items, header, align = "right", triggerClassName, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const itemsEls = () => Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    itemsEls()[0]?.focus();

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      const els = itemsEls();
      const index = els.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        els[(index + 1) % els.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        els[(index - 1 + els.length) % els.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        els[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        els[els.length - 1]?.focus();
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    menu?.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      menu?.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-full z-40 mt-2 w-56 max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl border border-line bg-white p-1.5 shadow-pop",
            align === "right" ? "right-0" : align === "left" ? "left-0" : "left-0 sm:left-auto sm:right-0",
          )}
        >
          {header && <div className="border-b border-line px-2.5 pb-2 pt-1.5 text-xs text-ink-muted">{header}</div>}
          {header && <div className="h-1.5" />}
          {items.map((item, i) => {
            if (item === "separator") return <div key={`sep-${i}`} role="separator" className="my-1.5 h-px bg-line" />;
            const cls = cn(ITEM, item.tone === "danger" ? "text-bad" : "text-ink");
            const content = (
              <>
                {item.icon && <span className={item.tone === "danger" ? "text-bad" : "text-ink-soft"}>{item.icon}</span>}
                {item.label}
              </>
            );
            if (item.href) {
              return (
                <Link key={i} href={item.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              );
            }
            if (item.formAction) {
              return (
                <form key={i} action={item.formAction} method="post">
                  <button type="submit" role="menuitem" className={cls} disabled={item.disabled}>
                    {content}
                  </button>
                </form>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={cls}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
