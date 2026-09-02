/**
 * Domain types mirroring the Vision CRM schema.
 *
 * src/integrations/supabase/types.ts is generated from the database and still
 * describes the prototype tables only. Rather than hand-edit a generated file,
 * the spec schema is typed here and reached through the loosely-typed client in
 * ./db.ts. Regenerating Supabase types later can replace this file wholesale.
 */

/**
 * A row returned by a joined Supabase select.
 *
 * PostgREST embeds ("students(id, full_name)") are shaped by the query string
 * rather than by the schema, so generated types cannot describe them. Naming
 * that looseness once keeps it greppable instead of scattering bare `any`
 * through every screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;

export type StaffRole = "owner" | "admin";
export type PersonStatus = "active" | "inactive";
export type PeriodType = "standard_term" | "holiday_intensive" | "other";
export type PeriodStatus = "planned" | "active" | "closed";
export type PricingBasis = "per_hour" | "per_session" | "fixed_hours_price";
export type PriceStatus = "active" | "inactive";
export type OfferingType = "group_class" | "private_tuition";
export type OfferingStatus = "planned" | "active" | "closed" | "cancelled";
export type RecurrencePattern = "weekly" | "fortnightly" | "daily" | "one_off" | "ad_hoc";
export type SessionStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
export type SessionType = "regular" | "dedicated_make_up";
export type EnrolmentStatus = "trial" | "active" | "closed";
export type BillingMethod = "hours" | "payg";
export type AdjustmentType = "none" | "percentage" | "fixed_amount" | "final_price_override";
export type ClosureReason = "completed" | "withdrawn" | "transferred" | "other";
export type PackageType = "purchased" | "courtesy";
export type PackageStatus = "draft" | "active" | "closed" | "expired";
export type AttendanceType = "regular" | "trial" | "make_up";
export type AttendanceStatus = "not_marked" | "present" | "absent";
export type ChargeSource = "hours" | "payg";
export type ChargeRoute = "parent" | "internal";
export type ChargeStatus = "to_invoice" | "invoiced" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "other";
export type PayoutStatus = "draft" | "approved" | "paid";
export type MakeUpState = "outstanding" | "scheduled" | "completed" | null;

// Leads & trials — the pre-student pipeline.
export type LeadStatus = "new" | "contacted" | "nurturing" | "trial_booked" | "converted" | "lost";
export type LeadSource =
  "referral" | "google" | "social_media" | "walk_in" | "event" | "website" | "other";
export type ContactChannel = "phone" | "sms" | "email" | "whatsapp" | "in_person" | "other";
export type TrialKind = "class_trial" | "diagnostic_test";
export type TrialStatus =
  "proposed" | "scheduled" | "attended" | "no_show" | "converted" | "declined";
export type DiagnosticRecommendation =
  "ready_for_class" | "needs_foundation" | "accelerate" | "not_suitable" | "undecided";

export interface Staff {
  user_id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
}

export interface Guardian {
  id: string;
  code: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  status: PersonStatus;
  notes: string | null;
}

export interface Student {
  id: string;
  code: string;
  full_name: string;
  status: PersonStatus;
  year_level: string | null;
  current_school: string | null;
  date_of_birth: string | null;
  joined_on: string | null;
  how_they_found_us: string | null;
  default_payer_id: string | null;
  notes: string | null;
}

export interface Tutor {
  id: string;
  code: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  status: PersonStatus;
  colour: string | null;
  notes: string | null;
}

export interface OperatingPeriod {
  id: string;
  name: string;
  code: string;
  period_type: PeriodType;
  starts_on: string;
  ends_on: string;
  status: PeriodStatus;
}

export interface StandardPrice {
  id: string;
  name: string;
  code: string;
  year_group: string | null;
  scope: string | null;
  basis: PricingBasis;
  quantity: number;
  unit_rate: number;
  effective_from: string;
  effective_to: string | null;
  status: PriceStatus;
  notes: string | null;
}

export interface Program {
  id: string;
  name: string;
  code: string;
  year_level: string | null;
  subject: string | null;
  exam_focus: string | null;
  default_offering_type: OfferingType | null;
  standard_duration_hours: number;
  default_price_id: string | null;
  is_active: boolean;
}

export interface ClassOffering {
  id: string;
  code: string;
  program_id: string;
  operating_period_id: string;
  primary_tutor_id: string | null;
  offering_type: OfferingType;
  capacity: number;
  starts_on: string;
  ends_on: string;
  recurrence: RecurrencePattern;
  recurrence_start: string | null;
  session_duration_hours: number;
  room: string | null;
  price_override: number | null;
  status: OfferingStatus;
  notes: string | null;
}

export interface SessionRow {
  id: string;
  code: string;
  class_offering_id: string;
  tutor_id: string | null;
  session_type: SessionType;
  status: SessionStatus;
  starts_at: string;
  ends_at: string;
  room: string | null;
  replaces_session_id: string | null;
  notes: string | null;
  /* from v_sessions */
  session_date: string;
  duration_hours: number;
  payable_hours: number;
  fortnight_start: string;
  fortnight_end: string;
  is_today: boolean;
  is_this_fortnight: boolean;
}

