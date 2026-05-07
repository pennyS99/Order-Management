"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/po/utils";
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
        "selection:bg-[rgba(29,158,117,0.22)] selection:text-[var(--surface)]",
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
            <div className="flex min-w-0 shrink items-center gap-2 overflow-hidden">
              <span className="truncate text-xs font-medium text-[var(--muted-foreground)]">Order Management</span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[var(--om-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate text-xs font-medium text-[var(--muted-foreground)]">{section}</span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[var(--om-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate text-sm font-semibold text-[var(--text)]">{page}</span>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-4">
              <label className="om-topbar-search" aria-label="Quick search">
                <Search
                  className="h-5 w-5 shrink-0 text-[var(--om-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="Search PO, SKU, or DC"
                  className="placeholder:text-[var(--om-text-muted)]"
                />
                <kbd className="rounded border border-[var(--border-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                  Ctrl K
                </kbd>
              </label>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm font-semibold text-[var(--text)]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                Ready
              </span>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_16%,var(--surface))] font-mono text-sm font-semibold text-[var(--primary)]">
                JM
              </div>
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
