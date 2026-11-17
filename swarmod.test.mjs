import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, zonesOf, split } from './swarmod.mjs';

test('analyze extracts symbols/imports across languages', () => {
  const php = analyze(`<?php\n/**\n * Handles customer login flow\n */\nuse App\\Models\\User;\nfinal class LoginController {\n  public static function authenticate($u) {}\n}`);
  assert.equal(php.role, 'Handles customer login flow');
  assert.deepEqual(php.symbols, ['class LoginController', 'authenticate']);
  assert.deepEqual(php.imports, ['App\\Models\\User']);

  const js = analyze(`import { a } from './a.js';\nexport const go = async (x) => x;\nexport default function main() {}`);
  assert.deepEqual(js.symbols, ['go', 'main']);
  assert.deepEqual(js.imports, ['./a.js']);

  const py = analyze(`from os import path\nclass Foo:\n    async def bar(self): pass`);
  assert.deepEqual(py.symbols, ['class Foo', 'bar']);
  assert.deepEqual(py.imports, ['os']);

  const go = analyze(`func (s *Srv) Handle() {}\ntype Srv struct {}`);
  assert.deepEqual(go.symbols, ['Handle', 'type Srv']);

  const rs = analyze(`pub(crate) async fn run() {}\npub struct Cfg;`);
  assert.deepEqual(rs.symbols, ['run', 'struct Cfg']);
});

test('zonesOf splits big directories', () => {
  const files = ['README.md', ...Array.from({ length: 50 }, (_, i) => `src/${i % 2 ? 'a' : 'b'}/f${i}.js`)];
  const z = zonesOf(files);
  assert.deepEqual([...z.keys()].sort(), ['.', 'src/a', 'src/b']);
  assert.equal(z.get('src/a').length, 25);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contextTokens } from './swarmod.mjs';

const run = (cmd, input, env = {}) =>
  execFileSync('node', [fileURLToPath(new URL('./swarmod.mjs', import.meta.url)), cmd],
    { input: JSON.stringify(input), env: { ...process.env, ...env } }).toString();

test('session hook maps git projects and consumes the handoff once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  const bare = run('session', { cwd: dir }); // not a project: orders only, no map, no find
  assert.match(bare, /swarmod orders/);
  assert.doesNotMatch(bare, /<swarmod-map>|find <words>/);
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, 'a.py'), 'class Foo:\n  pass\n');
  fs.mkdirSync(path.join(dir, '.swarmod'));
  fs.writeFileSync(path.join(dir, '.swarmod', 'HANDOFF.md'), '# Handoff — fix Foo');
  const first = run('session', { cwd: dir });
  assert.match(first, /<swarmod-map>[\s\S]*class Foo/);
  assert.match(first, /fix Foo/);
  assert.doesNotMatch(run('session', { cwd: dir }), /fix Foo/);
});

test('guard reads context size from the transcript', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  const t = path.join(dir, 't.jsonl');
  const usage = n => JSON.stringify({ message: { usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: n } } });
  fs.writeFileSync(t, [usage(10), '{"type":"user"}', usage(150_000), '{"type":"user"}'].join('\n'));
  assert.equal(contextTokens(t), 150_002);
  assert.match(run('guard', { cwd: dir, transcript_path: t }), /~150k tokens/);
  assert.doesNotMatch(run('guard', { cwd: dir, transcript_path: t }, { SWARMOD_HANDOFF_TOKENS: '200000' }), /tokens/);
});

import { rankFiles } from './swarmod.mjs';

test('rankFiles ranks the most imported file first (relative + namespaced imports)', () => {
  const info = {
    'src/a.ts': { imports: ['./core'] },
    'src/b.ts': { imports: ['./core', './a'] },
    'src/core.ts': { imports: [] },
    'app/Http/Login.php': { imports: ['App\\Models\\User'] },
    'app/Models/User.php': { imports: [] },
    'lib/x.py': { imports: ['os'] },
  };
  const r = rankFiles(info);
  const order = Object.keys(info).sort((a, b) => r.get(b) - r.get(a));
  assert.equal(order[0], 'src/core.ts');
  assert.ok(r.get('app/Models/User.php') > r.get('app/Http/Login.php'));
});

