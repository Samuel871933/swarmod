import { expect, test } from 'claude-code/testing'

import { parseZones, skySvg, unslug, zoneOf } from './sky'

const MAP = '| zone | files | main symbols |\n|---|---|---|\n| `lib/site` | 36 | type Page |\n| `lib` | 33 | x |\n| `.` | 4 | — |\n'

test('zones parse from map.md and files land in the deepest zone', async () => {
  const zones = parseZones(MAP)
  expect(zones).toEqual([{ name: 'lib/site', files: 36 }, { name: 'lib', files: 33 }, { name: '.', files: 4 }])
  expect(zoneOf('/p/lib/site/a.ts', '/p', zones)).toBe('lib/site')
  expect(zoneOf('/p/lib/b.ts', '/p', zones)).toBe('lib')
  expect(zoneOf('/p/README.md', '/p', zones)).toBe('.')
  expect(zoneOf('/p/other/c.ts', '/p', zones)).toBe('')
  expect(unslug('lib__site')).toBe('lib/site')
  expect(unslug('_root')).toBe('.')
})

test('the sky draws a ship per agent and lights explored zones', async () => {
  const svg = skySvg({
    zones: parseZones(MAP),
    ships: [{ id: 'a1', toolUseId: 't1', type: 'swarmod:worker', model: 'claude-sonnet-5-5', zone: 'lib' }],
    found: ['lib'],
    percent: 42,
  })
  expect(svg.match(/<animateMotion/g)?.length).toBe(1)
  expect(svg).toContain('#a78bfa')
  expect(svg).toContain('main · 42%')
  expect(svg).toContain('1/3 zones explored')
})