export interface Enrolment {
  id: string;
  code: string;
  student_id: string;
  class_offering_id: string;
  status: EnrolmentStatus;
  starts_on: string;
  ends_on: string | null;
  closure: ClosureReason | null;
  method: BillingMethod | null;
  standard_price_id: string | null;
  base_price: number | null;
  adjustment: AdjustmentType;
  adjustment_value: number;
  hours_override: number | null;
  default_package_id: string | null;
  notes: string | null;
  /* from v_enrolments */
  final_agreed_price: number | null;
}

export interface HoursPackage {
  id: string;
  code: string;
  student_id: string;
  package_type: PackageType;
  hours_purchased: number;
  price: number;
  standard_price_id: string | null;
  approved_on: string;
  status: PackageStatus;
  low_balance_threshold: number;
  courtesy_reason: string | null;
  admin_note: string | null;
  /* from v_hours_packages */
  hours_used: number;
  hours_remaining: number;
  is_low: boolean;
  is_overdrawn: boolean;
}

export interface AttendanceRow {
  id: string;
  code: string;
  session_id: string;
  enrolment_id: string;
  att_type: AttendanceType;
  status: AttendanceStatus;
  package_id: string | null;
  source_attendance_id: string | null;
  correction_note: string | null;
  /* from v_attendance */
  session_date: string;
  lesson_starts_at: string;
  class_offering_id: string;
  lesson_tutor_id: string | null;
  student_id: string;
  billing_method: BillingMethod | null;
  effective_status: string;
  hours_consumed: number;
  make_up_state: MakeUpState;
}

export interface Charge {
  id: string;
  code: string;
  student_id: string;
  payer_id: string | null;
  source: ChargeSource;
  package_id: string | null;
  attendance_id: string | null;
  standard_amount: number;
  adjustment: number;
  route: ChargeRoute;
  status: ChargeStatus;
  invoice_date: string | null;
  xero_invoice_no: string | null;
  paid_date: string | null;
  method: PaymentMethod | null;
  payment_ref: string | null;
  notes: string | null;
  /* from v_charges */
  final_amount: number;
}

export interface NeedsAttentionRow {
  entity: "session" | "attendance" | "student" | "enrolment" | "hours_package";
  id: string;
  code: string;
  issue: string;
}

export interface FortnightPay {
  tutor_id: string;
  tutor_name: string;
  fortnight_start: string;
  fortnight_end: string;
  lessons: number;
  hours: number;
  adjustments: number;
  total_pay: number;
}

export interface SessionPay {
  session_id: string;
  code: string;
  class_offering_id: string;
  tutor_id: string | null;
  session_date: string;
  fortnight_start: string;
  payable_hours: number;
  hourly_rate: number | null;
  base_pay: number;
  adjustment: number;
  pay: number;
}

export interface TutorPayRate {
  id: string;
  tutor_id: string;
  hourly_rate: number;
  effective_from: string;
  note: string | null;
}

