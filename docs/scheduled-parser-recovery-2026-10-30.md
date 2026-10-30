# Scheduled parser recovery — 2026-10-30

Scope: recover reproducible parser defects from scheduled run 40999683043 without another full collection, new sources, weaker validation, or larger budgets.

## Reproduced and fixed

Fisherman retailer-49, product 2989, selected item_code P0000EKZ000D.
Two bounded requests (robots + existing public product) on 2026-10-30; detail fetched at 04:36:07.011Z, HTTP 200. Full response retained locally, minimal verbatim fixture committed.
Standalone JSON-LD names “네온 테트라 1마리”, while heading names its parent and the public option selector uses an item code rather than the option label as its value.
The previous selected-variant verifier accepted label-valued selectors only, yielding identity_not_corroborated.
Support exact SKU-valued selectors only when parent/page/SKU/option label/visible base/visible signed adjustment/option data/availability agree. Single primary axis remains required; accessory selectors cannot supply product identity.
Actual captured selection: 800 KRW, 1마리, JSON-LD InStock corroborated by selling/display flags. Stable collector key retained. No automatic publication or refreshed timestamps for other products.
Synthetic bundle tests check 800 + 5,200 = 6,000 and reject wrong/missing delta, another option, disabled selection and ambiguous axes. Existing label-valued Garden behavior remains covered.

## Unresolved evidence and external conditions

- Lara retailer-04 product 8972: scheduled parse failure. Available older ledger has identity_not_corroborated but no failure-time raw HTML. Cannot establish that it is the same selector defect. Pending retryAfter 2026-10-31T04:07:43.845Z respected; no new request, no speculative parser change.
- Fisherman new candidates 4286, 149, 3501, 5208: older ledger records missing JSON-LD or identity mismatch, not current HTML evidence. Pending retryAfter approximately 2026-10-31T03:59–04:00Z respected. Fix is verified for 2989 only; candidates are not declared recovered.
- Chunjane retailer-48 product 4675: response_too_large at the existing 2,000,000-byte ceiling. No complete raw response is available. Preserve limit and reject incomplete data; do not parse prefixes or infer stock. Offline boundary regression proves exact-size acceptance and last-valid-cache preservation for header/stream overflow. Pending retryAfter 2026-10-31T03:56:01.119Z respected.
- Chunjane 2246 HTTP404 and Greenfish connection failure: no retries or stock/deletion inference.
- JD request_limit after 20 requests: existing bounded partial completion, not an error to remove. No cap increase.

No collector timing, cron (UTC00/12), request limits/delays, 18-minute shared budget, cursor/backoff, stock publication or data-only atomic publication logic changed. Current catalog remains 5,299 rows, asOf 2026-10-30T04:12:01.416Z. Next scheduled execution is required to demonstrate recovery in the live collector; offline parser success is not a live collection success.

## Validation

Windows Node 24.21.0 full npm test: main 481 total / 473 pass / 8 platform skips / 0 failures; preview 474 total / 467 pass / 7 platform skips / 0 failures. Counts are per-branch executions, not unique tests. Both npm run build:ui succeeded without generated asset changes. Full captured Fisherman HTML and minimized fixture both parse successfully. No live collection was dispatched.

## Existing option identity follow-up

Live catalog comparison found that Fisherman 2989 already uses the inline ProductGroup parent key plus variant SKU. Newly supported SKU-valued standalone responses now keep that same parent/variant identity, instead of creating a standalone :default key. This applies only to the newly accepted, independently verified SKU-valued selector path; existing label-valued Garden keys remain unchanged. A mocked collectSource integration test preserves all three existing 1/10/50-fish siblings, refreshes only the selected 1-fish option, and asserts no deletion, duplicate identity, or sibling timestamp change. GitHub read confirms no new collection ran between the parser and identity follow-up.
