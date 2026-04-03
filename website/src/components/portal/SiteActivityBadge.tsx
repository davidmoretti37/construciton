"use client";

import { useEffect, useState } from "react";
import { fetchSiteActivity, type SiteActivity } from "@/services/portal";

interface Props {
  projectId: string;
  enabled: boolean;
}

export default function SiteActivityBadge({ projectId, enabled }: Props) {
  const [activity, setActivity] = useState<SiteActivity | null>(null);

  useEffect(() => {
    if (!enabled) return;
    fetchSiteActivity(projectId)
      .then(setActivity)
      .catch(() => {});
  }, [projectId, enabled]);

  if (!enabled || !activity || activity.workers_on_site === 0) return null;

  const activeWorkers = activity.activity.filter((a) => a.is_active);

  return (
    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-[10px] font-medium text-green-700">
        {activeWorkers.length > 0
          ? `${activeWorkers.length} on site`
          : `${activity.workers_on_site} today`}
      </span>
    </div>
  );
}
