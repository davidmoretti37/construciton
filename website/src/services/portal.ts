/**
 * Portal service layer — all client-facing API calls.
 */

import { portalFetch } from "@/lib/portal-api";

// ============================================================
// Types
// ============================================================

export interface PortalProject {
  id: string;
  name: string;
  status: string;
  percent_complete: number;
  location?: string;
  start_date?: string;
  end_date?: string;
  payment_structure?: string;
  contract_amount?: number;
  income_collected?: number;
  expenses?: number;
  phases?: PortalPhase[];
  photos?: PortalPhoto[];
  dailyLogs?: PortalDailyLog[];
  settings?: PortalSettings;
  created_at: string;
}

export interface PortalPhase {
  id: string;
  name: string;
  order_index: number;
  status: string;
  completion_percentage: number;
  start_date?: string;
  end_date?: string;
  tasks?: { name: string; completed: boolean }[];
  payment_amount?: number;
  invoiced?: boolean;
}

export interface PortalPhoto {
  url: string;
  caption?: string;
  date: string;
  reportId: string;
}

export interface PortalDailyLog {
  id: string;
  report_date: string;
  notes?: string;
  work_performed?: unknown;
  weather?: unknown;
  materials?: unknown;
  delays?: unknown;
}

export interface PortalSettings {
  show_phases: boolean;
  show_photos: boolean;
  show_budget: boolean;
  show_daily_logs: boolean;
  show_documents: boolean;
  show_messages: boolean;
  show_site_activity: boolean;
  weekly_summary_enabled: boolean;
  invoice_reminders: boolean;
}

