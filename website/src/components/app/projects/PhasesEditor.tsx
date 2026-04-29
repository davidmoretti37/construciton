"use client";

import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export interface PhaseDraft {
  id: string;
  name: string;
  planned_days: number;
  budget: number;
}

interface Props {
  initial?: PhaseDraft[];
  onChange?: (phases: PhaseDraft[]) => void;
  onGenerate?: () => Promise<PhaseDraft[]>;
}

function newDraft(order: number): PhaseDraft {
  return {
    id: `p_${Date.now()}_${order}_${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    planned_days: 0,
    budget: 0,
  };
}

export default function PhasesEditor({ initial, onChange, onGenerate }: Props) {
  const [phases, setPhases] = useState<PhaseDraft[]>(initial ?? []);
  const [generating, setGenerating] = useState(false);

  function update(next: PhaseDraft[]) {
    setPhases(next);
    onChange?.(next);
  }

  function add() {
    update([...phases, newDraft(phases.length)]);
  }

  function remove(id: string) {
    update(phases.filter((p) => p.id !== id));
  }

  function setField<K extends keyof PhaseDraft>(id: string, key: K, value: PhaseDraft[K]) {
    update(phases.map((p) => (p.id === id ? { ...p, [key]: value } : p)));
  }

  async function handleGenerate() {
    if (!onGenerate) return;
    setGenerating(true);
    try {
      const generated = await onGenerate();
      update(generated);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#6e6e73]">
          Break the project into phases. Drag to reorder.
        </p>
        {onGenerate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
            className="text-[#0071e3] ring-1 ring-[#0071e3]/30 hover:bg-[#0071e3]/[0.06]"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.5 2L11 6l4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5L9.5 2zm9 7.5L19.5 12l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z" />
            </svg>
            {generating ? "Generating…" : "AI generate"}
          </Button>
        )}
      </div>

      {phases.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="w-full border-2 border-dashed border-[#e5e5ea] hover:border-[#0071e3] hover:bg-[#0071e3]/[0.03] rounded-2xl py-8 text-[13px] text-[#86868b] hover:text-[#0071e3] transition-colors"
        >
          + Add first phase
        </button>
      ) : (
        <ul className="space-y-2">
          {phases.map((phase, idx) => (
            <li
              key={phase.id}
              className="flex items-center gap-3 bg-white ring-1 ring-[#e5e5ea] rounded-[10px] px-3 py-2"
            >
              <span className="font-mono text-[12px] text-[#86868b] tabular-nums w-6 shrink-0">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <Input
                name={`phase_name_${idx}`}
                value={phase.name}
                onChange={(e) => setField(phase.id, "name", e.target.value)}
                placeholder="Phase name"
                className="flex-1"
              />
              <Input
                name={`phase_days_${idx}`}
                value={phase.planned_days || ""}
                onChange={(e) =>
                  setField(phase.id, "planned_days", Number(e.target.value) || 0)
                }
                placeholder="days"
                inputMode="numeric"
                className="w-24"
              />
              <Input
                name={`phase_budget_${idx}`}
                value={phase.budget || ""}
                onChange={(e) =>
                  setField(phase.id, "budget", Number(e.target.value) || 0)
                }
                placeholder="budget"
                inputMode="numeric"
                className="w-32"
              />
              <button
                type="button"
                onClick={() => remove(phase.id)}
                className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] text-[#86868b] hover:bg-[#f5f5f7] shrink-0"
                aria-label="Remove phase"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={add}
              className="w-full border border-dashed border-[#e5e5ea] hover:border-[#0071e3] hover:bg-[#0071e3]/[0.03] rounded-[10px] py-2.5 text-[13px] text-[#6e6e73] hover:text-[#0071e3] transition-colors"
            >
              + Add another phase
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
