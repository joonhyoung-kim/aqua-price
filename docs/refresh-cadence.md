# Scheduled refresh

The active `catalog-refresh.yml` starts one combined `all` run at UTC 00:00 and
12:00 (Korea 09:00 and 21:00). GitHub may delay or omit a scheduled delivery;
these are planned start times, not guarantees of website publication time.

Both livestock and supplies use the existing shared 18-minute execution budget,
source request caps, pacing, robots checks, refusal holds and rotating resume
cursors. A run does not verify every product. Separate automated reconciliation
is no longer scheduled; explicit manual scopes remain available. Deletion stays
disabled. The configured live and gear gate intervals are both 12 hours. Combined
runs use the faster of those configured intervals, anchored to UTC midnight.
Completed-run time is not used to delay the next slot. A repeated scheduled
attempt in the same slot is skipped; manual dispatch retains its explicit bypass.

`source-snapshot.snapshot_at_utc` / `catalog.asOf` are the cutoff for the generated
publication. Only an accepted changed projection advances that cutoff to its
generation time. Individual price/stock observation timestamps are retained;
cache-only, failed and identical updates do not renew them. Future observations
and a publication clock moving behind the prior cutoff fail closed.

Validated data still publishes to main and preview atomically, with pinned branch
bases and no preview feature merge. Partial source failures retain last-good
products and refusal evidence; a fatal or incomplete run cannot publish. The
workflow still reports source failures even if its valid partial data was posted.
