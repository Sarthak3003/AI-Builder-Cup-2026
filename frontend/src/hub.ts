export type Profile = {
  name: string; language: 'en-IN' | 'hi-IN'; large_text: boolean; high_contrast: boolean; simple?: boolean;
  vegetarian: boolean; mild: boolean; budget: number; home: string; caregiver_name: string;
  approval_limit: number; caregiver_enabled: boolean; medicines: string[]; enabled_providers: string[];
}
export type Service = 'food' | 'ride' | 'medicine'
export type Option = {
  id: string; name: string; price: number; detail: string;
  provider?: string; provider_name?: string; eta_min?: number; simulated?: boolean;
}
export type CatalogueApp = { id: string; name: string; service: Service; blurb: string; simulated: boolean }
export type Proposal = { id: string; service: Service; channel: string; options: Option[]; clarification: string; summary: string; status: string; expires_at: number; input?: { message?: string; destination?: string } }
export type AskResult = Omit<Proposal, 'service'> & { service: Service | null; understood_by: 'keywords' | 'gemini'; transcript?: string }
export type Activity = { id: string; service: Service; channel: string; option: Option; status: string; created_at: number; reference?: string; simulated?: boolean }
export type HubState = { profile: Profile; role: 'owner' | 'caregiver'; storage: string; gemini?: boolean; catalogue: CatalogueApp[]; activity: Activity[]; requests: Proposal[]; messages: { role: string; text: string; channel: string }[]; audit: { event: string; request_id: string; at: number }[] }

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/hub${path}`, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000) })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check the form and try again.')
  return data as T
}
export const statusLabel: Record<string, string> = {
  awaiting_approval: 'Waiting for caregiver', simulated_confirmed: 'Booked · demo only',
  cancelled: 'Cancelled', rejected: 'Declined by caregiver', proposed: 'Ready to review', needs_details: 'More details needed',
}
export const serviceNames: Record<Service, string> = { ride: 'Book a ride', food: 'Order food', medicine: 'Medicine request' }
export const waitText = (service: Service, minutes: number) => (service === 'ride' ? `${minutes} min away` : `About ${minutes} min`)