export interface TutorPayout {
  id: string;
  code: string;
  tutor_id: string;
  fortnight_start: string;
  hours_worked: number;
  rate_at_payout: number;
  hours_adjustment: number;
  amount_adjustment: number;
  adjustment_reason: string | null;
  status: PayoutStatus;
  paid_date: string | null;
  method: PaymentMethod | null;
  payment_ref: string | null;
  notes: string | null;
}

export interface Lead {
  id: string;
  code: string;
  student_name: string;
  year_level: string | null;
  subject_interest: string | null;
  program_interest_id: string | null;
  guardian_name: string;
  guardian_email: string | null;
  guardian_mobile: string | null;
  status: LeadStatus;
  source: LeadSource;
  source_detail: string | null;
  assigned_to: string | null;
  next_action_on: string | null;
  lost_reason: string | null;
  converted_student_id: string | null;
  converted_enrolment_id: string | null;
  converted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // v_leads adds:
  latest_contact_at?: string | null;
  contact_count?: number;
  days_since_contact?: number | null;
  days_in_pipeline?: number;
  trial_count?: number;
  is_overdue?: boolean;
  assigned_name?: string | null;
  program_interest_name?: string | null;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  contacted_at: string;
  channel: ContactChannel;
  summary: string;
  next_action_on: string | null;
  contacted_by: string | null;
  created_at: string;
}