test('zone notes are embedded in the zone file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'export function go() {}');
  fs.mkdirSync(path.join(dir, '.swarmod', 'notes'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.swarmod', 'notes', '_root.md'), '- tests: node --test');
  run('session', { cwd: dir });
  assert.match(fs.readFileSync(path.join(dir, '.swarmod', 'zones', '_root.md'), 'utf8'), /Notes[\s\S]*node --test[\s\S]*go/);
});

import { buildMap, find } from './swarmod.mjs';

test('big projects: overview stays in budget, every zone stays reachable, find answers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  for (let i = 0; i < 300; i++) {
    const d = path.join(dir, 'shop', `mod${i % 150}`, `part${i % 2}`);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `F${i}.php`), `<?php\n/* Copyright 2007-2020 PrestaShop */\nclass Thing${i}Core {}\n`);
  }
  buildMap(dir);
  const z = path.join(dir, '.swarmod', 'zones');
  assert.ok(fs.readFileSync(path.join(dir, '.swarmod', 'map.md'), 'utf8').length <= 6000);
  // Walk the index tree from _more.md: every zone must be listed somewhere, every index file small.
  const listed = new Set(), seen = new Set();
  (function walk(name) {
    if (seen.has(name)) return; seen.add(name);
    const text = fs.readFileSync(path.join(z, `${name}.md`), 'utf8');
    assert.ok(text.split('\n').length <= 160, `${name} too long`);
    for (const m of text.matchAll(/^\| `([^`…]+)` \|/gm)) listed.add(m[1]);
    for (const m of text.matchAll(/→ `(_more[^`]*)\.md`/g)) walk(m[1]);
  })('_more');
  for (const m of fs.readFileSync(path.join(dir, '.swarmod', 'map.md'), 'utf8').matchAll(/^\| `([^`]+)` \|/gm)) listed.add(m[1]);
  const all = fs.readdirSync(z).filter(f => !f.startsWith('_more')).length;
  assert.equal(listed.size, all);
  const hits = find(dir, ['Thing42Core']);
  assert.match(hits[0], /F42\.php — class Thing42Core$/); // license header is not a role
});

import { refreshFile, lint, recordNotes } from './swarmod.mjs';

test('edit refresh, lint, find ranking and checks line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  fs.mkdirSync(path.join(dir, 'classes'));
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'classes', 'Cart.php'), '<?php\nclass CartCore {}\n');
  fs.writeFileSync(path.join(dir, 'classes', 'CartRule.php'), '<?php\nclass CartRuleCore {}\n');
  fs.writeFileSync(path.join(dir, 'tests', 'CartTest.php'), '<?php\nclass Cart {}\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"test":"x","lint":"y"}}');
  buildMap(dir);
  assert.match(fs.readFileSync(path.join(dir, '.swarmod', 'map.md'), 'utf8'), /Checks: npm run test · npm run lint/);
  assert.match(find(dir, ['cart'])[0], /^classes\/Cart\.php/); // basename + prefix beat the test fixture
  // a new file in a known zone shows up in find and its zone file without a rebuild
  const added = path.join(dir, 'classes', 'Wishlist.js');
  fs.writeFileSync(added, 'export function addToWishlist() {}\n');
  assert.equal(refreshFile(dir, added), true);
  assert.match(find(dir, ['addToWishlist'])[0], /Wishlist\.js/);
  assert.match(fs.readFileSync(path.join(dir, '.swarmod', 'zones', '_root.md'), 'utf8'), /Wishlist\.js/);
  assert.equal(lint(added), '');
  fs.writeFileSync(added, 'export function (\n');
  assert.notEqual(lint(added), '');
  fs.writeFileSync(path.join(dir, 'bad.json'), '{');
  assert.notEqual(lint(path.join(dir, 'bad.json')), '');
});

test('recently committed or uncommitted zones lead the map (git)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    const d = path.join(dir, i < 50 ? `core/m${i % 2}` : 'custom');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `f${i}.js`), `import './x.js';\nexport function f${i}() {}\n`);
  }
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base');
  for (let i = 0; i < 40; i++) git('commit', '-q', '--allow-empty', '-m', `e${i}`); // push "base" out of the last 30
  fs.appendFileSync(path.join(dir, 'custom', 'f55.js'), '// wip\n');
  buildMap(dir);
  const map = fs.readFileSync(path.join(dir, '.swarmod', 'map.md'), 'utf8');
  assert.match(map, /Recently active: custom/);
  assert.match(map.split('|---|---|---|\n')[1], /^\| `custom` /);
});

test('intel hook keeps proven NOTE lines in zone notes, drops unproven ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'export function a() {}\n// two\n// three\n');
  buildMap(dir);
  const report = [
    'STATUS: done',
    'NOTE .: a() is the only export — proof: lib/a.js:1 "export function a()"',
    'NOTE .: invented fact — proof: lib/a.js:99 "nothing"',
    'NOTE .: wrong quote — proof: lib/a.js:1 "export class Zed"',
    'NOTE .: no quote — proof: lib/a.js:1',
    'NOTE .: outside the project — proof: ../x.js:1 "x"',
    'NOTE nozone: unknown zone and file — proof: nofile.js:1 "x"',
  ].join('\n');
  const transcript = path.join(dir, 'agent.jsonl');
  fs.writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: report } }] } }) + '\n');
  const input = { cwd: dir, agent_type: 'swarmod:soldier', agent_transcript_path: transcript, last_assistant_message: 'ok' };
  run('intel', input);
  run('intel', input); // same report twice: no duplicate
  const notes = fs.readFileSync(path.join(dir, '.swarmod', 'notes', '_root.md'), 'utf8');
  assert.equal(notes.trim().split('\n').length, 1);
  assert.match(notes, /^- a\(\) is the only export — proof: lib\/a\.js:1 "export function a\(\)" \(soldier, \d{4}-\d\d-\d\d\)/);
  assert.match(fs.readFileSync(path.join(dir, '.swarmod', 'zones', '_root.md'), 'utf8'), /a\(\) is the only export/);
  assert.equal(recordNotes(dir, 'NOTE .: range — proof: `lib/a.js:2-3` "two"'), 1);
  assert.equal(recordNotes(dir, 'NOTE shortname: zone taken from the proof — proof: lib/a.js:2 "// two"'), 1); // agents shorten zone names
});

test('guard repeats the split reminder on every prompt, even in an empty folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  const t = path.join(dir, 't.jsonl');
  fs.writeFileSync(t, '');
  assert.match(run('guard', { cwd: dir, transcript_path: t, prompt: 'any task' }), /fan out/);
});

test('split cuts code into balanced batches in path order, skipping tests and non-code', () => {
  const f = (bytes, code = true) => ({ key: `1:${bytes}`, symbols: code ? ['x'] : [], imports: [] });
  const info = { 'a/1.js': f(100), 'a/2.js': f(100), 'b/1.js': f(100), 'b/2.js': f(100), 'big.js': f(400),
    'README.md': f(999, false), 'tests/t.js': f(999) };
  const b = split(info, 2);
  assert.deepEqual(b.map(x => x.files), [['a/1.js', 'a/2.js', 'b/1.js', 'b/2.js'], ['big.js']]);
  assert.deepEqual(split(info, 3, ['b/']).map(x => x.files), [['b/1.js'], ['b/2.js']]);
});

test('every role brief named in the skill exists', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills/swarmod');
  const named = [...fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').matchAll(/`(\w+)\.md`/g)].map(m => m[1])
    .filter(n => n !== '_more');
  assert.ok(named.length >= 10, `only ${named.length} briefs named`);
  for (const n of named) assert.ok(fs.existsSync(path.join(dir, 'briefs', n + '.md')), `briefs/${n}.md missing`);
});

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));

test('verified checks: block a report claiming a check that never ran, once', () => {
  const dir = mk(), t = path.join(dir, 'a.jsonl');
  const line = c => JSON.stringify({ type: 'assistant', message: { content: [c] } }) + '\n';
  fs.writeFileSync(t, line({ type: 'tool_use', name: 'Bash', input: { command: 'cd x && npm test 2>&1' } }));
  const input = { cwd: dir, agent_type: 'swarmod:lieutenant', agent_transcript_path: t };
  assert.equal(run('intel', { ...input, last_assistant_message: 'STATUS: done\n- check: `npm test` → pass' }), '');
  const out = JSON.parse(run('intel', { ...input, last_assistant_message: '- check: npm run lint → pass' }));
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /npm run lint/);
  assert.equal(run('intel', { ...input, stop_hook_active: true, last_assistant_message: '- check: npm run lint → pass' }), '');
});

test('notes follow the code: re-anchored when the quote moves, dropped when it vanishes', () => {
  const dir = mk(), f = path.join(dir, 'a.js');
  fs.writeFileSync(f, 'one\ntwo\nthree\nfour\nfive\nsix\nexport function a() {}\n');
  buildMap(dir);
  assert.equal(recordNotes(dir, 'NOTE .: a exists — proof: a.js:7 "export function a()"'), 1);
  const notes = path.join(dir, '.swarmod', 'notes', '_root.md');
  fs.writeFileSync(f, '0\n1\n2\n3\n4\n5\n6\n7\n8\nexport function a() {}\n');
  refreshFile(dir, f);
  assert.match(fs.readFileSync(notes, 'utf8'), /a\.js:10 "export function a\(\)"/);
  fs.writeFileSync(f, 'nothing\n');
  refreshFile(dir, f);
  assert.equal(fs.readFileSync(notes, 'utf8').trim(), '');
});

test('notes follow changes made outside Claude (next map), and a zone file shows only the newest 20', () => {
  const dir = mk(), f = path.join(dir, 'a.js');
  fs.writeFileSync(f, Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n');
  buildMap(dir);
  const notes = path.join(dir, '.swarmod', 'notes', '_root.md'), zone = path.join(dir, '.swarmod', 'zones', '_root.md');
  for (let i = 0; i < 25; i++) recordNotes(dir, `NOTE .: v${i} is ${i} — proof: a.js:${i + 1} "export const v${i} = ${i};"`);
  const shown = fs.readFileSync(zone, 'utf8');
  assert.ok(!shown.includes('v4 is 4') && shown.includes('v5 is 5') && shown.includes('v24 is 24'));
  assert.match(shown, /\+5 older notes: Grep/);
  assert.equal(recordNotes(dir, 'NOTE .: v0 is 0 — proof: a.js:1 "export const v0 = 0;"'), 0); // known: not new...
  assert.ok(fs.readFileSync(zone, 'utf8').includes('v0 is 0')); // ...but back in the shown window
  assert.equal(fs.readFileSync(notes, 'utf8').match(/v0 is 0/g).length, 1);
  fs.writeFileSync(f, 'export const v0 = 0;\n'); // "git pull": no edit hook, only the next session map
  buildMap(dir);
  assert.equal(fs.readFileSync(notes, 'utf8').trim().split('\n').length, 1);
  fs.unlinkSync(f);
  buildMap(dir);
  assert.equal(fs.readFileSync(notes, 'utf8').trim(), '');
});

test('guard flags a weakened test (skip added, assertions removed), not a clean edit', () => {
  const dir = mk();
  const edit = (file_path, old_string, new_string) => run('refresh', { cwd: dir, tool_name: 'Edit', tool_input: { file_path, old_string, new_string } });
  assert.match(edit(path.join(dir, 'a.test.js'), "test('x', () => {})", "test.skip('x', () => {})"), /weakens a check \(.skip\(/);
  assert.match(edit(path.join(dir, 'a.test.js'), 'assert.ok(1); assert.ok(2);', 'assert.ok(1);'), /removes assertions/);
  fs.writeFileSync(path.join(dir, 'a.js'), 'let a = 2');
  assert.equal(edit(path.join(dir, 'a.js'), 'let a = 1', 'let a = 2'), '');
});

test('journal + stats: intel appends a run, stats summarizes per agent', () => {
  const dir = mk(), t = path.join(dir, 'a.jsonl');
  fs.mkdirSync(path.join(dir, '.swarmod'));
  const m = (ts, usage, content) => JSON.stringify({ timestamp: ts, message: { usage, content } }) + '\n';
  fs.writeFileSync(t, m('2026-01-01T00:00:00Z', { input_tokens: 5, output_tokens: 7 }, []) + m('2026-01-01T00:00:10Z', { input_tokens: 1, output_tokens: 3 }, []));
  run('intel', { cwd: dir, agent_type: 'swarmod:soldier', agent_transcript_path: t, last_assistant_message: 'STATUS: unproven' });
  const j = JSON.parse(fs.readFileSync(path.join(dir, '.swarmod', 'journal.jsonl'), 'utf8'));
  assert.deepEqual([j.agent, j.status, j.in_tokens, j.out_tokens, j.seconds], ['soldier', 'unproven', 6, 10, 10]);
  const out = execFileSync('node', [fileURLToPath(new URL('./swarmod.mjs', import.meta.url)), 'stats'], { cwd: dir }).toString();
  assert.match(out, /soldier: 1 runs · done 0% unproven 100%/);
});

test('plan: summary, unproven [x] flagged, injected by guard and session', () => {
  const dir = mk();
  fs.mkdirSync(path.join(dir, '.swarmod'));
  const plan = path.join(dir, '.swarmod', 'PLAN.md');
  fs.writeFileSync(plan, ['# Plan — demo', '- [x] 1. a | proof: a.js:1 "x" | needs: —', '- [x] 2. b | proof: done | needs: 1',
    '- [ ] 3. c | proof: t → pass | needs: 1', '- [ ] 4. d | proof: p | needs: —', '- [ ] 5. e | proof: p | needs: 3'].join('\n'));
  const g = run('guard', { cwd: dir, transcript_path: path.join(dir, 'none') });
  assert.match(g, /plan: 2\/5 proven · ready now: 3, 4 \(independent: launch together\) · waiting: 5 \(needs 3\)/);
  assert.match(g, /check: step 2 marked \[x\] without a proof/);
  assert.match(run('session', { cwd: dir }), /<swarmod-plan>[\s\S]*Plan — demo/);
  fs.writeFileSync(plan, '- [x] 1. a | proof: a.js:1 "x"\n');
  assert.match(run('guard', { cwd: dir, transcript_path: path.join(dir, 'none') }), /plan complete: rename/);
});

test('skills index: dedupe by name keeping newest, word search, library lines in session', () => {
  const home = mk(), proj = mk();
  const skill = (rel, name, desc, t) => {
    const f = path.join(home, '.claude', rel, 'SKILL.md');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `---\nname: ${name}\ndescription: ${desc}\n---\nbody`);
    fs.utimesSync(f, t, t);
  };
  skill('skills/pdfx', 'pdfx', 'Old pdf tool. Second sentence.', 1000);
  skill('skills/.trash/pdfx', 'pdfx', 'Trashed.', 5000);
  skill('skills-library/misc/pdfx', 'pdfx', 'New pdf tool. More.', 3000);
  skill('skills-library/other', 'chart', 'Draw charts', 2000);
  const sw = (cmd, ...a) => execFileSync('node', [fileURLToPath(new URL('./swarmod.mjs', import.meta.url)), cmd, ...a], { cwd: proj, env: { ...process.env, HOME: home } }).toString();
  const out = sw('skills', 'pdf');
  assert.equal(out.trim().split('\n').length, 1);
  assert.match(out, /^pdfx — New pdf tool\. — ~0\.1k tok — .*skills-library.*SKILL\.md \[library\]/);
  assert.equal(sw('skills').trim().split('\n').length, 2);
  const s = execFileSync('node', [fileURLToPath(new URL('./swarmod.mjs', import.meta.url)), 'session'], { input: JSON.stringify({ cwd: proj }), env: { ...process.env, HOME: home } }).toString();
  assert.match(s, /library skills[\s\S]*chart — Draw charts/);
});

test('map ignores itself via .swarmod/.gitignore and leaves the project .gitignore alone', () => {
  const dir = mk(), gi = path.join(dir, '.gitignore');
  fs.writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(gi, 'node_modules/');
  buildMap(dir);
  assert.equal(fs.readFileSync(gi, 'utf8'), 'node_modules/');
  assert.equal(fs.readFileSync(path.join(dir, '.swarmod', '.gitignore'), 'utf8'), '*\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).includes('.swarmod'), false);
});
