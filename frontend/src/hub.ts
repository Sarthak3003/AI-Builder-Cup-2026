export type Profile = {
  name: string; language: 'en-IN' | 'hi-IN'; large_text: boolean; high_contrast: boolean;
  vegetarian: boolean; mild: boolean; budget: number; home: string; caregiver_name: string;
  approval_limit: number; caregiver_enabled: boolean; medicines: string[];
}
export type Service = 'food' | 'ride' | 'medicine'
export type Option = { id: string; name: string; price: number; detail: string }
export type Proposal = { id: string; service: Service; channel: string; options: Option[]; clarification: string; summary: string; status: string; expires_at: number }
export type Activity = { id: string; service: Service; channel: string; option: Option; status: string; created_at: number }
export type HubState = { profile: Profile; role: 'owner' | 'caregiver'; storage: string; activity: Activity[]; requests: Proposal[]; messages: { role: string; text: string; channel: string }[]; audit: { event: string; request_id: string; at: number }[] }

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/hub${path}`, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000) })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check the form and try again.')
  return data as T
}
export const statusLabel: Record<string, string> = {
  awaiting_approval: 'Waiting for caregiver', simulated_confirmed: 'Confirmed · demo only',
  cancelled: 'Cancelled', rejected: 'Declined by caregiver', proposed: 'Ready to review', needs_details: 'More details needed',
}
