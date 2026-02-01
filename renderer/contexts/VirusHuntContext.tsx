/**
 * VirusHunt Context
 * 
 * Global state for VirusHunt security features:
 * - Unscanned files counter for sidebar badge
 * - Torrent security status map
 * - Threat notifications
 * - Auto-scan settings
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Download } from '../../shared/types';

export interface TorrentSecurityStatus {
  infoHash: string;
  status: 'scanning' | 'safe' | 'suspicious' | 'dangerous' | 'error' | 'unscanned';
  threatCount: number;
  lastScanned?: Date;
  scanResults?: any[];
}

interface VirusHuntContextValue {
  // Security status map
  securityStatuses: Map<string, TorrentSecurityStatus>;
  setSecurityStatus: (infoHash: string, status: TorrentSecurityStatus) => void;
  getSecurityStatus: (infoHash: string) => TorrentSecurityStatus | undefined;
  
  // Unscanned counter
  unscannedCount: number;
  incrementUnscanned: () => void;
  decrementUnscanned: () => void;
  setUnscannedCount: (count: number) => void;
  
  // Threat detection
  hasActiveThreats: boolean;
  setHasActiveThreats: (value: boolean) => void;
  
  // Auto-scan
  autoScanEnabled: boolean;
  setAutoScanEnabled: (enabled: boolean) => void;
  
  // Notifications
  notifyThreat: (torrentName: string, threatCount: number) => void;
  notifyScanComplete: (torrentName: string, status: 'safe' | 'suspicious' | 'dangerous') => void;
  
  // Scan management
  startAutoScan: (download: Download) => Promise<void>;
}

const VirusHuntContext = createContext<VirusHuntContextValue | undefined>(undefined);

interface VirusHuntProviderProps {
  children: ReactNode;
}

export const VirusHuntProvider: React.FC<VirusHuntProviderProps> = ({ children }) => {
  const [securityStatuses, setSecurityStatuses] = useState<Map<string, TorrentSecurityStatus>>(new Map());
  const [unscannedCount, setUnscannedCount] = useState(0);
  const [hasActiveThreats, setHasActiveThreats] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);

  // Load auto-scan setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('virusHunt.autoScan');
    if (saved !== null) {
      setAutoScanEnabled(JSON.parse(saved));
    }
  }, []);

  // Save auto-scan setting
  useEffect(() => {
    localStorage.setItem('virusHunt.autoScan', JSON.stringify(autoScanEnabled));
  }, [autoScanEnabled]);

  // Load security statuses from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('virusHunt.securityStatuses');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const map = new Map<string, TorrentSecurityStatus>();
        Object.entries(parsed).forEach(([key, value]) => {
          map.set(key, value as TorrentSecurityStatus);
        });
        setSecurityStatuses(map);
      } catch (error) {
        console.error('Failed to load security statuses:', error);
      }
    }
  }, []);

  // Save security statuses to localStorage
  useEffect(() => {
    const obj: Record<string, TorrentSecurityStatus> = {};
    securityStatuses.forEach((value, key) => {
      obj[key] = value;
    });
    localStorage.setItem('virusHunt.securityStatuses', JSON.stringify(obj));

    // Update unscanned count
    const unscanned = Array.from(securityStatuses.values()).filter(
      s => s.status === 'unscanned'
    ).length;
    setUnscannedCount(unscanned);

    // Update active threats flag
    const threats = Array.from(securityStatuses.values()).some(
      s => s.status === 'dangerous' || s.status === 'suspicious'
    );
    setHasActiveThreats(threats);
  }, [securityStatuses]);

  const setSecurityStatus = useCallback((infoHash: string, status: TorrentSecurityStatus) => {
    setSecurityStatuses(prev => {
      const next = new Map(prev);
      next.set(infoHash, status);
      return next;
    });
  }, []);

  const getSecurityStatus = useCallback((infoHash: string): TorrentSecurityStatus | undefined => {
    return securityStatuses.get(infoHash);
  }, [securityStatuses]);

  const incrementUnscanned = useCallback(() => {
    setUnscannedCount(prev => prev + 1);
  }, []);

  const decrementUnscanned = useCallback(() => {
    setUnscannedCount(prev => Math.max(0, prev - 1));
  }, []);

  const notifyThreat = useCallback((torrentName: string, threatCount: number) => {
    const message = threatCount === 1
      ? `⚠️ 1 threat detected in "${torrentName}"`
      : `⚠️ ${threatCount} threats detected in "${torrentName}"`;

    toast.error(message, {
      duration: 8000,
      icon: '🛡️',
      position: 'top-right',
      style: {
        background: '#ef4444',
        color: '#fff',
        fontWeight: 600,
      },
    });

    // Desktop notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('VirusHunt - Threat Detected', {
        body: message,
        icon: 'shield',
        tag: `threat-${torrentName}`,
      });
    }
  }, []);

  const notifyScanComplete = useCallback((torrentName: string, status: 'safe' | 'suspicious' | 'dangerous') => {
    if (status === 'safe') {
      toast.success(`✓ "${torrentName}" is safe`, {
        duration: 4000,
        icon: '🛡️',
        position: 'top-right',
      });
    } else if (status === 'suspicious') {
      toast(`⚠️ "${torrentName}" is suspicious`, {
        duration: 6000,
        icon: '🛡️',
        position: 'top-right',
        style: {
          background: '#f59e0b',
          color: '#fff',
        },
      });
    } else {
      toast.error(`❌ "${torrentName}" is dangerous`, {
        duration: 8000,
        icon: '🛡️',
        position: 'top-right',
      });
    }
  }, []);

  const startAutoScan = useCallback(async (download: Download) => {
    if (!autoScanEnabled) return;

    const infoHash = download.id; // Using download ID as infoHash placeholder
    
    // Mark as scanning
    setSecurityStatus(infoHash, {
      infoHash,
      status: 'scanning',
      threatCount: 0,
    });

    try {
      // Subscribe to scan events
      const unsubscribeComplete = window.api.virusHunt.onScanComplete((data) => {
        const { result } = data;
        
        // Count threats from file results
        const threatCount = result.fileResults.filter(
          (f: any) => f.threats && f.threats.length > 0
        ).length;
        
        let status: TorrentSecurityStatus['status'] = 'safe';
        
        if (threatCount > 0) {
          const hasDangerous = result.fileResults.some((f: any) => 
            f.threatLevel === 'DANGEROUS' || f.threatLevel === 'CRITICAL'
          );
          status = hasDangerous ? 'dangerous' : 'suspicious';
        }

        const newStatus: TorrentSecurityStatus = {
          infoHash,
          status,
          threatCount,
          lastScanned: new Date(),
          scanResults: result.fileResults.filter((f: any) => f.threats?.length > 0),
        };

        setSecurityStatus(infoHash, newStatus);

        // Notify user
        if (threatCount > 0) {
          notifyThreat(download.name, threatCount);
        } else {
          notifyScanComplete(download.name, status);
        }

        unsubscribeComplete();
      });

      const unsubscribeError = window.api.virusHunt.onScanError((data) => {
        console.error('Auto-scan failed:', data.error);
        setSecurityStatus(infoHash, {
          infoHash,
          status: 'error',
          threatCount: 0,
        });
        unsubscribeError();
      });

      // Start scan via IPC (returns scanId immediately)
      await window.api.virusHunt.startScan({
        paths: [download.savePath],
        enableHeuristics: true,
        timeout: 30000,
      });
    } catch (error) {
      console.error('Failed to start auto-scan:', error);
      setSecurityStatus(infoHash, {
        infoHash,
        status: 'error',
        threatCount: 0,
      });
    }
  }, [autoScanEnabled, setSecurityStatus, notifyThreat, notifyScanComplete]);

  const value: VirusHuntContextValue = {
    securityStatuses,
    setSecurityStatus,
    getSecurityStatus,
    unscannedCount,
    incrementUnscanned,
    decrementUnscanned,
    setUnscannedCount,
    hasActiveThreats,
    setHasActiveThreats,
    autoScanEnabled,
    setAutoScanEnabled,
    notifyThreat,
    notifyScanComplete,
    startAutoScan,
  };

  return (
    <VirusHuntContext.Provider value={value}>
      {children}
    </VirusHuntContext.Provider>
  );
};

export const useVirusHunt = (): VirusHuntContextValue => {
  const context = useContext(VirusHuntContext);
  if (!context) {
    throw new Error('useVirusHunt must be used within VirusHuntProvider');
  }
  return context;
};
