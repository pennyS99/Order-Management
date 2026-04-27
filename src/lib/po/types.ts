export interface POLineItem {
  po_number: string | null;
  po_date: string | null;
  retailer: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  delivery_location: string | null;
  delivery_date: string | null;
  product_code: string | null;
  item?: string | null; // Populated from UOM master lookup after extraction
  product_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  discount: number | null;
  tax: number | null;
  notes: string | null;
  /** Extraction method metadata from parser pipeline */
  extraction_method?: string | null;
  /** Confidence score for extraction when available */
  confidence?: number | null;
}

export interface HeaderConfig {
  key: keyof POLineItem;
  label: string;
  enabled: boolean;
  order: number;
}

export interface ExtractionMetadata {
  method: "digital" | "ocr" | "mixed";
  pageCount: number;
  confidence?: number;
  /** Parser used: e.g. "lotte", "indomarco" */
  parserUsed?: string;
  /** Extraction method metadata from parser pipeline */
  extraction_method?: string;
}

export interface FileProcessingStatus {
  id: string;
  fileName: string;
  fileSize: number;
  file?: File;
  status: "pending" | "uploading" | "extracting" | "done" | "error";
  progress?: string;
  itemCount?: number;
  metadata?: ExtractionMetadata;
  error?: string;
  data?: POLineItem[];
}

export interface ExportOptions {
  summarySheet: boolean;
  perRetailer: boolean;
  freezeHeader: boolean;
}

export interface ProcessingBatch {
  id: string;
  name: string;
  files: FileProcessingStatus[];
  createdAt: number;
}

export interface BatchHistoryEntry {
  id: string;
  batchName: string;
  fileCount: number;
  itemCount: number;
  completedAt: number;
  data: POLineItem[];
}
