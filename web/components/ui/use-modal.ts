"use client";
// useModal: shared modal behaviour for Drawer and Dialog (focus trap, Esc, scroll lock, focus return).
import { useEffect, useEffectEvent, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

/**
 * Wires modal behaviour to the returned ref while `open` (and `ready`, i.e. mounted) are true:
 * focuses the [data-autofocus] element or the panel, traps Tab inside, closes on Esc,
 * locks page scroll, and returns focus to the previously focused element on close.
 */
export function useModal<T extends HTMLElement>(open: boolean, ready: boolean, onClose: () => void): RefObject<T | null> {
  const panelRef = useRef<T>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open || !ready) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    // An element marked data-autofocus gets focus; otherwise the panel itself, so screen readers announce
    // the dialog's title and Tab starts at the close button.
    const initial = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    initial.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (!panel) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === panel || !panel.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !panel.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, ready]);

  return panelRef;
}
