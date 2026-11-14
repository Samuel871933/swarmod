# Test checklist — paste into the brief of every agent that writes tests

Confirm each item before STATUS: done.
1. Read the existing tests first and match their runner, layout, naming and fixtures; find the real test command.
2. Test at the lowest level that shows the behaviour: unit, then integration, then end-to-end.
3. Per function: happy path, empty, boundary values, error path, and concurrency if state is shared.
4. Assert outcomes (returned values, stored rows, responses), not internal calls; mock only at system boundaries (network, clock, DB).
5. Prove the riskiest test bites, once: invert one condition with Edit, run that test only, see it fail, Edit it back. Quote it.
6. Tests independent of order and shared state; no sleeps; fixed seeds and clocks.
7. Never skip, delete or loosen an existing test to get green; report it instead.
8. Report the pass/fail counts of the full suite.
