"use client";

import { useState } from "react";

interface UploadedFile {
  url: string;
  name: string;
  originalName: string;
  size: number;
  contentType: string;
}

interface Props {
  accept?: string;
  onUploaded?: (file: UploadedFile) => void;
}

export function FileUploadForm({ accept = "image/*,application/pdf", onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(picked: File) {
    setError(null);
    setUploaded(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", picked);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json()) as UploadedFile | { error: string };
      if (!res.ok || "error" in data) {
        setError(("error" in data && data.error) || "Upload failed");
        return;
      }
      setUploaded(data);
      onUploaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Pick a file first");
      return;
    }
    await upload(file);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      upload(dropped);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">Upload a file</h3>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <label
        htmlFor="fu-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${
          dragOver
            ? "border-[#1E40AF] bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className="font-medium text-gray-700">
          {file ? file.name : "Drop a file here or click to choose"}
        </span>
        <span className="mt-1 text-xs text-gray-400">
          {accept.split(",").join(" · ")} · max 10MB
        </span>
        <input
          id="fu-input"
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) upload(f);
          }}
        />
      </label>

      <button
        type="submit"
        disabled={busy || !file}
        className="rounded-xl bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>

      {uploaded && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Uploaded:&nbsp;
          <a href={uploaded.url} target="_blank" rel="noreferrer" className="font-mono underline">
            {uploaded.url}
          </a>
        </div>
      )}
    </form>
  );
}
