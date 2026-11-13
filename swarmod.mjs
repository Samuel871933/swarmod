#!/usr/bin/env node
// swarmod — lightweight, language-agnostic project map for AI agents.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OUT = '.swarmod';
const MAX_ZONE = 40;          // max files per zone before splitting by subdir
const MAX_SYMBOLS = 12;       // per file in zone detail
const MAX_FILE_BYTES = 512_000;
const MAP_BUDGET = 6000;      // chars of map.md (~1.5k tokens), injected at every session start
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target', '.next',
  '.nuxt', '.cache', 'coverage', '__pycache__', '.venv', 'venv', '.idea', '.vscode', OUT, 'var', 'tmp', 'graphify-out']);
const IGNORE_FILE = /(\.lock|-lock\.json|\.min\.(js|css)|\.map|\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|exe|dll|so|o|a|class|jar|pyc))$/i;

// shortcut: regex extraction misses C/Java/C# methods and nested scopes; swap for tree-sitter tags when precision matters.
const SYMBOL_RES = [
  /^\s*(?:(?:export|default|async|public|private|protected|static|final|abstract|pub(?:\([\w:]+\))?|override|internal|unsafe|const)\s+)*(?:function\*?|def|fn|func(?:\s*\([^)]*\))?|sub|proc)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:(?:export|default|public|private|protected|static|final|abstract|sealed|partial|data|pub(?:\([\w:]+\))?|internal|readonly)\s+)*(class|interface|trait|enum|struct|record|module|object|impl|type)\s+([A-Za-z_$][\w$\\.]*)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
];
const IMPORT_RES = [
  /^\s*import\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/,      // js/ts
  /require(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/,               // js/php/ruby
  /^\s*(?:include|include_once)\s*\(?\s*['"]([^'"]+)['"]/,     // php
  /^\s*use\s+([A-Za-z_][\w\\:]*)/,                            // php/rust
  /^\s*from\s+([\w.]+)\s+import/,                             // python
  /^\s*import\s+([\w.]+)\s*;?\s*$/,                           // python/java/kotlin
  /^\s*#include\s*[<"]([^>"]+)[>"]/,                          // c/c++
];
const COMMENT_LINE = /^\s*(?:\/\/+|#(?!!|include|\[)|\/\*+|\*+(?!\/)|"""|'''|--|;+)\s*(.*?)\s*(?:\*\/|"""|''')?\s*$/;
const NOT_ROLE = /copyright|license|licence|trademark|rights reserved|world-wide-web|https?:|\b(19|20)\d\d\b|@|^[-=*#\s]*$|eslint|prettier|<\?php|^!|coding[:=]|strict|todo|fixme|disclaimer|^\S+$/i;

export function analyze(text) {
  const lines = text.split('\n');
  const symbols = [], imports = [];
  let role = '';
  for (const [i, line] of lines.entries()) {
    if (!role && i < 30) {
      const m = line.match(COMMENT_LINE);
      if (m && m[1] && m[1].length > 8 && !NOT_ROLE.test(m[1])) role = m[1].slice(0, 120);
    }
    if (line.length > 400) continue; // minified / data lines
    for (const re of SYMBOL_RES) {
      const m = line.match(re);
      if (m) {
        const kind = m.length > 2 && m[2] ? m[1] : null;
        const name = kind ? m[2] : m[1];
        const label = kind && kind !== 'impl' ? `${kind} ${name}` : name;
        if (!symbols.includes(label)) symbols.push(label);
        break;
      }
    }
    for (const re of IMPORT_RES) {
      const m = line.match(re);
      if (m) { if (!imports.includes(m[1])) imports.push(m[1]); break; }
    }
  }
  return { role, symbols, imports };
}

function listFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    const files = out.toString().split('\0').filter(Boolean);
    return files.filter(f => !f.split('/').some(p => IGNORE_DIRS.has(p)) && !IGNORE_FILE.test(f));
  } catch { /* not a git repo: walk */ }
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(rel); }
      else if (e.isFile() && !IGNORE_FILE.test(e.name)) files.push(rel);
    }
  })('');
  return files;
}

