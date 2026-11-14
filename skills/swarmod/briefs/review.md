# Review checklist — paste into every code-review agent's brief, after the files or diff

For each item: a finding labelled Critical / Required / Nit / FYI with path:line, or "sound" with the quoted line, or "not checked".
1. Correctness first: inverted or off-by-one conditions, unhandled null/empty/error paths, wrong units, races on shared state.
2. Tests: does a test fail if the main condition is inverted? Name the missing test for each changed branch.
3. Security on changed lines: unvalidated input at a boundary, string-built SQL/shell, missing ownership check, secrets or PII in logs.
4. Callers: grep every caller of a changed function or signature; list the ones the change breaks.
5. Duplication: a new helper that already exists in the codebase (grep its key line); a refactor that only moves complexity.
6. Size: > ~300 changed lines or a file pushed past ~1000 lines without a split → say where to cut.
7. Dependencies: a new package for a few lines; an upgrade without reading the changelog; lockfile changes nobody asked for.
8. Never "LGTM" without having read every changed hunk; say which hunks you did not read.
