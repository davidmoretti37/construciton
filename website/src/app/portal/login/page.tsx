"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { portalFetch } from "@/lib/portal-api";

export default function PortalLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "error" | "success">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      // If email param present (from app deep link fallback), show download prompt
      const email = searchParams.get("email");
      if (email) {
        setStatus("error");
        setErrorMsg("Download the Sylk app to view your project and message your contractor.");
        return;
      }

      // No token — try checking if already authenticated via cookie
      portalFetch<{ client: { full_name: string } }>("/auth/check")
        .then(() => router.replace("/portal"))
        .catch(() => {
          setStatus("error");
          setErrorMsg("No access token provided. Please use the link sent to you.");
        });
      return;
    }

    async function verify() {
      try {
        await portalFetch<{ client: { full_name: string } }>(
          "/auth/verify",
          {
            method: "POST",
            body: JSON.stringify({ token }),
            headers: { "Content-Type": "application/json" },
          }
        );

        setStatus("success");

        // Brief pause to show success state, then redirect
        setTimeout(() => router.replace("/portal"), 800);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Failed to verify access link");
      }
    }

    verify();
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        {status === "verifying" && (
          <>
            <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              Verifying your access...
            </h1>
            <p className="text-sm text-gray-500">
              Please wait while we confirm your identity.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              Welcome!
            </h1>
            <p className="text-sm text-gray-500">
              Redirecting to your portal...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              Access Link Invalid
            </h1>
            <p className="text-sm text-gray-500">
              {errorMsg || "This link may have expired. Please contact your contractor for a new link."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
