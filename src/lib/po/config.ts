import type { HeaderConfig, POLineItem } from "./types";

export async function loadDefaultHeadersFromRepository(): Promise<HeaderConfig[]> {
  return defaultHeaders;
}

export const defaultHeaders: HeaderConfig[] = [
  { key: "po_date", label: "PO Date", enabled: true, order: 0 },
  { key: "po_number", label: "PO NUMBER", enabled: true, order: 1 },
  { key: "delivery_location", label: "DC Name", enabled: true, order: 2 },
  { key: "product_code", label: "MT Channel SKU", enabled: true, order: 3 },
  { key: "item" as keyof POLineItem, label: "ITEM", enabled: true, order: 4 },
  { key: "product_name", label: "Nama Produk", enabled: true, order: 5 },
  { key: "quantity", label: "Qty ", enabled: true, order: 6 },
  { key: "delivery_date", label: "Delivery Date", enabled: true, order: 7 },
  { key: "retailer", label: "Retailer", enabled: false, order: 8 },
  { key: "supplier_name", label: "Nama Supplier", enabled: false, order: 9 },
  { key: "supplier_code", label: "Kode Supplier", enabled: false, order: 10 },
  { key: "unit", label: "Satuan", enabled: false, order: 11 },
  { key: "unit_price", label: "Harga Satuan", enabled: false, order: 12 },
  { key: "total_price", label: "Total Harga", enabled: false, order: 13 },
  { key: "discount", label: "Diskon", enabled: false, order: 14 },
  { key: "tax", label: "Pajak", enabled: false, order: 15 },
  { key: "notes", label: "Catatan", enabled: false, order: 16 },
];

export const config = {
  ocr: {
    languages: ["eng", "ind"],
    pageSegMode: 3, // PSM_AUTO
  },
  upload: {
    maxFileSizeMb: 50,
    maxFilesPerBatch: 50,
  },
};