// Group files into zones: a directory is a zone unless it holds > MAX_ZONE files, then split by subdir.
export function zonesOf(files) {
  const zones = new Map();
  (function split(prefix, group) {
    const depth = prefix ? prefix.split('/').length : 0;
    const direct = group.filter(f => f.split('/').length === depth + 1);
    const subs = new Map();
    for (const f of group) {
      if (direct.includes(f)) continue;
      const d = f.split('/').slice(0, depth + 1).join('/');
      if (!subs.has(d)) subs.set(d, []);
      subs.get(d).push(f);
    }
    if (group.length <= MAX_ZONE || subs.size === 0) { zones.set(prefix || '.', group); return; }
    if (direct.length) zones.set(prefix || '.', direct);
    for (const [d, g] of subs) split(d, g);
  })('', files);
  return zones;
}

// Resolve imports to project files, then PageRank the import graph: central files rank high.
export function rankFiles(info) {
  const files = Object.keys(info), set = new Set(files), n = files.length;
  const bySuffix = new Map(); // last 2 path segments without extension → files (for namespaced imports)
  for (const f of files) {
    const k = f.replace(/\.[^./]+$/, '').split('/').slice(-2).join('/').toLowerCase();
    if (!bySuffix.has(k)) bySuffix.set(k, []);
    bySuffix.get(k).push(f);
  }
  const exts = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.php', '.py', '/index.js', '/index.ts', '/index.tsx'];
  const resolve = (from, imp) => {
    if (imp.startsWith('.')) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), imp));
      return exts.map(e => base + e).find(c => set.has(c));
    }
    const parts = imp.replace(/\\|::|\./g, '/').toLowerCase().split('/').filter(Boolean);
    const hits = bySuffix.get(parts.slice(-2).join('/'));
    return hits?.length === 1 ? hits[0] : undefined; // ambiguous → skip rather than guess
  };
  const out = new Map(files.map(f => [f, [...new Set(info[f].imports.map(i => resolve(f, i)).filter(t => t && t !== f))]]));
  let rank = new Map(files.map(f => [f, 1 / n]));
  for (let it = 0; it < 30; it++) {
    let dangling = 0;
    const next = new Map(files.map(f => [f, 0]));
    for (const f of files) {
      const o = out.get(f);
      if (!o.length) dangling += rank.get(f);
      else for (const t of o) next.set(t, next.get(t) + rank.get(f) / o.length);
    }
    for (const f of files) next.set(f, 0.15 / n + 0.85 * (next.get(f) + dangling / n));
    rank = next;
  }
  return rank;
}

const CACHE_VERSION = 5; // bump when analyze() or the cache shape changes
const ZONE_BUDGET = 8000;  // chars per zone file (~2k tokens): beyond it, files are listed by name only
const TABLE_HEAD = '| zone | files | main symbols |\n|---|---|---|';
const INDEX_MAX = 60;
const TESTS = /(^|\/)(tests?|__tests__|spec|fixtures?)(\/|$)/i;
const slug = z => (z === '.' ? '_root' : z.replace(/[\/\\]/g, '__'));
// Concurrent workers refresh in parallel: never leave a half-written file behind.
const writeAtomic = (file, text) => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };

// Rank = PageRank × relevance: recently touched files up (only when mtimes vary), pure exception/interface files down.
// Files touched by the last 30 commits or uncommitted: the most reliable "where the work is" signal.
function gitHot(root) {
  try {
    const run = args => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString();
    const prefix = run(['rev-parse', '--show-prefix']).trim(); // map root may be a subfolder of the repo
    const files = [...run(['log', '-n', '30', '--name-only', '--format=']).split('\n'),
      ...run(['status', '--porcelain']).split('\n').map(l => l.slice(3).split(' -> ').pop())];
    return new Set(files.filter(f => f && f.startsWith(prefix)).map(f => f.slice(prefix.length)));
  } catch { return null; } // not a git repo
}

function scoreFiles(info, root) {
  const rank = rankFiles(info);
  const mtime = i => Number(i.key.split(':')[0]);
  const since = Math.max(0, ...Object.values(info).map(mtime)) - 7 * 86_400_000; // a week before the latest edit
  const git = gitHot(root);
  // No git: mtimes, unless nearly everything is "recent" (fresh copy, bulk checkout), which says nothing.
  const meaningful = !git && Object.values(info).filter(i => mtime(i) >= since).length <= 0.3 * Object.keys(info).length;
  for (const [f, i] of Object.entries(info)) {
    i.hot = git ? git.has(f) : meaningful && mtime(i) >= since;
    const plumbing = i.symbols.length && i.symbols.every(s => /(exception|interface)$/i.test(s));
    i.r = rank.get(f) * (i.hot ? 4 : 1) * (plumbing ? 0.3 : 1) * (TESTS.test(f) ? 0.3 : 1);
  }
}

