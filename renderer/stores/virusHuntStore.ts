/**
 * VirusHunt Zustand Store
 * 
 * Global state management for VirusHunt module
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ScanMode,
  VirusHuntSettings,
  ScanState,
  ScanStatistics,
  FileResult,
  VirusHuntError
} from '../types/virushunt';
import {
  ScanResultRow,
  ScanResultFilters,
  SortConfig,
  ExportFormat
} from '../types/scan-results';
import { ScanResult, FileScanResult, FileCategory } from '../../shared/virushunt-types';

interface VirusHuntStore {
  // Settings
  settings: VirusHuntSettings;
  updateSettings: (settings: Partial<VirusHuntSettings>) => void;
  resetSettings: () => void;

  // Scan mode
  selectedMode: ScanMode;
  setMode: (mode: ScanMode) => void;

  // Scan state
  scanState: ScanState;
  setScanState: (state: Partial<ScanState>) => void;
  resetScanState: () => void;

  // Statistics
  statistics: ScanStatistics;
  updateStatistics: (stats: Partial<ScanStatistics>) => void;
  resetStatistics: () => void;

  // Results
  results: FileResult[];
  addResult: (result: FileResult) => void;
  clearResults: () => void;
  
  // Scan Results Table
  scanResultRows: ScanResultRow[];
  setScanResultRows: (rows: ScanResultRow[]) => void;
  addScanResultRow: (row: ScanResultRow) => void;
  updateScanResultRow: (id: string, updates: Partial<ScanResultRow>) => void;
  deleteScanResultRows: (ids: string[]) => Promise<void>;
  
  // Filters and Sorting
  resultFilters: ScanResultFilters;
  updateResultFilters: (filters: Partial<ScanResultFilters>) => void;
  resetResultFilters: () => void;
  
  resultSort: SortConfig;
  updateResultSort: (sort: SortConfig) => void;
  
  // Selection
  selectedRowIds: Set<string>;
  toggleRowSelection: (id: string) => void;
  selectAllRows: (ids: string[]) => void;
  clearSelection: () => void;
  
  // Export
  exportResults: (format: ExportFormat['format'], rowIds?: string[]) => Promise<void>;

  // Errors
  errors: VirusHuntError[];
  addError: (error: VirusHuntError) => void;
  clearErrors: () => void;

  // History
  scanHistory: Array<{
    id: string;
    date: Date;
    mode: ScanMode;
    statistics: ScanStatistics;
  }>;
  addToHistory: (item: {
    id: string;
    mode: ScanMode;
    statistics: ScanStatistics;
  }) => void;
  clearHistory: () => void;
}

const defaultSettings: VirusHuntSettings = {
  deepScan: false,
  sensitivity: 50,
  autoCheck: false,
};

const defaultResultFilters: ScanResultFilters = {
  search: '',
  categories: [],
  riskScoreMin: 0,
  riskScoreMax: 100,
  showWhitelisted: true,
  showBlacklisted: true,
};

const defaultResultSort: SortConfig = {
  column: 'riskScore',
  direction: 'desc',
};

const defaultScanState: ScanState = {
  isScanning: false,
  scanId: null,
  progress: 0,
  currentFile: '',
  filesScanned: 0,
  filesTotal: 0,
  results: [],
  errors: [],
};

const defaultStatistics: ScanStatistics = {
  totalFiles: 0,
  safeFiles: 0,
  threatsFound: 0,
  cracksFound: 0,
  keygensFound: 0,
  suspiciousFiles: 0,
  dangerousFiles: 0,
  unknownFiles: 0,
  scannedSize: 0,
  scanTime: 0,
};

export const useVirusHuntStore = create<VirusHuntStore>()(
  persist(
    (set) => ({
      // Settings
      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      resetSettings: () => set({ settings: defaultSettings }),

      // Scan mode
      selectedMode: 'downloads',
      setMode: (mode) => set({ selectedMode: mode }),

      // Scan state
      scanState: defaultScanState,
      setScanState: (newState) =>
        set((state) => ({
          scanState: { ...state.scanState, ...newState },
        })),
      resetScanState: () => set({ scanState: defaultScanState }),

      // Statistics
      statistics: defaultStatistics,
      updateStatistics: (stats) =>
        set((state) => ({
          statistics: { ...state.statistics, ...stats },
        })),
      resetStatistics: () => set({ statistics: defaultStatistics }),

      // Results
      results: [],
      addResult: (result) =>
        set((state) => ({
          results: [...state.results, result],
        })),
      clearResults: () => set({ results: [] }),

      // Errors
      errors: [],
      addError: (error) =>
        set((state) => ({
          errors: [...state.errors, error],
        })),
      clearErrors: () => set({ errors: [] }),
      
      // History
      scanHistory: [],
      addToHistory: (item) =>
        set((state) => ({
          scanHistory: [...state.scanHistory, { ...item, date: new Date() }],
        })),
      clearHistory: () => set({ scanHistory: [] }),
      
      // Scan Results Table
      scanResultRows: [],
      setScanResultRows: (rows) => set({ scanResultRows: rows }),
      addScanResultRow: (row) =>
        set((state) => ({
          scanResultRows: [...state.scanResultRows, row],
        })),
      updateScanResultRow: (id, updates) =>
        set((state) => ({
          scanResultRows: state.scanResultRows.map((row) =>
            row.id === id ? { ...row, ...updates } : row
          ),
        })),
      deleteScanResultRows: async (ids) => {
        // Call IPC to delete files
        for (const id of ids) {
          const row = useVirusHuntStore.getState().scanResultRows.find(r => r.id === id);
          if (row) {
            try {
              await window.api.invoke('fs:deleteFile', row.filePath);
            } catch (error) {
              console.error(`Failed to delete file ${row.filePath}:`, error);
            }
          }
        }
        
        set((state) => ({
          scanResultRows: state.scanResultRows.filter((row) => !ids.includes(row.id)),
        }));
      },
      
      // Filters and Sorting
      resultFilters: defaultResultFilters,
      updateResultFilters: (filters) =>
        set((state) => ({
          resultFilters: { ...state.resultFilters, ...filters },
        })),
      resetResultFilters: () => set({ resultFilters: defaultResultFilters }),
      
      resultSort: defaultResultSort,
      updateResultSort: (sort) => set({ resultSort: sort }),
      
      // Selection
      selectedRowIds: new Set(),
      toggleRowSelection: (id) =>
        set((state) => {
          const newSet = new Set(state.selectedRowIds);
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
          }
          return { selectedRowIds: newSet };
        }),
      selectAllRows: (ids) =>
        set({ selectedRowIds: new Set(ids) }),
      clearSelection: () => set({ selectedRowIds: new Set() }),
      
      // Export
      exportResults: async (format, rowIds) => {
        const state = useVirusHuntStore.getState();
        const rowsToExport = rowIds 
          ? state.scanResultRows.filter((row) => rowIds.includes(row.id))
          : state.scanResultRows;
        
        const exportData = rowsToExport.map((row) => ({
          fileName: row.fileName,
          path: row.filePath,
          category: row.category,
          riskScore: row.riskScore,
          size: row.size,
          threats: row.threats,
          scanDate: row.scanDate,
        }));
        
        try {
          const result = await window.api.dialog.showSaveDialog({
            title: 'Export Scan Results',
            defaultPath: `scan-results-${Date.now()}.${format}`,
            filters: [
              { name: format.toUpperCase(), extensions: [format] },
              { name: 'All Files', extensions: ['*'] },
            ],
          });
          
          if (!result.canceled && result.filePath) {
            let content = '';
            
            switch (format) {
              case 'json':
                content = JSON.stringify(exportData, null, 2);
                break;
                
              case 'csv':
                const headers = Object.keys(exportData[0] || {}).join(',');
                const rows = exportData.map((row) => 
                  Object.values(row).map(v => 
                    typeof v === 'string' && v.includes(',') ? `"${v}"` : v
                  ).join(',')
                );
                content = [headers, ...rows].join('\n');
                break;
                
              case 'txt':
                content = exportData.map((row) => 
                  `File: ${row.fileName}\nPath: ${row.path}\nCategory: ${row.category}\nRisk: ${row.riskScore}\n---\n`
                ).join('\n');
                break;
                
              case 'html':
                content = `<!DOCTYPE html>
<html>
<head>
  <title>Scan Results</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
  </style>
</head>
<body>
  <h1>VirusHunt Scan Results</h1>
  <table>
    <tr>
      <th>File Name</th>
      <th>Path</th>
      <th>Category</th>
      <th>Risk Score</th>
      <th>Size</th>
    </tr>
    ${exportData.map((row) => `
    <tr>
      <td>${row.fileName}</td>
      <td>${row.path}</td>
      <td>${row.category}</td>
      <td>${row.riskScore}</td>
      <td>${row.size}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>`;
                break;
            }
            
            await window.api.invoke('fs:writeFile', result.filePath, content);
          }
        } catch (error) {
          console.error('Failed to export results:', error);
          throw error;
        }
      },
    }),
    {
      name: 'virushunt-storage',
      partialize: (state: VirusHuntStore) => ({
        settings: state.settings,
        scanHistory: state.scanHistory,
      }),
    }
  )
);

// Helper function to categorize scan results
export function categorizeScanResults(results: FileScanResult[]): ScanStatistics {
  const stats: ScanStatistics = {
    totalFiles: results.length,
    safeFiles: 0,
    threatsFound: 0,
    cracksFound: 0,
    keygensFound: 0,
    suspiciousFiles: 0,
    dangerousFiles: 0,
    unknownFiles: 0,
    scannedSize: 0,
    scanTime: 0,
  };

  results.forEach((result) => {
    stats.scannedSize += result.size || 0;

    const category = (result as any).category || 'unknown';

    switch (category) {
      case 'safe':
        stats.safeFiles++;
        break;
      case 'crack':
        stats.cracksFound++;
        break;
      case 'keygen':
        stats.keygensFound++;
        break;
      case 'suspicious':
        stats.suspiciousFiles++;
        stats.threatsFound++;
        break;
      case 'dangerous':
        stats.dangerousFiles++;
        stats.threatsFound++;
        break;
      default:
        stats.unknownFiles++;
    }
  });

  return stats;
}

// Helper to get threat color
export function getThreatColor(category: FileCategory): string {
  switch (category) {
    case 'safe':
      return '#4ade80'; // green
    case 'crack':
      return '#fbbf24'; // amber
    case 'keygen':
      return '#fb923c'; // orange
    case 'suspicious':
      return '#f97316'; // orange-red
    case 'dangerous':
      return '#ef4444'; // red
    default:
      return '#9ca3af'; // gray
  }
}

// Helper to get threat icon
export function getThreatIcon(category: FileCategory): string {
  switch (category) {
    case 'safe':
      return '✓';
    case 'crack':
      return '🔓';
    case 'keygen':
      return '🔑';
    case 'suspicious':
      return '⚠️';
    case 'dangerous':
      return '⛔';
    default:
      return '❓';
  }
}

// Helper to convert FileScanResult to ScanResultRow
export function scanResultToRow(result: FileScanResult): ScanResultRow {
  const fileName = result.filePath.split(/[/\\]/).pop() || 'Unknown';
  const lastSlash = Math.max(result.filePath.lastIndexOf('/'), result.filePath.lastIndexOf('\\'));
  const directory = lastSlash >= 0 ? result.filePath.substring(0, lastSlash) : '';
  
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };
  
  const getRiskLevel = (score: number): 'low' | 'medium' | 'high' | 'critical' => {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  };
  
  const getCategoryLabel = (cat: FileCategory): string => {
    const labels: Record<FileCategory, string> = {
      safe: 'Безопасно',
      crack: 'Крак',
      keygen: 'Кейген',
      suspicious: 'Подозрительно',
      dangerous: 'Опасно',
      unknown: 'Неизвестно',
    };
    return labels[cat] || 'Неизвестно';
  };
  
  return {
    ...result,
    id: `${result.hash}-${Date.now()}`,
    fileName,
    directory,
    formattedSize: formatSize(result.size || 0),
    categoryLabel: getCategoryLabel((result as any).category || FileCategory.UNKNOWN),
    riskLevel: getRiskLevel((result as any).riskScore || 0),
    selected: false,
  };
}

// Helper to filter and sort results
export function filterAndSortResults(
  rows: ScanResultRow[],
  filters: ScanResultFilters,
  sort: SortConfig
): ScanResultRow[] {
  let filtered = [...rows];
  
  // Apply search filter
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter((row) =>
      row.fileName.toLowerCase().includes(searchLower) ||
      row.filePath.toLowerCase().includes(searchLower)
    );
  }
  
  // Apply category filter
  if (filters.categories.length > 0) {
    filtered = filtered.filter((row) =>
      filters.categories.includes((row.category || FileCategory.UNKNOWN) as any)
    );
  }
  
  // Apply risk score filter
  filtered = filtered.filter((row) => {
    const score = row.riskScore || 0;
    return score >= filters.riskScoreMin && score <= filters.riskScoreMax;
  });
  
  // Apply whitelist/blacklist filter
  if (!filters.showWhitelisted) {
    filtered = filtered.filter((row) => !row.isWhitelisted);
  }
  if (!filters.showBlacklisted) {
    filtered = filtered.filter((row) => !row.isBlacklisted);
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    const aVal = a[sort.column];
    const bVal = b[sort.column];
    
    if (aVal === undefined || bVal === undefined) return 0;
    
    let comparison = 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    }
    
    return sort.direction === 'asc' ? comparison : -comparison;
  });
  
  return filtered;
}
