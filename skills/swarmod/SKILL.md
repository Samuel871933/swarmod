---
name: swarmod
description: Coordinate work through the swarmod map (find code cheaply, scouts read, workers edit in parallel, handoff before the context grows). Use when a <swarmod-map> or <swarmod-handoff> block is in context, or the user says "swarmod" or asks to map a project.
---

# swarmod — you are the coordinator

Goal: fewest tokens, fastest correct result. Your context is the expensive one: it is re-sent every turn.
Keep source code and tool output out of it.

## Map
- `.swarmod/map.md`: recently active zones (git), key files, `Checks:` commands, one line per zone. `.swarmod/zones/<zone>.md`: notes + files (role, defs, imports), ≤ ~2k tokens each.
- **Locate code with `node <this skill's base directory>/../../swarmod.mjs find <words>` first** (~700 tokens, matches names, class prefixes, paths). Open a zone file only to see a whole area; the `_more.md` index tree is the last resort.
- Edits refresh their zone and get a syntax check automatically (hook): a `swarmod lint` message means fix that file now.
- Not mapped yet? Run `node <this skill's base directory>/../../swarmod.mjs map .` once to opt the project in.

## Decide by what you would have to read, not by file count
A single file can be 50k tokens. Estimate the source you need to read, then:
| Expected reading | Do |
|---|---|
| < ~3k tokens (a known function, a few line ranges) | Yourself: `find`, then `Read` with offset/limit. |
| Open-ended search, or > ~3k tokens to read | `swarmod:scout` (haiku, ~4k tokens to start): it reads, you get 150 words. |
| An edit that needs a big read first | `swarmod:worker` (sonnet). |
| Several independent edits | Split (below). |
Never use the general-purpose agent for this: it starts at ~33k tokens.

## Split a multi-part task
1. Plan from the map and `find`: list sub-tasks **by feature**, each with an explicit list of files it may touch.
   Rule: no file in two lists (zones may overlap, files may not).
2. Shared files first (types, schemas, config, routes, core classes): yourself or one worker, before the others.
   Two features needing the same file: same worker, or one after the other.
3. Launch the independent workers **in a single message** so they run in parallel.
   For heavy parallel edits in a git repo, pass `isolation: "worktree"`.
4. Brief each one with: goal, acceptance criteria, files allowed, relevant zone file path, decisions already made. Nothing else.
5. Use the summaries; do not re-read a worker's files unless its check failed or summaries conflict.
6. Finish with one project-level check from `Checks:` yourself. Send failures back to the worker that owns the files.

## Handoff (guard warning, user request, or before stopping mid-task)
Write `.swarmod/HANDOFF.md`, under 60 lines:
```
# Handoff — <task in one line>
## Goal
## Done (file:line refs)
## Decisions and why
## Next step (exact, first action)
## Watch out
```
Then tell the user: "Handoff written — run /clear to continue with a fresh context."
The next session receives the map and the handoff automatically. If auto-compaction fires first, it summarizes in this format too.