// Test/lint commands an agent would otherwise have to discover (~20 tokens).
function checks(root) {
  const out = [], has = f => fs.existsSync(path.join(root, f));
  const json = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return null; } };
  const pkg = json('package.json');
  for (const s of ['test', 'lint', 'typecheck', 'build']) if (pkg?.scripts?.[s]) out.push(`npm run ${s}`);
  const comp = json('composer.json');
  for (const s of Object.keys(comp?.scripts ?? {})) if (/test|lint|stan|cs/i.test(s)) out.push(`composer ${s}`);
  if (has('phpunit.xml') || has('phpunit.xml.dist')) out.push('vendor/bin/phpunit');
  try {
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8');
    for (const t of ['test', 'lint', 'check']) if (new RegExp(`^${t}:`, 'm').test(mk)) out.push(`make ${t}`);
  } catch { /* no Makefile */ }
  if (has('pytest.ini') || has('pyproject.toml')) out.push('pytest');
  if (has('Cargo.toml')) out.push('cargo test');
  if (has('go.mod')) out.push('go test ./...');
  return [...new Set(out)].slice(0, 6);
}

const isCode = i => i.symbols.length || i.imports.length;

export function buildMap(root) {
  const outDir = path.join(root, OUT);
  fs.mkdirSync(path.join(outDir, 'zones'), { recursive: true });
  const cachePath = path.join(outDir, 'cache.json');
  let cache = {};
  try {
    const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (c.v === CACHE_VERSION) cache = c.files;
  } catch { /* first run */ }

  const info = {};
  let analyzed = 0;
  for (const f of listFiles(root).sort()) {
    let st;
    try { st = fs.statSync(path.join(root, f)); } catch { continue; } // deleted but still in git index
    const key = `${st.mtimeMs}:${st.size}`;
    if (cache[f]?.key === key) { info[f] = cache[f]; continue; }
    info[f] = { key, ...analyzeFile(path.join(root, f), st.size) };
    analyzed++;
  }
  scoreFiles(info, root);
  const byR = (a, b) => info[b].r - info[a].r;
  // Zone weight counts code files only, so big data/translation folders don't float to the top.
  const weight = zf => zf.reduce((s, f) => s + (isCode(info[f]) ? info[f].r : 0), 0);
  // Zones with recently edited code come first (where the work is), then the most central ones.
  const lastEdit = zf => Math.max(0, ...zf.filter(f => info[f].hot && isCode(info[f])).map(f => Number(info[f].key.split(':')[0])));
  const zones = [...zonesOf(Object.keys(info))].map(([z, zf]) => [z, zf.sort(byR)])
    .sort((a, b) => lastEdit(b[1]) - lastEdit(a[1]) || weight(b[1]) - weight(a[1]));
  for (const [z, zf] of zones) for (const f of zf) info[f].z = z;
  writeAtomic(cachePath, JSON.stringify({ v: CACHE_VERSION, files: info }));

  for (const old of fs.readdirSync(path.join(outDir, 'zones'))) fs.unlinkSync(path.join(outDir, 'zones', old));
  const rowOf = (z, zf) => {
    const syms = zf.flatMap(f => info[f].symbols);
    const top = syms.filter(s => / /.test(s)); // types/classes first
    return `| \`${z}\` | ${zf.length} | ${(top.length ? top : syms).slice(0, 4).join(', ').slice(0, 120) || '—'} |`;
  };
  const keyFiles = Object.keys(info).filter(f => isCode(info[f])).sort(byR).slice(0, 10);
  const active = zones.filter(([, zf]) => lastEdit(zf)).slice(0, 8).map(([z]) => z);
  const chk = checks(root);
  const overview = [`# Map: ${path.basename(path.resolve(root))}`, '',
    `${Object.keys(info).length} files, ${zones.length} zones, most relevant first. Detail + notes: \`${OUT}/zones/<zone with / as __, . as _root>.md\`.`,
    ...(active.length ? [`Recently active: ${active.join(', ')}`] : []),
    `Key files: ${keyFiles.join(', ')}`, ...(chk.length ? [`Checks: ${chk.join(' · ')}`] : []), '', TABLE_HEAD];
  let size = overview.join('\n').length;
  const overflow = [];
  for (const [z, zf] of zones) {
    const row = rowOf(z, zf);
    // Budget: the overview is injected every session; the rest stays reachable through the index tree.
    if (size + row.length > MAP_BUDGET - 300) overflow.push({ z, row, files: zf.length });
    else { overview.push(row); size += row.length + 1; }
    writeZone(outDir, z, zf, info);
  }
  if (overflow.length) {
    overview.push('', `+${overflow.length} more zones: index tree from \`${OUT}/zones/_more.md\` (≤ ${INDEX_MAX} lines per file).`);
    writeIndex(outDir, '_more', 'More zones', overflow, 1);
  }
  writeAtomic(path.join(outDir, 'map.md'), overview.join('\n') + '\n');
  return { files: Object.keys(info).length, zones: zones.length, analyzed };
}

