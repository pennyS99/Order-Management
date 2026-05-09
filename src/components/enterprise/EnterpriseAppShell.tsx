"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/po/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { EnterpriseSidebar } from "./EnterpriseSidebar";
import { matchEnterpriseNavItem } from "./nav";

function getBreadcrumb(pathname: string): { section: string; page: string } {
  if (pathname === "/" || pathname === "") {
    return { section: "Workspace", page: "Overview" };
  }
  const match = matchEnterpriseNavItem(pathname);
  if (match) return { section: match.section, page: match.label };
  return { section: "Workspace", page: "Overview" };
}

export function EnterpriseAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { section, page } = getBreadcrumb(pathname);

  return (
    <div
      className={cn(
        "om-enterprise-shell min-h-screen",
        "selection:bg-[color-mix(in_oklch,var(--primary)_22%,var(--surface))] selection:text-[var(--text)]",
      )}
    >
      <div className="flex h-screen overflow-hidden">
        <EnterpriseSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "sticky top-0 z-30 om-enterprise-toolbar",
              "flex h-14 min-h-[56px] shrink-0 items-center justify-between gap-4 px-5",
            )}
          >
            <div className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden text-[13px]">
              <span className="truncate font-medium text-[var(--muted-foreground)]">Order Management</span>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-[var(--om-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate font-medium text-[var(--muted-foreground)]">{section}</span>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-[var(--om-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">{page}</span>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-4">
              <label className="om-topbar-search" aria-label="Quick search">
                <Search
                  className="h-[18px] w-[18px] shrink-0 text-[var(--om-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="Search PO, SKU, or DC"
                  className="placeholder:text-[var(--om-text-muted)]"
                />
                <kbd className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[var(--muted-foreground)]">
                  Ctrl K
                </kbd>
              </label>
              <ThemeToggle />
            </div>
          </div>

          <div
            className="relative z-10 min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            style={{
              minHeight: "calc(100vh - var(--om-toolbar-h))",
            }}
          >
            <div
              className="mx-auto w-full"
              style={{
                maxWidth: "unset",
                paddingLeft: "16px",
                paddingRight: "16px",
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
