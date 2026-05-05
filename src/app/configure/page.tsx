"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Columns, Plus, Package, Trash2, Pencil, Check, X, Boxes, Upload, Download, History } from "lucide-react";
import { BrandMark } from "@/components/po/BrandMark";
import { HeaderConfig } from "@/components/po/HeaderConfig";
import { MasterSettingsClient } from "@/components/settings/MasterSettingsClient";
import { Button } from "@/components/po/ui/button";
import { ConfirmDialog } from "@/components/po/ui/confirm-dialog";
import { Input } from "@/components/po/ui/input";
import { useHeaders } from "@/context/HeadersContext";
import {
  addUomItemAction,
  getUomMasterAction,
  updateUomItemAction,
  deleteUomItemByIndexAction,
  replaceUomMasterAction,
} from "@/app/actions/uom";
import type { UomMasterRow } from "@/lib/po/uom";
import { useTableFilterSort } from "@/hooks/use-table-filter-sort";
import { TableColumnHeaderControlButtons } from "@/components/po/table-column-header-controls";
import { TableFilterToolbar } from "@/components/po/table-filter-toolbar";

type SettingsView = "list" | "poExtract" | "planner" | "headers" | "uom";
type PlannerMasterCategory = "list" | "item" | "address" | "truck";
type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
} | null;

