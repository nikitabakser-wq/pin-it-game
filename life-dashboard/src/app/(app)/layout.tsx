"use client";

import { DataProvider, useStore } from "@/lib/store";
import { EditorsProvider } from "@/components/editors";
import { Shell } from "@/components/shell";

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useStore();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="size-2.5 animate-pulse rounded-full bg-accent" /> Loading your progress…
        </div>
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <EditorsProvider>
        <Gate>{children}</Gate>
      </EditorsProvider>
    </DataProvider>
  );
}
