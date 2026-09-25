"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { today } from "@/lib/dates";

export default function TodayRedirect() {
  const router = useRouter();
  useEffect(() => router.replace(`/day/${today()}`), [router]);
  return null;
}
