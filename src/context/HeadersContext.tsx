"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { HeaderConfig as HeaderConfigType } from "@/lib/po/types";

const STORAGE_KEY = "po-extractor-headers";

async function fetchDefaultHeaders(): Promise<HeaderConfigType[]> {
  const res = await fetch("/api/po/default-headers");
  if (!res.ok) throw new Error("Failed to load default headers");
  const body = (await res.json()) as { headers?: HeaderConfigType[] };
  if (!Array.isArray(body.headers) || body.headers.length === 0) {
    throw new Error("Invalid default headers response");
  }
  return body.headers;
}

function mergeWithStored(defaults: HeaderConfigType[]): HeaderConfigType[] {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as HeaderConfigType[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const storedKeys = new Set(parsed.map((h) => h.key));
        for (const dh of defaults) {
          if (!storedKeys.has(dh.key)) parsed.push(dh);
        }
        return parsed.sort((a, b) => a.order - b.order);
      }
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

function saveHeaders(headers: HeaderConfigType[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(headers));
  } catch {
    /* ignore */
  }
}

interface HeadersContextValue {
  headers: HeaderConfigType[];
  setHeaders: (
    headers: HeaderConfigType[] | ((prev: HeaderConfigType[]) => HeaderConfigType[])
  ) => void;
  reloadDefaultHeaders: () => Promise<HeaderConfigType[]>;
}

const HeadersContext = createContext<HeadersContextValue | null>(null);

export function HeadersProvider({ children }: { children: React.ReactNode }) {
  const [headers, setHeadersState] = useState<HeaderConfigType[]>([]);
  const [mounted, setMounted] = useState(false);

  const reloadDefaultHeaders = useCallback(async () => {
    const defaults = await fetchDefaultHeaders();
    return defaults;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const defaults = await fetchDefaultHeaders();
        if (cancelled) return;
        setHeadersState(mergeWithStored(defaults));
      } catch {
        if (!cancelled) setHeadersState([]);
      } finally {
        if (!cancelled) setMounted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setHeaders = (
    value: HeaderConfigType[] | ((prev: HeaderConfigType[]) => HeaderConfigType[])
  ) => {
    setHeadersState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (mounted) saveHeaders(next);
      return next;
    });
  };

  return (
    <HeadersContext.Provider value={{ headers, setHeaders, reloadDefaultHeaders }}>
      {children}
    </HeadersContext.Provider>
  );
}

export function useHeaders() {
  const ctx = useContext(HeadersContext);
  if (!ctx) throw new Error("useHeaders must be used within HeadersProvider");
  return ctx;
}
