export type Profile = {
  name: string; language: 'en-IN' | 'hi-IN'; large_text: boolean; high_contrast: boolean; simple?: boolean;
  vegetarian: boolean; mild: boolean; budget: number; home: string; caregiver_name: string;
  approval_limit: number; caregiver_enabled: boolean; medicines: string[]; enabled_providers: string[];
  sharing?: Sharing;
}
export type Sharing = { ride: boolean; food: boolean; medicine: boolean; appointments: boolean }
export type Service = 'food' | 'ride' | 'medicine'
export type Option = {
  id: string; name: string; price: number; detail: string;
  provider?: string; provider_name?: string; eta_min?: number; simulated?: boolean;
}
export type CatalogueApp = { id: string; name: string; service: Service; blurb: string; simulated: boolean }
export type Proposal = { id: string; service: Service; channel: string; options: Option[]; clarification: string; summary: string; status: string; expires_at: number; input?: { message?: string; destination?: string }; appointment_id?: string }
export type AskResult = Omit<Proposal, 'service'> & { service: Service | null; understood_by: 'keywords' | 'gemini' | 'appointment'; transcript?: string }
export type PaymentStatus = 'not_charged_simulated' | 'pending_simulated' | 'succeeded_simulated'
export type Payment = { method: string; status: PaymentStatus; amount: number; simulated: boolean }
export type Decision = { action: 'approve' | 'reject'; by: string; name: string; note: string; at: number }
export type Activity = {
  id: string; service: Service; channel: string; option: Option; status: string; created_at: number; reference?: string; simulated?: boolean;
  payment?: Payment; shared?: boolean; approval_reason?: string; appointment_id?: string | null; decision?: Decision | null;
  questions?: { by: string; text: string; at: number }[]; failure?: string;
}
export type Role = 'viewer' | 'assistant' | 'approver' | 'administrator'
export type Grant = {
  id: string; name: string; relationship: string; role: Role; permissions: string[];
  status?: 'invited' | 'active' | 'revoked'; joined_at?: number | null; created_by?: string;
}
export type CareEvent = {
  id: string; at: number; kind: string; title: string; detail: string; permission: string; ref: string | null; topic?: string | null;
  severity: 'info' | 'attention'; certainty: 'confirmed' | 'suspected'; actor: string; status: 'open' | 'resolved' | 'info';
  resolved_by?: string; resolution?: string;
}
export type Appointment = { id: string; title: string; with_whom: string; place: string; starts_at: number; notes: string; ride_request_id: string | null; created_by: string }
export type Reminder = { id: string; title: string; kind: 'medicine' | 'appointment' | 'other'; due_at: number; notes: string; done_at: number | null; status: 'upcoming' | 'missed' | 'done'; created_by: string }
export type Contact = { id: string; name: string; relationship: string; phone: string; primary: boolean; added_by: string }
export type Summary = { by: 'rules' | 'gemini'; text: string; confirmed: string[]; suggestions: string[] }
export type Line = { role: string; text: string }
export type Conversation = {
  id: string; channel: string; at: number; service: Service | null; request_id: string | null; safety: string | null; seeded?: boolean;
  status: string; summary: Summary; transcript?: Line[];
}
export type HubState = {
  profile: Profile; role: 'owner'; storage: string; gemini?: boolean; catalogue: CatalogueApp[]; activity: Activity[]; requests: Proposal[];
  messages: { role: string; text: string; channel: string }[]; audit: { event: string; request_id: string; at: number; actor?: string }[];
  care_circle?: Grant[]; events?: CareEvent[]; appointments?: Appointment[]; reminders?: Reminder[]; contacts?: Contact[]; conversations?: Conversation[];
  permissions?: Record<string, string>; roles?: Record<Role, string[]>; sensitive?: string[]; demo_controls?: boolean;
  demo_people?: DemoPerson[]; demo_person?: string;
}
export type DemoPerson = { id: string; name: string; role: string }
// What a caretaker receives: built by the backend from their permissions only.
export type CareState = {
  role: 'caregiver'; grant: Grant; owner: { name: string; language: Profile['language'] };
  profile: { name: string; language: Profile['language']; home: string; medicines: string[]; approval_limit: number | null; large_text: boolean; high_contrast: boolean };
  activity: Activity[]; approvals: Activity[]; appointments: Appointment[]; reminders: Reminder[]; contacts: Contact[];
  events: CareEvent[]; circle: Grant[]; conversations: Conversation[]; permissions: Record<string, string>; storage: string; catalogue: CatalogueApp[];
  demo_people?: DemoPerson[]; demo_person?: string;
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/hub${path}`, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000) })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check the form and try again.')
  return data as T
}
export const statusLabel: Record<string, string> = {
  awaiting_approval: 'Waiting for approval', simulated_confirmed: 'Booked · simulated', completed: 'Completed · simulated',
  failed: 'Failed · nothing booked', cancelled: 'Cancelled', rejected: 'Declined in Care Circle',
  proposed: 'Ready to review', needs_details: 'More details needed', no_booking: 'Nothing booked',
}
export const paymentLabel: Record<PaymentStatus, string> = {
  not_charged_simulated: 'Not charged (simulated)',
  pending_simulated: 'Pay on completion (simulated) · nothing charged yet',
  succeeded_simulated: 'Paid (simulated) · no real money moved',
}
export const roleLabel: Record<Role, string> = { viewer: 'Viewer', assistant: 'Assistant', approver: 'Approver', administrator: 'Administrator' }
export const roleBlurb: Record<Role, string> = {
  viewer: 'Sees shared rides, orders and appointments.',
  assistant: 'Also helps with reminders, appointments and saved addresses.',
  approver: 'Also approves or declines requests you send for approval.',
  administrator: 'Also invites and removes viewers and assistants.',
}
const when = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
export const formatWhen = (seconds: number) => when.format(new Date(seconds * 1000))
export const inviteLink = (code: string) => `${window.location.origin}${window.location.pathname}#/join/${code}`
export const serviceNames: Record<Service, string> = { ride: 'Book a ride', food: 'Order food', medicine: 'Medicine request' }
export const waitText = (service: Service, minutes: number) => (service === 'ride' ? `${minutes} min away` : `About ${minutes} min`)
