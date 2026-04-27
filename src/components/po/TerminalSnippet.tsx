"use client";

import { useCallback, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { cn } from "@/lib/po/utils";

type TerminalSnippetProps = {
  command: string;
  className?: string;
};

export function TerminalSnippet({ command, className }: TerminalSnippetProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command.replace(/^\$\s*/, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [command]);

  const display = command.startsWith("$") ? command : `$ ${command}`;

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2.5 font-mono text-[13px] text-[#e0e0e0] shadow-[0_0_0_1px_rgba(29,158,117,0.06)]",
        className
      )}
    >
      <code className="min-w-0 flex-1 truncate tracking-tight">{display}</code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md p-1.5 text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#1D9E75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/50"
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? <Check className="h-4 w-4 text-[#1D9E75]" strokeWidth={2.5} /> : <ClipboardCopy className="h-4 w-4" />}
      </button>
    </div>
  );
}
