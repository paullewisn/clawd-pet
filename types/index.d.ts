export type Ref = { label: string; href: string; kind: 'ticket' | 'pr' }

declare module 'claude-code' {
  interface PluginState {
    clawd: {
      branch: string | null
      refs: Ref[]
      mode: string
      model: string
      drafting: boolean
      doneSeq: number
      context: number
    }
  }
}
