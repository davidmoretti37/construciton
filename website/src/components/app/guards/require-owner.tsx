"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireOwner({ children, fallback }: Props) {
  const { isLoading, user, isOwner } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isOwner) {
      router.replace("/login");
    }
  }, [isLoading, user, isOwner, router]);

  if (isLoading) {
    return (
      fallback ?? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      )
    );
  }

  if (!user || !isOwner) {
    return null;
  }

  return <>{children}</>;
}
