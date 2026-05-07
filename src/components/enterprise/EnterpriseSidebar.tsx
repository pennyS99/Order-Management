"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileText,
  Map,
  MapPin,
  Truck,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/po/utils";
import { enterpriseNav, matchEnterpriseNavItem } from "./nav";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ICONS: Record<string, LucideIcon> = {
  "/extract": FileText,
  "/planner": CalendarDays,
  "/shipments": Truck,
  "/shipments/map": Map,
  "/configure": SettingsIcon,
};

const MAIN_SECTIONS = ["Operations", "Planning"] as const;

export function EnterpriseSidebar({
  className,
}: {
  className?: string;
}) {
  const pathname = usePathname();
  const activeNav = matchEnterpriseNavItem(pathname);
  const settingsItem = enterpriseNav.find((i) => i.href === "/configure");
  const settingsActive = settingsItem ? isActivePath(pathname, settingsItem.href) : false;

  return (
    <aside
      className={cn(
        "om-enterprise-sidebar shrink-0 overflow-hidden",
        "sticky top-0 h-screen",
        "transition-[width] duration-200 ease-in-out",
        "w-[var(--om-sidebar-w)]",
        className,
      )}
      aria-label="Primary navigation"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-[60px] min-h-[60px] items-center border-b border-[var(--border)] px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[color-mix(in_oklch,var(--primary)_24%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_13%,var(--surface))] text-[var(--primary)]">
              <MapPin className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-bold tracking-[-0.02em] text-[var(--text)]">Order Management</div>
              <div className="mt-0.5 truncate text-xs font-medium tracking-wide text-[var(--muted-foreground)]">
                Logistics Hub
              </div>
            </div>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-5">
          {MAIN_SECTIONS.map((section) => {
            const items = enterpriseNav.filter((i) => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-6">
                <div className="om-section-label px-0 pb-2">{section}</div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = ICONS[item.href] ?? FileText;
                    const active = activeNav?.href === item.href;
                    const isSubNav = item.href === "/shipments/map";
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex h-9 min-h-[36px] items-center gap-3 rounded border px-4 py-2 text-sm font-medium transition-colors",
                          isSubNav && "om-sidebar-subitem",
                          "border-transparent text-[var(--muted-foreground)]",
                          "hover:bg-[color-mix(in_oklch,var(--surface-elevated)_70%,transparent)] hover:text-[var(--text)]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                          active &&
                            "border-[color-mix(in_oklch,var(--primary)_34%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_12%,var(--surface))] text-[var(--primary)]",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon
                          className={cn(
                            "h-5 w-5 shrink-0",
                            active
                              ? "text-[var(--primary)]"
                              : "text-[var(--muted-foreground)] group-hover:text-[var(--text)]",
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {settingsItem && (
          <div className="mt-auto shrink-0 border-t border-[var(--border)] px-4 pb-4 pt-5">
            <div className="om-section-label px-0 pb-2">Admin</div>
            <div>
              <Link
                href={settingsItem.href}
                className={cn(
                  "group relative flex h-9 min-h-[36px] items-center gap-3 rounded border px-4 py-2 text-sm font-medium transition-colors",
                  "border-transparent text-[var(--muted-foreground)]",
                  "hover:bg-[color-mix(in_oklch,var(--surface-elevated)_70%,transparent)] hover:text-[var(--text)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  settingsActive &&
                    "border-[color-mix(in_oklch,var(--primary)_34%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_12%,var(--surface))] text-[var(--primary)]",
                )}
                aria-current={settingsActive ? "page" : undefined}
              >
                <SettingsIcon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    settingsActive
                      ? "text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] group-hover:text-[var(--text)]",
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="truncate">{settingsItem.label}</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
