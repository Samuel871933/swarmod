import { expect, test } from 'claude-code/testing'

import type { Ship } from '../../types'
import { move, parseZones, posOf, roleOf, ROLES, skySvg, starAt, station, unslug, zoneOf } from './sky'

const MAP = '| zone | files | main symbols |\n|---|---|---|\n| `lib/site` | 36 | type Page |\n| `lib` | 33 | x |\n| `.` | 4 | — |\n'

test('zones parse from map.md and files land in the deepest zone', async () => {
  const zones = parseZones(MAP)
  expect(zones).toEqual([{ name: 'lib/site', files: 36 }, { name: 'lib', files: 33 }, { name: '.', files: 4 }])
  expect(zoneOf('/p/lib/site/a.ts', '/p', zones)).toBe('lib/site')
  expect(zoneOf('/p/lib/b.ts', '/p', zones)).toBe('lib')
  expect(zoneOf('/p/README.md', '/p', zones)).toBe('.')
  expect(zoneOf('/p/other/c.ts', '/p', zones)).toBe('')
  expect(zoneOf('C:\\p\\lib\\site\\a.ts', 'c:\\p', zones)).toBe('lib/site')
  expect(zoneOf('C:\\p\\README.md', 'c:\\p', zones)).toBe('.')
  expect(unslug('lib__site')).toBe('lib/site')
  expect(unslug('_root')).toBe('.')
})

const ship = (id: string, type: string, slot: number): Ship =>
  ({ id, toolUseId: 't' + id, type, model: '', zone: '', slot, state: 'home' })

test('ships explore to their finds, hover side by side to talk, and dock home', async () => {
  const star = starAt('/p/lib/a.ts', 'lib')
  let fleet = [ship('a', 'swarmod:soldier', 0), ship('b', 'swarmod:captain', 1)]
  expect(posOf(fleet[0]!, fleet, [])).toEqual(station(0))
  fleet = move(fleet, 'a', { state: 'explore', star: star.k }, [star], 1000)
  expect(fleet[0]!.from).toEqual(station(0))
  expect(posOf(fleet[0]!, fleet, [star])).toEqual({ x: star.x, y: star.y + 9 })
  fleet = move(move(fleet, 'a', { state: 'talk', with: 'b' }, [star], 2000), 'b', { state: 'talk', with: 'a' }, [star], 2000)
  const pa = posOf(fleet[0]!, fleet, [star]), pb = posOf(fleet[1]!, fleet, [star])
  expect(pa.y).toBe(pb.y)
  expect(pb.x - pa.x).toBe(16)
  fleet = move(fleet, 'a', { state: 'talk', with: 'general' }, [star], 3000)
  expect(posOf(fleet[0]!, fleet, [star])).toEqual(station(0))
  expect(roleOf({ type: 'general-purpose', model: 'claude-opus-5-5' })).toBe('captain')
})

test('the sky draws the planet, a ship per agent in its rank colour, and a star per find', async () => {
  const s = { ...ship('a1', 'swarmod:lieutenant', 0), state: 'explore' as const }
  const svg = skySvg({ zones: parseZones(MAP), ships: [s], stars: [starAt('/p/lib/a.ts', 'lib')], found: ['lib'], percent: 42, now: 0 })
  expect(svg.match(/<polygon/g)?.length).toBe(1)
  expect(svg).toContain(`fill="${ROLES.lieutenant.c}"`)
  expect(svg).toContain('general · 42% context')
  expect(svg).toContain('1/1 out · 1 finds · 1/3 zones')
})
