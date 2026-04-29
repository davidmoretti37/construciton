"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/app/TopBar";
import { createClient } from "@/lib/supabase-browser";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  "How is my business doing this month?",
  "Which projects are over budget?",
  "Who is clocked in right now?",
  "Draft a follow-up email for overdue invoices",
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setInput("");

    const userMsg: Message = { id: uid(), role: "user", content: trimmed };
    const placeholder: Message = {
      id: uid(),
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setSending(true);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const res = await fetch(`${backendUrl}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const reply: string =
        typeof data === "string"
          ? data
          : data.content ?? data.message ?? data.reply ?? "";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? { ...m, content: reply || "(no response)", pending: false }
            : m
        )
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach assistant";
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div className="flex flex-col h-[100dvh] md:h-[calc(100vh-4rem)]">
      <TopBar title="Chat" />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-0 pb-4"
      >
        {messages.length === 0 ? (
          <div className="max-w-md mx-auto text-center pt-10">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624L16.5 21.75l-.398-1.126a3.375 3.375 0 00-2.226-2.226L12.75 18l1.126-.398a3.375 3.375 0 002.226-2.226L16.5 14.25l.398 1.126a3.375 3.375 0 002.226 2.226L20.25 18l-1.126.398a3.375 3.375 0 00-2.226 2.226z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Ask Sylk
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Ask about your projects, finances, schedule, or team.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={sending}
                  className="text-left bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl px-4 py-3 text-sm text-gray-700 transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3 pt-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-[#1E40AF] text-white rounded-br-md"
                      : "bg-gray-100 text-gray-900 rounded-bl-md"
                  }`}
                >
                  {m.pending ? (
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse [animation-delay:120ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse [animation-delay:240ms]" />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            ))}
            {error && (
              <div className="text-xs text-red-600 text-center">{error}</div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 bg-white px-4 py-3 md:rounded-b-xl"
      >
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask anything about your business..."
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-xl bg-[#1E40AF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A] transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
