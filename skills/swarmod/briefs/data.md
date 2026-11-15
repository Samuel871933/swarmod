# Schema / migration / API checklist — for the brief of every agent touching schemas, migrations or public interfaces

Confirm each item before STATUS: done.
1. Contract first: types, endpoints or schema written before the code; changes additive only (new optional fields).
2. Never rename or drop a column in place: expand → migrate → contract, in separate deploys.
3. Every migration has a working down/rollback, run once locally; backfills in batches; indexes built concurrently on big tables.
4. Status codes: 400 invalid, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict, 422 validation; one error shape.
5. Idempotency: the key is derived from the intent and claimed atomically (unique constraint); same key with another payload → 422.
6. Check-then-write on shared rows inside a transaction, or with a lock that reloads the row.
7. Before removing anything public: grep and measure its consumers; a working replacement exists.
8. No data destroyed without a backup or a dry run first; say which.
