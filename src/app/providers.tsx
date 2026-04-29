"use client";

import { PlannerProvider } from "@/context/PlannerContext";
import { HeadersProvider } from "@/context/HeadersContext";
import { EnterpriseAppShell } from "@/components/enterprise/EnterpriseAppShell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlannerProvider>
      <HeadersProvider>
        <EnterpriseAppShell>{children}</EnterpriseAppShell>
      </HeadersProvider>
    </PlannerProvider>
  );
}
