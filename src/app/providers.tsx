"use client";

import { PlannerProvider } from "@/context/PlannerContext";
import { HeadersProvider } from "@/context/HeadersContext";
import { PlannerResultsColumnsProvider } from "@/context/PlannerResultsColumnsContext";
import { EnterpriseAppShell } from "@/components/enterprise/EnterpriseAppShell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlannerProvider>
      <HeadersProvider>
        <PlannerResultsColumnsProvider>
          <EnterpriseAppShell>{children}</EnterpriseAppShell>
        </PlannerResultsColumnsProvider>
      </HeadersProvider>
    </PlannerProvider>
  );
}
