"use client";

import { useState } from "react";

interface Props {
  amount?: number;
  priceId?: string;
  productName?: string;
  currency?: string;
  mode?: "payment" | "subscription";
  className?: string;
  children?: React.ReactNode;
}

export function CheckoutButton({
  amount,
  priceId,
  productName,
  currency = "usd",
  mode = "payment",
  className,
  children,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, priceId, productName, currency, mode }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || `Checkout unavailable (${res.status})`);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={
          className ??
          "rounded-xl bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
        }
      >
        {busy ? "Starting checkout…" : children ?? "Pay now"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
