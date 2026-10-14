import { api } from './hub'
import type { HubState } from './hub'
import type { Hub } from './screens/hubType'

export function setSimple(hub: Hub, on: boolean) {
  void hub.run(async () => { hub.setState(await api<HubState>('/profile', 'PUT', { ...hub.state.profile, simple: on })) })
}
