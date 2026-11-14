// explore: out at its last find · talk: hovering beside the ship it messages · home: docked at its station
export type ShipState = 'explore' | 'talk' | 'home'
export type Ship = {
  id: string; toolUseId: string; type: string; model: string; zone: string
  slot: number; state: ShipState; star?: string; with?: string
  from?: { x: number; y: number }; at?: number // last move, so the sky can draw the flight
}
// A file a ship found: a point in the sky. k = normalized path.
export type Star = { k: string; x: number; y: number; zone: string }
export type Ctx = { percent: number }

declare module 'claude-code' {
  interface PluginState {
    swarmod: {
      ships: Shaped<Ship[]>
      stars: Shaped<Star[]>
      found: Shaped<string[]>
      ctx: Shaped<Ctx>
      view: Shaped<{ open: boolean }>
    }
  }
}
