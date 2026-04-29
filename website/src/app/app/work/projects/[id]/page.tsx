"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import TopBar from "@/components/app/TopBar";
import ProjectHeader from "@/components/app/projects/ProjectHeader";
import ProjectTabs from "@/components/app/projects/ProjectTabs";
import ProjectOverview from "@/components/app/projects/ProjectOverview";
import ProjectSchedule from "@/components/app/projects/ProjectSchedule";
import ProjectTeam from "@/components/app/projects/ProjectTeam";
import ProjectDocuments from "@/components/app/projects/ProjectDocuments";
import ProjectFinancials from "@/components/app/projects/ProjectFinancials";
import ProjectActivity from "@/components/app/projects/ProjectActivity";
import PhotoTimeline from "@/components/portal/PhotoTimeline";
import MessageThread from "@/components/portal/MessageThread";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { fetchProjectDetail, type ProjectDetail } from "@/services/projectDetail";
import { useToast } from "@/components/ui/toast-provider";
import type { ProjectTabConfig, ProjectTabKey } from "@/types";

const TABS: ProjectTabConfig[] = [
  { key: "overview", label: "Overview" },
  { key: "schedule", label: "Schedule" },
  { key: "team", label: "Team" },
  { key: "documents", label: "Documents" },
  { key: "financials", label: "Financials" },
  { key: "photos", label: "Photos" },
  { key: "messages", label: "Messages" },
  { key: "activity", label: "Activity" },
];

const TAB_KEYS: ProjectTabKey[] = TABS.map((t) => t.key);

function isTabKey(k: string | null): k is ProjectTabKey {
  return !!k && (TAB_KEYS as string[]).includes(k);
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabFromUrl = searchParams.get("tab");
  const activeTab: ProjectTabKey = isTabKey(tabFromUrl) ? tabFromUrl : "overview";

  const setTab = useCallback(
    (key: ProjectTabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === "overview") params.delete("tab");
      else params.set("tab", key);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: true, autoRefreshToken: true } }
      );
      const data = await fetchProjectDetail(supabase, id);
      if (!data) {
        setError("Project not found");
      } else {
        setProject(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const progress = useMemo(() => {
    if (!project) return 0;
    if (project.contract_amount > 0) {
      return Math.min(
        (project.income_collected / project.contract_amount) * 100,
        100
      );
    }
    return project.actual_progress ?? 0;
  }, [project]);

  if (loading) {
    return (
      <div>
        <TopBar
          breadcrumb={[{ label: "Work", href: "/app/work" }, { label: "Loading…" }]}
        />
        <div className="-mx-4 md:-mx-6 lg:-mx-8">
          <Skeleton className="h-[280px] rounded-none" />
        </div>
        <div className="max-w-[1440px] mx-auto px-2 md:px-0 -mt-16 relative z-10 space-y-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div>
        <TopBar breadcrumb={[{ label: "Work", href: "/app/work" }, { label: "Project" }]} />
        <div className="px-2 md:px-0 py-8">
          <ErrorBanner message={error ?? "Project not found"} onRetry={load} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar
        breadcrumb={[
          { label: "Work", href: "/app/work" },
          { label: project.name },
        ]}
      />

      {/* Full-bleed cover */}
      <div className="relative h-[280px] w-full -mx-4 md:-mx-6 lg:-mx-8 -mt-6">
        <Image
          src="/logo.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0071e3]/10 via-transparent to-[#fbfbfd]" />
      </div>

      {/* Overlapping content */}
      <div className="max-w-[1440px] mx-auto -mt-16 relative z-10 space-y-6">
        <ProjectHeader
          name={project.name}
          address={project.location}
          client={project.client_name}
          status={project.status}
          progress={progress}
          editHref={`/app/work/projects/${project.id}/edit`}
          onSendUpdate={() =>
            toast({ title: "Update sent", variant: "success", description: "Client portal refreshed." })
          }
          onAddInvoice={() =>
            toast({ title: "Open the Financials tab to add an invoice", variant: "info" })
          }
        />

        <ProjectTabs tabs={TABS} active={activeTab} onChange={setTab} />

        <div className="pb-16">
          {activeTab === "overview" && <ProjectOverview project={project} />}
          {activeTab === "schedule" && <ProjectSchedule project={project} />}
          {activeTab === "team" && <ProjectTeam project={project} />}
          {activeTab === "documents" && (
            <ProjectDocuments documents={project.documents} projectId={project.id} />
          )}
          {activeTab === "financials" && <ProjectFinancials project={project} />}
          {activeTab === "photos" && (
            project.reports.length === 0 ? (
              <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
                <EmptyState
                  icon="photo"
                  title="No photos yet"
                  description="Daily reports with photos will show up here."
                />
              </div>
            ) : (
              <PhotoTimeline projectId={project.id} photos={[]} />
            )
          )}
          {activeTab === "messages" && <MessageThread projectId={project.id} />}
          {activeTab === "activity" && <ProjectActivity project={project} />}
        </div>
      </div>
    </div>
  );
}
