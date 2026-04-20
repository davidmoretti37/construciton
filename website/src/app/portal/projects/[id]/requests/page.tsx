"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PortalShell from "@/components/portal/PortalShell";
import { useToast } from "@/components/portal/Toast";
import { fetchRequests, createRequest, type PortalRequest } from "@/services/portal";

const requestTypes = [
  { value: "question", label: "Question" },
  { value: "issue", label: "Report Issue" },
  { value: "change_request", label: "Change Request" },
  { value: "warranty", label: "Warranty Claim" },
];

export default function PortalRequestsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("question");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (projectId) {
      fetchRequests(projectId)
        .then(setRequests)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [projectId]);

  const handleSubmit = async () => {
    if (!formTitle.trim() || !projectId) return;
    setSubmitting(true);
    try {
      const req = await createRequest(projectId, {
        type: formType,
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
      });
      setRequests((prev) => [req, ...prev]);
      setShowForm(false);
      setFormTitle("");
      setFormDesc("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to submit", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalShell>
      <div className="space-y-4">
        <Link href={`/portal/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Project
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Requests</h1>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            New Request
          </button>
        </div>

        {/* New Request Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Type</label>
              <div className="flex flex-wrap gap-2">
                {requestTypes.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setFormType(t.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      formType === t.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Brief description..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Details (optional)</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Provide more details..."
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-gray-500 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formTitle.trim() || submitting}
                className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        )}

        {/* Request List */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <div className="h-4 bg-gray-200 rounded w-40" />
                    <div className="h-3 bg-gray-100 rounded w-20" />
                  </div>
                  <div className="h-5 bg-gray-100 rounded-full w-16" />
                </div>
                <div className="h-3 bg-gray-50 rounded w-full" />
              </div>
            ))}
          </div>
        ) : requests.length === 0 && !showForm ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500">No requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{req.type.replace(/_/g, " ")}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    req.status === "resolved" ? "bg-green-100 text-green-700" :
                    req.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    req.status === "closed" ? "bg-gray-100 text-gray-500" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {req.status.replace(/_/g, " ")}
                  </span>
                </div>

                {req.description && (
                  <p className="text-xs text-gray-600 mb-3">{req.description}</p>
                )}

                {req.owner_response && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-2">
                    <p className="text-[10px] text-blue-600 font-medium mb-1">Contractor Response</p>
                    <p className="text-xs text-blue-800">{req.owner_response}</p>
                    {req.responded_at && (
                      <p className="text-[10px] text-blue-400 mt-1">
                        {new Date(req.responded_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-gray-400 mt-2">
                  {new Date(req.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