function analyzeFile(abs, size) {
  if (size > MAX_FILE_BYTES) return { role: '', symbols: [], imports: [] };
  const buf = fs.readFileSync(abs);
  return buf.subarray(0, 8000).includes(0) ? { role: '', symbols: [], imports: [] } : analyze(buf.toString('utf8'));
}

// PostToolUse: re-analyze only the edited file and rewrite only its zone (ms, not a full rebuild).
export function refreshFile(root, abs) {
  const outDir = path.join(root, OUT), cachePath = path.join(outDir, 'cache.json');
  const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  if (c.v !== CACHE_VERSION) return false;
  const f = path.relative(root, abs).split(path.sep).join('/');
  if (f.startsWith('..') || f.startsWith(OUT + '/') || IGNORE_FILE.test(f)) return false;
  const old = c.files[f];
  let st;
  try { st = fs.statSync(abs); } catch { return false; }
  // A new file joins the deepest existing zone holding its folder; a brand-new folder waits for the next session.
  const zonesKnown = new Set(Object.values(c.files).map(i => i.z));
  const dir = path.posix.dirname(f);
  const rootDeep = Object.entries(c.files).some(([k, i]) => i.z === '.' && k.includes('/')); // small project: '.' holds everything
  const z = old?.z ?? ([...zonesKnown].filter(k => k !== '.' && (dir === k || dir.startsWith(k + '/'))).sort((a, b) => b.length - a.length)[0]
    ?? (zonesKnown.has('.') && (dir === '.' || rootDeep) ? '.' : null));
  if (!z) return false;
  c.files[f] = { key: `${st.mtimeMs}:${st.size}`, ...analyzeFile(abs, st.size), z, r: old?.r ?? 0, hot: true };
  // shortcut: two workers refreshing at the same instant can lose one cache update; the next session start rebuilds it.
  writeAtomic(cachePath, JSON.stringify(c));
  const zf = Object.keys(c.files).filter(k => c.files[k].z === z).sort((a, b) => c.files[b].r - c.files[a].r);
  writeZone(outDir, z, zf, c.files);
  return true;
}

function writeZone(outDir, z, zf, info) {
  const detail = [`# Zone: ${z}`, ''];
  const notesPath = path.join(outDir, 'notes', `${slug(z)}.md`);
  if (fs.existsSync(notesPath)) detail.push('## Notes (learned while working — trust but verify)', fs.readFileSync(notesPath, 'utf8').trim(), '', '## Files');
  const plain = [], namesOnly = []; // data files, and files past the budget: names only
  let size = detail.join('\n').length;
  for (const f of zf) {
    const { role, symbols, imports } = info[f];
    const rel = z === '.' ? f : f.slice(z.length + 1);
    if (!role && !symbols.length && !imports.length) { plain.push(rel); continue; }
    let line = `- **${rel}**`;
    if (role) line += ` — ${role}`;
    if (symbols.length) line += `\n  - defs: ${symbols.slice(0, MAX_SYMBOLS).join(', ')}${symbols.length > MAX_SYMBOLS ? ` (+${symbols.length - MAX_SYMBOLS})` : ''}`;
    if (imports.length) line += `\n  - uses: ${imports.slice(0, 8).join(', ')}${imports.length > 8 ? ' …' : ''}`;
    if (size + line.length > ZONE_BUDGET) { namesOnly.push(rel); continue; }
    detail.push(line);
    size += line.length + 1;
  }
  const names = (label, l) => `- ${label} (${l.length}): ${l.slice(0, 40).join(', ')}${l.length > 40 ? ' …' : ''}`;
  if (namesOnly.length) detail.push(names('more code files, use `find` for their defs', namesOnly));
  if (plain.length) detail.push(names('other files', plain.sort()));
  writeAtomic(path.join(outDir, 'zones', `${slug(z)}.md`), detail.join('\n') + '\n');
}

