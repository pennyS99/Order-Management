"use client";

import React, { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/po/ui/button";
import type { POLineItem, HeaderConfig, ExportOptions } from "@/lib/po/types";

interface ExportButtonProps {
  data: POLineItem[];
  headers: HeaderConfig[];
  disabled?: boolean;
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
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="default"
        onClick={handleExport}
        disabled={disabled || data.length === 0 || loading}
      >
        {loading ? (
          "Generating..."
        ) : (
          <>
            <Download className="h-4 w-4 mr-2" />
            Download .xlsx
          </>
        )}
      </Button>
      <p aria-live="polite" role={error ? "alert" : "status"} className="text-xs text-rose-300 min-h-4">
        {error ?? ""}
      </p>
    </div>
  );
}
