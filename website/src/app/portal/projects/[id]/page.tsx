"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import PortalShell from "@/components/portal/PortalShell";
import MilestoneTracker from "@/components/portal/MilestoneTracker";
import PhotoTimeline from "@/components/portal/PhotoTimeline";
import MessageThread from "@/components/portal/MessageThread";
import ApprovalTimeline from "@/components/portal/ApprovalTimeline";
import SiteActivityBadge from "@/components/portal/SiteActivityBadge";
import {
  fetchProject,
  fetchEstimates,
  fetchInvoices,
  fetchMilestones,
  fetchMaterials,
  fetchSummaries,
  fetchRequests,
  fetchDocuments,
  respondToEstimate,
  payInvoice,
  type PortalProject,
  type PortalEstimate,
  type PortalInvoice,
  type PortalMilestonesData,
  type PortalMaterialSelection,
  type PortalWeeklySummary,
  type PortalRequest,
  type PortalDocument,
} from "@/services/portal";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");

  const [project, setProject] = useState<PortalProject | null>(null);
  const [estimates, setEstimates] = useState<PortalEstimate[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [milestones, setMilestones] = useState<PortalMilestonesData | null>(null);
  const [materials, setMaterials] = useState<PortalMaterialSelection[]>([]);
  const [summaries, setSummaries] = useState<PortalWeeklySummary[]>([]);
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentVerified, setPaymentVerified] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const proj = await fetchProject(id);
      setProject(proj);

      // Load additional data in parallel
      const results = await Promise.allSettled([
        fetchEstimates(id),
        fetchInvoices(id),
        fetchMilestones(id),
        fetchMaterials(id),
        fetchSummaries(id),
        fetchRequests(id),
        fetchDocuments(id),
      ]);

      if (results[0].status === "fulfilled") setEstimates(results[0].value);
      if (results[1].status === "fulfilled") setInvoices(results[1].value);
      if (results[2].status === "fulfilled") setMilestones(results[2].value);
      if (results[3].status === "fulfilled") setMaterials(results[3].value);
      if (results[4].status === "fulfilled") setSummaries(results[4].value);
      if (results[5].status === "fulfilled") setRequests(results[5].value);
      if (results[6].status === "fulfilled") setDocuments(results[6].value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Verify payment after Stripe redirect — poll until invoice status changes or timeout
  useEffect(() => {
    if (paymentStatus !== "success" || !id) return;
    let attempts = 0;
    const maxAttempts = 6;
    const checkPayment = () => {
      fetchInvoices(id)
        .then((updated) => {
          setInvoices(updated);
          const hasPaid = updated.some((inv) => inv.status === "paid" || inv.amount_paid > 0);
          if (hasPaid || attempts >= maxAttempts) {
            setPaymentVerified(true);
          } else {
            attempts++;
            setTimeout(checkPayment, 3000); // Retry every 3s
          }
        })
        .catch(() => setPaymentVerified(true));
    };
    checkPayment();
  }, [paymentStatus, id]);

  const handleEstimateRespond = async (estimateId: string, action: string) => {
    try {
      await respondToEstimate(estimateId, action);
      setEstimates((prev) =>
        prev.map((e) => (e.id === estimateId ? { ...e, status: action === "changes_requested" ? "sent" : action } : e))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to respond");
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      const { url } = await payInvoice(invoiceId);
      window.location.href = url;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start payment");
    }
  };

  if (loading) {
    return (
      <PortalShell>
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PortalShell>
    );
  }

  if (error || !project) {
    return (
      <PortalShell>
        <div className="text-center py-20">
          <p className="text-red-500 text-sm">{error || "Project not found"}</p>
          <Link href="/portal" className="text-sm text-blue-600 mt-2 inline-block">
            Back to dashboard
          </Link>
        </div>
      </PortalShell>
    );
  }

  const settings = project.settings || {} as Record<string, boolean>;

  return (
    <PortalShell>
      <div className="space-y-6">
        {/* Back button */}
        <Link href="/portal" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Dashboard
        </Link>

        {/* Payment success banner */}
        {paymentStatus === "success" && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            paymentVerified ? "bg-green-50 border border-green-200" : "bg-blue-50 border border-blue-200"
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              paymentVerified ? "bg-green-100" : "bg-blue-100"
            }`}>
              {paymentVerified ? (
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <p className={`text-sm font-medium ${paymentVerified ? "text-green-800" : "text-blue-800"}`}>
              {paymentVerified ? "Payment received! Thank you." : "Verifying payment..."}
            </p>
          </div>
        )}

        {/* Project header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
              {project.location && (
                <p className="text-sm text-gray-500 mt-0.5">{project.location}</p>
              )}
            </div>
            <SiteActivityBadge projectId={id} enabled={!!settings.show_site_activity} />
          </div>

          {/* Progress */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">Progress</span>
              <span className="text-xs font-medium text-gray-700">{project.percent_complete}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all"
                style={{ width: `${project.percent_complete}%` }}
              />
            </div>
          </div>

          {/* Dates & status */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            {project.start_date && <span>Start: {formatDate(project.start_date)}</span>}
            {project.end_date && <span>End: {formatDate(project.end_date)}</span>}
            <span className="capitalize">{project.status.replace(/-/g, " ")}</span>
          </div>

          {/* Budget (if enabled) */}
          {settings.show_budget && project.contract_amount != null && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Contract</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(project.contract_amount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Paid</p>
                <p className="text-sm font-semibold text-green-600">{formatCurrency(project.income_collected || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Remaining</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency((project.contract_amount || 0) - (project.income_collected || 0))}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Milestone Tracker */}
        {milestones && milestones.milestones.length > 0 && (
          <MilestoneTracker data={milestones} onPayInvoice={handlePayInvoice} />
        )}

        {/* Phases */}
        {settings.show_phases && project.phases && project.phases.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Project Phases</h2>
            <div className="space-y-3">
              {project.phases.map((phase) => (
                <div key={phase.id} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    phase.status === "completed" ? "bg-green-100" :
                    phase.status === "in_progress" ? "bg-blue-100" :
                    "bg-gray-100"
                  }`}>
                    {phase.status === "completed" ? (
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-[10px] font-bold ${
                        phase.status === "in_progress" ? "text-blue-600" : "text-gray-400"
                      }`}>
                        {phase.order_index + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium truncate">{phase.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 bg-gray-100 rounded-full h-1">
                        <div
                          className="h-1 rounded-full bg-blue-600"
                          style={{ width: `${phase.completion_percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-8 text-right">{phase.completion_percentage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Weekly Summaries */}
        {summaries.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Weekly Updates</h2>
            <div className="space-y-4">
              {summaries.map((summary) => (
                <div key={summary.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <p className="text-[10px] text-gray-400 mb-2">
                    Week of {formatDate(summary.week_start)} — {formatDate(summary.week_end)}
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{summary.summary_text}</p>
                  {summary.highlights.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {summary.highlights.map((h, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <span className="text-blue-500 mt-0.5">•</span> {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Estimates */}
        {estimates.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Estimates</h2>
            <div className="space-y-3">
              {estimates.map((est) => (
                <div key={est.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{est.estimate_number}</p>
                      {est.project_name && <p className="text-xs text-gray-500">{est.project_name}</p>}
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      est.status === "accepted" ? "bg-green-100 text-green-700" :
                      est.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {est.status}
                    </span>
                  </div>

                  {/* Line items */}
                  <div className="space-y-1 mb-3">
                    {est.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-600">{item.description} × {item.quantity}</span>
                        <span className="text-gray-900 font-medium">{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <p className="text-sm font-bold text-gray-900">Total: {formatCurrency(est.total)}</p>

                    {(est.status === "sent" || est.status === "viewed") && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEstimateRespond(est.id, "accepted")}
                          className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleEstimateRespond(est.id, "changes_requested")}
                          className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Request Changes
                        </button>
                        <button
                          onClick={() => handleEstimateRespond(est.id, "rejected")}
                          className="text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Invoices</h2>
            <div className="space-y-3">
              {invoices.map((inv) => (
                <div key={inv.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500">Due: {formatDate(inv.due_date)}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      inv.status === "paid" ? "bg-green-100 text-green-700" :
                      inv.status === "overdue" ? "bg-red-100 text-red-700" :
                      inv.status === "partial" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {inv.status}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.total)}</p>
                      {inv.amount_paid > 0 && (
                        <p className="text-xs text-gray-500">
                          Paid: {formatCurrency(inv.amount_paid)} · Due: {formatCurrency(inv.amount_due)}
                        </p>
                      )}
                    </div>

                    {(inv.status === "unpaid" || inv.status === "partial" || inv.status === "overdue") && (
                      <button
                        onClick={() => handlePayInvoice(inv.id)}
                        className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors"
                      >
                        Pay {formatCurrency(inv.amount_due)}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Material Selections */}
        {materials.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Material Selections</h2>
            <div className="space-y-4">
              {materials.map((mat) => (
                <Link
                  key={mat.id}
                  href={`/portal/projects/${id}/materials`}
                  className="block border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{mat.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {mat.options.length} options · {mat.status === "pending" ? "Awaiting your selection" : mat.status}
                      </p>
                    </div>
                    {mat.status === "pending" && (
                      <span className="text-xs text-blue-600 font-medium">Select →</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Photos */}
        {settings.show_photos && project.photos && project.photos.length > 0 && (
          <PhotoTimeline photos={project.photos} projectId={id} />
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Documents</h2>
            <div className="space-y-2">
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.download_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors ${
                    doc.download_url ? "" : "pointer-events-none opacity-50"
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title || doc.file_name}</p>
                    <p className="text-xs text-gray-500">
                      {doc.category && <span className="capitalize">{doc.category} · </span>}
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Messages */}
        {settings.show_messages && (
          <MessageThread projectId={id} />
        )}

        {/* Client Requests */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Your Requests</h2>
            <Link
              href={`/portal/projects/${id}/requests`}
              className="text-xs text-blue-600 font-medium"
            >
              {requests.length > 0 ? "View all" : "Submit a request"}
            </Link>
          </div>
          {requests.length > 0 ? (
            <div className="space-y-2">
              {requests.slice(0, 3).map((req) => (
                <div key={req.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{req.title}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    req.status === "resolved" ? "bg-green-100 text-green-700" :
                    req.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {req.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No requests submitted yet.</p>
          )}
        </section>

        {/* Approval History */}
        <ApprovalTimeline projectId={id} />
      </div>
    </PortalShell>
  );
}
