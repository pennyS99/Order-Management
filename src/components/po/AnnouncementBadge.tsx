import { cn } from "@/lib/po/utils";

type AnnouncementBadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export function AnnouncementBadge({ children, className }: AnnouncementBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[#2a2a2a] bg-[rgba(26,26,26,0.72)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#888888]",
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D9E75] shadow-[0_0_10px_rgba(29,158,117,0.75)]" aria-hidden />
      {children}
    </span>
  );
}
