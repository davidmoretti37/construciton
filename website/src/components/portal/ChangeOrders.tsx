"use client";

import { useEffect, useState } from "react";
import { fetchChangeOrders, respondToChangeOrder, type PortalChangeOrder } from "@/services/portal";
import { useToast } from "./Toast";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ChangeOrders({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PortalChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  useEffect(() => {
    fetchChangeOrders(projectId)
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleRespond = async (coId: string, action: "approve" | "reject", reason?: string) => {
    setRespondingId(coId);
    try {
      await respondToChangeOrder(coId, action, reason);
      setOrders((prev) =>
        prev.map((co) =>
          co.id === coId
            ? { ...co, status: action === "approve" ? "approved" : "rejected", client_responded_at: new Date().toISOString() }
            : co
        )
      );
      setShowRejectFor(null);
      setRejectReason("");
      toast(action === "approve" ? "Change order approved" : "Change order declined", action === "approve" ? "success" : "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to respond", "error");
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-32" />
          <div className="h-20 bg-gray-50 rounded-lg" />
        </div>
      </section>
    );
  }

  if (orders.length === 0) return null;

  const pending = orders.filter((co) => co.status === "pending_client");
  const others = orders.filter((co) => co.status !== "pending_client");

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Change Orders</h2>

      <div className="space-y-3">
        {/* Pending change orders first */}
        {pending.map((co) => (
          <div key={co.id} className="border-2 border-amber-200 bg-amber-50 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900">{co.title}</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Awaiting Response
                  </span>
                </div>
                {co.description && (
                  <p className="text-xs text-gray-600 mb-2">{co.description}</p>
                )}
              </div>
            </div>

            {/* Line items */}
            {co.items && co.items.length > 0 && (
              <div className="space-y-1 mb-3">
                {co.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600">{item.description}</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-amber-200">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {co.total_amount > 0 ? "+" : ""}{formatCurrency(co.total_amount)}
                </p>
                <p className="text-[10px] text-gray-400">
                  {formatDate(co.created_at)}
                </p>
              </div>

              {showRejectFor === co.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    onClick={() => handleRespond(co.id, "reject", rejectReason)}
                    disabled={respondingId === co.id}
                    className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => { setShowRejectFor(null); setRejectReason(""); }}
                    className="text-xs text-gray-500 px-2 py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(co.id, "approve")}
                    disabled={respondingId === co.id}
                    className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {respondingId === co.id ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={() => setShowRejectFor(co.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Resolved change orders */}
        {others.map((co) => (
          <div key={co.id} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-medium text-gray-900">{co.title}</p>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                co.status === "approved" ? "bg-green-100 text-green-700" :
                co.status === "rejected" ? "bg-red-100 text-red-700" :
                co.status === "draft" ? "bg-gray-100 text-gray-500" :
                "bg-gray-100 text-gray-600"
              }`}>
                {co.status.replace(/_/g, " ")}
              </span>
            </div>
            {co.description && (
              <p className="text-xs text-gray-500 mb-1">{co.description}</p>
            )}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{co.total_amount > 0 ? "+" : ""}{formatCurrency(co.total_amount)}</span>
              <span>{formatDate(co.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
