export type EnterpriseNavItem = {
  href: string;
  label: string;
  section: "Operations" | "Planning" | "Admin";
};

export const enterpriseNav: EnterpriseNavItem[] = [
  { href: "/extract", label: "PO Extract", section: "Operations" },
  { href: "/planner", label: "Planner", section: "Planning" },
  { href: "/shipments", label: "Shipments", section: "Planning" },
  { href: "/configure", label: "Settings", section: "Admin" },
];

