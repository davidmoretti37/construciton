"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/app/TopBar";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";
import DotPattern from "@/components/ui/DotPattern";
import DateRangePicker from "@/components/ui/DateRangePicker";
import FileUpload from "@/components/ui/FileUpload";
import WizardTOC, { type WizardSection } from "@/components/app/projects/WizardTOC";
import ClientPicker from "@/components/app/projects/ClientPicker";
import PhasesEditor, { type PhaseDraft } from "@/components/app/projects/PhasesEditor";
import { useToast } from "@/components/ui/toast-provider";
import { createProject, updateProject, type ProjectFormState } from "@/app/actions/projects";

type Mode = "create" | "edit";

export interface ProjectWizardInitial {
  id?: string;
  name?: string;
  status?: string;
  contract_amount?: number;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  task_description?: string;
}

interface Props {
  mode: Mode;
  initial?: ProjectWizardInitial;
}

type SectionId = "basics" | "client" | "schedule" | "phases" | "budget" | "documents";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function ProjectWizard({ mode, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const action = useMemo(() => {
    if (mode === "edit" && initial?.id) {
      return (prev: ProjectFormState | undefined, formData: FormData) =>
        updateProject(initial.id!, prev, formData);
    }
    return createProject;
  }, [mode, initial?.id]);

  const [state, formAction, pending] = useActionState<ProjectFormState | undefined, FormData>(
    action,
    undefined
  );

  // Local field state (so we can derive validation indicators)
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planning");
  const [contract, setContract] = useState(
    initial?.contract_amount ? String(initial.contract_amount) : ""
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [scope, setScope] = useState(initial?.task_description ?? "");
  const [phases, setPhases] = useState<PhaseDraft[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("basics");

  useEffect(() => {
    if (state?.ok && state.projectId) {
      toast({
        title: mode === "create" ? "Project created" : "Project saved",
        variant: "success",
        description: "Redirecting…",
      });
      const target =
        mode === "create"
          ? `/app/work/projects/${state.projectId}`
          : `/app/work/projects/${state.projectId}`;
      router.push(target);
    } else if (state && !state.ok && state.error) {
      toast({
        title: "Save failed",
        variant: "error",
        description: state.error,
      });
    }
  }, [state, mode, router, toast]);

  const sections: WizardSection[] = [
    {
      id: "basics",
      label: "Basics",
      validation: name.trim().length >= 2 && Number(contract) >= 0 ? "valid" : "empty",
    },
    {
      id: "client",
      label: "Client",
      validation: "empty",
    },
    {
      id: "schedule",
      label: "Schedule",
      validation: startDate && endDate ? "valid" : "empty",
    },
    {
      id: "phases",
      label: "Phases",
      validation: phases.length > 0 ? "valid" : "empty",
    },
    {
      id: "budget",
      label: "Budget",
      validation: Number(contract) > 0 ? "valid" : "empty",
    },
    {
      id: "documents",
      label: "Documents",
      validation: mode === "edit" ? "empty" : "warn",
    },
  ];

  const completeCount = sections.filter((s) => s.validation === "valid").length;
  const fieldErrors = state?.fieldErrors ?? {};
  const basicsValid = name.trim().length >= 2;

  return (
    <div className="relative">
      <TopBar
        breadcrumb={[
          { label: "Work", href: "/app/work" },
          { label: mode === "create" ? "New project" : `Edit ${initial?.name ?? ""}` },
        ]}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px] bg-gradient-to-b from-[#0071e3]/[0.03] to-transparent -z-10"
      />
      <DotPattern className="fixed inset-0 -z-10 opacity-[0.04]" size={24} />

      <form action={formAction} className="grid grid-cols-12 gap-8 max-w-[1280px] mx-auto pb-32">
        {/* TOC sidebar */}
        <aside className="hidden lg:block col-span-3 sticky top-20 self-start pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b] px-3 mb-2">
            Sections
          </p>
          <WizardTOC
            sections={sections}
            active={activeSection}
            onSelect={(id) => setActiveSection(id as SectionId)}
          />
          <div className="mt-6 px-3 text-[11px] text-[#86868b] font-mono">
            {completeCount}/{sections.length} complete
          </div>
        </aside>

        {/* Form body */}
        <div className="col-span-12 lg:col-span-9 space-y-8 pt-2">
          <header className="px-1">
            <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">
              {mode === "create" ? "New project" : `Edit ${initial?.name ?? "project"}`}
            </h1>
            <p className="text-[14px] text-[#6e6e73] mt-1">
              {mode === "create"
                ? "Capture the essentials — you can always come back to edit."
                : "Update fields and save when you're done."}
            </p>
          </header>

          {/* Basics */}
          <section
            id="basics"
            className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 scroll-mt-24"
          >
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">Basics</h2>
              <span className="font-mono text-[12px] text-[#86868b]">01</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Project name</Label>
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Park Residence Renovation"
                  invalid={!!fieldErrors.name}
                  required
                />
                {fieldErrors.name && (
                  <p className="text-[12px] text-[#ff3b30] mt-1.5">{fieldErrors.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] focus:ring-2 focus:ring-[#0071e3] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none transition-shadow"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="contract_amount">Contract amount (USD)</Label>
                <Input
                  id="contract_amount"
                  name="contract_amount"
                  value={contract}
                  onChange={(e) => setContract(e.target.value)}
                  placeholder="125000"
                  inputMode="numeric"
                  invalid={!!fieldErrors.contract_amount}
                />
                {fieldErrors.contract_amount && (
                  <p className="text-[12px] text-[#ff3b30] mt-1.5">{fieldErrors.contract_amount}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="location" optional>
                  Site address
                </Label>
                <Input
                  id="location"
                  name="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="123 Main St, Springfield, IL"
                  invalid={!!fieldErrors.location}
                />
                {fieldErrors.location && (
                  <p className="text-[12px] text-[#ff3b30] mt-1.5">{fieldErrors.location}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="task_description" optional>
                  Scope notes
                </Label>
                <textarea
                  id="task_description"
                  name="task_description"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  rows={3}
                  placeholder="Brief description of the work…"
                  className="w-full bg-white text-[#1d1d1f] placeholder:text-[#86868b] ring-1 ring-inset ring-[#e5e5ea] focus:ring-2 focus:ring-[#0071e3] rounded-[10px] px-3 py-2.5 text-[14px] focus:outline-none transition-shadow resize-y"
                />
                {fieldErrors.task_description && (
                  <p className="text-[12px] text-[#ff3b30] mt-1.5">{fieldErrors.task_description}</p>
                )}
              </div>
            </div>
          </section>

          {/* Client */}
          <section
            id="client"
            className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 scroll-mt-24"
          >
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">Client</h2>
              <span className="font-mono text-[12px] text-[#86868b]">02</span>
            </div>
            <ClientPicker
              defaultName={initial?.client_name}
              defaultPhone={initial?.client_phone}
              defaultEmail={initial?.client_email}
              errors={{
                name: fieldErrors.client_name,
                phone: fieldErrors.client_phone,
                email: fieldErrors.client_email,
              }}
            />
          </section>

          {/* Schedule */}
          <section
            id="schedule"
            className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 scroll-mt-24"
          >
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">Schedule</h2>
              <span className="font-mono text-[12px] text-[#86868b]">03</span>
            </div>
            <DateRangePicker
              startValue={startDate}
              endValue={endDate}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
            />
            {(fieldErrors.start_date || fieldErrors.end_date) && (
              <p className="text-[12px] text-[#ff3b30] mt-2">
                {fieldErrors.start_date || fieldErrors.end_date}
              </p>
            )}
          </section>

          {/* Phases */}
          <section
            id="phases"
            className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 scroll-mt-24"
          >
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">Phases</h2>
              <span className="font-mono text-[12px] text-[#86868b]">04</span>
            </div>
            <PhasesEditor
              initial={phases}
              onChange={setPhases}
              onGenerate={async () => {
                try {
                  const res = await fetch("/api/project-sections/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      project_name: name,
                      contract_amount: Number(contract) || 0,
                      description: scope,
                    }),
                  });
                  if (!res.ok) throw new Error(`Status ${res.status}`);
                  const json = (await res.json()) as {
                    phases?: { name: string; planned_days?: number }[];
                  };
                  return (json.phases ?? []).map((p, i) => ({
                    id: `g_${i}_${Date.now()}`,
                    name: p.name,
                    planned_days: p.planned_days ?? 0,
                    budget: 0,
                  }));
                } catch (e) {
                  toast({
                    title: "Couldn't generate phases",
                    description: e instanceof Error ? e.message : "Try again later",
                    variant: "warning",
                  });
                  return phases;
                }
              }}
            />
          </section>

          {/* Budget */}
          <section
            id="budget"
            className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 scroll-mt-24"
          >
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">Budget</h2>
              <span className="font-mono text-[12px] text-[#86868b]">05</span>
            </div>
            <p className="text-[13px] text-[#6e6e73]">
              Contract amount drives budget allocation. Per-phase budgets are set in the Phases
              section above.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-[#fbfbfd] ring-1 ring-[#e5e5ea] rounded-[10px] p-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#86868b]">
                  Contract
                </p>
                <p className="font-mono text-[20px] text-[#1d1d1f] tabular-nums mt-1">
                  ${Number(contract || 0).toLocaleString("en-US")}
                </p>
              </div>
              <div className="bg-[#fbfbfd] ring-1 ring-[#e5e5ea] rounded-[10px] p-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#86868b]">
                  Allocated to phases
                </p>
                <p className="font-mono text-[20px] text-[#1d1d1f] tabular-nums mt-1">
                  $
                  {phases
                    .reduce((s, p) => s + (p.budget || 0), 0)
                    .toLocaleString("en-US")}
                </p>
              </div>
            </div>
          </section>

          {/* Documents */}
          <section
            id="documents"
            className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 scroll-mt-24"
          >
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">
                Documents
              </h2>
              <span className="font-mono text-[12px] text-[#86868b]">06</span>
            </div>
            {mode === "create" ? (
              <p className="text-[13px] text-[#6e6e73]">
                Save the project first, then come back to upload contract PDFs, plans, or photos.
              </p>
            ) : (
              <FileUpload projectId={initial?.id} />
            )}
          </section>

          {state?.error && !state?.fieldErrors?.auth && (
            <div className="rounded-[10px] bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 px-4 py-3 text-[13px] text-[#c5251c]">
              {state.error}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="col-span-12 fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur ring-1 ring-[#e5e5ea] border-t border-[#e5e5ea]">
          <div className="max-w-[1280px] mx-auto px-6 py-3 flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#6e6e73] font-mono">
              {completeCount}/{sections.length} sections complete
            </p>
            <div className="flex items-center gap-2">
              <Button
                href="/app/work"
                variant="ghost"
                size="sm"
                type="button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!basicsValid || pending}
                className={!basicsValid || pending ? "opacity-50 cursor-not-allowed" : ""}
              >
                {pending
                  ? "Saving…"
                  : mode === "create"
                  ? "Create project"
                  : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
