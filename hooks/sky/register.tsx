// swarmod sky: the general is a planet, subagents are ships. They fly out to explore, each find becomes a star,
// they hover side by side while messaging, and dock back at their station to note or when done.
// UI only: adds nothing to the model's context.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ship } from '../../types'
import { move, parseZones, skySvg, skyText, starAt, unslug, zoneOf } from './sky'

const PANE = 'swarmod-sky'
const MAP = '.swarmod/map.md'
const SVG = '.swarmod/sky.svg'
const ships = atom({ plugin: 'swarmod', key: 'ships' } as const, [], { shape: 'ships-2' })
const stars = atom({ plugin: 'swarmod', key: 'stars' } as const, [], { shape: 'stars-1' })
const found = atom({ plugin: 'swarmod', key: 'found' } as const, [], { shape: 'found-1' })
const ctx = atom({ plugin: 'swarmod', key: 'ctx' } as const, { percent: 0 }, { shape: 'ctx-1' })
const view = atom({ plugin: 'swarmod', key: 'view' } as const, { open: true }, { shape: 'view-1' })
const WRITES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const LIVE = ['pending', 'running', 'waiting']

let zones: { name: string; files: number }[] = [] // cached for tool.call, refreshed on render
const loadZones = async ($: EngineInterface) => {
  try { zones = parseZones(String(await $.fs.read(MAP))) } catch { zones = [] }
  return zones
}
const skyOf = async ($: EngineInterface) => {
  const live = new Set((await $.agent.list()).filter(a => LIVE.includes(a.status)).map(a => a.id))
  const st = await read($, stars), now = Date.now()
  // An agent that ended flies home (once: the ship is then 'home').
  if ((await read($, ships)).some(s => !live.has(s.id) && s.state !== 'home')) {
    await update($, ships, list => list.reduce((l, s) => (!live.has(s.id) && s.state !== 'home' ? move(l, s.id, { state: 'home' }, st, now) : l), list))
  }
  return { zones: await loadZones($), ships: await read($, ships), stars: st, found: await read($, found), percent: (await read($, ctx)).percent, now }
}
// The VS Code "Sky" panel tab (vscode/) watches this file.
const dump = async ($: EngineInterface) => {
  try { if (zones.length) await $.fs.write(SVG, skySvg(await skyOf($))) } catch {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'swarmod-sky', description: 'Show the swarmod agents and map as a sky' })
    await loadZones($)
    const open = await $.store.get('skyOpen')
    if (typeof open === 'boolean') await update($, view, () => ({ open }))
    await dump($)
    return next(e)
  })

  on('command.run', { command: 'swarmod-sky' }, async $ => {
    await loadZones($)
    await $.ui.open({ id: PANE, title: 'swarmod' })
    return { text: zones.length ? 'swarmod sky opened.' : 'No .swarmod/map.md here yet: map the project first.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, ctx, () => ({ percent: Math.round(e.context.percent ?? 0) }))
      await dump($)
    }
    return next(e)
  })

  // A new ship leaves its own station, on the next free pad.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      const m = e.prompt.match(/\.swarmod\/zones\/([\w.-]+)\.md/)
      const now = Date.now()
      await update($, ships, list => {
        const slot = ((list.at(-1)?.slot ?? -1) + 1) % 12
        const ship: Ship = { id: r.agentId!, toolUseId: e.tool_use_id, type: e.subagentType, model: r.model, zone: m ? unslug(m[1]!) : '', slot, state: 'home', at: now }
        return move([...list.slice(-11), ship], ship.id, { state: 'explore' }, [], now)
      })
      await dump($)
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const a = e as { file_path?: unknown; path?: unknown; agentId?: string; to?: unknown }
    const p = typeof a.file_path === 'string' ? a.file_path : typeof a.path === 'string' ? a.path : ''
    const z = p && zones.length ? zoneOf(p, await $.session.cwd(), zones) : ''
    if (z) await update($, found, list => (list.includes(z) ? list : [...list, z]))
    const id = a.agentId ?? 'general', now = Date.now(), st = await read($, stars)
    let moved = true
    if (e.tool === 'SendMessage' && typeof a.to === 'string') {
      // Both ships hover side by side; a ship talking to the general goes home.
      const to = a.to
      await update($, ships, l => move(move(l, id, { state: 'talk', with: to }, st, now), to, { state: 'talk', with: id }, st, now))
    } else if (!a.agentId) {
      moved = !!z
    } else if (e.tool === 'SubagentHandback' || (WRITES.has(e.tool) && /[\\/]\.swarmod[\\/]/.test(p))) {
      await update($, ships, l => move(l, id, { state: 'home' }, st, now)) // back on the planet to note
    } else if (p) {
      const star = starAt(p.replace(/\\/g, '/').toLowerCase(), z)
      await update($, stars, l => (l.some(x => x.k === star.k) ? l : [...l.slice(-149), star]))
      await update($, ships, l => move(l, id, { state: 'explore', star: star.k, ...(z && { zone: z }) }, [...st, star], now))
    } else moved = false
    if (moved) await dump($)
    const ran = await next(e)
    if (e.tool === 'Agent') await dump($) // a foreground agent just ended
    return ran
  })

  // Above the chat input, full width, like the ponytail band: folds to one line, never goes away.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Other mods share this slot: theirs draw below ours. next(e) rejects when nothing answers beneath.
    const below = await next(e).catch(() => undefined)
    if (!zones.length) return below
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const sky = await skyOf($)
    const { open } = await read($, view)
    const toggle = async () => {
      await update($, view, v => ({ open: !v.open }))
      await $.store.set('skyOpen', !open)
    }
    const mine = (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Button key="sky" plain label={open ? '▾ sky' : '▸ sky'} onPress={toggle} />
          <Text dimColor wrap="truncate-end">{skyText(sky)}</Text>
        </Box>
        {open && 'Svg' in els && <els.Svg source={skySvg(sky)} alt={skyText(sky)} />}
      </Box>
    )
    return below ? <Box flexDirection="column">{mine}{below}</Box> : mine
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const sky = await skyOf($)
    if ('Svg' in els) {
      const { Svg } = els
      return <Svg source={skySvg(sky)} alt={skyText(sky)} />
    }
    const { Text } = els
    return <Text>{skyText(sky)}</Text>
  })
}