export default function ConfigurePage() {
  const [view, setView] = useState<SettingsView>("list");
  const { headers, setHeaders } = useHeaders();

  // UOM state
  const [uomItems, setUomItems] = useState<UomMasterRow[]>([]);
  const [uomLoading, setUomLoading] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ sku: "", item: "", pcsPerCtn: 1, packPerCtn: 1 });
  const [addForm, setAddForm] = useState({ sku: "", item: "", pcsPerCtn: "24", packPerCtn: "24" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [uomMessage, setUomMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uomPending, setUomPending] = useState(false);
  const [duplicateCandidate, setDuplicateCandidate] = useState<UomMasterRow | null>(null);
  const uploadCsvRef = useRef<HTMLInputElement | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [plannerMasterCategory, setPlannerMasterCategory] = useState<PlannerMasterCategory>("list");

  const normalizeSku = (value: string) => value.trim().replace(/\s/g, "");

  const loadUomData = useCallback(async () => {
    setUomLoading(true);
    const result = await getUomMasterAction();
    if (result.success && result.data) {
      setUomItems(result.data);
    }
    setUomLoading(false);
  }, []);

  const uomRowsWithIndex = useMemo(
    () => uomItems.map((item, originalIndex) => ({ ...item, originalIndex })),
    [uomItems],
  );

  type UomRowWithIndex = UomMasterRow & { originalIndex: number };

  const getUomColumnText = useCallback((row: UomRowWithIndex, columnId: string) => {
    switch (columnId) {
      case "sku":
        return row.sku ?? "";
      case "item":
        return row.item ?? "";
      case "pcsPerCtn":
        return String(row.pcsPerCtn);
      case "packPerCtn":
        return String(row.packPerCtn);
      default:
        return "";
    }
  }, []);

  const {
    filterText,
    setFilterText,
    activeFilterColumn,
    sortColumn,
    sortDir,
    displayRows: filteredItems,
    toggleSort,
    toggleFilterColumn,
  } = useTableFilterSort(uomRowsWithIndex, {
    columnIds: ["sku", "item", "pcsPerCtn", "packPerCtn"],
    getColumnText: getUomColumnText,
  });

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows(new Set());
  }, [filterText, activeFilterColumn, rowsPerPage]);

  useEffect(() => {
    if (view === "uom") {
      loadUomData();
    }
  }, [view, loadUomData]);

  useEffect(() => {
    if (view !== "planner") {
      setPlannerMasterCategory("list");
    }
  }, [view]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const pagedItems = filteredItems.slice(startIndex, startIndex + rowsPerPage);
  const allVisibleSelected = pagedItems.length > 0 && pagedItems.every((row) => selectedRows.has(row.originalIndex));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setUomMessage(null);
    setDuplicateCandidate(null);

    const normalizedSku = normalizeSku(addForm.sku);
    const duplicate = uomItems.find((row) => normalizeSku(row.sku) === normalizedSku);
    if (duplicate) {
      setDuplicateCandidate(duplicate);
      return;
    }

    setUomPending(true);
    const fd = new FormData();
    fd.set("sku", normalizedSku);
    fd.set("item", addForm.item.trim());
    fd.set("pcsPerCtn", addForm.pcsPerCtn);
    fd.set("packPerCtn", addForm.packPerCtn);
    const result = await addUomItemAction(fd);
    if (result.success) {
      setUomMessage({ type: "success", text: "Item added successfully." });
      setAddForm((p) => ({ ...p, sku: "", item: "" }));
      setShowAddForm(false);
      await loadUomData();
    } else {
      setUomMessage({ type: "error", text: result.error ?? "Failed to add item" });
    }
    setUomPending(false);
  };

  const handleUpdateExistingFromAddForm = async () => {
    if (!duplicateCandidate) return;
    setUomMessage(null);
    setUomPending(true);
    const result = await updateUomItemAction(duplicateCandidate.sku, {
      sku: normalizeSku(addForm.sku),
      item: addForm.item.trim(),
      pcsPerCtn: Number(addForm.pcsPerCtn),
      packPerCtn: Number(addForm.packPerCtn),
    });
    if (result.success) {
      setUomMessage({ type: "success", text: `SKU "${duplicateCandidate.sku}" updated with new values.` });
      setDuplicateCandidate(null);
      setShowAddForm(false);
      setAddForm((p) => ({ ...p, sku: "", item: "" }));
      await loadUomData();
    } else {
      setUomMessage({ type: "error", text: result.error ?? "Failed to update existing SKU" });
    }
    setUomPending(false);
  };

  const handleKeepExisting = () => {
    if (!duplicateCandidate) return;
    setDuplicateCandidate(null);
    setShowAddForm(false);
    setAddForm((p) => ({ ...p, sku: "", item: "" }));
    setUomMessage({ type: "success", text: `Existing SKU "${duplicateCandidate.sku}" was kept unchanged.` });
  };

  const startEdit = (item: UomMasterRow) => {
    setEditingSku(item.sku);
    setEditForm({
      sku: item.sku,
      item: item.item,
      pcsPerCtn: item.pcsPerCtn,
      packPerCtn: item.packPerCtn,
    });
    setUomMessage(null);
  };

  const cancelEdit = () => {
    setEditingSku(null);
    setUomMessage(null);
  };

  const saveEdit = async () => {
    if (!editingSku) return;
    setUomPending(true);
    const result = await updateUomItemAction(editingSku, editForm);
    if (result.success) {
      setUomMessage({ type: "success", text: "Item updated." });
      setEditingSku(null);
      await loadUomData();
    } else {
      setUomMessage({ type: "error", text: result.error ?? "Failed to update" });
    }
    setUomPending(false);
  };

  const handleDelete = async (originalIndex: number, sku: string) => {
    setUomPending(true);
    setUomMessage(null);
    const result = await deleteUomItemByIndexAction(originalIndex);
    if (result.success) {
      setUomMessage({ type: "success", text: `SKU "${sku}" removed.` });
      await loadUomData();
    } else {
      setUomMessage({ type: "error", text: result.error ?? "Failed to delete" });
    }
    setUomPending(false);
  };

  const toggleRowSelection = (originalIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(originalIndex)) next.delete(originalIndex);
      else next.add(originalIndex);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        pagedItems.forEach((row) => next.delete(row.originalIndex));
      } else {
        pagedItems.forEach((row) => next.add(row.originalIndex));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    setConfirmAction({
      title: "Delete selected rows?",
      description: `This will permanently remove ${selectedRows.size} selected row(s).`,
      confirmLabel: "Delete rows",
      onConfirm: async () => {
        setUomPending(true);
        setUomMessage(null);
        try {
          const indices = Array.from(selectedRows).sort((a, b) => b - a);
          for (const index of indices) {
            const result = await deleteUomItemByIndexAction(index);
            if (!result.success) {
              setUomMessage({ type: "error", text: result.error ?? "Failed to delete selected rows" });
              setUomPending(false);
              return;
            }
          }
          setSelectedRows(new Set());
          await loadUomData();
          setUomMessage({ type: "success", text: "Selected rows deleted." });
        } finally {
          setUomPending(false);
          setConfirmAction(null);
        }
      },
    });
    return;
  };

  const escapeCsvCell = (value: string | number) => {
    const text = String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const toExcelTextSku = (sku: string) => `="${String(sku).replace(/"/g, '""')}"`;

  const normalizeImportedSkuText = (raw: string) => {
    let value = String(raw ?? "").trim();
    if (!value) return "";

    // Handle Excel-text style: ="8997240600256"
    if (value.startsWith('="') && value.endsWith('"')) {
      value = value.slice(2, -1);
    }
    // Handle CSV-quoted style: "8997240600256"
    else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    // Handle apostrophe text marker from spreadsheets: '8997240600256
    if (value.startsWith("'")) {
      value = value.slice(1);
    }

    return value.trim().replace(/\s/g, "");
  };

  const handleDownloadCsv = () => {
    const header = ["sku", "item", "pcsPerCtn", "packPerCtn"];
    const lines = [
      header.join(","),
      ...uomItems.map((row) =>
        [
          toExcelTextSku(row.sku),
          escapeCsvCell(row.item),
          escapeCsvCell(row.pcsPerCtn),
          escapeCsvCell(row.packPerCtn),
        ].join(",")
      ),
    ];
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "uom-master.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const handleUploadCsv: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUomMessage(null);
    setDuplicateCandidate(null);
    setUomPending(true);

    try {
      const content = await file.text();
      const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      const lines = rawLines.map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        setUomMessage({ type: "error", text: "CSV file is empty." });
        return;
      }

      const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const skuIdx = headers.indexOf("sku");
      const itemIdx = headers.indexOf("item");
      const pcsIdx = headers.indexOf("pcsperctn");
      const packIdx = headers.indexOf("packperctn");
      if (skuIdx === -1 || itemIdx === -1 || pcsIdx === -1 || packIdx === -1) {
        setUomMessage({
          type: "error",
          text: 'CSV must contain headers: "sku,item,pcsPerCtn,packPerCtn".',
        });
        return;
      }

      const parsedRows = lines.slice(1).map((line, index) => {
        const cols = parseCsvLine(line);
        return {
          rowNo: index + 2,
          sku: normalizeImportedSkuText(cols[skuIdx] ?? ""),
          item: (cols[itemIdx] ?? "").trim(),
          pcsPerCtn: Number(cols[pcsIdx] ?? ""),
          packPerCtn: Number(cols[packIdx] ?? ""),
        };
      });

      const invalid = parsedRows.find(
        (row) =>
          !row.sku
          || !row.item
          || !Number.isFinite(row.pcsPerCtn)
          || row.pcsPerCtn < 1
          || !Number.isFinite(row.packPerCtn)
          || row.packPerCtn < 1
      );
      if (invalid) {
        setUomMessage({
          type: "error",
          text: `Invalid CSV values at row ${invalid.rowNo}.`,
        });
        return;
      }

      setConfirmAction({
        title: "Replace UOM master data?",
        description: `Upload will replace existing UOM master with ${parsedRows.length} rows.`,
        confirmLabel: "Replace data",
        onConfirm: async () => {
          setUomPending(true);
          try {
            const result = await replaceUomMasterAction(
              parsedRows.map((row) => ({
                sku: row.sku,
                item: row.item,
                pcsPerCtn: row.pcsPerCtn,
                packPerCtn: row.packPerCtn,
              }))
            );

            if (result.success) {
              setUomMessage({
                type: "success",
                text: `UOM master CSV uploaded successfully (${result.count ?? parsedRows.length} rows).`,
              });
              await loadUomData();
            } else {
              setUomMessage({ type: "error", text: result.error ?? "Failed to upload UOM CSV" });
            }
          } finally {
            setUomPending(false);
            setConfirmAction(null);
          }
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read CSV file";
      setUomMessage({ type: "error", text: message });
    } finally {
      if (uploadCsvRef.current) uploadCsvRef.current.value = "";
      setUomPending(false);
    }
  };

  return (
    <div className="pb-12">
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description ?? ""}
        confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
        busy={uomPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          void confirmAction.onConfirm();
        }}
      />
      <header className="z-20 border-b border-[#2a2a2a] bg-[#0d0d0d]">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            {view === "list" ? (
              <Link
                href="/extract"
                className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#888888] transition-colors duration-150 hover:text-[#1D9E75]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Extract
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (view === "headers" || view === "uom") {
                    setView("poExtract");
                    return;
                  }
                  if (view === "planner" && plannerMasterCategory !== "list") {
                    setPlannerMasterCategory("list");
                    return;
                  }
                  setView("list");
                }}
                className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#888888] transition-colors duration-150 hover:text-[#1D9E75]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Settings
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mb-2">
            <BrandMark size="sm" />
            <h1 className="font-display text-xl font-black tracking-tight text-[#e0e0e0]">
              {view === "list"
                ? "Settings"
                : view === "poExtract"
                  ? "Settings for PO Extract"
                  : view === "planner"
                    ? plannerMasterCategory === "item"
                      ? "Item Master"
                      : plannerMasterCategory === "address"
                        ? "Address Master"
                        : plannerMasterCategory === "truck"
                          ? "Truck Master"
                          : "Settings for Planner"
                    : view === "headers"
                      ? "Header configuration"
                      : "UOM Master"}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#888888]">
            {view === "list"
              ? "Choose a settings category."
              : view === "poExtract"
                ? "Configure extraction headers and UOM conversion behavior."
                : view === "planner"
                  ? plannerMasterCategory === "item"
                    ? "Manage item codes with CBM and weight used by shipment planning."
                    : plannerMasterCategory === "address"
                      ? "Manage DC mapping, coordinates, channels, transport modes, and time windows."
                      : plannerMasterCategory === "truck"
                        ? "Manage truck types and capacity limits (kg and CBM)."
                        : "Configure master data used by shipment planning."
                  : view === "headers"
                    ? "Toggle, rename, and reorder columns for your Excel export."
                    : `Manage ${uomItems.length} SKUs for barcode verification and quantity conversion.`}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {view === "list" && (
          <ul className="space-y-2">
            <li>
              <button
                type="button"
                onClick={() => setView("poExtract")}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-left transition-[border-color,box-shadow] hover:border-[#1D9E75]/35 hover:shadow-[0_0_20px_rgba(29,158,117,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
                    <Columns className="h-5 w-5 text-[#1D9E75]" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#e0e0e0]">Settings for PO Extract</span>
                    <p className="text-sm text-[#888888]">Header configuration and UOM Master</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#888888]" />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setView("planner")}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-left transition-[border-color,box-shadow] hover:border-[#1D9E75]/35 hover:shadow-[0_0_20px_rgba(29,158,117,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
                    <Boxes className="h-5 w-5 text-[#1D9E75]" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#e0e0e0]">Settings for Planner</span>
                    <p className="text-sm text-[#888888]">Manage OM Masters (item, address, and truck data)</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#888888]" />
              </button>
            </li>
          </ul>
        )}

        {view === "poExtract" && (
          <ul className="space-y-2">
            <li>
              <button
                type="button"
                onClick={() => setView("headers")}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-left transition-[border-color,box-shadow] hover:border-[#1D9E75]/35 hover:shadow-[0_0_20px_rgba(29,158,117,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
                    <Columns className="h-5 w-5 text-[#1D9E75]" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#e0e0e0]">Header configuration</span>
                    <p className="text-sm text-[#888888]">Toggle, rename, and reorder Excel columns</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#888888]" />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setView("uom")}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-left transition-[border-color,box-shadow] hover:border-[#1D9E75]/35 hover:shadow-[0_0_20px_rgba(29,158,117,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
                    <Package className="h-5 w-5 text-[#1D9E75]" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#e0e0e0]">UOM Master</span>
                    <p className="text-sm text-[#888888]">Manage SKUs for barcode verification & quantity conversion</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#888888]" />
              </button>
            </li>
            <li>
              <Link
                href="/history"
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-left transition-[border-color,box-shadow] hover:border-[#1D9E75]/35 hover:shadow-[0_0_20px_rgba(29,158,117,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
                    <History className="h-5 w-5 text-[#1D9E75]" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#e0e0e0]">History</span>
                    <p className="text-sm text-[#888888]">View extraction history and previous batches</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#888888]" />
              </Link>
            </li>
          </ul>
        )}

        {view === "planner" && (
          <MasterSettingsClient
            initialItems={[]}
            initialAddresses={[]}
            initialTrucks={[]}
            embedded
            plannerCategory={plannerMasterCategory}
            onPlannerCategoryChange={setPlannerMasterCategory}
          />
        )}

        {view === "headers" && (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6">
            <HeaderConfig headers={headers} onHeadersChange={setHeaders} />
          </div>
        )}

        {view === "uom" && (
          <div className="space-y-4">
            {/* Message */}
            {uomMessage && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                  uomMessage.type === "success"
                    ? "border-[#1D9E75]/35 bg-[rgba(29,158,117,0.08)] text-[#1D9E75]"
                    : "border-[#ff4d4d]/35 bg-[#2a1212] text-[#ffb4b4]"
                }`}
              >
                {uomMessage.text}
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-end gap-2">
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="h-9 rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 text-sm text-[#e0e0e0]"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uomPending || selectedRows.size === 0}
                onClick={handleBulkDelete}
              >
                Delete Selected ({selectedRows.size})
              </Button>
              <input
                ref={uploadCsvRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleUploadCsv}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleDownloadCsv}
                disabled={uomPending || uomLoading || uomItems.length === 0}
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => uploadCsvRef.current?.click()}
                disabled={uomPending || uomLoading}
              >
                <Upload className="h-4 w-4" />
                Upload CSV
              </Button>
              <Button
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => { setShowAddForm(!showAddForm); setUomMessage(null); }}
              >
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <form onSubmit={handleAdd} className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#888888]">SKU *</label>
                    <Input
                      placeholder="8997240600256"
                      value={addForm.sku}
                      onChange={(e) => setAddForm((p) => ({ ...p, sku: e.target.value }))}
                      required
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#888888]">ITEM *</label>
                    <Input
                      placeholder="BBIDN200MLC"
                      value={addForm.item}
                      onChange={(e) => setAddForm((p) => ({ ...p, item: e.target.value }))}
                      required
                      className="font-mono text-sm uppercase"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#888888]">PCS/CTN</label>
                    <Input
                      type="number"
                      min={1}
                      value={addForm.pcsPerCtn}
                      onChange={(e) => setAddForm((p) => ({ ...p, pcsPerCtn: e.target.value }))}
                      required
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#888888]">PACK/CTN</label>
                    <Input
                      type="number"
                      min={1}
                      value={addForm.packPerCtn}
                      onChange={(e) => setAddForm((p) => ({ ...p, packPerCtn: e.target.value }))}
                      required
                      className="text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={uomPending} className="gap-1">
                      <Check className="h-3.5 w-3.5" />
                      Add
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {duplicateCandidate && (
              <div className="rounded-lg border border-[#ffc14a]/35 bg-[#1f1908] px-4 py-3">
                <p className="text-sm font-semibold text-[#ffc14a]">
                  SKU &quot;{duplicateCandidate.sku}&quot; already exists.
                </p>
                <p className="mt-1 text-xs text-[#888888]">
                  Existing: ITEM {duplicateCandidate.item}, PCS/CTN {duplicateCandidate.pcsPerCtn}, PACK/CTN {duplicateCandidate.packPerCtn}
                </p>
                <p className="text-xs text-[#888888]">
                  New input: ITEM {addForm.item.trim() || "-"}, PCS/CTN {addForm.pcsPerCtn || "-"}, PACK/CTN {addForm.packPerCtn || "-"}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={uomPending}
                    className="gap-1.5"
                    onClick={handleUpdateExistingFromAddForm}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Update Item
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uomPending}
                    onClick={handleKeepExisting}
                  >
                    Keep Existing
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#141414]">
              {uomLoading ? (
                <div className="p-8 text-center text-sm text-[#888888]">Loading UOM data...</div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border-b border-[#2a2a2a] bg-[#141414] px-3 py-2">
                    <TableFilterToolbar
                      id="configure-uom-filter"
                      value={filterText}
                      onChange={setFilterText}
                      placeholder={
                        activeFilterColumn
                          ? `Filter ${activeFilterColumn === "pcsPerCtn" ? "PCS/CTN" : activeFilterColumn === "packPerCtn" ? "PACK/CTN" : activeFilterColumn}...`
                          : "Filter..."
                      }
                    />
                  </div>
                  <table className="w-full min-w-[620px] md:min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                        <th className="w-10 px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            className="h-4 w-4 rounded border-[#2a2a2a] bg-[#0d0d0d] accent-[#1D9E75]"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#888888]">
                          <TableColumnHeaderControlButtons
                            label="SKU"
                            columnId="sku"
                            filterActive={activeFilterColumn === "sku"}
                            sortActive={sortColumn === "sku"}
                            sortDir={sortColumn === "sku" ? sortDir : null}
                            onFilterClick={toggleFilterColumn}
                            onSortClick={toggleSort}
                            variant="po"
                            labelClassName="text-inherit font-bold uppercase tracking-wider"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#888888]">
                          <TableColumnHeaderControlButtons
                            label="Item"
                            columnId="item"
                            filterActive={activeFilterColumn === "item"}
                            sortActive={sortColumn === "item"}
                            sortDir={sortColumn === "item" ? sortDir : null}
                            onFilterClick={toggleFilterColumn}
                            onSortClick={toggleSort}
                            variant="po"
                            labelClassName="text-inherit font-bold uppercase tracking-wider"
                          />
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-[#888888]">
                          <div className="flex justify-center">
                            <TableColumnHeaderControlButtons
                              label="PCS/CTN"
                              columnId="pcsPerCtn"
                              filterActive={activeFilterColumn === "pcsPerCtn"}
                              sortActive={sortColumn === "pcsPerCtn"}
                              sortDir={sortColumn === "pcsPerCtn" ? sortDir : null}
                              onFilterClick={toggleFilterColumn}
                              onSortClick={toggleSort}
                              variant="po"
                              labelClassName="text-inherit font-bold uppercase tracking-wider"
                            />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-[#888888]">
                          <div className="flex justify-center">
                            <TableColumnHeaderControlButtons
                              label="PACK/CTN"
                              columnId="packPerCtn"
                              filterActive={activeFilterColumn === "packPerCtn"}
                              sortActive={sortColumn === "packPerCtn"}
                              sortDir={sortColumn === "packPerCtn" ? sortDir : null}
                              onFilterClick={toggleFilterColumn}
                              onSortClick={toggleSort}
                              variant="po"
                              labelClassName="text-inherit font-bold uppercase tracking-wider"
                            />
                          </div>
                        </th>
                        <th className="w-28 px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-[#888888]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-[#888888]">
                            {uomItems.length === 0
                              ? "No items in UOM master."
                              : filterText.trim() || activeFilterColumn
                                ? "No items match the applied filters."
                                : "No items in UOM master."}
                          </td>
                        </tr>
                      ) : (
                        pagedItems.map((row, rowIndex) => {
                          const isEditing = editingSku === row.sku;
                          return (
                            <tr
                              key={`${row.sku}-${row.item}-${row.pcsPerCtn}-${row.packPerCtn}-${rowIndex}`}
                              className={`group border-b border-[#2a2a2a] transition-colors ${
                                isEditing ? "bg-[rgba(29,158,117,0.06)]" : "hover:bg-[#1a1a1a]"
                              }`}
                            >
                              {isEditing ? (
                                <>
                                  <td className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={selectedRows.has(row.originalIndex)}
                                      onChange={() => toggleRowSelection(row.originalIndex)}
                                      className="h-4 w-4 rounded border-[#2a2a2a] bg-[#0d0d0d] accent-[#1D9E75]"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <Input
                                      value={editForm.sku}
                                      onChange={(e) => setEditForm((p) => ({ ...p, sku: e.target.value }))}
                                      className="font-mono text-sm h-8"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <Input
                                      value={editForm.item}
                                      onChange={(e) => setEditForm((p) => ({ ...p, item: e.target.value }))}
                                      className="font-mono text-sm h-8 uppercase"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={editForm.pcsPerCtn}
                                      onChange={(e) => setEditForm((p) => ({ ...p, pcsPerCtn: Number(e.target.value) }))}
                                      className="text-sm h-8 text-center"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={editForm.packPerCtn}
                                      onChange={(e) => setEditForm((p) => ({ ...p, packPerCtn: Number(e.target.value) }))}
                                      className="text-sm h-8 text-center"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={saveEdit}
                                        disabled={uomPending}
                                        className="rounded-md p-2.5 text-[#1D9E75] transition-colors hover:bg-[rgba(29,158,117,0.1)]"
                                        title="Save"
                                        aria-label={`Save SKU ${row.sku}`}
                                      >
                                        <Check className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="rounded-md p-2.5 text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#e0e0e0]"
                                        title="Cancel"
                                        aria-label={`Cancel editing SKU ${row.sku}`}
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={selectedRows.has(row.originalIndex)}
                                      onChange={() => toggleRowSelection(row.originalIndex)}
                                      className="h-4 w-4 rounded border-[#2a2a2a] bg-[#0d0d0d] accent-[#1D9E75]"
                                    />
                                  </td>
                                  <td className="px-4 py-3 font-mono tracking-tight text-[#e0e0e0]">{row.sku}</td>
                                  <td className="px-4 py-3 font-mono text-[#888888]">{row.item}</td>
                                  <td className="px-4 py-3 text-center text-[#888888]">{row.pcsPerCtn}</td>
                                  <td className="px-4 py-3 text-center text-[#888888]">{row.packPerCtn}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:hover:opacity-100 [tr:hover_&]:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        onClick={() => startEdit(row)}
                                        className="rounded-md p-2.5 text-[#888888] transition-colors hover:bg-[rgba(29,158,117,0.08)] hover:text-[#1D9E75]"
                                        title="Edit"
                                        aria-label={`Edit SKU ${row.sku}`}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(row.originalIndex, row.sku)}
                                        disabled={uomPending}
                                        className="rounded-md p-2.5 text-[#888888] transition-colors hover:bg-[#2a1212] hover:text-[#ff6b6b]"
                                        title="Delete"
                                        aria-label={`Delete SKU ${row.sku}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-[#888888]">
              {pagedItems.length} of {filteredItems.length} filtered items shown ({uomItems.length} total)
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-xs text-[#888888]">
                Page {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
