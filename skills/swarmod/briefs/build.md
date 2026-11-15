# Build checklist — for the brief of every agent that writes a feature or an app

Confirm each item before STATUS: done, or say why it does not apply.
1. Find the project's own test/build/lint commands (package.json, Makefile, `Checks:` in the map); never assume them.
2. Reuse first: grep for an existing helper, component or pattern before writing one; follow its style.
3. Simplest version that meets the acceptance criteria; no option, abstraction or config nobody asked for.
4. Stay inside your file list; other problems you notice go in the report, not in the diff.
5. Run the checks every ~100 written lines, not only at the end; never re-run an unchanged command.
6. Validate input at trust boundaries (user, network, files, env); typed internal code needs no re-checks.
7. Lists paginated, one error shape, no stack traces or secrets in responses or logs; auth and ownership checked per resource.
8. One test per new branch or parser; it must fail when the logic is inverted.
9. Report: files changed, commands run with pass/fail counts, anything skipped.
