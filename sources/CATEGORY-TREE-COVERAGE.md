# Public livestock menu traversal

The collector preserves observed category hrefs and their menu ancestry for each registered seller. It merges newly observed aquatic subcategories into the traversal queue; it does not generate category IDs or page numbers. A category page contributes only normal listing links. Recommended/new-product blocks are excluded from listing counts.

Scope is fish, ornamental shrimp, aquatic plants and aquatic snails. Feed, packaging, supplies and unsupported animals are excluded by explicit parent-menu and detail evidence. Ambiguous menu nodes and ambiguous detail products remain in review. A fish-named link under a feed menu is not a fish category. Mixed livestock parents require detail classification.

Each category keeps its actual next-page href, visited URLs, seen seller product IDs, displayed count when present and terminal-page evidence. Page and candidate budgets never mark an unfinished category complete. Category turns rotate; fish detail turns are weighted while shrimp, snails, plants and mixed candidates retain turns. Fish detail candidates also rotate between category queues.

The existing scheduled live mode now resumes menu discovery as well as all/reconcile mode, including sellers with no registered product URL. This behavior is tested through the real CLI with mock HTTP only; natural scheduled execution remains unverified. The normal per-source request ceiling remains 20 and the global execution deadline remains 18 minutes. This validation round used 10 requests per seller. Sangaqua additionally used 3 standard access-diagnostic requests, so its total was 13, within the registered ceiling. Robots restrictions and crawl delays, refusal quarantine and retry holds remain enforced.

Source rotation persists the next seller ID, which survives changes in registry ordering. Tree, page and detail queues persist both in private state and the published collector checkpoint. Successful source checkpoints now publish partial data and status immediately, so an interrupted process can retain its completed sellers without claiming a finished run. A cold cache can restore tree and detail queues from public status.

The administrator view reports discovered/allowed/excluded/review menu counts, visited pages, pending categories/page URLs, verified/pending/review products and terminal categories. Full retailer totals and full menu completeness remain unknown. Public HTML without an observed usable pagination link or verified terminal evidence cannot be marked complete; unsupported adapters remain explicit blockers.

## Current validation

The original 547 products remain. The resulting preview contains 632 products, including 387 fish. Public cached navigation yielded 339 additional reviewed fish links after excluding 39 ambiguous or supply links, plus Sangaqua's observed allowed menu tree. The first general pass preserved 12 seller checkpoints before its process ended without a final report; the exact termination cause is unknown. Results were recovered from those checkpoints, and the next seller is retailer-15. Sangaqua separately verified seven fish and one packaging supply, bringing its preserved snapshot to 15 products. Its parent livestock category displays 602 products across supported and unsupported animals; this is not a fish count or proof of full collection.

Sangaqua's old combined `HTTP/tunnel 403` reason did not retain an identifiable origin response. User-authorized reassessment of the same official hostname returned 200 for robots, category page 1 and the actual linked page 2. No alternate host, login, proxy or denial bypass was used. The past failure origin remains unknown. Fresh refusals stop the source immediately.

Detailed seller rows, observed page counts, remaining candidates and blockers are in `dist/fish-coverage-report.json`, `dist/collector-status.json` and `dist/admin/status.json`. No source is reported as fully collected. Scheduled natural execution is still unverified; main and its existing scheduling workflow are preserved.