export interface PortalEstimate {
  id: string;
  estimate_number: string;
  project_name?: string;
  items: { description: string; quantity: number; unit: string; pricePerUnit: number; total: number }[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  valid_until?: string;
  payment_terms?: string;
  notes?: string;
  status: string;
  sent_date?: string;
  viewed_date?: string;
  accepted_date?: string;
  rejected_date?: string;
  created_at: string;
}

export interface PortalInvoice {
  id: string;
  invoice_number: string;
  project_name?: string;
  items: { description: string; quantity: number; unit: string; pricePerUnit: number; total: number }[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  due_date: string;
  payment_terms?: string;
  notes?: string;
  paid_date?: string;
  created_at: string;
}

export interface PortalMilestone {
  phase_id: string;
  name: string;
  order: number;
  status: string;
  completion: number;
  payment_amount?: number;
  invoiced: boolean;
  invoice?: { id: string; status: string; amount_paid: number; amount_due: number; total: number } | null;
}

export interface PortalMilestonesData {
  contract_amount: number;
  payment_structure: string;
  total_collected: number;
  milestones: PortalMilestone[];
}

export interface PortalMessage {
  id: string;
  content: string;
  created_at: string;
  is_client: boolean;
  sender_name: string;
}

export interface PortalRequest {
  id: string;
  project_id: string;
  type: string;
  title: string;
  description?: string;
  photos: string[];
  status: string;
  owner_response?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PortalMaterialSelection {
  id: string;
  title: string;
  description?: string;
  options: { name: string; description?: string; photo_url?: string; price_difference?: number; is_default?: boolean }[];
  selected_option_index?: number;
  status: string;
  due_date?: string;
  client_notes?: string;
  selected_at?: string;
  confirmed_at?: string;
  created_at: string;
}

export interface PortalWeeklySummary {
  id: string;
  week_start: string;
  week_end: string;
  summary_text: string;
  highlights: string[];
  sent_at: string;
}

export interface PortalServicePlan {
  id: string;
  name: string;
  service_type: string;
  status: string;
  billing_cycle: string;
  price_per_visit?: number;
  monthly_rate?: number;
  created_at: string;
  locations?: { id: string; name: string; address: string; contact_name?: string; contact_phone?: string; is_active: boolean }[];
  recentVisits?: { id: string; scheduled_date: string; status: string; completed_at?: string; worker_notes?: string; photos?: string[] }[];
}

export interface PortalBranding {
  business_name: string;
  logo_url?: string;
  primary_color: string;
  accent_color: string;
}

export interface PortalDashboard {
  projects: PortalProject[];
  servicePlans: PortalServicePlan[];
  outstandingInvoices: PortalInvoice[];
  pendingEstimates: PortalEstimate[];
  branding: PortalBranding;
}

export interface PortalApprovalEvent {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_type: string;
  actor_id: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SiteActivity {
  date: string;
  workers_on_site: number;
  activity: { worker_name?: string; trade?: string; clock_in: string; clock_out?: string; is_active: boolean }[];
}

export interface PortalDocument {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  download_url: string | null;
  created_at: string;
}

// ============================================================
// API Functions
// ============================================================

export const fetchDashboard = () =>
  portalFetch<PortalDashboard>("/dashboard");

export const fetchBranding = () =>
  portalFetch<PortalBranding>("/branding");

export const fetchProject = (projectId: string) =>
  portalFetch<PortalProject>(`/projects/${projectId}`);

export const fetchProjectPhotos = (projectId: string) =>
  portalFetch<PortalPhoto[]>(`/projects/${projectId}/photos`);

export const fetchSiteActivity = (projectId: string) =>
  portalFetch<SiteActivity>(`/projects/${projectId}/activity`);

export const fetchEstimates = (projectId: string) =>
  portalFetch<PortalEstimate[]>(`/projects/${projectId}/estimates`);

export const respondToEstimate = (estimateId: string, action: string, notes?: string) =>
  portalFetch(`/estimates/${estimateId}/respond`, {
    method: "PATCH",
    body: JSON.stringify({ action, notes }),
  });

export const fetchInvoices = (projectId: string) =>
  portalFetch<PortalInvoice[]>(`/projects/${projectId}/invoices`);

export const fetchMilestones = (projectId: string) =>
  portalFetch<PortalMilestonesData>(`/projects/${projectId}/milestones`);

export const payInvoice = (invoiceId: string) =>
  portalFetch<{ url: string }>(`/invoices/${invoiceId}/pay`, { method: "POST" });

export const fetchMessages = (projectId: string) =>
  portalFetch<PortalMessage[]>(`/projects/${projectId}/messages`);

export const sendMessage = (projectId: string, content: string) =>
  portalFetch<PortalMessage>(`/projects/${projectId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

export const fetchRequests = (projectId: string) =>
  portalFetch<PortalRequest[]>(`/projects/${projectId}/requests`);

export const createRequest = (projectId: string, data: { type: string; title: string; description?: string; photos?: string[] }) =>
  portalFetch<PortalRequest>(`/projects/${projectId}/requests`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const fetchMaterials = (projectId: string) =>
  portalFetch<PortalMaterialSelection[]>(`/projects/${projectId}/materials`);

export const selectMaterial = (id: string, selectedOptionIndex: number, notes?: string) =>
  portalFetch(`/materials/${id}/select`, {
    method: "PATCH",
    body: JSON.stringify({ selectedOptionIndex, notes }),
  });

export const submitRating = (projectId: string, data: { rating: number; comment?: string; phaseId?: string; isProjectFinal?: boolean }) =>
  portalFetch(`/projects/${projectId}/rate`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const trackGoogleReviewClick = (projectId: string) =>
  portalFetch(`/projects/${projectId}/google-review-clicked`, { method: "POST" });

export const fetchSummaries = (projectId: string) =>
  portalFetch<PortalWeeklySummary[]>(`/projects/${projectId}/summaries`);

export const fetchServicePlans = () =>
  portalFetch<PortalServicePlan[]>("/services");

export const fetchServicePlan = (id: string) =>
  portalFetch<PortalServicePlan>(`/services/${id}`);

export const fetchApprovals = (projectId: string) =>
  portalFetch<PortalApprovalEvent[]>(`/projects/${projectId}/approvals`);

export const fetchDocuments = (projectId: string) =>
  portalFetch<PortalDocument[]>(`/projects/${projectId}/documents`);
