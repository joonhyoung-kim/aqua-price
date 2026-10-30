# Direct fish/shrimp category selection — 2026-10-30

Fish and shrimp buttons immediately open only that subtype's categories below the subtype controls. Choosing a category applies the existing filter immediately and collapses the list, with the current category kept in an accessible summary and removable chip. Reopen through the subtype or summary. No care/specification/shopping dialog is opened by this path.
Reuse the existing group tree, count calculation, filter state, history and saved-condition schema. Preserve zero-result selected categories and legacy saved browse-group selections. Gear/plant/snail navigation stays in its existing detailed filter location; selecting them moves the same tree back without duplicating controls.
No collector, data, cron, request budget, storage schema, matching or pricing logic changes.

Validation:
- Full npm test: main 483 total,475 pass,8 Windows skips,0 failures; preview476 total,469 pass,7 Windows skips,0 failures. Per-branch execution counts, not unique combined tests.
- UI builds both passed; UI tests42 passed; diff check clean.
- Actual IAB viewports 1280x800,390x844,360x844: fish-only/shrimp-only categories, direct selection, cross-subtype reset; no full-page horizontal overflow. Document widths1265/375/345 respectively, minimum category button height44px. No shopping/care dialog opened.
- Actual selections: fish guppy382 grouped products /436 options; shrimp red32 grouped products. Current counts are observed, not fixed assertions.
- Enter selected a category; Space reopened native summary; Tab reached first category with visible2px outline. Selected item closes and focus returns to summary.
- Browser Back restored shrimp-all then fish-guppy; high-price sort retained.
- Saved guppy/high-price condition survived reload and restored after switching to shrimp. Individual group chip clear and full reset worked. Existing stored data was not deleted or migrated.
- Submitted query 네온 and high-price sort remained after switching to shrimp; genuine0 results recovered to171 shrimp products by clearing only the query.
- Existing favorite and comparison/storage regressions passed in full suite; actual production retained existing favorite count1 before deployment (verify again after deploy).
- Before and after screenshot originals: task/category-ui-evidence. UI screenshots are local deliverables. Library helper resources were obtained through the official skill; current Python alias could not run and bundled workspace dependencies were unavailable for this thread. No upload started, no Library ID claimed, no direct-upload fallback.

Production verification and exact commits are recorded separately in the task result after deployment.
