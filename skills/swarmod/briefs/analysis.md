# Data analysis / data mining checklist — paste into every agent that analyses data or builds a model

Report each item with the number or the command output that shows it.
1. Provenance: each dataset's source, date range, row count and one sample row. Never modify raw data; write derived files.
2. Quality: nulls, duplicates, outliers, units and time zones for every column used; say what you dropped and how many rows.
   Hold the item fixed (same sku/product) and compare each amount across the finest segments (store x month, source): a constant ratio such as x1.2 or x100 in one segment is a tax, unit or currency change. Medians over mixed items hide it.
3. Row counts before and after every join and filter; an unexpected increase means a fan-out bug.
4. Leakage: no feature computed from the target or the future; split train/test by time or by group when rows are related.
5. Baseline first (mean, majority class, last value); compare every result to it.
6. Effect sizes with uncertainty (CI, std over seeds or folds), never one lucky run; fixed seeds.
7. Correlation is not causation: name the confounders you could not rule out.
8. Reproducible: one script or notebook regenerates every number in the report from the raw data.
9. Personal data: minimise and aggregate; never print rows with names, emails or ids into the report.
