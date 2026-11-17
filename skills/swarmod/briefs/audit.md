# Audit checklist — for every audit soldier's brief, after the file list

For each item: report a finding, or "sound" with the quoted guard at path:line, or "not checked".
1. Guards that do nothing: a check whose result is unused (`consume()` without `isAccepted()`), a comparison that can never be true
   (bool vs `null`, wrong type), a guard that only logs. A comment claiming the framework handles it is not proof: find the config line.
2. Limits stored but never enforced: every `max*`, `limit`, `quota`, `supply`, `until`, `expires` field — grep where it is READ.
   The fields live in the entity/model, often outside your file list: for each thing a path redeems, buys, claims or consumes
   (code, coupon, item, ticket), grep its class for those fields and check this path tests each one before granting.
3. Comparisons of secrets/tokens: prefix/substring/`==` instead of constant-time equality; empty secret allowed; secret in query string.
4. Locks and races: check-then-write outside a transaction; a lock taken AFTER the read it should protect; ORM lock calls that do not
   reload the entity (Doctrine `lock()`, `findOneBy` on a managed entity return the stale in-memory copy); idempotency flags read before the lock.
5. Client-trusted facts: "completed", "watched", "opened", amounts, ids, timestamps sent by the client and granted without a server proof.
6. Auth and abuse: missing login/role/ownership (IDOR), missing CSRF on state changes, no rate limit on login, key guessing or codes,
   rate limiter placed after the check it should protect.
7. Writes on GET, unbounded input creating rows, unpaginated dumps.
8. Framework config: firewall/throttling/access_control in config files, not only the code that mentions them.
Default steps: 1. split code into batches (swarmod split) 2. one soldier per batch 3. re-read cited high-severity lines 4. ranked report
