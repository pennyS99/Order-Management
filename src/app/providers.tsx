"use client";

import { PlannerProvider } from "@/context/PlannerContext";
import { HeadersProvider } from "@/context/HeadersContext";
import { PlannerResultsColumnsProvider } from "@/context/PlannerResultsColumnsContext";
import { EnterpriseAppShell } from "@/components/enterprise/EnterpriseAppShell";
import { ThemeProvider } from "@/components/theme/theme-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PlannerProvider>
        <HeadersProvider>
          <PlannerResultsColumnsProvider>
            <EnterpriseAppShell>{children}</EnterpriseAppShell>
          </PlannerResultsColumnsProvider>
        </HeadersProvider>
      </PlannerProvider>
    </ThemeProvider>
  );
}
