import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, zonesOf } from './swarmod.mjs';

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
import { contextTokens } from './swarmod.mjs';

const run = (cmd, input, env = {}) =>
  execFileSync('node', [new URL('./swarmod.mjs', import.meta.url).pathname, cmd],
    { input: JSON.stringify(input), env: { ...process.env, ...env } }).toString();

test('session hook maps git projects and consumes the handoff once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmod-'));
  assert.equal(run('session', { cwd: dir }), ''); // not a project: nothing injected
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
  assert.match(run('guard', { transcript_path: t }), /~150k tokens/);
  assert.equal(run('guard', { transcript_path: t }, { SWARMOD_HANDOFF_TOKENS: '200000' }), '');
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

import { refreshFile, lint } from './swarmod.mjs';

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
