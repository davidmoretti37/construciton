"use client";

import { useEffect, useState } from "react";
import { fetchApprovals, type PortalApprovalEvent } from "@/services/portal";

interface Props {
  projectId: string;
}

const actionLabels: Record<string, string> = {
  sent: "Sent",
  viewed: "Viewed",
  approved: "Approved",
  rejected: "Declined",
  changes_requested: "Changes Requested",
  signed_off: "Signed Off",
  paid: "Payment Made",
};

const actionIcons: Record<string, { bg: string; icon: string }> = {
  sent: { bg: "bg-blue-100", icon: "text-blue-600" },
  viewed: { bg: "bg-gray-100", icon: "text-gray-500" },
  approved: { bg: "bg-green-100", icon: "text-green-600" },
  rejected: { bg: "bg-red-100", icon: "text-red-600" },
  changes_requested: { bg: "bg-amber-100", icon: "text-amber-600" },
  signed_off: { bg: "bg-green-100", icon: "text-green-600" },
  paid: { bg: "bg-green-100", icon: "text-green-600" },
};

export default function ApprovalTimeline({ projectId }: Props) {
  const [events, setEvents] = useState<PortalApprovalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApprovals(projectId)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading || events.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Activity Timeline</h2>
      <div className="space-y-3">
        {events.slice(0, 10).map((event) => {
          const style = actionIcons[event.action] || actionIcons.viewed;
          return (
            <div key={event.id} className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${style.bg}`}>
                <div className={`w-2 h-2 rounded-full ${style.icon.replace("text-", "bg-")}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  <span className="font-medium capitalize">{event.entity_type.replace(/_/g, " ")}</span>
                  {" "}
                  {actionLabels[event.action] || event.action}
                  {event.actor_type === "client" ? " by you" : " by contractor"}
                </p>
                {event.notes && (
                  <p className="text-xs text-gray-500 mt-0.5">{event.notes}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(event.created_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
