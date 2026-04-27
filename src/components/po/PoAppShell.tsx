"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/po/BrandMark";
import { cn } from "@/lib/po/utils";

const nav = [
  { href: "/extract", label: "PO Extract" },
  { href: "/planner", label: "Planner" },
  { href: "/shipments", label: "Shipments" },
  { href: "/configure", label: "Settings", alignRight: true },
] as const;

function NavLink({
  href,
  label,
  alignRight = false,
}: {
  href: string;
  label: string;
  alignRight?: boolean;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors duration-200 cursor-pointer min-h-10",
        "hover:text-[var(--text)] after:absolute after:left-3 after:right-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--primary)] after:transition-transform after:duration-200 hover:after:scale-x-100",
        alignRight && "ml-auto",
        active && "text-[var(--primary)] after:scale-x-100 after:shadow-[0_0_12px_rgba(29,158,117,0.45)]"
      )}
    >
      {label}
    </Link>
  );
}

export function PoAppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] selection:bg-[rgba(29,158,117,0.22)] selection:text-[var(--surface)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3 md:px-8">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-3 transition-transform duration-200 hover:opacity-95"
          >
            <BrandMark className="group-hover:border-[var(--primary)]/60 group-hover:shadow-[0_10px_24px_rgba(2,6,23,0.36)]" />
            <div className="min-w-0 self-center">
              <h1 className="font-display truncate text-lg font-black tracking-tight text-[var(--text)] md:text-xl">
                Order Management <span className="text-[var(--primary)]">Hub</span>
              </h1>
            </div>
          </Link>

          <nav className="hidden flex-1 flex-wrap items-center justify-center gap-1 md:flex md:px-6">
            {nav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                alignRight={"alignRight" in item ? item.alignRight : false}
              />
            ))}
          </nav>
        </div>

        <div className="mx-auto flex max-w-7xl border-t border-[var(--card)] px-2 pb-2 md:hidden">
          <nav className="flex w-full flex-wrap items-center justify-start gap-1 pt-2">
            {nav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                alignRight={"alignRight" in item ? item.alignRight : false}
              />
            ))}
          </nav>
        </div>
      </header>

      <div className="relative z-10 pb-10">{children}</div>
    </div>
  );
}
