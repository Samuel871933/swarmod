// swarmod sky: the main agent is a planet, subagents are ships, map zones are planets they discover.
// UI only: adds nothing to the model's context.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ship } from '../../types'
import { parseZones, skySvg, skyText, unslug, zoneOf } from './sky'

const PANE = 'swarmod-sky'
const MAP = '.swarmod/map.md'
const ships = atom({ plugin: 'swarmod', key: 'ships' } as const, [], { shape: 'ships-1' })
const found = atom({ plugin: 'swarmod', key: 'found' } as const, [], { shape: 'found-1' })
const ctx = atom({ plugin: 'swarmod', key: 'ctx' } as const, { percent: 0 }, { shape: 'ctx-1' })

let zones: { name: string; files: number }[] = [] // cached for tool.call, refreshed on render
const loadZones = async ($: EngineInterface) => {
  try { zones = parseZones(String(await $.fs.read(MAP))) } catch { zones = [] }
  return zones
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'swarmod-sky', description: 'Show the swarmod agents and map as a sky' })
    if ((await loadZones($)).length) void $.ui.open({ id: PANE, title: 'swarmod' })
    return next(e)
  })

  on('command.run', { command: 'swarmod-sky' }, async $ => {
    await loadZones($)
    await $.ui.open({ id: PANE, title: 'swarmod' })
    return { text: zones.length ? 'swarmod sky opened.' : 'No .swarmod/map.md here yet: map the project first.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await update($, ctx, () => ({ percent: Math.round(e.context.percent ?? 0) }))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      const m = e.prompt.match(/\.swarmod\/zones\/([\w.-]+)\.md/)
      const ship: Ship = { id: r.agentId, toolUseId: e.tool_use_id, type: e.subagentType, model: r.model, zone: m ? unslug(m[1]!) : '' }
      await update($, ships, list => [...list.slice(-30), ship])
    }
    return r
  })

  // Every file a loop touches lights its zone; a subagent's touches also steer its ship.
  on('tool.call', async ($, e, next) => {
    const a = e as { file_path?: unknown; path?: unknown; agentId?: string }
    const p = typeof a.file_path === 'string' ? a.file_path : typeof a.path === 'string' ? a.path : ''
    const z = p && zones.length ? zoneOf(p, await $.session.cwd(), zones) : ''
    if (z) {
      await update($, found, list => (list.includes(z) ? list : [...list, z]))
      if (a.agentId) await update($, ships, list => list.map(s => (s.id === a.agentId ? { ...s, zone: z } : s)))
    }
    const ran = await next(e)
    if (e.tool === 'Agent') await update($, ships, list => [...list]) // redraw: a foreground agent just ended
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const live = new Set((await $.agent.list()).filter(a => ['pending', 'running', 'waiting'].includes(a.status)).map(a => a.id))
    const sky = {
      zones: await loadZones($),
      ships: (await read($, ships)).filter(s => live.has(s.id)),
      found: await read($, found),
      percent: (await read($, ctx)).percent,
    }
    if ('Svg' in els) {
      const { Svg } = els
      return <Svg source={skySvg(sky)} alt={skyText(sky)} />
    }
    const { Text } = els
    return <Text>{skyText(sky)}</Text>
  })
}
