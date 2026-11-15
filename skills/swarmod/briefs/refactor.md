# Refactor checklist — for the brief of every agent that simplifies or restructures code

Confirm each item before STATUS: done.
1. Before changing code, know why it exists: its callers (grep), its tests, and `git log -L` on surprising lines.
2. Behaviour stays identical: outputs, errors, side effects, ordering. Existing tests pass unmodified.
3. A test you must change to make it pass means you changed behaviour: revert that step.
4. One simplification at a time, tests after each.
5. Prefer deletion: dead code (zero callers, proven by grep), duplicate helpers merged into the existing one.
6. Flatten deep nesting and nested ternaries with guard clauses; keep helpers that give a concept a name.
7. Keep every validation and error handler you move.
8. Stay in scope: no drive-by changes outside the file list.
