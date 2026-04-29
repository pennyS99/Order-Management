"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/po/utils";
import { EnterpriseSidebar } from "./EnterpriseSidebar";
import { enterpriseNav } from "./nav";

function getBreadcrumb(pathname: string): { section: string; page: string } {
  if (pathname === "/" || pathname === "") {
    return { section: "Operations", page: "Overview" };
  }
  const match = enterpriseNav.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
  if (match) return { section: match.section, page: match.label };
  return { section: "Operations", page: "Overview" };
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
              "flex h-14 shrink-0 items-center justify-between gap-3 px-5",
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[11px] font-medium text-[var(--muted-foreground)]">
                Transport Ops
              </span>
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[var(--om-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate text-[11px] font-medium text-[var(--muted-foreground)]">
                {section}
              </span>
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[var(--om-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate text-[11px] font-semibold text-[var(--text)]">
                {page}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="om-topbar-search" aria-label="Quick search">
                <Search
                  className="h-3.5 w-3.5 shrink-0 text-[var(--om-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="Search POs, SKUs, DCs..."
                  className="placeholder:text-[var(--om-text-muted)]"
                />
                <kbd className="rounded border border-[var(--border-strong)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--muted-foreground)]">
                  ⌘K
                </kbd>
              </label>
              <button
                type="button"
                aria-label="Notifications"
                className="relative grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
              >
                <Bell className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--warning)]" aria-hidden />
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[var(--success)]"
                />
                Dark Ops
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-full border border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_16%,var(--surface))] font-mono text-[10px] font-semibold text-[var(--primary)]">
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
