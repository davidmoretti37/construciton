"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import ProgressBar from "./ProgressBar";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  url?: string;
  error?: string;
}

interface Props {
  multiple?: boolean;
  accept?: string;
  projectId?: string;
  onUploaded?: (file: { id: string; name: string; url: string }) => void;
  className?: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileUpload({
  multiple = true,
  accept,
  projectId,
  onUploaded,
  className = "",
}: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File) {
    const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFiles((prev) => {
      // dedupe by name+size
      if (prev.some((f) => f.name === file.name && f.size === file.size && !f.error)) return prev;
      return [...prev, { id, name: file.name, size: file.size, progress: 0 }];
    });

    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("project_id", projectId);

      // Simulated progress while we wait for server
      const tick = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) => (f.id === id && f.progress < 90 ? { ...f, progress: f.progress + 10 } : f))
        );
      }, 200);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      clearInterval(tick);

      if (!res.ok) {
        const err = await res.text().catch(() => "Upload failed");
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, progress: 0, error: err.slice(0, 80) } : f))
        );
        return;
      }
      const json = (await res.json()) as { url?: string; document?: { id: string; file_name: string; file_url: string } };
      const url = json.document?.file_url ?? json.url ?? "";
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 100, url } : f))
      );
      onUploaded?.({ id, name: file.name, url });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 0, error: msg.slice(0, 80) } : f))
      );
    }
  }

  function onSelect(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach(uploadOne);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onSelect(e.dataTransfer.files);
        }}
        className={cn(
          "w-full flex flex-col items-center justify-center gap-2",
          "border-2 border-dashed rounded-2xl p-10 text-center",
          "transition-all duration-200",
          dragOver
            ? "border-[#0071e3] bg-[#0071e3]/[0.06]"
            : "border-[#e5e5ea] hover:border-[#0071e3] hover:bg-[#0071e3]/[0.03]"
        )}
      >
        <svg className="w-7 h-7 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-[14px] font-medium text-[#1d1d1f]">Drop files here, or click to browse</p>
        <p className="text-[12px] text-[#86868b]">PDF, images, docs up to 25MB</p>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={(e) => onSelect(e.target.files)}
        />
      </button>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 py-2 px-3 ring-1 ring-[#e5e5ea] rounded-[10px] bg-white"
            >
              <div className="w-9 h-9 rounded-[8px] bg-[#f5f5f7] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 9h6m-6 6h6m-6-3h3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{f.name}</p>
                <p className="text-[11px] text-[#86868b] font-mono">{fmtSize(f.size)}</p>
                {f.progress < 100 && !f.error && (
                  <ProgressBar value={f.progress} className="mt-1" />
                )}
                {f.error && <p className="text-[11px] text-[#c5251c] mt-0.5">{f.error}</p>}
              </div>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] text-[#86868b] hover:bg-[#f5f5f7]"
                aria-label="Remove file"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
