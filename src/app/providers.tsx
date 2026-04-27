"use client";

import { PlannerProvider } from "@/context/PlannerContext";
import { HeadersProvider } from "@/context/HeadersContext";
import { PoAppShell } from "@/components/po/PoAppShell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlannerProvider>
      <HeadersProvider>
        <PoAppShell>{children}</PoAppShell>
      </HeadersProvider>
    </PlannerProvider>
  );
}
