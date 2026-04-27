"use client";

import React from "react";
import { cn } from "@/lib/po/utils";

interface LoadingBarProps {
  progress: number; // 0-100
  isActive: boolean;
  className?: string;
}

export function LoadingBar({ progress, isActive, className }: LoadingBarProps) {
  if (!isActive) return null;

  const clampedProgress = Math.min(100, Math.max(0, progress));
  const isIndeterminate = clampedProgress === 0;

  return (
    <div
      className={cn(
        "h-0.5 w-full bg-slate-100 overflow-hidden",
        className
      )}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Processing progress"
    >
      {isIndeterminate ? (
        <div className="h-full w-1/3 bg-slate-400 animate-loading-shimmer" />
      ) : (
        <div
          className="h-full bg-slate-400 transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      )}
    </div>
  );
}
