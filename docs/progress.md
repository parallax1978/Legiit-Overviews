# Progress

The first build (PLAN.md sections 1 to 10) is complete and was verified only against the local mock of DataForSEO and the Anthropic API: 261 pgTAP tests, 117 Edge Function tests, 23 mock tests, the web build and the end-to-end demo pass on a fresh local database (last full run 2026-10-07; in a sandbox without Docker the 46 database-backed function tests cannot run, the other 71 and the web checks pass). Nothing has called a real API or been deployed.

Audits on 2026-10-07 rated every area keep-with-fixes. The fixes and the path to a live product on real data are PLAN.md section 12. Tick a session when its real-data check passes.

- [ ] 1. Real DataForSEO: smoke script, 30 real fixtures, parser and client fixes (`include_serp_info`, depth 10, JavaScript off by default, timeouts, cost recorded, pending codes)
- [ ] 2. Real Claude: smoke script, one real batch, section 7 fixes, equivalence rules, measured tokens written into section 13
- [ ] 3. Supabase project live: migrations (reference data, Vault, guarded alter role, `function_runs`, retention, caps, cost and usage), `scripts/deploy.ts`, demo script guarded, 10 real searches capturing through the real postback
- [ ] 4. App live on Vercel: domain, Resend, sign-in from a non-team address, security headers, brand colour fixes, `docs/brand.md` corrected
- [ ] 5. Everyday-user surface, part 1: vocabulary, evidence disclosure, searches list, add-search form, search index with the six steps (`docs/design-spec.md`)
- [ ] 6. Everyday-user surface, part 2: the five detail pages, notifications, marketing page, old tabs and `n=` removed
- [ ] 7. First real week: capture cadence, dedupe, consolidation, reports and briefs verified on real series; 200-pair accuracy set at 90% or better; section 13 replaced with measured costs; extraction model decided
- [ ] 8. Launch hardening: health check and alerts, heartbeat, batch budget, retention verified, docs rewritten real-first, launch checklist
- [ ] 9. Billing (later)

Needs in the environment before each session: see PLAN.md section 11.
