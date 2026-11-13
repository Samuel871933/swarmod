import type { Ship } from '../../types'

export type Zone = { name: string; files: number }
export type Sky = { zones: Zone[]; ships: Ship[]; found: string[]; percent: number }

export const parseZones = (map: string): Zone[] =>
  [...map.matchAll(/^\| `([^`]+)` \| (\d+) \|/gm)].map(m => ({ name: m[1]!, files: Number(m[2]) }))

export const unslug = (s: string) => (s === '_root' ? '.' : s.replace(/__/g, '/'))

// Deepest zone containing the path ('.' holds root files only).
export function zoneOf(file: string, cwd: string, zones: Zone[]): string {
  const rel = file.startsWith(cwd + '/') ? file.slice(cwd.length + 1) : file
  let best = ''
  for (const { name } of zones) {
    if (name === '.' ? !rel.includes('/') && !best : rel.startsWith(name + '/') && name.length > best.length) best = name
  }
  return best
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const SHIP_COLOR: Record<string, string> = { haiku: '#7dd3fc', sonnet: '#a78bfa', opus: '#f472b6' }
const shipColor = (model: string) => SHIP_COLOR[Object.keys(SHIP_COLOR).find(k => model.includes(k)) ?? ''] ?? '#e5e7eb'
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)

const W = 320, H = 200, HOME = { x: 52, y: 100 }

// Zones on a sunflower spiral, most central first (map order) nearest the middle.
export function zonePos(i: number) {
  const r = 14 * Math.sqrt(i + 0.5), a = i * 2.39996
  return { x: 215 + r * Math.cos(a) * 1.15, y: 100 + r * Math.sin(a) * 0.95 }
}

export function skySvg({ zones, ships, found, percent }: Sky): string {
  const shown = zones.slice(0, 48)
  const pos = new Map(shown.map((z, i) => [z.name, zonePos(i)]))
  const stars = Array.from({ length: 40 }, (_, i) => {
    const h = hash('s' + i)
    return `<circle cx="${h % W}" cy="${(h >> 9) % H}" r="${(h >> 3) % 3 === 0 ? 0.9 : 0.5}" fill="#cbd5e1" opacity="${0.3 + ((h >> 5) % 5) / 10}"/>`
  }).join('')
  const planets = shown.map(z => {
    const { x, y } = pos.get(z.name)!, r = 2 + Math.min(5, Math.log2(z.files + 1))
    const lit = found.includes(z.name)
    const label = z.name === '.' ? 'root' : z.name.split('/').pop()!
    return lit
      ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="hsl(${hash(z.name) % 360} 70% 62%)"/>` +
        `<text x="${x.toFixed(1)}" y="${(y + r + 7).toFixed(1)}" font-size="6.5" fill="#cbd5e1" text-anchor="middle">${esc(label)}</text>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#1e2640" stroke="#3b4668" stroke-width="0.6"/>`
  }).join('')
  const fleet = ships.map((s, i) => {
    const t = pos.get(s.zone) ?? { x: 150 + (hash(s.id) % 60), y: 30 + (hash(s.id) % 140) } // no zone yet: scouting
    const lift = (i % 2 ? -1 : 1) * (25 + (i % 3) * 12)
    const cx = (HOME.x + t.x) / 2, cy = (HOME.y + t.y) / 2 + lift
    const d = `M${HOME.x} ${HOME.y} Q${cx.toFixed(0)} ${cy.toFixed(0)} ${t.x.toFixed(0)} ${t.y.toFixed(0)} Q${cx.toFixed(0)} ${(cy - 2 * lift).toFixed(0)} ${HOME.x} ${HOME.y}`
    const c = shipColor(s.model)
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="0.4" stroke-dasharray="2 3" opacity="0.45"/>` +
      `<polygon points="5,0 -3,-3 -1,0 -3,3" fill="${c}"><animateMotion dur="${4 + (i % 3)}s" repeatCount="indefinite" rotate="auto" path="${d}"/></polygon>`
  }).join('')
  const fill = Math.max(0, Math.min(100, percent))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">` +
    `<rect width="${W}" height="${H}" rx="8" fill="#0b1020"/>${stars}${planets}` +
    `<circle cx="${HOME.x}" cy="${HOME.y}" r="20" fill="#f4a259"/>` +
    `<ellipse cx="${HOME.x}" cy="${HOME.y}" rx="30" ry="6" fill="none" stroke="#fcd9b0" stroke-width="1.4" opacity="0.8"/>` +
    `<circle cx="${HOME.x}" cy="${HOME.y}" r="23" fill="none" stroke="${fill > 60 ? '#f87171' : '#4ade80'}" stroke-width="2" stroke-dasharray="${(fill * 1.445).toFixed(1)} 200" transform="rotate(-90 ${HOME.x} ${HOME.y})"/>` +
    `<text x="${HOME.x}" y="${HOME.y + 36}" font-size="8" fill="#fde7cf" text-anchor="middle">main · ${fill}%</text>` +
    fleet +
    `<text x="8" y="${H - 8}" font-size="7" fill="#94a3b8">${ships.length} ship${ships.length === 1 ? '' : 's'} · ${found.filter(f => pos.has(f)).length}/${shown.length} zones explored</text></svg>`
}

export const skyText = ({ zones, ships, found, percent }: Sky) =>
  `main ${percent}% context · ${ships.length} agents${ships.length ? ` (${ships.map(s => `${s.type}→${s.zone || '?'}`).join(', ')})` : ''} · ${found.length}/${zones.length} zones explored`
