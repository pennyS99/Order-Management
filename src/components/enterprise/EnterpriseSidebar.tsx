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
import { enterpriseNav, ENTERPRISE_SIDEBAR_SECTIONS, matchEnterpriseNavItem } from "./nav";

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
        <div className="flex h-[56px] min-h-[56px] items-center border-b border-[var(--border)] px-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] shadow-[0_1px_2px_oklch(0.145_0.008_265_/_0.05)]">
              <MapPin className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                Order Management
              </div>
              <div className="mt-0.5 truncate text-[13px] font-normal leading-snug text-[var(--muted-foreground)]">
                Logistics Hub
              </div>
            </div>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-auto px-3 pb-4 pt-4">
          {ENTERPRISE_SIDEBAR_SECTIONS.map((section) => {
            const items = enterpriseNav.filter((i) => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-5">
                <div className="om-section-label px-1 pb-2">{section}</div>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const Icon = ICONS[item.href] ?? FileText;
                    const active = activeNav?.href === item.href;
                    const isSubNav = item.href === "/shipments/map";
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex min-h-[36px] items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] leading-snug transition-colors duration-150 ease-out",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--om-bg-sidebar)]",
                          isSubNav && "om-sidebar-subitem",
                          !active &&
                            "font-medium text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                          active &&
                            "bg-[var(--surface)] font-semibold text-[var(--text)] shadow-[inset_0_0_0_1px_var(--border)]",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
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
          <div className="mt-auto shrink-0 border-t border-[var(--border)] px-3 pb-4 pt-4">
            <div className="om-section-label px-1 pb-2">Admin</div>
            <div>
              <Link
                href={settingsItem.href}
                className={cn(
                  "group relative flex min-h-[36px] items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] leading-snug transition-colors duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--om-bg-sidebar)]",
                  !settingsActive &&
                    "font-medium text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                  settingsActive &&
                    "bg-[var(--surface)] font-semibold text-[var(--text)] shadow-[inset_0_0_0_1px_var(--border)]",
                )}
                aria-current={settingsActive ? "page" : undefined}
              >
                <SettingsIcon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
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
