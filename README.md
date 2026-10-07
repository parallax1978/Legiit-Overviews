# Legiit Overviews

Captures a Google AI Overview every 3 hours, counts exactly what keeps showing up with evidence for every number, reverse-engineers the pages it cites, writes a brief for a page that can get cited, and tracks whether yours does. Built on DataForSEO, the Claude API and Supabase; the app runs on Vercel.

| File | What it is |
|---|---|
| `PLAN.md` | The plan: product, capture, analysis, brief, tracking, schema, functions, what the founder provides, the sessions for Claude Code, costs, risks |
| `CLAUDE.md` | Instructions for Claude Code sessions |
| `docs/progress.md` | Session checklist |
| `docs/design-spec.md` | The everyday-user surface: screens, copy, vocabulary |
| `docs/architecture.md` | Interfaces between modules |
| `docs/brand.md` | Design system, matching legiitkeywords.com |
| `docs/deploy.md` | Deploying to Supabase and Vercel |
| `docs/local-development.md` | Running locally |
| `docs/source-thread.md` | The X thread the product automates |
| `docs/research/` | Background research (vendors, competitors, AI Overview studies); reference only |

State on 2026-10-07: the backend and app are built and pass their tests against a local mock; nothing has run against the real APIs or been deployed. The next step is `PLAN.md` section 12, session 1, once the DataForSEO credentials are in the environment (section 11).

To start: open a Claude Code session here and say "do session 1".
