"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ReviewQueueLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const poller = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(poller);
  }, [router]);

  return null;
}
