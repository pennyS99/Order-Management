export type EnterpriseNavItem = {
  href: string;
  label: string;
  section: "Dashboard" | "PO Collection" | "Planning" | "Admin";
};

/** Sidebar column order (Admin is pinned separately in the shell). */
export const ENTERPRISE_SIDEBAR_SECTIONS = ["Dashboard", "PO Collection", "Planning"] as const;

/**
 * Longest-prefix match so e.g. `/shipments/map` resolves to Shipments Map, not Shipments.
 */
export function matchEnterpriseNavItem(pathname: string): EnterpriseNavItem | null {
  const matches = enterpriseNav.filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
}

export const enterpriseNav: EnterpriseNavItem[] = [
  { href: "/", label: "Overview", section: "Dashboard" },
  { href: "/extract", label: "PO Extract", section: "PO Collection" },
  { href: "/planner", label: "Planner", section: "Planning" },
  { href: "/shipments", label: "Shipments", section: "Planning" },
  { href: "/shipments/map", label: "Map", section: "Planning" },
  { href: "/configure", label: "Configure", section: "Admin" },
];

