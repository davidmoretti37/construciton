"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  name: string;
  summary: string;
}

export default function ForemanBar({ name, summary }: Props) {
  const [input, setInput] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    router.push(`/app/chat?q=${encodeURIComponent(input.trim())}`);
  }

  return (
    <div className="bg-[#0F172A] rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06L5.403 4.343a.75.75 0 00-1.06 1.06l1.06 1.061z" />
          </svg>
        </div>
        <div>
          <p className="text-white text-sm font-semibold">Foreman AI</p>
          <p className="text-slate-400 text-xs">{name ? `Hey ${name}` : "Hey"} — {summary}</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Foreman anything..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
        />
        <button
          type="submit"
          className="bg-[#1E40AF] hover:bg-[#1E3A8A] text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </div>
  );
}
