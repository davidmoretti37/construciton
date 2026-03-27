"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import Image from "next/image";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/logo.png"
            alt="Sylk"
            width={48}
            height={48}
            className="mx-auto rounded-xl"
          />
          <h2 className="mt-6 text-xl font-bold text-gray-900">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            We sent a password reset link to <strong>{email}</strong>.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-[#1E40AF] hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Sylk"
              width={40}
              height={40}
              className="rounded-xl"
            />
            <span className="text-2xl font-bold text-gray-900">Sylk</span>
          </Link>
          <p className="mt-3 text-sm text-gray-500">
            Reset your password
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="you@company.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1E40AF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A] transition-colors disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            &larr; Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
