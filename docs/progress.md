# Progress

Built and verified locally against the mock DataForSEO and Anthropic server (`mocks/`): 261 pgTAP tests, 117 Edge Function tests, 23 mock tests, the web build, and the end-to-end demo (`scripts/demo.ts`) all pass on a fresh database. What still needs the real APIs is listed per step.

- [x] 1. Schema
- [ ] 2. DataForSEO client and parser: built; fixture tests pass. Still to do: capture 30 real Live responses into `_shared/fixtures/` and run the parser on them.
- [x] 3. Add query
- [ ] 4. Scheduled capture: built; duplicates and `same_as` verified. Still to do: watch a real series capture 8 times in 24 hours.
- [x] 5. Extraction and matching (verified with the mock Claude; first real batch to be checked by hand)
- [ ] 6. Consolidation and accuracy: merging verified. Still to do: the 200-pair labelled set and the matching accuracy script against real captures.
- [x] 7. Metrics
- [x] 8. Cited pages
- [x] 9. Matrix and brief
- [x] 10. App
- [x] 11. Tracking and draft scorer
- [x] 12. Platform events and alerts
- [ ] 13. Billing (later)
- [ ] Deploy: create the Supabase project, push migrations, deploy functions, set secrets and Vault values, deploy `web/` to Vercel (`docs/deploy.md`). Needs `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY`, `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` in the environment.
