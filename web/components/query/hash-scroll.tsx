"use client";
// HashScroll: scrolls to the element named by the URL hash once the tab's content has rendered. A link
// from another tab (a page chip to /pages#page-…, "15 more" to /patterns#daily) navigates while the
// tab's loading state shows, so Next.js has nothing to scroll to yet; this runs when the content mounts.
import { useEffect } from "react";

function scrollToHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

export function HashScroll() {
  useEffect(() => {
    // After paint, so layout (fonts, client components) has settled.
    const frame = requestAnimationFrame(scrollToHash);
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);
  return null;
}
