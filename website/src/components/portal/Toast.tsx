"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface ToastMessage {
  id: string;
  text: string;
  type: "error" | "success" | "info";
}

interface ToastContextType {
  toast: (text: string, type?: "error" | "success" | "info") => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string, type: "error" | "success" | "info" = "error") => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {messages.map((msg) => (
          <ToastItem key={msg.id} message={msg} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(message.id), 4000);
    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  const colors = {
    error: "bg-red-600",
    success: "bg-green-600",
    info: "bg-blue-600",
  };

  const icons = {
    error: (
      <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
    success: (
      <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  };

  return (
    <div
      className={`${colors[message.type]} text-white rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 animate-slide-in cursor-pointer`}
      onClick={() => onDismiss(message.id)}
    >
      {icons[message.type]}
      <p className="text-sm font-medium">{message.text}</p>
    </div>
  );
}
