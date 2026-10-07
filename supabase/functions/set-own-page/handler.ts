// set-own-page: saves the caller's own URL and brand names for a tracked query, parses the page, and
// re-matches the series' captures from the last 28 days.
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireUser } from "../_shared/http.ts";
import { normalizeUrl } from "../_shared/normalize.ts";
import { MAX_BRANDS, parseOwnPage, rematch } from "../_shared/tracking.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Brand name length after trimming; tracked_queries_brand_names_check enforces the same bounds. */
const MIN_BRAND_LENGTH = 2;
const MAX_BRAND_LENGTH = 60;
const MAX_URL_LENGTH = 2048;

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail("method not allowed", 405);
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("body must be JSON");
  }
  const id = body?.tracked_query_id;
  if (typeof id !== "string" || !UUID.test(id)) return fail("tracked_query_id is required.");

  const db = serviceClient();
  const tq = must(
    await db.from("tracked_queries").select("id, user_id, own_url_key").eq("id", id).maybeSingle(),
    "load tracked query",
  ) as { id: string; user_id: string; own_url_key: string | null } | null;
  if (!tq || tq.user_id !== auth.user.id) return fail("not found", 404);

  const ownUrl = parseOwnUrl(body?.own_url);
  if (ownUrl instanceof Response) return ownUrl;
  const brands = parseBrands(body?.brand_names);
  if (brands instanceof Response) return brands;

  const ownUrlKey = ownUrl ? normalizeUrl(ownUrl) : null;
  must(
    await db.from("tracked_queries").update({ own_url: ownUrl, own_url_key: ownUrlKey, brand_names: brands }).eq("id", id),
    "save own page settings",
  );
  if (ownUrlKey !== tq.own_url_key) {
    // Matches describe the page they were made for: a new (or no) page starts from nothing, and the
    // re-match below rewrites the last 28 days. Rows older than that would otherwise keep the old
    // page's citations as the query's latest.
    must(await db.from("own_matches").delete().eq("tracked_query_id", id), "clear own matches");
  }

  let parsed = false;
  try {
    parsed = (await parseOwnPage(id)) !== null;
  } catch (e) {
    console.error(`parse own page ${ownUrl}:`, e instanceof Error ? e.message : e);
  }
  const matches = await rematch(id);
  return json({ ok: true, parsed, matches });
}

function parseOwnUrl(v: unknown): string | null | Response {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  if (typeof v !== "string" || v.trim().length > MAX_URL_LENGTH) return fail("own_url must be an http(s) URL.");
  try {
    const u = new URL(v.trim());
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) throw new Error();
    return v.trim();
  } catch {
    return fail("own_url must be an http(s) URL.");
  }
}

function parseBrands(v: unknown): string[] | Response {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v) || !v.every((b) => typeof b === "string")) return fail("brand_names must be a list of names.");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v as string[]) {
    const name = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    if (name.length < MIN_BRAND_LENGTH || name.length > MAX_BRAND_LENGTH) {
      return fail(`Brand names are ${MIN_BRAND_LENGTH} to ${MAX_BRAND_LENGTH} characters.`);
    }
    seen.add(key);
    out.push(name);
  }
  if (out.length > MAX_BRANDS) return fail(`Add at most ${MAX_BRANDS} brand names.`);
  return out;
}
