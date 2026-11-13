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
- Agents `swarmod:scout` (haiku, read-only) and `swarmod:worker` (sonnet, explicit file list, writes zone notes). Restricted tools keep a spawn at ~4k tokens vs ~33k for general-purpose..
- `find <words>`: query the index (names, class prefixes, paths) instead of browsing, ~700 tokens.
- After each edit: the file's zone is refreshed and it gets a syntax check (php, node, python, json), silent when fine.
- Context guard: past `SWARMOD_HANDOFF_TOKENS` (default 110000) Claude writes `.swarmod/HANDOFF.md` and asks for `/clear`;
  if native auto-compaction fires first, its summary uses the handoff format.
- `/swarmod-sky`: the main agent as a planet, subagents as ships, zones as planets they discover (VS Code, desktop; text in a terminal).

## Develop
`npm test` (node tests + `claude plugin test .`), `claude plugin validate .`
