"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewLeaguePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?create=1");
  }, [router]);
  return null;
}