export interface Trial {
  id: string;
  code: string;
  lead_id: string;
  kind: TrialKind;
  class_offering_id: string | null;
  session_id: string | null;
  enrolment_id: string | null;
  scheduled_for: string | null;
  status: TrialStatus;
  recommendation: DiagnosticRecommendation | null;
  recommended_program_id: string | null;
  score: string | null;
  outcome_notes: string | null;
  conducted_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Human labels. The UI never shows a raw enum value. */
export const LABELS = {
  sessionStatus: {
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
    rescheduled: "Rescheduled",
  },
  attendanceStatus: {
    not_marked: "Not marked",
    present: "Present",
    absent: "Absent",
  },
  attendanceType: { regular: "Regular", trial: "Trial", make_up: "Make-up" },
  enrolmentStatus: { trial: "Trial", active: "Active", closed: "Closed" },
  billingMethod: { hours: "Hours", payg: "Pay as you go" },
  packageType: { purchased: "Purchased", courtesy: "Courtesy" },
  packageStatus: { draft: "Draft", active: "Active", closed: "Closed", expired: "Expired" },
  chargeStatus: {
    to_invoice: "To invoice",
    invoiced: "Invoiced",
    paid: "Paid",
    cancelled: "Cancelled",
  },
  chargeRoute: { parent: "Parent", internal: "Internal (cash/bank)" },
  paymentMethod: { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", other: "Other" },
  offeringType: { group_class: "Group class", private_tuition: "Private tuition" },
  offeringStatus: {
    planned: "Planned",
    active: "Active",
    closed: "Closed",
    cancelled: "Cancelled",
  },
  periodType: {
    standard_term: "Standard term",
    holiday_intensive: "Holiday intensive",
    other: "Other",
  },
  periodStatus: { planned: "Planned", active: "Active", closed: "Closed" },
  pricingBasis: {
    per_hour: "Per hour",
    per_session: "Per session",
    fixed_hours_price: "Fixed hours price",
  },
  recurrence: {
    weekly: "Weekly",
    fortnightly: "Fortnightly",
    daily: "Daily",
    one_off: "One-off",
    ad_hoc: "Ad hoc",
  },
  adjustmentType: {
    none: "None",
    percentage: "Percentage",
    fixed_amount: "Fixed amount",
    final_price_override: "Final price override",
  },
  payoutStatus: { draft: "Draft", approved: "Approved", paid: "Paid" },
  closureReason: {
    completed: "Completed",
    withdrawn: "Withdrawn",
    transferred: "Transferred",
    other: "Other",
  },
  leadStatus: {
    new: "New",
    contacted: "Contacted",
    nurturing: "Nurturing",
    trial_booked: "Trial booked",
    converted: "Converted",
    lost: "Lost",
  },
  leadSource: {
    referral: "Referral",
    google: "Google",
    social_media: "Social media",
    walk_in: "Walk-in",
    event: "Event",
    website: "Website",
    other: "Other",
  },
  contactChannel: {
    phone: "Phone",
    sms: "SMS",
    email: "Email",
    whatsapp: "WhatsApp",
    in_person: "In person",
    other: "Other",
  },
  trialKind: { class_trial: "Class trial", diagnostic_test: "Diagnostic test" },
  trialStatus: {
    proposed: "Proposed",
    scheduled: "Scheduled",
    attended: "Attended",
    no_show: "No-show",
    converted: "Converted",
    declined: "Declined",
  },
  diagnosticRecommendation: {
    ready_for_class: "Ready for class",
    needs_foundation: "Needs foundation",
    accelerate: "Accelerate",
    not_suitable: "Not suitable",
    undecided: "Undecided",
  },
} as const;

/** How a charge came to exist, for a screen that has to name it. */
export function chargeSourceLabel(source: string | null | undefined): string {
  if (source === "hours") return "Hours package";
  if (source === "payg") return "PAYG lesson";
  if (source === "manual") return "One-off bill";
  return "Charge";
}

/**
 * Timetable swatches.
 *
 * Eighteen hues around the wheel, four steps of depth each. The rows are the
 * same four steps for every hue, so picking "the light green" and "the light
 * blue" for two tutors gives two colours of matching weight - which is what
 * keeps a week of blocks looking like one calendar rather than a paint chart.
 *
 * The eight colours this list used to hold are all still here, in the third
 * row, so every tutor already assigned a colour keeps exactly the one they had.
 */
export const TUTOR_COLOUR_FAMILIES: { name: string; shades: [string, string, string, string] }[] = [
  { name: "Red", shades: ["#f87171", "#ef4444", "#dc2626", "#b91c1c"] },
  { name: "Orange", shades: ["#fb923c", "#f97316", "#ea580c", "#c2410c"] },
  { name: "Amber", shades: ["#fbbf24", "#f59e0b", "#d97706", "#b45309"] },
  { name: "Yellow", shades: ["#facc15", "#eab308", "#ca8a04", "#a16207"] },
  { name: "Lime", shades: ["#a3e635", "#84cc16", "#65a30d", "#4d7c0f"] },
  { name: "Green", shades: ["#4ade80", "#22c55e", "#16a34a", "#15803d"] },
  { name: "Emerald", shades: ["#34d399", "#10b981", "#059669", "#047857"] },
  { name: "Teal", shades: ["#2dd4bf", "#14b8a6", "#0d9488", "#0f766e"] },
  { name: "Cyan", shades: ["#22d3ee", "#06b6d4", "#0891b2", "#0e7490"] },
  { name: "Sky", shades: ["#38bdf8", "#0ea5e9", "#0284c7", "#0369a1"] },
  { name: "Blue", shades: ["#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"] },
  { name: "Indigo", shades: ["#818cf8", "#6366f1", "#4f46e5", "#4338ca"] },
  { name: "Violet", shades: ["#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9"] },
  { name: "Purple", shades: ["#c084fc", "#a855f7", "#9333ea", "#7e22ce"] },
  { name: "Fuchsia", shades: ["#e879f9", "#d946ef", "#c026d3", "#a21caf"] },
  { name: "Pink", shades: ["#f472b6", "#ec4899", "#db2777", "#be185d"] },
  { name: "Rose", shades: ["#fb7185", "#f43f5e", "#e11d48", "#be123c"] },
  { name: "Slate", shades: ["#94a3b8", "#64748b", "#475569", "#334155"] },
];

/** Every swatch, flat - for validation and for the "is this one of ours" check. */
export const TUTOR_COLOURS: string[] = TUTOR_COLOUR_FAMILIES.flatMap((f) => f.shades);

/** What a tutor gets before anyone picks for them. */
export const DEFAULT_TUTOR_COLOUR = "#4f46e5";
