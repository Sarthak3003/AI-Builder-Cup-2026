import type { HubState } from '../hub'

export type Hub = {
  state: HubState
  busy: boolean
  online: boolean
  run: (action: () => Promise<void>) => Promise<void>
  refresh: () => Promise<void>
  setState: (state: HubState) => void
  notify: (text: string) => void
}
