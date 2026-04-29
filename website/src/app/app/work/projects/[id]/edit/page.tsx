"use client";

import { use, useEffect, useState } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import ProjectWizard, {
  type ProjectWizardInitial,
} from "@/components/app/projects/ProjectWizard";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import TopBar from "@/components/app/TopBar";
import { fetchProjectDetail } from "@/services/projectDetail";

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [initial, setInitial] = useState<ProjectWizardInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: true, autoRefreshToken: true } }
        );
        const data = await fetchProjectDetail(supabase, id);
        if (cancelled) return;
        if (!data) {
          setError("Project not found");
          return;
        }
        setInitial({
          id: data.id,
          name: data.name,
          status: data.status,
          contract_amount: data.contract_amount,
          client_name: data.client_name,
          client_phone: data.client_phone,
          client_email: data.client_email,
          location: data.location,
          start_date: data.start_date,
          end_date: data.end_date,
          task_description: data.task_description,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <TopBar
          breadcrumb={[
            { label: "Work", href: "/app/work" },
            { label: "Edit project" },
          ]}
        />
        <div className="px-2 md:px-0 py-8">
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  }

  if (!initial) {
    return (
      <div>
        <TopBar
          breadcrumb={[
            { label: "Work", href: "/app/work" },
            { label: "Edit project" },
          ]}
        />
        <div className="grid grid-cols-12 gap-8 max-w-[1280px] mx-auto pt-2">
          <div className="hidden lg:block col-span-3">
            <Skeleton className="h-72" />
          </div>
          <div className="col-span-12 lg:col-span-9 space-y-6">
            <Skeleton className="h-12 w-72" />
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  return <ProjectWizard mode="edit" initial={initial} />;
}
