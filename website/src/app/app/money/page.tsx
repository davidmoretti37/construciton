"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MoneyIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/money/invoices");
  }, [router]);
  return null;
}
