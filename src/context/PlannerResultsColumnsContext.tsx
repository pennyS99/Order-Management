"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PLANNER_RESULTS_COLUMNS_STORAGE_KEY,
  buildStateFromStorage,
  defaultColumnsByTab,
  normalizeOrder,
  type PlannerColumnConfig,
  type PlannerResultsColumnsStateV1,
  type PlannerResultsTab,
} from "@/lib/planner/results-columns";

type PlannerResultsColumnsContextValue = {
  state: PlannerResultsColumnsStateV1;
  getTabColumns: (tab: PlannerResultsTab) => PlannerColumnConfig[];
  setTabColumns: (tab: PlannerResultsTab, next: PlannerColumnConfig[]) => void;
  resetTab: (tab: PlannerResultsTab) => void;
};

const PlannerResultsColumnsContext = createContext<PlannerResultsColumnsContextValue | null>(null);

function safeReadStorage(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLANNER_RESULTS_COLUMNS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function safeWriteStorage(state: PlannerResultsColumnsStateV1) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLANNER_RESULTS_COLUMNS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

export function PlannerResultsColumnsProvider({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [state, setState] = useState<PlannerResultsColumnsStateV1>(() => buildStateFromStorage(null));

  useEffect(() => {
    const stored = safeReadStorage();
    const merged = buildStateFromStorage(stored);
    setState(merged);
    setIsMounted(true);
    safeWriteStorage(merged);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    safeWriteStorage(state);
  }, [isMounted, state]);

  const getTabColumns = useCallback(
    (tab: PlannerResultsTab) => state.columnsByTab[tab],
    [state.columnsByTab],
  );

  const setTabColumns = useCallback((tab: PlannerResultsTab, next: PlannerColumnConfig[]) => {
    setState((prev) =>
      buildStateFromStorage({
        version: 1,
        columnsByTab: {
          ...prev.columnsByTab,
          [tab]: normalizeOrder(next),
        },
      }),
    );
  }, []);

  const resetTab = useCallback(
    (tab: PlannerResultsTab) => {
      const defaults = defaultColumnsByTab()[tab];
      setTabColumns(tab, defaults);
    },
    [setTabColumns],
  );

  const value = useMemo<PlannerResultsColumnsContextValue>(
    () => ({
      state,
      getTabColumns,
      setTabColumns,
      resetTab,
    }),
    [state, getTabColumns, setTabColumns, resetTab],
  );

  return (
    <PlannerResultsColumnsContext.Provider value={value}>
      {children}
    </PlannerResultsColumnsContext.Provider>
  );
}

export function usePlannerResultsColumns() {
  const ctx = useContext(PlannerResultsColumnsContext);
  if (!ctx) {
    throw new Error("usePlannerResultsColumns must be used within PlannerResultsColumnsProvider");
  }
  return ctx;
}

