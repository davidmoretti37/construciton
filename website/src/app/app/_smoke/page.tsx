"use client";

import { useState } from "react";
import { FileUploadForm } from "@/components/forms/FileUploadForm";
import { useToast } from "@/components/ui/toast-provider";

const ROWS = [
  { id: "p_001", name: "Maple St. Renovation", status: "active", value: 18250 },
  { id: "p_002", name: "Riverside Office Build", status: "planning", value: 96400 },
  { id: "p_003", name: "Cedar Park Demo", status: "completed", value: 12000 },
];

export default function SmokeTestPage() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required";
    setErrors(next);
    if (Object.keys(next).length === 0) {
      toast({
        title: "Form submitted",
        description: `Hello, ${name}.`,
        variant: "success",
      });
      setName("");
    }
  }

  return (
    <div className="space-y-8 px-2 py-4 md:px-0">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Smoke
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Wiring check</h1>
        <p className="mt-1 text-sm text-gray-600">
          Verifies Table + FormField + FileUpload + Toast wiring end-to-end.
        </p>
      </header>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Toast triggers</h2>
        <div className="flex flex-wrap gap-2">
          {(["info", "success", "warning", "error"] as const).map((variant) => (
            <button
              key={variant}
              type="button"
              onClick={() =>
                toast({
                  title: `${variant[0].toUpperCase()}${variant.slice(1)} toast`,
                  description: "Triggered from smoke page.",
                  variant,
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              {variant}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Form field</h2>
        <form onSubmit={onSubmit} className="space-y-3 max-w-md">
          <div>
            <label htmlFor="smoke-name" className="block text-xs font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="smoke-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0071e3] focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Submit
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Table</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-2">ID</th>
                <th className="py-2">Project</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-mono text-xs text-gray-500">{r.id}</td>
                  <td className="py-2 text-gray-900">{r.name}</td>
                  <td className="py-2 capitalize text-gray-700">{r.status}</td>
                  <td className="py-2 text-right font-mono text-gray-900">
                    ${r.value.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">File upload</h2>
        <FileUploadForm
          onUploaded={(file) =>
            toast({
              title: "Upload complete",
              description: file.originalName,
              variant: "success",
            })
          }
        />
      </section>
    </div>
  );
}
