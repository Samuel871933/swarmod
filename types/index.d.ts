export type Ship = { id: string; toolUseId: string; type: string; model: string; zone: string }
export type Ctx = { percent: number }

declare module 'claude-code' {
  interface PluginState {
    swarmod: {
      ships: Shaped<Ship[]>
      found: Shaped<string[]>
      ctx: Shaped<Ctx>
    }
  }
}