// Overflow zones as a tree of small index files: each level splits by the next path segment.
function writeIndex(outDir, name, title, entries, depth) {
  let buckets;
  if (entries.length > INDEX_MAX) {
    for (; depth <= 16; depth++) {
      buckets = new Map();
      for (const e of entries) {
        const k = e.z.split('/').slice(0, depth).join('/');
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(e);
      }
      if (buckets.size > 1) break;
    }
  }
  if (!buckets || buckets.size <= 1) { // small enough, or cannot split further
    writeAtomic(path.join(outDir, 'zones', `${name}.md`), [`# ${title}`, '', TABLE_HEAD, ...entries.map(e => e.row)].join('\n') + '\n');
    return;
  }
  const lines = [`# ${title}`, '', TABLE_HEAD];
  for (const [k, es] of buckets) {
    if (es.length === 1) { lines.push(es[0].row); continue; }
    const sub = `_more__${slug(k)}`;
    lines.push(`| \`${k}/…\` | ${es.reduce((s, e) => s + e.files, 0)} | ${es.length} zones → \`${sub}.md\` |`);
    writeIndex(outDir, sub, `Zones in ${k}`, es, depth + 1);
  }
  writeAtomic(path.join(outDir, 'zones', `${name}.md`), lines.join('\n') + '\n');
}

// Search the cached index (defs, paths, roles) so big projects are queried, not browsed.
export function find(root, words, limit = 15) {
  const { files = {} } = JSON.parse(fs.readFileSync(path.join(root, OUT, 'cache.json'), 'utf8'));
  const terms = words.map(w => w.toLowerCase()).filter(Boolean);
  const hits = [];
  for (const [f, { role = '', symbols = [], hot }] of Object.entries(files)) {
    const base = path.posix.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
    let score = 0;
    const defs = [];
    for (const t of terms) {
      const name = s => s.toLowerCase().split(' ').pop();
      const exact = symbols.filter(s => name(s) === t);
      const prefix = symbols.filter(s => !exact.includes(s) && name(s).startsWith(t)); // Cart → CartCore
      const partial = symbols.filter(s => !exact.includes(s) && !prefix.includes(s) && name(s).includes(t));
      score += exact.length * 5 + (base === t ? 5 : 0)
        + Math.max(0, ...prefix.map(s => 4 * t.length / name(s).length))
        + Math.min(partial.length, 3) * 2 + (f.toLowerCase().includes(t) ? 2 : 0) + (role.toLowerCase().includes(t) ? 1 : 0);
      defs.push(...exact, ...prefix.slice(0, 2), ...partial.slice(0, 2));
    }
    if (score) hits.push({ f, score: score * (TESTS.test(f) ? 0.3 : 1) * (hot ? 1.5 : 1), defs: [...new Set(defs)].slice(0, 5), role });
  }
  return hits.sort((a, b) => b.score - a.score || a.f.localeCompare(b.f)).slice(0, limit)
    .map(h => `${h.f}${h.defs.length ? ` — ${h.defs.join(', ')}` : ''}${h.role ? ` — ${h.role.slice(0, 60)}` : ''}`);
}

// Syntax-check an edited file with the toolchain already on PATH. Returns the error, or '' (also when no linter).
export function lint(abs) {
  const ext = path.extname(abs).toLowerCase();
  const cmd = { '.php': ['php', ['-l', abs]], '.js': ['node', ['--check', abs]], '.mjs': ['node', ['--check', abs]],
    '.cjs': ['node', ['--check', abs]], '.py': ['python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])', abs]] }[ext];
  if (ext === '.json') { try { JSON.parse(fs.readFileSync(abs, 'utf8')); return ''; } catch (e) { return e.message; } }
  if (!cmd) return '';
  try {
    execFileSync(cmd[0], cmd[1], { stdio: 'pipe', timeout: 10_000 });
    // node --check on a .js using ESM syntax can pass broken code (module detection): re-check as a module via stdin.
    const src = ext === '.js' && fs.readFileSync(abs, 'utf8');
    if (src && /^\s*(import|export)\b/m.test(src)) execFileSync('node', ['--input-type=module', '--check'], { input: src, stdio: 'pipe', timeout: 10_000 });
    return '';
  }
  catch (e) {
    if (e.code === 'ENOENT' || e.signal) return ''; // no linter installed, or too slow: stay silent
    const lines = `${e.stderr || ''}${e.stdout || ''}`.split('\n').filter(l => l.trim());
    const i = Math.max(0, lines.findIndex(l => /error/i.test(l)));
    return lines.slice(Math.max(0, i - 3), i + 1).join('\n').slice(0, 600); // code line + caret + message, not a stack
  }
}

