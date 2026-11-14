import type { Ship, Star } from '../../types'

export type Zone = { name: string; files: number }
export type Sky = { zones: Zone[]; ships: Ship[]; stars: Star[]; found: string[]; percent: number; now: number }
type P = { x: number; y: number }

export const parseZones = (map: string): Zone[] =>
  [...map.matchAll(/^\| `([^`]+)` \| (\d+) \|/gm)].map(m => ({ name: m[1]!, files: Number(m[2]) }))

export const unslug = (s: string) => (s === '_root' ? '.' : s.replace(/__/g, '/'))

// Deepest zone containing the path ('.' holds root files only).
export function zoneOf(file: string, cwd: string, zones: Zone[]): string {
  // Windows: backslashes and drive-letter case differ between tool paths and cwd.
  const f = file.replace(/\\/g, '/'), c = cwd.replace(/\\/g, '/')
  const rel = f.toLowerCase().startsWith(c.toLowerCase() + '/') ? f.slice(c.length + 1) : f
  let best = ''
  for (const { name } of zones) {
    if (name === '.' ? !rel.includes('/') && !best : rel.startsWith(name + '/') && name.length > best.length) best = name
  }
  return best
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
const f1 = (n: number) => n.toFixed(1)

// The general is the planet: a big arc along the bottom; the sky above it holds the finds.
const W = 640, H = 170, PX = 320, PR = 210, PY = H + 150, SKY = 92, SLOTS = 12
export const station = (slot: number): P => {
  const a = ((-90 + (slot % SLOTS - (SLOTS - 1) / 2) * 6) * Math.PI) / 180
  return { x: PX + (PR + 4) * Math.cos(a), y: PY + (PR + 4) * Math.sin(a) }
}
export const starAt = (k: string, zone: string): Star => {
  const h = hash(k)
  return { k, zone, x: 16 + (h % (W - 32)), y: 14 + ((h >>> 11) % (SKY - 14)) }
}

// Each rank its own colour and size; the subagent type wins, the model is the fallback.
export const ROLES = { soldier: { s: 1, c: '#7dd3fc' }, lieutenant: { s: 1.5, c: '#a78bfa' }, captain: { s: 2.1, c: '#f472b6' } }
type Role = keyof typeof ROLES
const BY_MODEL: [string, Role][] = [['opus', 'captain'], ['sonnet', 'lieutenant'], ['haiku', 'soldier']]
export const roleOf = ({ type, model }: Pick<Ship, 'type' | 'model'>): Role =>
  (Object.keys(ROLES) as Role[]).find(r => type.includes(r)) ?? BY_MODEL.find(([m]) => model.includes(m))?.[1] ?? 'soldier'

// Out exploring: just below its last find, or above its station before the first one.
const spot = (s: Ship, stars: Star[]): P => {
  const st = s.star && stars.find(x => x.k === s.star)
  if (st) return { x: st.x, y: st.y + 9 }
  const h = station(s.slot)
  return { x: h.x, y: h.y - 30 }
}
export function posOf(s: Ship, ships: Ship[], stars: Star[]): P {
  if (s.state === 'home') return station(s.slot)
  if (s.state === 'talk') {
    const o = ships.find(x => x.id === s.with)
    if (!o) return station(s.slot) // talking to the general: back on the planet
    const a = spot(s, stars), b = spot(o, stars), side = s.id < o.id ? -1 : 1
    return { x: (a.x + b.x) / 2 + side * 8, y: (a.y + b.y) / 2 }
  }
  return spot(s, stars)
}
// Change a ship's state, keeping where it was so the next draw shows the flight.
export const move = (ships: Ship[], id: string, patch: Partial<Ship>, stars: Star[], now: number) =>
  ships.map(s => (s.id === id ? { ...s, ...patch, from: posOf(s, ships, stars), at: now } : s))

const FLIGHT = 1.2
function shipSvg(s: Ship, i: number, sky: Sky): string {
  const { s: k, c } = ROLES[roleOf(s)], to = posOf(s, sky.ships, sky.stars)
  const tip = `<title>${esc(s.type)} · ${s.state}${s.zone ? ` · ${esc(s.zone)}` : ''}</title>`
  const hull = (extra = '') => `<polygon points="${f1(5 * k)},0 ${f1(-4 * k)},${f1(-3 * k)} ${f1(-2 * k)},0 ${f1(-4 * k)},${f1(3 * k)}" fill="${c}">${tip}${extra}</polygon>`
  const flying = s.from && s.at !== undefined && sky.now - s.at < FLIGHT * 1000 + 300
  const fly = flying ? `<animateMotion id="f${i}" dur="${FLIGHT}s" fill="freeze" rotate="auto" path="M${f1(s.from!.x)} ${f1(s.from!.y)} L${f1(to.x)} ${f1(to.y)}"/>` : ''
  if (s.state === 'explore') {
    const r = 6 + k * 2, orbit = `M${f1(to.x + r)} ${f1(to.y)} a${r} ${r} 0 1 1 ${-2 * r} 0 a${r} ${r} 0 1 1 ${2 * r} 0`
    return hull(fly + `<animateMotion ${flying ? `begin="f${i}.end"` : ''} dur="${3 + (i % 3)}s" repeatCount="indefinite" rotate="auto" path="${orbit}"/>`)
  }
  // Docked (nose up) or hovering face to face with the ship it talks to.
  const o = s.state === 'talk' ? sky.ships.find(x => x.id === s.with) : undefined
  const turn = o ? (s.id < o.id ? 0 : 180) : -90
  return flying ? hull(fly) : `<g transform="translate(${f1(to.x)} ${f1(to.y)}) rotate(${turn})">${hull()}</g>`
}

export function skySvg(sky: Sky): string {
  const { zones, ships, stars, found, percent } = sky
  const fill = Math.max(0, Math.min(100, percent))
  const out = ships.filter(s => s.state !== 'home').length
  const dots = stars.map((s, i) => {
    const fresh = i >= stars.length - 3
    return `<circle cx="${s.x}" cy="${s.y}" r="${fresh ? 1.8 : 1.1}" fill="hsl(${hash(s.zone) % 360} 70% ${fresh ? 85 : 70}%)" opacity="${fresh ? 1 : 0.7}"><title>${esc(s.k.split('/').slice(-2).join('/'))}</title></circle>`
  }).join('')
  const pads = [...new Set(ships.map(s => s.slot % SLOTS))].map(n => {
    const p = station(n)
    return `<rect x="${f1(p.x - 5)}" y="${f1(p.y - 1)}" width="10" height="3" rx="1" fill="#475569"/>`
  }).join('')
  // A link between ships that are talking.
  const links = ships.filter(s => s.state === 'talk').map(s => {
    const o = ships.find(x => x.id === s.with)
    if (!o || s.id > o.id) return ''
    const a = posOf(s, ships, stars), b = posOf(o, ships, stars)
    return `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="#fde68a" stroke-dasharray="2 2" opacity="0.7"/>`
  }).join('')
  const legend = (Object.keys(ROLES) as Role[]).map((r, i) =>
    `<circle cx="${14 + i * 62}" cy="${H - 8}" r="${1.5 * ROLES[r].s}" fill="${ROLES[r].c}"/><text x="${20 + i * 62}" y="${H - 5}" font-size="8" fill="#94a3b8">${r}</text>`).join('')
  const explored = found.filter(f => zones.some(z => z.name === f)).length
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif">` +
    `<defs><radialGradient id="pl" cx="50%" cy="0%" r="60%"><stop offset="0" stop-color="#f4a259"/><stop offset="1" stop-color="#7c2d12"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" rx="6" fill="#0b1020"/>` + dots +
    `<circle cx="${PX}" cy="${PY}" r="${PR + 3}" fill="none" stroke="#f4a25944" stroke-width="4"/>` +
    `<circle cx="${PX}" cy="${PY}" r="${PR}" fill="url(#pl)"/>` + pads +
    `<text x="${PX}" y="${PY - PR + 20}" font-size="9" fill="#fde7cf" text-anchor="middle">general · ${fill}% context</text>` +
    `<rect x="${PX - 30}" y="${PY - PR + 25}" width="60" height="3" rx="1.5" fill="#00000055"/>` +
    `<rect x="${PX - 30}" y="${PY - PR + 25}" width="${f1(fill * 0.6)}" height="3" rx="1.5" fill="${fill > 60 ? '#f87171' : '#4ade80'}"/>` +
    links + ships.map((s, i) => shipSvg(s, i, sky)).join('') + legend +
    `<text x="${W - 10}" y="${H - 5}" font-size="8" fill="#94a3b8" text-anchor="end">${out}/${ships.length} out · ${stars.length} finds · ${explored}/${zones.length} zones</text></svg>`
}

export const skyText = ({ zones, ships, stars, found, percent }: Sky) =>
  `general ${percent}% context · ${ships.length} ships${ships.length ? ` (${ships.map(s => `${roleOf(s)}:${s.state}`).join(', ')})` : ''} · ${stars.length} finds · ${found.length}/${zones.length} zones`
