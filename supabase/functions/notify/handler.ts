// notify (cron, every 15 min): writes one daily digest per user after 13:00 UTC, then emails
// notifications that have not been emailed yet through Resend (when RESEND_API_KEY is set).
import { must, serviceClient } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { json, requireCron } from "../_shared/http.ts";
import { selectAll } from "../_shared/tracking.ts";
import type { SeriesMetrics } from "../_shared/types.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Digests are written once a day from this UTC hour. */
export const DIGEST_HOUR_UTC = 13;
/** Notifications older than this are never emailed. */
const EMAIL_WINDOW_MS = 3 * DAY_MS;
const EMAILS_PER_RUN = 50;
/** Per user per run, oldest first; the rest wait for the next run. */
export const EMAILS_PER_USER_PER_RUN = 20;
const DIGEST_USERS_PER_RUN = 200;
const TIME_BUDGET_MS = 100_000;
const RESEND_URL = "https://api.resend.com/emails";

type Fetch = typeof fetch;

export interface NotifyOptions {
  now?: Date;
  /** Limits the run to these users (tests). */
  userIds?: string[];
  /** HTTP client for Resend (tests). */
  fetch?: Fetch;
}

export interface NotifySummary {
  digests: number;
  emailed: number;
  email_failed: number;
  email_enabled: boolean;
}

interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
}

interface QueryRow {
  id: string;
  user_id: string;
  series_id: string;
  display_keyword: string;
  series: { device: string } | null;
}

export async function runNotify(opts: NotifyOptions = {}): Promise<NotifySummary> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const summary: NotifySummary = { digests: 0, emailed: 0, email_failed: 0, email_enabled: !!env.resendApiKey() };
  if (now.getUTCHours() >= DIGEST_HOUR_UTC) summary.digests = await writeDigests(now, opts.userIds ?? null, started);
  if (summary.email_enabled) await sendEmails(now, opts.userIds ?? null, opts.fetch ?? fetch, summary, started);
  return summary;
}

// ------------------------------------------------------------------ digests

