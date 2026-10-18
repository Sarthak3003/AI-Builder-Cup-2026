import type { CareState } from '../hub'

export type CareHub = {
  state: CareState
  busy: boolean
  run: (action: () => Promise<void>) => Promise<void>
  refresh: () => Promise<void>
  notify: (text: string) => void
}

export const allowed = (hub: CareHub, permission: string) => hub.state.grant.permissions.includes(permission)
