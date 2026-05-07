export type EnterpriseNavItem = {
  href: string;
  label: string;
  section: "Operations" | "Planning" | "Admin";
};

/**
 * Longest-prefix match so e.g. `/shipments/map` resolves to Shipments Map, not Shipments.
 */
export function matchEnterpriseNavItem(pathname: string): EnterpriseNavItem | null {
  const matches = enterpriseNav.filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
}

export const enterpriseNav: EnterpriseNavItem[] = [
  { href: "/extract", label: "Extract POs", section: "Operations" },
  { href: "/planner", label: "Planner", section: "Planning" },
  { href: "/shipments", label: "Shipments", section: "Planning" },
  { href: "/shipments/map", label: "Map", section: "Planning" },
  { href: "/configure", label: "Configure", section: "Admin" },
];

