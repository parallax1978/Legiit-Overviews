# Local development

Everything runs locally: the Supabase stack in Docker, and one mock server on the host that stands in for DataForSEO and the Anthropic API. No real API is called and nothing is billed.

## 1. Stack

```sh
npx supabase start          # Postgres, Auth, Storage, edge runtime (serves supabase/functions), Studio, Mailpit
```

API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `:54323`, Mailpit `:54324`.

Two gitignored env files point the code at the mock:

| File | Used by | Mock URLs |
|---|---|---|
| `supabase/functions/.env` | Edge Functions in the edge runtime container | `DATAFORSEO_BASE_URL=http://host.docker.internal:8787`, `ANTHROPIC_BASE_URL=http://host.docker.internal:8787/anthropic` |
| `supabase/functions/.env.test` | Deno tests and scripts on the host | `http://127.0.0.1:8787` and `http://127.0.0.1:8787/anthropic` |

Both also hold `DATAFORSEO_LOGIN`/`PASSWORD` (any value), `ANTHROPIC_API_KEY` (any value), `POSTBACK_SECRET`, `CRON_SECRET` (same values in both files) and `FUNCTIONS_PUBLIC_URL=http://127.0.0.1:54321/functions/v1`, where the mock sends DataForSEO postbacks.

Serve the functions with the env file (this restarts the edge runtime with those secrets; keep it running):

```sh
npx supabase functions serve --env-file supabase/functions/.env
```

If functions answer 503 with `failed to bootstrap runtime ... Failed loading https://registry.npmjs.org/...`, the edge runtime container can't download npm packages (for example behind a TLS-intercepting proxy). Run any host test once so Deno caches the packages, then copy the host cache into the runtime's cache volume:

```sh
cp -a ~/.cache/deno/npm/registry.npmjs.org /var/lib/docker/volumes/supabase_edge_runtime_legiit-overviews/_data/npm/
```

A variable already exported in your shell wins over `--env-file`, and `supabase start` passes it into the edge runtime too. If `ANTHROPIC_BASE_URL` is exported (some environments set it to `https://api.anthropic.com`), unset it before `supabase start` and before host runs, or set it to the mock URL.

## 2. Mock server

```sh
deno run -A mocks/server.ts
```

Listens on `0.0.0.0:8787`, so the edge runtime reaches it as `host.docker.internal:8787`.

| Route | Does |
|---|---|
| `POST /v3/serp/google/organic/live/advanced` | SERP with AI Overview for (keyword, location, language, device) now |
| `POST /v3/serp/google/organic/task_post` | Queues tasks (status 20100); after a delay POSTs each result gzip-compressed to its `postback_url` (`$id` and `$tag` are substituted) |
| `GET /v3/serp/google/organic/task_get/advanced/{id}` | The stored result, 40602 while queued, 40400 for unknown ids |
| `POST /v3/dataforseo_labs/google/related_keywords/live` | Seed plus sibling keywords, flagged with `ai_overview` in `serp_info.serp_item_types` |
| `POST /v3/on_page/content_parsing/live` | `page_content` and `page_as_markdown` for any URL |
| `POST /anthropic/v1/messages` | A Message whose text is schema-valid JSON for the task (see below) |
| `POST /anthropic/v1/messages/batches`, `GET .../{id}`, `GET .../{id}/results` | Message Batches; `results_url` is built from the request's Host header |
| `GET /__mock/state` | Counters: tasks, postbacks sent and failed, batches, requests per Claude task |

| Variable | Default | Effect |
|---|---|---|
| `MOCK_PORT` | `8787` | Port |
| `MOCK_POSTBACK` | on | `off` stops postbacks (exercises the sweeper and `task_get`) |
| `MOCK_POSTBACK_DELAY_MS` | `1500` | Time until a posted task is ready and its postback is sent |
| `MOCK_BATCH_DELAY_MS` | `0` | Time a batch stays `in_progress` |
| `MOCK_FAIL_RATE` | `0` | Share of batch results returned as `errored` |
| `MOCK_QUIET` | off | `1` silences request logs |

State is in memory; restarting the mock forgets queued tasks and batches.

**SERPs** (`mocks/scenario.ts`) are deterministic per series and 3-hour slot. "best form builder" is curated (Jotform, Typeform, Google Forms, Tally written as "Tally" or "Tally Forms", Fillout, Paperform and four rotating tools; Zapier, Forbes, G2, a Reddit thread, a YouTube video, vendor pages and blogs as sources); any other keyword gets generated tools and sources built the same way. About 10% of slots have no overview and about 30% repeat the previous overview exactly. Keywords containing "login" or starting with "no overview" never show one. Every quoted passage exists verbatim in the page content parsing returns for its URL.

**Claude** (`mocks/fake-claude.ts`) recognises the task from the output schema's property names and answers from the JSON between `<data>` tags with simple text rules: atomic claims per sentence matched to known claims by word overlap, entities from list heads and product names, prefix merges such as "Tally Forms" into "Tally" for consolidation, page tags from headings and numbers, and a brief that only uses refs present in its input.

## 3. Demo data

With the stack and the mock running:

```sh
deno run -A --env-file=supabase/functions/.env.test scripts/demo.ts [--days 8] [--keyword "best form builder"]
```

It signs in as `demo@legiit.local` / `demo-password-123` (created on first run), adds the keyword (US, English, desktop), back-fills one capture per 3-hour slot for the last N days through `dataforseo-postback` exactly as DataForSEO delivers them, runs `submit-batches` and `collect-batches` until extraction is done, runs `build-reports` until the report is ready, calls `detect-platform-events` for each day, sets an own page (a recurring cited page; for "best form builder" the Jotform blog post with brand "Jotform"), adds "no overview test keyword" so a watching query exists, and prints a summary. Re-running skips slots that already have captures.

## 4. Web app

```sh
cd web && npm install && cp .env.example .env.local   # fill in the anon key from `npx supabase status`
npm run dev                                           # http://localhost:3000, sign in as demo@legiit.local
```

Magic-link emails land in Mailpit at http://127.0.0.1:54324.

## 5. Tests and checks

```sh
deno test -A --config mocks/deno.json mocks/                       # scenario, fake Claude, mock server with the real clients
deno check --config mocks/deno.json mocks/*.ts && deno lint --config mocks/deno.json mocks/
deno check --config scripts/deno.json scripts/demo.ts
cd supabase/functions && deno test -A --env-file=.env.test <files>  # function and module tests
npx supabase test db                                                # pgTAP: metrics and RLS
cd web && npx tsc --noEmit && npm run lint && npm run build         # app
```
