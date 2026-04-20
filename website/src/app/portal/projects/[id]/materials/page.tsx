"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PortalShell from "@/components/portal/PortalShell";
import { useToast } from "@/components/portal/Toast";
import { fetchMaterials, selectMaterial, type PortalMaterialSelection } from "@/services/portal";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalMaterialsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [materials, setMaterials] = useState<PortalMaterialSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (projectId) {
      fetchMaterials(projectId)
        .then(setMaterials)
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load materials"))
        .finally(() => setLoading(false));
    }
  }, [projectId]);

  const handleSelect = async (materialId: string, optionIndex: number) => {
    setSelecting(materialId);
    try {
      await selectMaterial(materialId, optionIndex);
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId
            ? { ...m, selected_option_index: optionIndex, status: "selected", selected_at: new Date().toISOString() }
            : m
        )
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to select", "error");
    } finally {
      setSelecting(null);
    }
  };

  return (
    <PortalShell>
      <div className="space-y-6">
        <Link href={`/portal/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Project
        </Link>

        <h1 className="text-lg font-bold text-gray-900">Material Selections</h1>

        {error ? (
          <div className="text-center py-20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : loading ? (
          <div className="space-y-6 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-36" />
                <div className="h-3 bg-gray-100 rounded w-48" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-40 bg-gray-50 rounded-lg" />
                  <div className="h-40 bg-gray-50 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-gray-500">No material selections pending.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {materials.map((mat) => (
              <div key={mat.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{mat.title}</h2>
                    {mat.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{mat.description}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    mat.status === "confirmed" ? "bg-green-100 text-green-700" :
                    mat.status === "selected" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {mat.status}
                  </span>
                </div>

                {mat.due_date && (
                  <p className="text-xs text-gray-400 mb-3">Due by: {formatDate(mat.due_date)}</p>
                )}

                {/* Options grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mat.options.map((option, i) => {
                    const isSelected = mat.selected_option_index === i;
                    const canSelect = mat.status === "pending";

                    return (
                      <button
                        key={i}
                        onClick={() => canSelect && handleSelect(mat.id, i)}
                        disabled={!canSelect || selecting === mat.id}
                        className={`text-left p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-blue-600 bg-blue-50"
                            : canSelect
                            ? "border-gray-200 hover:border-gray-300 cursor-pointer"
                            : "border-gray-100 cursor-default"
                        }`}
                      >
                        {option.photo_url && (
                          <img
                            src={option.photo_url}
                            alt={option.name}
                            className="w-full h-32 object-cover rounded-md mb-2"
                          />
                        )}
                        <p className="text-sm font-medium text-gray-900">{option.name}</p>
                        {option.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                        )}
                        {option.price_difference != null && option.price_difference !== 0 && (
                          <p className={`text-xs font-medium mt-1 ${
                            option.price_difference > 0 ? "text-amber-600" : "text-green-600"
                          }`}>
                            {option.price_difference > 0 ? "+" : ""}${option.price_difference}
                          </p>
                        )}
                        {isSelected && (
                          <div className="flex items-center gap-1 mt-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-xs text-blue-600 font-medium">Selected</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