// Context size of the last assistant turn, read from the tail of a Claude Code transcript (JSONL).
export function contextTokens(transcriptPath) {
  const fd = fs.openSync(transcriptPath, 'r');
  const size = fs.fstatSync(fd).size, len = Math.min(size, 512_000);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n').reverse();
  for (const l of lines) {
    if (!l.includes('"usage"')) continue;
    try {
      const u = JSON.parse(l).message?.usage;
      if (u) return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    } catch { /* partial first line */ }
  }
  return 0;
}

// PreCompact stdout becomes the compaction instructions: make the summary a handoff, not a transcript.
const PRECOMPACT = `Summarize as a swarmod handoff, under 60 lines:
# Handoff — <task in one line>
## Goal
## Done (file:line refs)
## Decisions and why
## Next step (exact, first action)
## Watch out
Do not copy file contents or tool output: the project map (.swarmod/map.md) is re-injected after compaction.`;

const readHookInput = () => { try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return {}; } };

// SessionStart hook: refresh the map, inject it, and consume a pending handoff once.
function session() {
  const { cwd = process.cwd() } = readHookInput();
  const out = [];
  // Only auto-map real projects (git or opted-in), never e.g. $HOME.
  if (fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, OUT))) {
    try {
      buildMap(cwd);
      out.push(`<swarmod-map>\n${fs.readFileSync(path.join(cwd, OUT, 'map.md'), 'utf8')}</swarmod-map>`,
        `swarmod: locate code with \`node "${fileURLToPath(import.meta.url)}" find <words>\` (~700 tokens) before browsing zone files; follow the swarmod skill rules.`);
    } catch (e) { out.push(`swarmod: map failed (${e.message})`); }
  }
  const handoff = path.join(cwd, OUT, 'HANDOFF.md');
  if (fs.existsSync(handoff)) {
    out.push(`<swarmod-handoff>\n${fs.readFileSync(handoff, 'utf8')}</swarmod-handoff>`,
      'swarmod: a previous session handed off this work. Resume from the handoff above.');
    fs.renameSync(handoff, path.join(cwd, OUT, 'HANDOFF.done.md'));
  }
  if (out.length) console.log(out.join('\n\n'));
}

// UserPromptSubmit hook: past the threshold, tell Claude to write a handoff and ask for /clear.
// Default 110k ≈ 55% of a 200k window, before native auto-compaction.
function guard() {
  const { transcript_path } = readHookInput();
  const limit = Number(process.env.SWARMOD_HANDOFF_TOKENS) || 110_000;
  let tokens = 0;
  try { tokens = contextTokens(transcript_path); } catch { return; }
  if (tokens < limit) return;
  console.log(`swarmod: context is ~${Math.round(tokens / 1000)}k tokens (limit ${limit / 1000}k). ` +
    'Finish the current step, then follow the swarmod handoff procedure: write .swarmod/HANDOFF.md and tell the user to run /clear.');
}

// PostToolUse hook: lint the edited file (silent on success) and refresh its zone in the map.
function postEdit() {
  const { cwd = process.cwd(), tool_input = {} } = readHookInput();
  const abs = tool_input.file_path || tool_input.notebook_path;
  if (!abs) return;
  if (fs.existsSync(path.join(cwd, OUT, 'cache.json'))) try { refreshFile(cwd, abs); } catch { /* never block an edit */ }
  const err = lint(abs);
  if (err) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse',
    additionalContext: `swarmod lint: ${path.basename(abs)} has a syntax error, fix it now:\n${err}` } }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [cmd, dir = '.'] = process.argv.slice(2);
  if (cmd === 'map') {
    const r = buildMap(dir);
    console.log(`swarmod: ${r.files} files, ${r.zones} zones, ${r.analyzed} (re)analyzed → ${path.join(dir, OUT, 'map.md')}`);
  } else if (cmd === 'find') {
    const out = find(process.cwd(), process.argv.slice(3));
    console.log(out.length ? out.join('\n') : 'no match: try other words, or read the zone file.');
  } else if (cmd === 'session') session();
  else if (cmd === 'guard') guard();
  else if (cmd === 'refresh') postEdit();
  else if (cmd === 'precompact') console.log(PRECOMPACT);
  else { console.error('usage: swarmod map [dir] | find <words> | session | guard | refresh | precompact'); process.exit(1); }
}
