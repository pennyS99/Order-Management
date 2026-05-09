"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Columns,
  Download,
  Upload,
  Plus,
  MapPin,
  FilterX,
  ListChecks,
  Package,
  Truck,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/po/BrandMark";
import { Button } from "@/components/po/ui/button";
import { ConfirmDialog } from "@/components/po/ui/confirm-dialog";
import { Input } from "@/components/po/ui/input";
import { PlannerResultsColumnsConfig } from "@/components/planner/PlannerResultsColumnsConfig";

type ItemRow = { id: number; item: string; cbm: number; weightKg: number };
type AddressRow = {
  id: number;
  dcName: string;
  latitude: number;
  longitude: number;
  province: string;
  city: string;
  origin: string;
  channelType: string;
  transportMode: string;
  maxKgLtlLcl: number | null;
  leadTimeFtlFcl: number | null;
  leadTimeLtlLcl: number | null;
  registerOpen: string;
  registerClosed: string;
  unloadDurationMin: number | null;
};
type TruckRow = { id: number; truckType: string; maxKg: number; maxCbm: number };
type PlannerCategory = "list" | "columns" | "item" | "address" | "truck";
type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
} | null;

export function MasterSettingsClient({
  initialItems,
  initialAddresses,
  initialTrucks,
  embedded = false,
  plannerCategory: plannerCategoryProp,
  onPlannerCategoryChange,
}: {
  initialItems: ItemRow[];
  initialAddresses: AddressRow[];
  initialTrucks: TruckRow[];
  embedded?: boolean;
  /** When set with `onPlannerCategoryChange`, planner drill-down is controlled (e.g. from Configure). */
  plannerCategory?: PlannerCategory;
  onPlannerCategoryChange?: (category: PlannerCategory) => void;
}) {
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [addresses, setAddresses] = useState<AddressRow[]>(initialAddresses);
  const [trucks, setTrucks] = useState<TruckRow[]>(initialTrucks);
  const [localCategory, setLocalCategory] = useState<PlannerCategory>("list");
  const isPlannerControlled =
    embedded && plannerCategoryProp !== undefined && onPlannerCategoryChange !== undefined;
  const category = isPlannerControlled ? plannerCategoryProp! : localCategory;
  const setCategory = (next: PlannerCategory) => {
    if (isPlannerControlled) onPlannerCategoryChange!(next);
    else setLocalCategory(next);
  };
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const [newItem, setNewItem] = useState({ item: "", cbm: "", weightKg: "" });
  const [newAddress, setNewAddress] = useState({
    dcName: "",
    latitude: "",
    longitude: "",
    province: "",
    city: "",
    origin: "",
    channelType: "",
    transportMode: "",
    maxKgLtlLcl: "",
    leadTimeFtlFcl: "",
    leadTimeLtlLcl: "",
    registerOpen: "",
    registerClosed: "",
    unloadDurationMin: "",
  });
  const [newTruck, setNewTruck] = useState({ truckType: "", maxKg: "", maxCbm: "" });
  const [importing, setImporting] = useState<"" | "item" | "address" | "truck">("");
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showItemAddForm, setShowItemAddForm] = useState(false);
  const [showTruckAddForm, setShowTruckAddForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemEditForm, setItemEditForm] = useState<ItemRow | null>(null);
  const [editingTruckId, setEditingTruckId] = useState<number | null>(null);
  const [truckEditForm, setTruckEditForm] = useState<TruckRow | null>(null);

  const [itemFilters, setItemFilters] = useState({ item: "", cbm: "", weightKg: "" });
  const [addressFilters, setAddressFilters] = useState({
    dcName: "",
    latitude: "",
    longitude: "",
    province: "",
    city: "",
    origin: "",
    channelType: "",
    transportMode: "",
    maxKgLtlLcl: "",
    leadTimeFtlFcl: "",
    leadTimeLtlLcl: "",
    registerOpen: "",
    registerClosed: "",
    unloadDurationMin: "",
  });
  const [truckFilters, setTruckFilters] = useState({ truckType: "", maxKg: "", maxCbm: "" });

  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [selectedAddressIds, setSelectedAddressIds] = useState<Set<number>>(new Set());
  const [selectedTruckIds, setSelectedTruckIds] = useState<Set<number>>(new Set());
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [addressEditForm, setAddressEditForm] = useState<AddressRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);

  const loadAll = async () => {
    setPending(true);
    const [itemRes, addressRes, truckRes] = await Promise.all([
      fetch("/api/masters/item"),
      fetch("/api/masters/address"),
      fetch("/api/masters/truck"),
    ]);
    setItems(await itemRes.json());
    setAddresses(await addressRes.json());
    setTrucks(await truckRes.json());
    setPending(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const importMasterFile = async (
    dataset: "item" | "address" | "truck",
    file: File | undefined,
  ) => {
    if (!file) return;
    setImporting(dataset);
    const payload = new FormData();
    payload.append("dataset", dataset);
    payload.append("file", file);
    const response = await fetch("/api/masters/import", { method: "POST", body: payload });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      created?: number;
      updated?: number;
      skipped?: number;
      totalRows?: number;
    };
    if (!response.ok || !data.ok) {
      setMessage({ type: "error", text: data.error ?? "Bulk import failed." });
      setImporting("");
      return;
    }
    await loadAll();
    setMessage({
      type: "success",
      text: `Import done: ${data.totalRows ?? 0} rows processed, ${data.created ?? 0} created, ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped.`,
    });
    setImporting("");
  };

  const resetCategoryState = () => {
    setCurrentPage(1);
    setSelectedItemIds(new Set());
    setSelectedAddressIds(new Set());
    setSelectedTruckIds(new Set());
    setEditingAddressId(null);
    setAddressEditForm(null);
    setShowItemAddForm(false);
    setShowTruckAddForm(false);
    setShowAddressForm(false);
    setEditingItemId(null);
    setItemEditForm(null);
    setEditingTruckId(null);
    setTruckEditForm(null);
  };

  const masterTableCheckboxClass =
    "h-4 w-4 rounded border-[var(--border)] bg-[var(--input)] accent-[var(--primary)]";
  const masterThClass =
    "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]";

  const escapeCsvCell = (value: string | number) => {
    const text = String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadCsv = (name: string, headers: string[], rows: Array<Array<string | number>>) => {
    const lines = [headers.join(","), ...rows.map((row) => row.map(escapeCsvCell).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const itemFiltered = items.filter((row) => {
    const i = itemFilters.item.trim().toLowerCase();
    const c = itemFilters.cbm.trim();
    const w = itemFilters.weightKg.trim();
    return (!i || row.item.toLowerCase().includes(i))
      && (!c || String(row.cbm).includes(c))
      && (!w || String(row.weightKg).includes(w));
  });
  const addressFiltered = addresses.filter((row) => {
    const dc = addressFilters.dcName.trim().toLowerCase();
    const lat = addressFilters.latitude.trim();
    const lon = addressFilters.longitude.trim();
    const province = addressFilters.province.trim().toLowerCase();
    const city = addressFilters.city.trim().toLowerCase();
    const origin = addressFilters.origin.trim().toLowerCase();
    const channelType = addressFilters.channelType.trim().toLowerCase();
    const transportMode = addressFilters.transportMode.trim().toLowerCase();
    const maxKgLtlLcl = addressFilters.maxKgLtlLcl.trim();
    const leadTimeFtlFcl = addressFilters.leadTimeFtlFcl.trim();
    const leadTimeLtlLcl = addressFilters.leadTimeLtlLcl.trim();
    const registerOpen = addressFilters.registerOpen.trim().toLowerCase();
    const registerClosed = addressFilters.registerClosed.trim().toLowerCase();
    const unloadDurationMin = addressFilters.unloadDurationMin.trim();
    return (!dc || row.dcName.toLowerCase().includes(dc))
      && (!lat || String(row.latitude).includes(lat))
      && (!lon || String(row.longitude).includes(lon))
      && (!province || row.province.toLowerCase().includes(province))
      && (!city || row.city.toLowerCase().includes(city))
      && (!origin || row.origin.toLowerCase().includes(origin))
      && (!channelType || row.channelType.toLowerCase().includes(channelType))
      && (!transportMode || row.transportMode.toLowerCase().includes(transportMode))
      && (!maxKgLtlLcl || String(row.maxKgLtlLcl ?? "").includes(maxKgLtlLcl))
      && (!leadTimeFtlFcl || String(row.leadTimeFtlFcl ?? "").includes(leadTimeFtlFcl))
      && (!leadTimeLtlLcl || String(row.leadTimeLtlLcl ?? "").includes(leadTimeLtlLcl))
      && (!registerOpen || row.registerOpen.toLowerCase().includes(registerOpen))
      && (!registerClosed || row.registerClosed.toLowerCase().includes(registerClosed))
      && (!unloadDurationMin || String(row.unloadDurationMin ?? "").includes(unloadDurationMin));
  });
  const truckFiltered = trucks.filter((row) => {
    const t = truckFilters.truckType.trim().toLowerCase();
    const kg = truckFilters.maxKg.trim();
    const cbm = truckFilters.maxCbm.trim();
    return (!t || row.truckType.toLowerCase().includes(t))
      && (!kg || String(row.maxKg).includes(kg))
      && (!cbm || String(row.maxCbm).includes(cbm));
  });

  const activeRows = category === "item" ? itemFiltered : category === "address" ? addressFiltered : truckFiltered;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * rowsPerPage;

  const itemPage = itemFiltered.slice(pageStart, pageStart + rowsPerPage);
  const addressPage = addressFiltered.slice(pageStart, pageStart + rowsPerPage);
  const truckPage = truckFiltered.slice(pageStart, pageStart + rowsPerPage);

  const categoryListButtonClass =
    "flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-[border-color,box-shadow] hover:border-[color-mix(in_oklch,var(--primary)_35%,transparent)] hover:shadow-[0_0_20px_color-mix(in_oklch,var(--primary)_10%,transparent)]";

  const renderCategoryList = (
    <ul className="space-y-2">
      <li>
        <button
          type="button"
          onClick={() => { setCategory("columns"); resetCategoryState(); }}
          className={categoryListButtonClass}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
              <Columns className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <span className="font-semibold text-[var(--text)]">Results columns</span>
              <p className="text-sm text-[var(--muted-foreground)]">Show, rename, and reorder planner results columns</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" />
        </button>
      </li>
      <li>
        <button
          type="button"
          onClick={() => { setCategory("item"); resetCategoryState(); }}
          className={categoryListButtonClass}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
              <Package className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <span className="font-semibold text-[var(--text)]">Item master</span>
              <p className="text-sm text-[var(--muted-foreground)]">Maintain item codes, CBM, and weight</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" />
        </button>
      </li>
      <li>
        <button
          type="button"
          onClick={() => { setCategory("address"); resetCategoryState(); }}
          className={categoryListButtonClass}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
              <MapPin className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <span className="font-semibold text-[var(--text)]">Address master</span>
              <p className="text-sm text-[var(--muted-foreground)]">Maintain DC mapping, channels, coordinates, and LTL/LCL limits</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" />
        </button>
      </li>
      <li>
        <button
          type="button"
          onClick={() => { setCategory("truck"); resetCategoryState(); }}
          className={categoryListButtonClass}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
              <Truck className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <span className="font-semibold text-[var(--text)]">Truck master</span>
              <p className="text-sm text-[var(--muted-foreground)]">Maintain truck capacity in kg and CBM</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" />
        </button>
      </li>
      <li>
        <Link href="/settings/planner/warehouse-time-motion" className={categoryListButtonClass}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
              <ListChecks className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <span className="font-semibold text-[var(--text)]">Warehouse time motion</span>
              <p className="text-sm text-[var(--muted-foreground)]">Set picking and loading capacity, timing, and rates</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" />
        </Link>
      </li>
    </ul>
  );

  const content = (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-0 py-0">
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description ?? ""}
        confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
        busy={pending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          void confirmAction.onConfirm();
        }}
      />
      {message && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            message.type === "success"
              ? "border-[color-mix(in_oklch,var(--success)_35%,var(--border))] bg-[color-mix(in_oklch,var(--success)_12%,var(--card))] text-[var(--success)]"
              : "border-[color-mix(in_oklch,var(--destructive)_35%,var(--border))] bg-[var(--om-status-red-bg)] text-[var(--destructive)]"
          }`}
        >
          {message.text}
        </div>
      )}

      {category === "list" && renderCategoryList}

      {category === "columns" && (
        <div className="space-y-4">
          {!embedded && (
            <button
              type="button"
              onClick={() => setCategory("list")}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to configure
            </button>
          )}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
            <PlannerResultsColumnsConfig />
          </div>
        </div>
      )}

      {category === "item" && (
        <div className="space-y-4">
          {!embedded && (
            <button
              type="button"
              onClick={() => setCategory("list")}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to configure
            </button>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)]"
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
              disabled={pending || selectedItemIds.size === 0}
              onClick={() => {
                setConfirmAction({
                  title: "Delete selected item rows?",
                  description: `This will permanently remove ${selectedItemIds.size} selected item row(s).`,
                  confirmLabel: "Delete rows",
                  onConfirm: async () => {
                    setPending(true);
                    try {
                      for (const id of Array.from(selectedItemIds)) {
                        await fetch(`/api/masters/item?id=${id}`, { method: "DELETE" });
                      }
                      setSelectedItemIds(new Set());
                      await loadAll();
                      setMessage({ type: "success", text: "Selected item rows deleted." });
                    } finally {
                      setPending(false);
                      setConfirmAction(null);
                    }
                  },
                });
              }}
            >
              Delete selected ({selectedItemIds.size})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => downloadCsv("item-master.csv", ["item", "cbm", "weightKg"], items.map((r) => [r.item, r.cbm, r.weightKg]))}
              disabled={items.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  void importMasterFile("item", e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
                disabled={importing === "item"}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={importing === "item"}
                onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.click()}
              >
                <Upload className="h-4 w-4" />
                Upload file
              </Button>
            </label>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => {
                setShowItemAddForm((prev) => !prev);
                setMessage(null);
                setEditingItemId(null);
                setItemEditForm(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </div>

          {showItemAddForm && (
            <form
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                await fetch("/api/masters/item", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    item: newItem.item,
                    cbm: Number(newItem.cbm),
                    weightKg: Number(newItem.weightKg),
                  }),
                });
                setNewItem({ item: "", cbm: "", weightKg: "" });
                setShowItemAddForm(false);
                await loadAll();
                setMessage({ type: "success", text: "Item added." });
              }}
            >
              <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted-foreground)]">Item *</label>
                  <Input
                    aria-label="New item code"
                    placeholder="ITEM"
                    value={newItem.item}
                    onChange={(e) => setNewItem((p) => ({ ...p, item: e.target.value }))}
                    required
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted-foreground)]">CBM *</label>
                  <Input
                    aria-label="New item CBM"
                    placeholder="CBM"
                    value={newItem.cbm}
                    onChange={(e) => setNewItem((p) => ({ ...p, cbm: e.target.value }))}
                    required
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted-foreground)]">Weight (KG) *</label>
                  <Input
                    aria-label="New item weight in kilograms"
                    placeholder="Weight (KG)"
                    value={newItem.weightKg}
                    onChange={(e) => setNewItem((p) => ({ ...p, weightKg: e.target.value }))}
                    required
                    className="text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Add
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowItemAddForm(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] md:min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--card)]">
                    <th className="w-10 px-3 py-3 text-center">
                      <input
                        aria-label="Select all visible item rows"
                        type="checkbox"
                        checked={itemPage.length > 0 && itemPage.every((r) => selectedItemIds.has(r.id))}
                        onChange={() => {
                          const all = itemPage.every((r) => selectedItemIds.has(r.id));
                          setSelectedItemIds((prev) => {
                            const next = new Set(prev);
                            for (const r of itemPage) {
                              if (all) {
                                next.delete(r.id);
                              } else {
                                next.add(r.id);
                              }
                            }
                            return next;
                          });
                        }}
                        className={masterTableCheckboxClass}
                      />
                    </th>
                    <th className={masterThClass}>Item</th>
                    <th className={masterThClass}>CBM</th>
                    <th className={masterThClass}>Weight (KG)</th>
                    <th className={`${masterThClass} w-28 text-right`}>Actions</th>
                  </tr>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-elevated)]">
                    <th className="px-3 py-2" />
                    <th className="px-4 py-2">
                      <Input
                        value={itemFilters.item}
                        onChange={(e) => {
                          setItemFilters((p) => ({ ...p, item: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter item"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={itemFilters.cbm}
                        onChange={(e) => {
                          setItemFilters((p) => ({ ...p, cbm: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter cbm"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={itemFilters.weightKg}
                        onChange={(e) => {
                          setItemFilters((p) => ({ ...p, weightKg: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter kg"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {itemPage.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                        {itemFilters.item || itemFilters.cbm || itemFilters.weightKg
                          ? "No items match the applied filters."
                          : "No items in item master."}
                      </td>
                    </tr>
                  ) : (
                    itemPage.map((row) => {
                      const isEditing = editingItemId === row.id && itemEditForm !== null;
                      return (
                        <tr
                          key={row.id}
                          className={`group border-b border-[var(--border)] transition-colors ${
                            isEditing
                              ? "bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))]"
                              : "hover:bg-[var(--surface-elevated)]"
                          }`}
                        >
                          {isEditing && itemEditForm ? (
                            <>
                              <td className="px-3 py-2 text-center">
                                <input
                                  aria-label={`Select item row ${row.item || row.id}`}
                                  type="checkbox"
                                  checked={selectedItemIds.has(row.id)}
                                  onChange={() => {
                                    setSelectedItemIds((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(row.id)) {
                                        n.delete(row.id);
                                      } else {
                                        n.add(row.id);
                                      }
                                      return n;
                                    });
                                  }}
                                  className={masterTableCheckboxClass}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  value={itemEditForm.item}
                                  onChange={(e) =>
                                    setItemEditForm((prev) => (prev ? { ...prev, item: e.target.value } : prev))
                                  }
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  value={itemEditForm.cbm}
                                  onChange={(e) =>
                                    setItemEditForm((prev) =>
                                      prev ? { ...prev, cbm: Number(e.target.value) } : prev,
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  value={itemEditForm.weightKg}
                                  onChange={(e) =>
                                    setItemEditForm((prev) =>
                                      prev ? { ...prev, weightKg: Number(e.target.value) } : prev,
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!itemEditForm) return;
                                      await fetch("/api/masters/item", {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(itemEditForm),
                                      });
                                      setItems((prev) =>
                                        prev.map((it) => (it.id === row.id ? itemEditForm : it)),
                                      );
                                      setEditingItemId(null);
                                      setItemEditForm(null);
                                      setMessage({ type: "success", text: "Item saved." });
                                    }}
                                    className="rounded-md p-2.5 text-[var(--primary)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_14%,var(--card))]"
                                    title="Save"
                                    aria-label={`Save item row ${row.item || row.id}`}
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItemId(null);
                                      setItemEditForm(null);
                                    }}
                                    className="rounded-md p-2.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
                                    title="Cancel"
                                    aria-label={`Cancel editing item row ${row.item || row.id}`}
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
                                  aria-label={`Select item row ${row.item || row.id}`}
                                  type="checkbox"
                                  checked={selectedItemIds.has(row.id)}
                                  onChange={() => {
                                    setSelectedItemIds((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(row.id)) {
                                        n.delete(row.id);
                                      } else {
                                        n.add(row.id);
                                      }
                                      return n;
                                    });
                                  }}
                                  className={masterTableCheckboxClass}
                                />
                              </td>
                              <td className="px-4 py-3 text-[var(--text)]">{row.item}</td>
                              <td className="px-4 py-3 text-center text-[var(--muted-foreground)]">{row.cbm}</td>
                              <td className="px-4 py-3 text-center text-[var(--muted-foreground)]">{row.weightKg}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:hover:opacity-100 [tr:hover_&]:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItemId(row.id);
                                      setItemEditForm({ ...row });
                                      setShowItemAddForm(false);
                                    }}
                                    className="rounded-md p-2.5 text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] hover:text-[var(--primary)]"
                                    title="Edit"
                                    aria-label={`Edit item row ${row.item || row.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
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
          </div>

          <p className="text-center text-xs text-[var(--muted-foreground)]">
            {itemPage.length} of {itemFiltered.length} filtered rows shown ({items.length} total)
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="text-xs text-[var(--muted-foreground)]">
              Page {safePage} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {category === "address" && (
        <div className="space-y-4">
          {!embedded && (
            <button
              type="button"
              onClick={() => setCategory("list")}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to configure
            </button>
          )}
          <p className="text-sm text-[var(--muted-foreground)]">
            Manage DC coordinates, channels, transport modes, and receiving windows. Export street addresses still come from the{" "}
            <span className="font-semibold text-[var(--text)]">Address</span> column on each orders CSV row.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)]"
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
              disabled={pending || selectedAddressIds.size === 0}
              onClick={() => {
                setConfirmAction({
                  title: "Delete selected address rows?",
                  description: `This will permanently remove ${selectedAddressIds.size} selected address row(s).`,
                  confirmLabel: "Delete rows",
                  onConfirm: async () => {
                    setPending(true);
                    try {
                      for (const id of Array.from(selectedAddressIds)) {
                        await fetch(`/api/masters/address?id=${id}`, { method: "DELETE" });
                      }
                      setSelectedAddressIds(new Set());
                      await loadAll();
                      setMessage({ type: "success", text: "Selected address rows deleted." });
                    } finally {
                      setPending(false);
                      setConfirmAction(null);
                    }
                  },
                });
              }}
            >
              Delete selected ({selectedAddressIds.size})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={addresses.length === 0}
              onClick={() =>
                downloadCsv(
                  "address-master.csv",
                  [
                    "origin",
                    "dcName",
                    "channelType",
                    "transportMode",
                    "maxKgLtlLcl",
                    "leadtime_ftl/fcl",
                    "leadtime_ltl/lcl",
                    "latitude",
                    "longitude",
                    "province",
                    "city",
                    "registeropen",
                    "registerclosed",
                    "unloadduration_m",
                  ],
                  addresses.map((r) => [
                    r.origin,
                    r.dcName,
                    r.channelType,
                    r.transportMode,
                    r.maxKgLtlLcl ?? "",
                    r.leadTimeFtlFcl ?? "",
                    r.leadTimeLtlLcl ?? "",
                    r.latitude,
                    r.longitude,
                    r.province,
                    r.city,
                    r.registerOpen,
                    r.registerClosed,
                    r.unloadDurationMin ?? "",
                  ]),
                )
              }
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  void importMasterFile("address", e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
                disabled={importing === "address"}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={importing === "address"}
                onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.click()}
              >
                <Upload className="h-4 w-4" />
                Upload file
              </Button>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setAddressFilters({
                  dcName: "",
                  latitude: "",
                  longitude: "",
                  province: "",
                  city: "",
                  origin: "",
                  channelType: "",
                  transportMode: "",
                  maxKgLtlLcl: "",
                  leadTimeFtlFcl: "",
                  leadTimeLtlLcl: "",
                  registerOpen: "",
                  registerClosed: "",
                  unloadDurationMin: "",
                });
                setCurrentPage(1);
              }}
            >
              <FilterX className="h-4 w-4" />
              Reset Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={selectedAddressIds.size === 0}
              onClick={() => setSelectedAddressIds(new Set())}
            >
              <ListChecks className="h-4 w-4" />
              Clear Selection
            </Button>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => {
                setShowAddressForm((prev) => !prev);
                setMessage(null);
                setEditingAddressId(null);
                setAddressEditForm(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Address
            </Button>
          </div>

          {showAddressForm && (
            <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 md:grid-cols-4">
              <Input placeholder="Origin" value={newAddress.origin} onChange={(e) => setNewAddress((p) => ({ ...p, origin: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="DC" value={newAddress.dcName} onChange={(e) => setNewAddress((p) => ({ ...p, dcName: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Channel Type" value={newAddress.channelType} onChange={(e) => setNewAddress((p) => ({ ...p, channelType: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Transport Mode" value={newAddress.transportMode} onChange={(e) => setNewAddress((p) => ({ ...p, transportMode: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Max KG LTL/LCL" value={newAddress.maxKgLtlLcl} onChange={(e) => setNewAddress((p) => ({ ...p, maxKgLtlLcl: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Lead Time FTL/FCL (days)" value={newAddress.leadTimeFtlFcl} onChange={(e) => setNewAddress((p) => ({ ...p, leadTimeFtlFcl: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Lead Time LTL/LCL (days)" value={newAddress.leadTimeLtlLcl} onChange={(e) => setNewAddress((p) => ({ ...p, leadTimeLtlLcl: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Latitude" value={newAddress.latitude} onChange={(e) => setNewAddress((p) => ({ ...p, latitude: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Longitude" value={newAddress.longitude} onChange={(e) => setNewAddress((p) => ({ ...p, longitude: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Province" value={newAddress.province} onChange={(e) => setNewAddress((p) => ({ ...p, province: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="City" value={newAddress.city} onChange={(e) => setNewAddress((p) => ({ ...p, city: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Register Open (HH:mm)" value={newAddress.registerOpen} onChange={(e) => setNewAddress((p) => ({ ...p, registerOpen: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Register Closed (HH:mm)" value={newAddress.registerClosed} onChange={(e) => setNewAddress((p) => ({ ...p, registerClosed: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Input placeholder="Unload Duration (min)" value={newAddress.unloadDurationMin} onChange={(e) => setNewAddress((p) => ({ ...p, unloadDurationMin: e.target.value }))} className="border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--om-text-muted)]" />
              <Button
                type="button"
                size="sm"
                className="gap-1.5 md:col-span-4"
                onClick={async () => {
                  await fetch("/api/masters/address", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      dcName: newAddress.dcName,
                      latitude: Number(newAddress.latitude),
                      longitude: Number(newAddress.longitude),
                      province: newAddress.province,
                      city: newAddress.city,
                      origin: newAddress.origin,
                      channelType: newAddress.channelType,
                      transportMode: newAddress.transportMode,
                      maxKgLtlLcl: newAddress.maxKgLtlLcl.trim() ? Number(newAddress.maxKgLtlLcl) : null,
                      leadTimeFtlFcl: newAddress.leadTimeFtlFcl.trim()
                        ? Number(newAddress.leadTimeFtlFcl)
                        : null,
                      leadTimeLtlLcl: newAddress.leadTimeLtlLcl.trim()
                        ? Number(newAddress.leadTimeLtlLcl)
                        : null,
                      registerOpen: newAddress.registerOpen,
                      registerClosed: newAddress.registerClosed,
                      unloadDurationMin: newAddress.unloadDurationMin.trim() ? Number(newAddress.unloadDurationMin) : null,
                    }),
                  });
                  setNewAddress({
                    dcName: "",
                    latitude: "",
                    longitude: "",
                    province: "",
                    city: "",
                    origin: "",
                    channelType: "",
                    transportMode: "",
                    maxKgLtlLcl: "",
                    leadTimeFtlFcl: "",
                    leadTimeLtlLcl: "",
                    registerOpen: "",
                    registerClosed: "",
                    unloadDurationMin: "",
                  });
                  await loadAll();
                  setMessage({ type: "success", text: "Address added." });
                }}
              >
                <Plus className="h-4 w-4" />
                Add Address
              </Button>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] whitespace-nowrap md:min-w-[2200px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--card)]">
                    <th className="w-10 px-3 py-3 text-center">
                      <input
                        aria-label="Select all visible address rows"
                        type="checkbox"
                        checked={addressPage.length > 0 && addressPage.every((r) => selectedAddressIds.has(r.id))}
                        onChange={() => {
                          const all = addressPage.every((r) => selectedAddressIds.has(r.id));
                          setSelectedAddressIds((prev) => {
                            const n = new Set(prev);
                            for (const r of addressPage) {
                              if (all) {
                                n.delete(r.id);
                              } else {
                                n.add(r.id);
                              }
                            }
                            return n;
                          });
                        }}
                        className={masterTableCheckboxClass}
                      />
                    </th>
                    <th className={masterThClass}>Origin</th>
                    <th className={masterThClass}>DC</th>
                    <th className={masterThClass}>Channel Type</th>
                    <th className={masterThClass}>Transport Mode</th>
                    <th className={masterThClass}>Max KG LTL/LCL</th>
                    <th className={masterThClass}>Lead FTL/FCL</th>
                    <th className={masterThClass}>Lead LTL/LCL</th>
                    <th className={masterThClass}>Latitude</th>
                    <th className={masterThClass}>Longitude</th>
                    <th className={masterThClass}>Province</th>
                    <th className={masterThClass}>City</th>
                    <th className={masterThClass}>Register Open</th>
                    <th className={masterThClass}>Register Closed</th>
                    <th className={masterThClass}>Unload (min)</th>
                    <th className={`${masterThClass} text-right`}>Actions</th>
                  </tr>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-elevated)]">
                    <th className="px-3 py-2" />
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.origin}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, origin: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter origin"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.dcName}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, dcName: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter dc"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.channelType}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, channelType: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter channel type"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.transportMode}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, transportMode: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter transport mode"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.maxKgLtlLcl}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, maxKgLtlLcl: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter max kg"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.leadTimeFtlFcl}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, leadTimeFtlFcl: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter lead ftl/fcl"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.leadTimeLtlLcl}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, leadTimeLtlLcl: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter lead ltl/lcl"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.latitude}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, latitude: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter latitude"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.longitude}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, longitude: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter longitude"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.province}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, province: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter province"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.city}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, city: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter city"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.registerOpen}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, registerOpen: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter reg open"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.registerClosed}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, registerClosed: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter reg closed"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={addressFilters.unloadDurationMin}
                        onChange={(e) => {
                          setAddressFilters((p) => ({ ...p, unloadDurationMin: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter unload min"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                {addressPage.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                      {Object.values(addressFilters).some((v) => String(v).trim())
                        ? "No addresses match the applied filters."
                        : "No addresses in address master."}
                    </td>
                  </tr>
                ) : (
                addressPage.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)]"
                  >
                    {editingAddressId === row.id && addressEditForm ? (
                      <>
                        <td className="px-3 py-2 text-center">
                          <input
                            aria-label={`Select address row ${row.dcName || row.id}`}
                            type="checkbox"
                            checked={selectedAddressIds.has(row.id)}
                            onChange={() => {
                              setSelectedAddressIds((prev) => {
                                const n = new Set(prev);
                                if (n.has(row.id)) {
                                  n.delete(row.id);
                                } else {
                                  n.add(row.id);
                                }
                                return n;
                              });
                            }}
                            className={masterTableCheckboxClass}
                          />
                        </td>
                        <td className="px-4 py-2"><Input value={addressEditForm.origin} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, origin: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.dcName} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, dcName: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.channelType} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, channelType: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.transportMode} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, transportMode: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.maxKgLtlLcl ?? ""} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, maxKgLtlLcl: e.target.value.trim() ? Number(e.target.value) : null } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.leadTimeFtlFcl ?? ""} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, leadTimeFtlFcl: e.target.value.trim() ? Number(e.target.value) : null } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.leadTimeLtlLcl ?? ""} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, leadTimeLtlLcl: e.target.value.trim() ? Number(e.target.value) : null } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.latitude} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, latitude: Number(e.target.value) } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.longitude} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, longitude: Number(e.target.value) } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.province} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, province: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.city} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, city: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.registerOpen} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, registerOpen: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.registerClosed} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, registerClosed: e.target.value } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2"><Input value={addressEditForm.unloadDurationMin ?? ""} onChange={(e) => setAddressEditForm((prev) => (prev ? { ...prev, unloadDurationMin: e.target.value.trim() ? Number(e.target.value) : null } : prev))} className="h-8 text-sm" /></td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!addressEditForm) return;
                                await fetch("/api/masters/address", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(addressEditForm),
                                });
                                setAddresses((prev) => prev.map((it) => (it.id === row.id ? addressEditForm : it)));
                                setEditingAddressId(null);
                                setAddressEditForm(null);
                                setMessage({ type: "success", text: "Address saved." });
                              }}
                              className="rounded-md p-2.5 text-[var(--primary)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_14%,var(--card))]"
                              title="Save"
                              aria-label={`Save address row ${row.dcName || row.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAddressId(null);
                                setAddressEditForm(null);
                              }}
                              className="rounded-md p-2.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-elevated)]"
                              title="Cancel"
                              aria-label={`Cancel editing address row ${row.dcName || row.id}`}
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
                        aria-label={`Select address row ${row.dcName || row.id}`}
                        type="checkbox"
                        checked={selectedAddressIds.has(row.id)}
                        onChange={() => {
                          setSelectedAddressIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(row.id)) {
                              n.delete(row.id);
                            } else {
                              n.add(row.id);
                            }
                            return n;
                          });
                        }}
                        className={masterTableCheckboxClass}
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.origin || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.dcName || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.channelType || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.transportMode || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.maxKgLtlLcl ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.leadTimeFtlFcl ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.leadTimeLtlLcl ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.latitude}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.longitude}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.province || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.city || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.registerOpen || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.registerClosed || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{row.unloadDurationMin ?? "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:hover:opacity-100 [tr:hover_&]:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAddressId(row.id);
                            setAddressEditForm({ ...row });
                          }}
                          className="rounded-md p-2.5 text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] hover:text-[var(--primary)]"
                          title="Edit"
                          aria-label={`Edit address row ${row.dcName || row.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                      </>
                    )}
                  </tr>
                ))
                )}
              </tbody>
              </table>
            </div>
          </div>

          <p className="text-center text-xs text-[var(--muted-foreground)]">
            {addressPage.length} of {addressFiltered.length} filtered rows shown ({addresses.length} total)
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="text-xs text-[var(--muted-foreground)]">
              Page {safePage} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {category === "truck" && (
        <div className="space-y-4">
          {!embedded && (
            <button
              type="button"
              onClick={() => setCategory("list")}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to configure
            </button>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)]"
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
              disabled={pending || selectedTruckIds.size === 0}
              onClick={() => {
                setConfirmAction({
                  title: "Delete selected truck rows?",
                  description: `This will permanently remove ${selectedTruckIds.size} selected truck row(s).`,
                  confirmLabel: "Delete rows",
                  onConfirm: async () => {
                    setPending(true);
                    try {
                      for (const id of Array.from(selectedTruckIds)) {
                        await fetch(`/api/masters/truck?id=${id}`, { method: "DELETE" });
                      }
                      setSelectedTruckIds(new Set());
                      await loadAll();
                      setMessage({ type: "success", text: "Selected truck rows deleted." });
                    } finally {
                      setPending(false);
                      setConfirmAction(null);
                    }
                  },
                });
              }}
            >
              Delete selected ({selectedTruckIds.size})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => downloadCsv("truck-master.csv", ["truckType", "maxKg", "maxCbm"], trucks.map((r) => [r.truckType, r.maxKg, r.maxCbm]))}
              disabled={trucks.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  void importMasterFile("truck", e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
                disabled={importing === "truck"}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={importing === "truck"}
                onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.click()}
              >
                <Upload className="h-4 w-4" />
                Upload file
              </Button>
            </label>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => {
                setShowTruckAddForm((prev) => !prev);
                setMessage(null);
                setEditingTruckId(null);
                setTruckEditForm(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Add truck
            </Button>
          </div>

          {showTruckAddForm && (
            <form
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                await fetch("/api/masters/truck", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    truckType: newTruck.truckType,
                    maxKg: Number(newTruck.maxKg),
                    maxCbm: Number(newTruck.maxCbm),
                  }),
                });
                setNewTruck({ truckType: "", maxKg: "", maxCbm: "" });
                setShowTruckAddForm(false);
                await loadAll();
                setMessage({ type: "success", text: "Truck added." });
              }}
            >
              <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted-foreground)]">Truck type *</label>
                  <Input
                    aria-label="New truck type"
                    placeholder="Truck Type"
                    value={newTruck.truckType}
                    onChange={(e) => setNewTruck((p) => ({ ...p, truckType: e.target.value }))}
                    required
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted-foreground)]">Max kg *</label>
                  <Input
                    aria-label="New truck maximum weight in kilograms"
                    placeholder="Max Kg"
                    value={newTruck.maxKg}
                    onChange={(e) => setNewTruck((p) => ({ ...p, maxKg: e.target.value }))}
                    required
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted-foreground)]">Max CBM *</label>
                  <Input
                    aria-label="New truck maximum CBM"
                    placeholder="Max CBM"
                    value={newTruck.maxCbm}
                    onChange={(e) => setNewTruck((p) => ({ ...p, maxCbm: e.target.value }))}
                    required
                    className="text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Add
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowTruckAddForm(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] md:min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--card)]">
                    <th className="w-10 px-3 py-3 text-center">
                      <input
                        aria-label="Select all visible truck rows"
                        type="checkbox"
                        checked={truckPage.length > 0 && truckPage.every((r) => selectedTruckIds.has(r.id))}
                        onChange={() => {
                          const all = truckPage.every((r) => selectedTruckIds.has(r.id));
                          setSelectedTruckIds((prev) => {
                            const n = new Set(prev);
                            for (const r of truckPage) {
                              if (all) {
                                n.delete(r.id);
                              } else {
                                n.add(r.id);
                              }
                            }
                            return n;
                          });
                        }}
                        className={masterTableCheckboxClass}
                      />
                    </th>
                    <th className={masterThClass}>Truck Type</th>
                    <th className={masterThClass}>Max Kg</th>
                    <th className={masterThClass}>Max CBM</th>
                    <th className={`${masterThClass} w-28 text-right`}>Actions</th>
                  </tr>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-elevated)]">
                    <th className="px-3 py-2" />
                    <th className="px-4 py-2">
                      <Input
                        value={truckFilters.truckType}
                        onChange={(e) => {
                          setTruckFilters((p) => ({ ...p, truckType: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter truck type"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={truckFilters.maxKg}
                        onChange={(e) => {
                          setTruckFilters((p) => ({ ...p, maxKg: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter max kg"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <Input
                        value={truckFilters.maxCbm}
                        onChange={(e) => {
                          setTruckFilters((p) => ({ ...p, maxCbm: e.target.value }));
                          setCurrentPage(1);
                        }}
                        placeholder="Filter max cbm"
                        className="h-8 text-xs"
                      />
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {truckPage.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                        {truckFilters.truckType || truckFilters.maxKg || truckFilters.maxCbm
                          ? "No trucks match the applied filters."
                          : "No trucks in truck master."}
                      </td>
                    </tr>
                  ) : (
                    truckPage.map((row) => {
                      const isEditing = editingTruckId === row.id && truckEditForm !== null;
                      return (
                        <tr
                          key={row.id}
                          className={`group border-b border-[var(--border)] transition-colors ${
                            isEditing
                              ? "bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))]"
                              : "hover:bg-[var(--surface-elevated)]"
                          }`}
                        >
                          {isEditing && truckEditForm ? (
                            <>
                              <td className="px-3 py-2 text-center">
                                <input
                                  aria-label={`Select truck row ${row.truckType || row.id}`}
                                  type="checkbox"
                                  checked={selectedTruckIds.has(row.id)}
                                  onChange={() => {
                                    setSelectedTruckIds((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(row.id)) {
                                        n.delete(row.id);
                                      } else {
                                        n.add(row.id);
                                      }
                                      return n;
                                    });
                                  }}
                                  className={masterTableCheckboxClass}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  value={truckEditForm.truckType}
                                  onChange={(e) =>
                                    setTruckEditForm((prev) =>
                                      prev ? { ...prev, truckType: e.target.value } : prev,
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  value={truckEditForm.maxKg}
                                  onChange={(e) =>
                                    setTruckEditForm((prev) =>
                                      prev ? { ...prev, maxKg: Number(e.target.value) } : prev,
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  value={truckEditForm.maxCbm}
                                  onChange={(e) =>
                                    setTruckEditForm((prev) =>
                                      prev ? { ...prev, maxCbm: Number(e.target.value) } : prev,
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!truckEditForm) return;
                                      await fetch("/api/masters/truck", {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(truckEditForm),
                                      });
                                      setTrucks((prev) =>
                                        prev.map((it) => (it.id === row.id ? truckEditForm : it)),
                                      );
                                      setEditingTruckId(null);
                                      setTruckEditForm(null);
                                      setMessage({ type: "success", text: "Truck saved." });
                                    }}
                                    className="rounded-md p-2.5 text-[var(--primary)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_14%,var(--card))]"
                                    title="Save"
                                    aria-label={`Save truck row ${row.truckType || row.id}`}
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTruckId(null);
                                      setTruckEditForm(null);
                                    }}
                                    className="rounded-md p-2.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
                                    title="Cancel"
                                    aria-label={`Cancel editing truck row ${row.truckType || row.id}`}
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
                                  aria-label={`Select truck row ${row.truckType || row.id}`}
                                  type="checkbox"
                                  checked={selectedTruckIds.has(row.id)}
                                  onChange={() => {
                                    setSelectedTruckIds((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(row.id)) {
                                        n.delete(row.id);
                                      } else {
                                        n.add(row.id);
                                      }
                                      return n;
                                    });
                                  }}
                                  className={masterTableCheckboxClass}
                                />
                              </td>
                              <td className="px-4 py-3 text-[var(--text)]">{row.truckType}</td>
                              <td className="px-4 py-3 text-center text-[var(--muted-foreground)]">{row.maxKg}</td>
                              <td className="px-4 py-3 text-center text-[var(--muted-foreground)]">{row.maxCbm}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:hover:opacity-100 [tr:hover_&]:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTruckId(row.id);
                                      setTruckEditForm({ ...row });
                                      setShowTruckAddForm(false);
                                    }}
                                    className="rounded-md p-2.5 text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] hover:text-[var(--primary)]"
                                    title="Edit"
                                    aria-label={`Edit truck row ${row.truckType || row.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
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
          </div>

          <p className="text-center text-xs text-[var(--muted-foreground)]">
            {truckPage.length} of {truckFiltered.length} filtered rows shown ({trucks.length} total)
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="text-xs text-[var(--muted-foreground)]">
              Page {safePage} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="pb-12">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <Link
              href="/configure"
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to configure
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <BrandMark size="sm" />
            <h1 className="font-display text-xl font-black tracking-tight text-[var(--text)]">Planner masters</h1>
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage the item, address, and truck data used by route planning.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">{content}</div>
    </div>
  );
}
