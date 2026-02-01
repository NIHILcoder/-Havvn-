/**
 * Scan History Store
 * Zustand store for managing scan history state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ScanHistoryEntry,
  ScanReport,
  ComparisonResult,
  HistoryFilter,
} from '../../shared/scan-report-types';

interface ScanHistoryState {
  // State
  history: ScanHistoryEntry[];
  selectedScanIds: string[];
  filter: HistoryFilter | null;
  isLoading: boolean;
  error: string | null;

  // Comparison
  comparisonResult: ComparisonResult | null;
  isComparing: boolean;

  // Actions
  setHistory: (history: ScanHistoryEntry[]) => void;
  addScan: (scan: ScanHistoryEntry) => void;
  removeScan: (id: string) => void;
  removeScans: (ids: string[]) => void;
  clearHistory: () => void;
  setFilter: (filter: HistoryFilter | null) => void;
  setSelectedScanIds: (ids: string[]) => void;
  toggleScanSelection: (id: string) => void;
  clearSelection: () => void;
  setComparisonResult: (result: ComparisonResult | null) => void;
  setIsComparing: (isComparing: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  loadHistory: () => Promise<void>;
  deleteScan: (id: string) => Promise<void>;
  deleteSelectedScans: () => Promise<void>;
  compareSelectedScans: () => Promise<void>;
  updateScanNotes: (id: string, notes: string) => Promise<void>;
  updateScanTags: (id: string, tags: string[]) => Promise<void>;
}

export const useScanHistoryStore = create<ScanHistoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      history: [],
      selectedScanIds: [],
      filter: null,
      isLoading: false,
      error: null,
      comparisonResult: null,
      isComparing: false,

      // Setters
      setHistory: (history) => set({ history }),
      
      addScan: (scan) =>
        set((state) => ({
          history: [scan, ...state.history],
        })),

      removeScan: (id) =>
        set((state) => ({
          history: state.history.filter((scan) => scan.id !== id),
          selectedScanIds: state.selectedScanIds.filter((sid) => sid !== id),
        })),

      removeScans: (ids) =>
        set((state) => ({
          history: state.history.filter((scan) => !ids.includes(scan.id)),
          selectedScanIds: state.selectedScanIds.filter((sid) => !ids.includes(sid)),
        })),

      clearHistory: () =>
        set({
          history: [],
          selectedScanIds: [],
        }),

      setFilter: (filter) => set({ filter }),

      setSelectedScanIds: (ids) => set({ selectedScanIds: ids }),

      toggleScanSelection: (id) =>
        set((state) => {
          const isSelected = state.selectedScanIds.includes(id);
          return {
            selectedScanIds: isSelected
              ? state.selectedScanIds.filter((sid) => sid !== id)
              : [...state.selectedScanIds, id],
          };
        }),

      clearSelection: () => set({ selectedScanIds: [] }),

      setComparisonResult: (result) => set({ comparisonResult: result }),

      setIsComparing: (isComparing) => set({ isComparing }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      // Async actions
      loadHistory: async () => {
        set({ isLoading: true, error: null });
        try {
          const filter = get().filter;
          const history = await window.api.reports.getHistory(filter);
          set({ history, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load history',
            isLoading: false,
          });
        }
      },

      deleteScan: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const success = await window.api.reports.deleteScan(id);
          if (success) {
            get().removeScan(id);
          }
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete scan',
            isLoading: false,
          });
        }
      },

      deleteSelectedScans: async () => {
        const ids = get().selectedScanIds;
        if (ids.length === 0) return;

        set({ isLoading: true, error: null });
        try {
          const result = await window.api.reports.deleteScans(ids);
          get().removeScans(ids);
          set({ isLoading: false, selectedScanIds: [] });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete scans',
            isLoading: false,
          });
        }
      },

      compareSelectedScans: async () => {
        const ids = get().selectedScanIds;
        if (ids.length !== 2) {
          set({ error: 'Please select exactly 2 scans to compare' });
          return;
        }

        set({ isComparing: true, error: null });
        try {
          const result = await window.api.reports.compareScans(ids[0], ids[1]);
          set({ comparisonResult: result, isComparing: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to compare scans',
            isComparing: false,
          });
        }
      },

      updateScanNotes: async (id, notes) => {
        try {
          await window.api.reports.updateScan(id, { notes });
          set((state) => ({
            history: state.history.map((scan) =>
              scan.id === id ? { ...scan, notes } : scan
            ),
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update notes',
          });
        }
      },

      updateScanTags: async (id, tags) => {
        try {
          await window.api.reports.updateScan(id, { tags });
          set((state) => ({
            history: state.history.map((scan) =>
              scan.id === id ? { ...scan, tags } : scan
            ),
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update tags',
          });
        }
      },
    }),
    {
      name: 'scan-history-storage',
      partialize: (state) => ({
        filter: state.filter,
        selectedScanIds: state.selectedScanIds,
      }),
    }
  )
);

// Helper selectors
export const useFilteredHistory = () => {
  const store = useScanHistoryStore();
  return store.history;
};

export const useSelectedScans = () => {
  const { history, selectedScanIds } = useScanHistoryStore();
  return history.filter((scan) => selectedScanIds.includes(scan.id));
};

export const useCanCompare = () => {
  const selectedScanIds = useScanHistoryStore((state) => state.selectedScanIds);
  return selectedScanIds.length === 2;
};

export const useHistoryStats = () => {
  const history = useScanHistoryStore((state) => state.history);

  const totalScans = history.length;
  const totalThreats = history.reduce((sum, scan) => sum + scan.summary.totalThreats, 0);
  const totalFilesScanned = history.reduce(
    (sum, scan) => sum + scan.summary.totalFiles,
    0
  );

  const mostDangerous =
    history.length > 0
      ? history.reduce((most, scan) =>
          scan.summary.totalThreats > most.summary.totalThreats ? scan : most
        )
      : null;

  return {
    totalScans,
    totalThreats,
    totalFilesScanned,
    mostDangerous,
    averageThreatsPerScan: totalScans > 0 ? totalThreats / totalScans : 0,
  };
};
