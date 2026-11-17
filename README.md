# swarmod

Claude Code plugin that keeps the main context small: a lightweight, language-agnostic project map,
cheap subagents per zone, automatic handoff/compaction, and a live "sky" pane of the agents at work.

## Install
```
/plugin marketplace add /path/to/swarmod
/plugin install swarmod@swarmod
```
Git projects are mapped automatically at session start. Elsewhere, ask Claude to "map this project with swarmod" once.

## What it does
- `.swarmod/map.md` (≤ ~1.5k tokens, injected each session) and `.swarmod/zones/<zone>.md` (files, defs, imports, notes),
  recently active zones first (git history), then PageRank over imports.
- Chain of command: the main agent is the general; `swarmod:soldier` (haiku, read-only), `swarmod:lieutenant` (sonnet, edits, sends soldiers),
  `swarmod:captain` (opus, hard cases, arbitration). Cheapest rank first, every fact with a `path:line` proof, `BLOCKED` goes up a rank,
  a doubtful fact gets a prove/refute pair of soldiers. Restricted tools keep a spawn at ~4k tokens vs ~33k for general-purpose.
- Shared memory: agents end reports with `NOTE <zone>: <fact> — proof: path:line "<exact text>"`; a `SubagentStop` hook keeps the ones whose quote is found within ±2 lines in `.swarmod/notes/`, re-anchors them when the file changes and drops them when the quote vanishes.
- v0.5: reports use `STATUS: done|unproven|blocked|contested`; check lines and NOTE quotes are verified by hooks; `.swarmod/PLAN.md` for multi-step tasks; `swarmod skills <words>` finds skills on demand.
- `find <words>`: query the index (names, class prefixes, paths) instead of browsing, ~700 tokens.
- After each edit: the file's zone is refreshed and it gets a syntax check (php, node, python, json), silent when fine.
- Context guard: past `SWARMOD_HANDOFF_TOKENS` (default 110000) Claude writes `.swarmod/HANDOFF.md` and asks for `/clear`;
  if native auto-compaction fires first, its summary uses the handoff format.
- `/swarmod-sky`: the main agent as a planet, subagents as ships, zones as planets they discover (VS Code, desktop; text in a terminal).

## Develop
`npm test` (node tests + `claude plugin test .`), `claude plugin validate .`
