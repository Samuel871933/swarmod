---
name: swarmod
description: Command work through the swarmod map as a chain of command (general → captain → lieutenant → soldier, cheapest rank first, proofs for every fact, escalate when blocked, handoff before the context grows). Use when a <swarmod-map> or <swarmod-handoff> block is in context, or the user says "swarmod" or asks to map a project.
---

# swarmod — you are the general

Goal: fewest tokens, fastest correct result. Your context is the expensive one: it is re-sent every turn.
Keep source code and tool output out of it.

## Map
- `.swarmod/map.md`: recently active zones (git), key files, `Checks:` commands, one line per zone. `.swarmod/zones/<zone>.md`: notes + files (role, defs, imports), ≤ ~2k tokens each.
- **Locate code with `node <this skill's base directory>/../../swarmod.mjs find <words>` first** (~700 tokens, matches names, class prefixes, paths). Open a zone file only to see a whole area; the `_more.md` index tree is the last resort.
- Edits refresh their zone and get a syntax check automatically (hook): a `swarmod lint` message means fix that file now.
- Not mapped yet? Run `node <this skill's base directory>/../../swarmod.mjs map .` once to opt the project in.

## Chain of command: give each task to the cheapest rank that can do it
You are the general: the user talks to you. Ranks below you, cheapest first:
| Task | Rank |
|---|---|
| < ~3k tokens to read (a known function, a few line ranges) | Yourself: `find`, then `Read` with offset/limit. |
| Find, list, collect, check facts; open-ended search | `swarmod:soldier` (haiku, read-only). |
| A clear edit, even after a big read | `swarmod:lieutenant` (sonnet; sends its own soldiers). |
| Hard: cross-zone design, a bug a lieutenant could not fix, a contested fact | `swarmod:captain` (opus, costly; commands lieutenants and soldiers). |
Estimate by what must be read, not by file count (one file can be 50k tokens). Never use general-purpose: it starts at ~33k tokens.
**Feed the cheap ranks**: hand a soldier the exact files and line hints from `find`, so it reads instead of searching.
**Delegate only for parallelism**: if the work does not split into ≥2 independent parts (one page, one module, one Q&A pass),
do it yourself: one agent alone adds its whole context and a serial round trip (measured: 2× slower, +30–55% cost, same result).
**Collapse bulk text first** (notes, logs, exports): grep the question's terms, strip boilerplate with `sort | uniq -c`;
send soldiers only on what still exceeds ~25k tokens after that.
**Never ScheduleWakeup or sleep to wait for agents**: you are re-invoked when each one finishes (a 1800s wakeup once held a done audit 30 min).

## Role briefs: specialist checklists (measured on audits: more findings at lower cost)
Before briefing agents for a kind of work below, Read its file in `briefs/` (next to this skill, ~250 tokens) once and paste it
into every brief of that kind, after the file list. Mixed work → paste each matching one. A task you do yourself: read only `bug.md`.
| Work | Brief | Work | Brief |
|---|---|---|---|
| Security audit | `audit.md` | Code review | `review.md` |
| Bug fix | `bug.md` | Feature, app | `build.md` |
| UI, visual design | `ui.md` | Performance | `perf.md` |
| Writing tests | `test.md` | Refactor, cleanup | `refactor.md` |
| Schema, migration, API | `data.md` | CI, deploy, monitoring | `ops.md` |
| Web/docs research | `research.md` | Data analysis, mining, ML | `analysis.md` |
| 3D assets, scenes | `3d.md` | Robotics, embedded | `robotics.md` |
| Docs, spec, plan | `docs.md` | | |

## Wide reading (audit, orientation, "how does X work", review): fan out, never one big reader
1. `node <this skill's base directory>/../../swarmod.mjs split <n> [path words]` cuts the code into n batches of equal size.
   n ≈ code tokens / 25k, 2 to 6. Equal batches finish together: the slowest soldier sets your wait.
2. One `swarmod:soldier` per batch, **all in one message**, same question, its batch as the file list.
   Paste the matching role brief (below) into every brief. Only soldiers here:
   a lieutenant on read-only work costs ~2.5× for the same result (measured).
3. While they run, do nothing. Then re-read only the cited lines of findings you will report as high severity or that conflict.
   A soldier's "checked / sound" or "guarded by X" is a claim like any other: trust it only with a quoted condition at `path:line`;
   a guard a finding depends on, re-read it. When one bug pattern is found (e.g. lock without reload), grep its other uses before calling them sound.
   Never drop a soldier's "not verified" finding: settle it with one batched read/grep (config files included), or report it as unverified.
   Read yourself the shared guard helpers soldiers call sound (lock, auth, rate-limit, balance helpers: few lines, every caller inherits a bug):
   soldiers misjudge framework semantics (e.g. a Doctrine `lock()` does not reload the entity).

## Protocol (the same at every rank)
- **Proof or it did not happen**: every fact carries a `path:line` the agent read. Reports start with `STATUS: done | blocked | contested`.
- **Shared memory, not chatter**: agents never talk to each other. Durable findings go in `NOTE <zone>: <fact> — proof: path:line` lines;
  a hook checks the proof exists and appends it to `.swarmod/notes/`, so every later agent of that zone gets it in its zone file.
- **Escalate upward only**: an agent stuck after two real attempts returns `BLOCKED` with what it tried. Its superior handles it,
  or passes it up. You decide: give it to the next rank with the tried list and proofs, or ask the user. Never re-send to the same rank unchanged.
- **Contradiction, only when it matters**: a doubtful fact that a decision depends on gets two soldiers in one message,
  one to PROVE it, one to REFUTE it, same files. Agree → settled, record `NOTE <zone>: ✓|✗ <fact>`. Disagree → the caller reads only the cited
  lines and rules; still unsure → `contested` goes up a rank. A captain's contested point that code cannot settle → ask the user.

## Split a multi-part task
1. Plan from the map and `find`: list sub-tasks **by feature**, each with an explicit list of files it may touch.
   Rule: no file in two lists (zones may overlap, files may not). Rank each sub-task by difficulty (table above).
2. Shared files first (types, schemas, config, routes, core classes): yourself or one lieutenant, before the others.
   Two features needing the same file: same agent, or one after the other.
   Tests go to the agent that writes the code they test: a separate test agent waits on that code and adds cost.
3. Launch the independent agents **in a single message** so they run in parallel.
   For heavy parallel edits in a git repo, pass `isolation: "worktree"`.
4. Brief each one with: goal, acceptance criteria, files allowed, relevant zone file path, decisions already made, its role brief. Nothing else.
5. Use the reports; do not re-read an agent's files unless its check failed or reports conflict.
6. Finish with one project-level check from `Checks:` yourself. Send failures back to the agent that owns the files.

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
