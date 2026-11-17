# Docs / spec / plan checklist — for every agent that writes documentation, specs, ADRs or plans

Confirm each item before STATUS: done.
1. Match the project's existing doc locations, numbering and headings before using a template.
2. Every command, path and number in the doc is checked against the code (path:line) or run once.
3. Specs: objective, users, testable success criteria, commands, boundaries (in / out of scope), assumptions listed.
4. Plans: vertical slices; each task ≤ ~5 files, with acceptance criteria and a verification step; a checkpoint every 2–3 tasks.
5. An ADR for any decision that is expensive to reverse: context, options, decision, consequences.
6. Comments and docs explain the why, never restate the what; delete commented-out code.
7. Never overwrite an existing plan, todo or doc that has unchecked items without asking.
8. Short: the reader's question is answered in the first lines; no filler.
Default steps: 1. check existing doc locations/format 2. outline 3. write each section 4. verify commands/paths against code