const EVENT_TEXT: Record<string, string> = {
  first_seen: "cited for the first time",
  regained: "cited again",
  lost: "dropped out of the overview",
  brand_mention: "your brand was named",
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function countsLine(label: string, claims: number, entities: number, sources: number): string | null {
  const parts = [
    claims ? plural(claims, "claim") : null,
    entities ? plural(entities, "entity", "entities") : null,
    sources ? plural(sources, "source") : null,
  ].filter(Boolean);
  return parts.length ? `${label}: ${parts.join(", ")}.` : null;
}

/** One digest line for a query: renders, presence, what was added or dropped, and citation events. */
export function digestLine(q: { display_keyword: string; device: string }, m: SeriesMetrics, events: string[]): string {
  const sum = (key: "claims_added" | "claims_dropped" | "entities_added" | "entities_dropped" | "citations_added" | "citations_dropped") =>
    m.daily.reduce((n, d) => n + d[key].length, 0);
  const parts = [`“${q.display_keyword}” (${q.device}): ${plural(m.renders, "capture")}`];
  parts[0] += m.renders ? `, overview on ${m.present} (${Math.round((m.presence_rate ?? 0) * 100)}%).` : ".";
  const added = countsLine("New", sum("claims_added"), sum("entities_added"), sum("citations_added"));
  const dropped = countsLine("Dropped", sum("claims_dropped"), sum("entities_dropped"), sum("citations_dropped"));
  if (added) parts.push(added);
  if (dropped) parts.push(dropped);
  if (!added && !dropped && m.renders) parts.push("No changes in claims, entities or sources.");
  if (events.length) parts.push(`Your page: ${events.join(", ")}.`);
  return parts.join(" ");
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function writeDigests(now: Date, userScope: string[] | null, started: number): Promise<number> {
  const db = serviceClient();
  // Paged: PostgREST caps a response at 1000 rows, which would leave later users without a digest.
  const queries = await selectAll<QueryRow>((from, to) => {
    let q = db.from("tracked_queries").select("id, user_id, series_id, display_keyword, series(device)").neq("status", "paused");
    if (userScope) q = q.in("user_id", userScope);
    return q.order("created_at").order("id").range(from, to);
  });
  if (!queries.length) return 0;

  const byUser = new Map<string, QueryRow[]>();
  for (const row of queries) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  const today = startOfDay(now).toISOString();
  const done = new Set<string>();
  const users = [...byUser.keys()];
  for (let i = 0; i < users.length; i += 100) {
    const rows = must(
      await db.from("notifications").select("user_id").eq("kind", "digest").gte("created_at", today).in("user_id", users.slice(i, i + 100)),
      "load digests",
    ) as { user_id: string }[];
    for (const r of rows) done.add(r.user_id);
  }

  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const metricsCache = new Map<string, SeriesMetrics>();
  let written = 0;
  for (const userId of users.filter((u) => !done.has(u)).slice(0, DIGEST_USERS_PER_RUN)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const mine = byUser.get(userId)!;
      const events = must(
        await db.from("citation_events").select("tracked_query_id, kind, created_at")
          .in("tracked_query_id", mine.map((x) => x.id)).gte("created_at", since).lt("created_at", now.toISOString())
          .eq("held_for_platform_event", false).order("created_at"),
        "load citation events",
      ) as { tracked_query_id: string; kind: string }[];
      const lines: string[] = [];
      for (const query of mine) {
        let m = metricsCache.get(query.series_id);
        if (!m) {
          m = must(
            await db.rpc("series_metrics", { p_series_id: query.series_id, p_from: since, p_to: now.toISOString() }),
            "series_metrics",
          ) as SeriesMetrics;
          metricsCache.set(query.series_id, m);
        }
        const evs = events.filter((e) => e.tracked_query_id === query.id).map((e) => EVENT_TEXT[e.kind] ?? e.kind);
        if (!m.renders && !evs.length) continue;
        lines.push(digestLine({ display_keyword: query.display_keyword, device: query.series?.device ?? "desktop" }, m, evs));
      }
      if (!lines.length) continue;
      const day = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      must(
        await db.from("notifications").insert({
          user_id: userId,
          kind: "digest",
          title: `Your AI Overview digest for ${day}`,
          body: lines.join("\n"),
          link: "/queries",
          created_at: now.toISOString(),
        }),
        "insert digest",
      );
      written++;
    } catch (e) {
      console.error(`digest for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return written;
}

// ------------------------------------------------------------------ email

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const CTA: Record<string, string> = {
  first_seen: "View tracking",
  regained: "View tracking",
  lost: "View tracking",
  brand_mention: "View tracking",
  report_ready: "Open the brief",
  platform_event: "See what changed",
  digest: "Open your queries",
};

/** The HTML email for one notification: white card, Inter, a purple pill button to the app. */
export function emailHtml(n: Pick<NotificationRow, "kind" | "title" | "body" | "link">, appUrl: string): string {
  const font = `Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  const paragraphs = n.body.split(/\n+/).filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#334155;">${escapeHtml(p)}</p>`).join("");
  const button = n.link
    ? `<tr><td style="padding:8px 28px 28px;"><a href="${escapeHtml(appUrl.replace(/\/$/, "") + n.link)}" style="display:inline-block;background:#8a12dc;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;line-height:20px;padding:10px 20px;border-radius:9999px;">${CTA[n.kind] ?? "Open Legiit Overviews"}</a></td></tr>`
    : `<tr><td style="padding:0 0 16px;"></td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(n.title)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f7f7fb;font-family:${font};color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.05);">
<tr><td style="padding:24px 28px 4px;font-size:16px;font-weight:700;letter-spacing:-0.2px;color:#0f172a;">Legiit <span style="color:#8a12dc;">Overviews</span></td></tr>
<tr><td style="padding:12px 28px 4px;font-size:18px;font-weight:600;line-height:26px;color:#0f172a;">${escapeHtml(n.title)}</td></tr>
<tr><td style="padding:8px 28px 4px;">${paragraphs}</td></tr>
${button}
</table>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#94a3b8;">You get these emails because you track queries on Legiit Overviews.</p>
</td></tr></table>
</body></html>`;
}

async function sendEmails(now: Date, userScope: string[] | null, http: Fetch, summary: NotifySummary, started: number): Promise<void> {
  const db = serviceClient();
  const key = env.resendApiKey()!;
  const appUrl = env.appUrl();
  const rows = must(
    await db.rpc("notifications_to_email", {
      p_since: new Date(now.getTime() - EMAIL_WINDOW_MS).toISOString(),
      p_per_user: EMAILS_PER_USER_PER_RUN,
      p_limit: EMAILS_PER_RUN,
      p_user_ids: userScope,
    }),
    "load notifications",
  ) as NotificationRow[];

  const emails = new Map<string, string | null>();
  for (const n of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    if (!emails.has(n.user_id)) {
      const { data, error } = await db.auth.admin.getUserById(n.user_id);
      emails.set(n.user_id, error ? null : data.user?.email ?? null);
    }
    const to = emails.get(n.user_id);
    if (!to) continue;
    const res = await http(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `notification-${n.id}` },
      body: JSON.stringify({
        from: env.emailFrom(),
        to: [to],
        subject: n.title,
        html: emailHtml(n, appUrl),
        text: `${n.title}\n\n${n.body}${n.link ? `\n\n${appUrl.replace(/\/$/, "")}${n.link}` : ""}`,
      }),
    });
    if (res.ok) {
      await res.body?.cancel();
      must(await db.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id).is("emailed_at", null), "mark emailed");
      summary.emailed++;
      continue;
    }
    summary.email_failed++;
    console.error(`resend ${n.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    if (res.status === 429) break;
  }
}

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  return json(await runNotify());
}
