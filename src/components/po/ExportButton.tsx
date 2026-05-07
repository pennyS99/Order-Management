"use client";

import React, { useState } from "react";
import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/po/ui/button";
import type { POLineItem, HeaderConfig, ExportOptions } from "@/lib/po/types";

interface ExportButtonProps {
  data: POLineItem[];
  headers: HeaderConfig[];
  disabled?: boolean;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  showStatusText?: boolean;
}

const defaultOptions: ExportOptions = {
  summarySheet: true,
  perRetailer: true,
  freezeHeader: true,
};

export function ExportButton({
  data,
  headers,
  disabled = false,
  label = "Export XLSX",
  variant = "default",
  size = "sm",
  className,
  showStatusText = true,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (data.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, headers, options: defaultOptions }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "PO_Extracted.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={showStatusText ? "flex flex-col items-end gap-1" : "inline-flex"}>
      <Button
        size={size}
        variant={variant}
        onClick={handleExport}
        disabled={disabled || data.length === 0 || loading}
        className={className}
      >
        {loading ? (
          "Generating..."
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            {label}
          </>
        )}
      </Button>
      {showStatusText ? (
        <p
          aria-live="polite"
          role={error ? "alert" : "status"}
          className="min-h-4 text-xs text-rose-300"
        >
          {error ?? ""}
        </p>
      ) : null}
    </div>
  );
}
