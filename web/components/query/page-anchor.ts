// Anchors for the page cards on the Pages tab, so other tabs can link to /queries/<id>/pages#page-<slug>.

/** The element id of a page card: "page-" plus a slug of the url_key. */
export function pageAnchorId(urlKey: string): string {
  const slug = urlKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `page-${slug || "page"}`;
}

/** Link to a page card on the Pages tab of a tracked query. */
export function pageAnchorHref(trackedQueryId: string, urlKey: string): string {
  return `/queries/${trackedQueryId}/pages#${pageAnchorId(urlKey)}`;
}

/** Host and path of a url_key or URL for display: "zapier.com/blog/best-form-builder". */
export function displayUrl(urlOrKey: string): string {
  const s = urlOrKey.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
