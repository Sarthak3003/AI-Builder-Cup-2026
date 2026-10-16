export type Profile = {
  name: string; language: 'en-IN' | 'hi-IN'; large_text: boolean; high_contrast: boolean; simple?: boolean;
  vegetarian: boolean; mild: boolean; budget: number; home: string; caregiver_name: string;
  approval_limit: number; caregiver_enabled: boolean; medicines: string[]; enabled_providers: string[];
  sharing?: Sharing; channel?: Channel; read_aloud?: boolean; offer_help?: boolean; payment_method?: PaymentMethod | null;
}
export type Channel = 'app' | 'voice' | 'message'
export type PaymentMethod = 'DEMO_WALLET' | 'PAY_ON_COMPLETION'
export type StepId = 'welcome' | 'accessibility' | 'places' | 'care_circle' | 'services' | 'payment' | 'review'
export type Review = {
  name: string; language: Profile['language']; channel: string; comfort: string[]; places: string[]; pickup: string | null;
  services: { service_type: ServiceType; provider_label: string; status: ConnectionStatus }[]; payment: string | null;
  care_circle: { name: string; role: Role; permissions: string[] }[]; approval_rule: string; missing: string[];
}
export type Progress = {
  steps: { id: StepId; title: string; status: 'done' | 'skipped' | null }[]; current: StepId;
  completed: boolean; completed_at: number | null; started_at: number | null; review: Review;
}
export type Place = { id: string; label: string; address: string; notes: string; is_default_pickup: boolean; created_at?: number; updated_at?: number }
export type SamplePlace = { label: string; address: string; notes: string }
export type ServiceType = 'RIDE' | 'FOOD' | 'PHARMACY'
export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'SETUP_REQUIRED'
export type RideOptionInfo = { id: string; name: string; app_id: string | null; app_name: string | null; pickup_min: number; enabled: boolean }
export type MenuItem = { id: string; name: string; price_minor: number; vegetarian?: boolean; mild?: boolean; minutes?: number }
export type KitchenInfo = { id: string; name: string; app_name: string | null; enabled: boolean; items: MenuItem[] }
export type Catalogue = { options?: RideOptionInfo[]; kitchens?: KitchenInfo[]; items?: MenuItem[]; delivery_fee_minor?: number }
export type DemoService = {
  service_type: ServiceType; provider_type: string; provider_label: string; connection_mode: 'SIMULATED'; status: ConnectionStatus;
  granted_capabilities: string[]; consent_at: number | null; updated_at: number | null; description: string; notice: string;
  capabilities: { id: string; label: string }[]; catalogue: Catalogue;
}
export type Sharing = { ride: boolean; food: boolean; medicine: boolean; appointments: boolean }
export type Service = 'food' | 'ride' | 'medicine'
export type CatalogueApp = { id: string; name: string; service: Service; service_type?: ServiceType; simulated: boolean }
export type BookingStatus = 'AWAITING_APPROVAL' | 'CONFIRMED_SIMULATED' | 'COMPLETED_SIMULATED' | 'FAILED' | 'CANCELLED_SIMULATED' | 'DECLINED'
export type PaymentStatus = 'PENDING_SIMULATED' | 'SUCCEEDED_SIMULATED' | 'FAILED_SIMULATED' | 'NOT_CHARGED_SIMULATED'
export type LineItem = { label: string; amount_minor: number }
export type PlaceSnapshot = { label: string; address?: string; place_id?: string | null }
export type OrderItem = { item_id?: string; name: string; quantity: number; unit_minor?: number; vegetarian?: boolean; mild?: boolean }
export type Details = { pickup?: PlaceSnapshot; destination?: PlaceSnapshot; distance_km?: number | null; kitchen?: string; items?: OrderItem[] }
// What a demo provider offered. Caretakers receive a trimmed copy without addresses or payment.
type Offer = {
  service: Service; service_type: ServiceType; provider_type: string; provider_label: string; option_id?: string; option_name: string;
  app_id?: string | null; app_name?: string | null; title: string; line_items?: LineItem[]; amount_minor: number; currency: string;
  pickup_eta_min?: number | null; duration_min?: number | null; delivery_min?: number | null; details?: Details; notice: string; simulated: boolean;
}
export type Quote = Offer & {
  id: string; request_id: string; payment_method: PaymentMethod; approval: { required: boolean; reason: string }; channel: string;
  appointment_id: string | null; status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED'; created_at: number; expires_at: number;
}
export type QuoteResult = { request_id: string; service_type: ServiceType; quotes: Quote[] }
export type AskResult = {
  id: string; service: Service | null; channel: string; status: 'quoted' | 'needs_details'; summary: string; clarification: string;
  request_id: string | null; quotes: Quote[]; appointment_id: string | null; input?: { message?: string; destination?: string };
  understood_by: 'keywords' | 'gemini' | 'appointment'; transcript?: string;
}
export type Payment = { method: PaymentMethod; status: PaymentStatus; amount_minor: number; currency: string; simulated: boolean; updated_at?: number; refund?: { status: string; at: number } | null }
export type Decision = { action: 'approve' | 'reject'; by: string; name: string; note: string; at: number }
export type Activity = Offer & {
  id: string; request_id?: string; quote_id?: string; channel: string; booking_status: BookingStatus; provider_booking_id: string | null;
  payment?: Payment; shared?: boolean; approval_reason?: string; appointment_id?: string | null; decision?: Decision | null;
  questions?: { by: string; text: string; at: number }[]; failure?: string; created_at: number; updated_at?: number;
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
  profile: Profile; role: 'owner'; storage: string; gemini?: boolean; catalogue: CatalogueApp[]; activity: Activity[]; quotes: Quote[];
  messages: { role: string; text: string; channel: string }[]; audit: { event: string; request_id: string; at: number; actor?: string }[];
  care_circle?: Grant[]; events?: CareEvent[]; appointments?: Appointment[]; reminders?: Reminder[]; contacts?: Contact[]; conversations?: Conversation[];
  permissions?: Record<string, string>; roles?: Record<Role, string[]>; sensitive?: string[]; demo_controls?: boolean;
  demo_people?: DemoPerson[]; demo_person?: string;
  onboarding?: Progress; places?: Place[]; services?: DemoService[]; payment_methods?: Record<PaymentMethod, string>; sample_places?: SamplePlace[];
}
export type DemoPerson = { id: string; name: string; role: string }
// What a caretaker receives: built by the backend from their permissions only.
export type CareState = {
  role: 'caregiver'; grant: Grant; owner: { name: string; language: Profile['language'] };
  profile: { name: string; language: Profile['language']; home: string; medicines: string[]; approval_limit: number | null; large_text: boolean; high_contrast: boolean };
  activity: Activity[]; approvals: Activity[]; appointments: Appointment[]; reminders: Reminder[]; contacts: Contact[];
  events: CareEvent[]; circle: Grant[]; conversations: Conversation[]; permissions: Record<string, string>; storage: string; catalogue: CatalogueApp[];
  demo_people?: DemoPerson[]; demo_person?: string; demo_controls?: boolean;
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/hub${path}`, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000) })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check the form and try again.')
  return data as T
}
export const bookingStatusLabel: Record<BookingStatus, string> = {
  AWAITING_APPROVAL: 'Waiting for approval · not booked yet', CONFIRMED_SIMULATED: 'Booked · simulated', COMPLETED_SIMULATED: 'Completed · simulated',
  FAILED: 'Failed · nothing booked', CANCELLED_SIMULATED: 'Cancelled · simulated', DECLINED: 'Declined in Care Circle',
}
export const statusLabel: Record<string, string> = { ...bookingStatusLabel, no_booking: 'Nothing booked' }
export const paymentLabel: Record<PaymentStatus, string> = {
  NOT_CHARGED_SIMULATED: 'Not charged (simulated)',
  PENDING_SIMULATED: 'Pending (simulated) · nothing charged yet',
  SUCCEEDED_SIMULATED: 'Paid (simulated) · no money charged',
  FAILED_SIMULATED: 'Failed (simulated) · nothing charged',
}
export const live = (item: Activity) => item.booking_status === 'AWAITING_APPROVAL' || item.booking_status === 'CONFIRMED_SIMULATED'
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
export const connectionLabel: Record<ConnectionStatus, string> = { CONNECTED: 'Connected (demo)', DISCONNECTED: 'Disconnected', SETUP_REQUIRED: 'Setup required' }
export const paymentMethodLabel: Record<PaymentMethod, string> = { DEMO_WALLET: 'Demo wallet (simulated)', PAY_ON_COMPLETION: 'Pay on completion (simulated)' }
export const serviceTypeOf: Record<Service, ServiceType> = { ride: 'RIDE', food: 'FOOD', medicine: 'PHARMACY' }
export const serviceOf: Record<ServiceType, Service> = { RIDE: 'ride', FOOD: 'food', PHARMACY: 'medicine' }
// Money arrives as integer paise; only the screen turns it into rupees.
export const formatINR = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
