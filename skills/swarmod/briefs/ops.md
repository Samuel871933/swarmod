# CI / deploy / observability checklist — for the brief of every agent touching pipelines, releases or monitoring

Confirm each item before STATUS: done.
1. Gates in order: lint, type check, tests, build, dependency audit; a failing gate is fixed, never skipped or disabled.
2. Lockfile installs (`npm ci` or equivalent), cached; pipeline under ~10 min.
3. Secrets only in the secret store; CI never sees production secrets; nothing secret in logs or the repo.
4. Rollback written and tested before deploy (revert or flag off); every feature flag has an owner and an expiry.
5. Roll out in steps (staging → small canary → full); roll back if errors exceed 2× baseline or p95 latency rises 50%.
6. Logs structured, with stable event names and a correlation id; no tokens or personal data.
7. Metrics: rate, errors and duration per endpoint and dependency; p95/p99, not averages; labels from small fixed sets only.
8. Alerts on symptoms, with a threshold, a duration and a runbook link; fire each one once to test it.
