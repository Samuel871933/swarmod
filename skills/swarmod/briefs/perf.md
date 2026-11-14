# Performance checklist — paste into every performance agent's brief

For each item: a finding with path:line and the measured or estimated impact, or "not measured".
1. Baseline first: the exact command and its numbers. No change without a measurement before and after, same conditions.
2. Keep a change only if the gain beats run-to-run variance; list reverted attempts in the report.
3. Hot paths: N+1 queries, a query or fetch inside a loop, sequential awaits that could run in parallel.
4. Data: missing index on a filtered or joined column (EXPLAIN before and after), unbounded queries, no pagination.
5. Caching: the key includes every input that changes the result (user, tenant, locale); the staleness window is stated.
6. Memory: unbounded maps, caches or listeners; resources never closed or disposed.
7. Web budgets: initial JS < 200 KB gzipped, LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; LCP image not lazy; media with width/height.
8. Label every number by source (measured / lab / estimated); never mix them.
