/**
 * Torrent Creator
 * 
 * Module for creating .torrent files from local files and folders.
 * Uses WebTorrent's seed functionality which handles torrent creation internally.
 */

import WebTorrent from 'webtorrent';
import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';
import {
  CreateTorrentRequest,
  CreateTorrentResult,
  CreateTorrentProgress,
} from '../../shared/types';
import { logger } from '../utils';

const log = logger.child('TorrentCreator');

// Default public trackers
export const DEFAULT_TRACKERS: string[][] = [
  ['udp://tracker.opentrackr.org:1337/announce'],
  ['udp://open.tracker.cl:1337/announce'],
  ['udp://tracker.openbittorrent.com:6969/announce'],
  ['udp://open.stealth.si:80/announce'],
  ['udp://tracker.torrent.eu.org:451/announce'],
  ['udp://exodus.desync.com:6969/announce'],
  ['udp://tracker.moeking.me:6969/announce'],
  ['udp://explodie.org:6969/announce'],
  ['udp://tracker.theoks.net:6969/announce'],
  ['udp://tracker1.bt.moack.co.kr:80/announce'],
];

// Piece size thresholds (total size -> piece size)
const PIECE_SIZE_THRESHOLDS: [number, number][] = [
  [512 * 1024 * 1024 * 1024, 16 * 1024 * 1024],   // > 512GB -> 16MB
  [64 * 1024 * 1024 * 1024, 4 * 1024 * 1024],     // > 64GB  -> 4MB
  [16 * 1024 * 1024 * 1024, 2 * 1024 * 1024],     // > 16GB  -> 2MB
  [4 * 1024 * 1024 * 1024, 1 * 1024 * 1024],      // > 4GB   -> 1MB
  [1 * 1024 * 1024 * 1024, 512 * 1024],           // > 1GB   -> 512KB
  [512 * 1024 * 1024, 256 * 1024],                // > 512MB -> 256KB
  [256 * 1024 * 1024, 128 * 1024],                // > 256MB -> 128KB
  [128 * 1024 * 1024, 64 * 1024],                 // > 128MB -> 64KB
  [64 * 1024 * 1024, 32 * 1024],                  // > 64MB  -> 32KB
  [0, 16 * 1024],                                  // default -> 16KB
];

/**
 * Calculate optimal piece size based on total content size
 */
function calculatePieceLength(totalSize: number): number {
  for (const [threshold, pieceSize] of PIECE_SIZE_THRESHOLDS) {
    if (totalSize > threshold) {
      return pieceSize;
    }
  }
  return 16 * 1024; // 16KB minimum
}

/**
 * Get total size of files/folders
 */
function getTotalSize(paths: string[]): number {
  let total = 0;
  
  for (const p of paths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      total += getDirSize(p);
    } else {
      total += stat.size;
    }
  }
  
  return total;
}

/**
 * Recursively get directory size
 */
function getDirSize(dirPath: string): number {
  let size = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }

  return size;
}

/**
 * Recursively collect absolute file paths under `p`, skipping any path in
 * `exclude` (matched by resolved absolute path). Used to honor per-file
 * exclusions from the Create Torrent file tree.
 */
function collectFiles(p: string, exclude: Set<string>, out: string[]): void {
  const resolved = path.resolve(p);
  if (exclude.has(resolved)) return;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      collectFiles(path.join(p, entry.name), exclude, out);
    }
  } else if (stat.isFile()) {
    out.push(p);
  }
}

/** Size of a single file, 0 on error. */
function safeSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/**
 * Send progress update to renderer
 */
function sendProgress(
  mainWindow: BrowserWindow | null,
  progress: CreateTorrentProgress
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('torrent:createProgress', progress);
  }
}

/**
 * Create a torrent file from source files/folders using WebTorrent
 */
export async function createTorrentFile(
  request: CreateTorrentRequest,
  mainWindow: BrowserWindow | null = null
): Promise<CreateTorrentResult> {
  const { sourcePaths, outputPath, options } = request;
  const excludeSet = new Set((request.excludePaths || []).map(p => path.resolve(p)));

  log.info('Creating torrent', {
    sourcePaths,
    outputPath,
    excluded: excludeSet.size,
    options: { ...options, announceList: `${options.announceList.length} trackers` },
  });

  // Validate source paths
  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }
  }

  // Stage 1: scanning — resolve what actually goes into the torrent.
  sendProgress(mainWindow, { stage: 'hashing', progress: 0.05, message: 'Scanning files...' });

  // Build the concrete file list, honoring exclusions. When nothing is excluded
  // and a single folder is selected we pass the folder path directly (preserves
  // the folder name as the torrent root). Otherwise we expand to a flat file
  // list minus excluded paths.
  const primaryPath = sourcePaths[0];
  let input: string | string[];
  let usingFolderRoot = false;

  if (excludeSet.size === 0 && sourcePaths.length === 1) {
    input = sourcePaths[0];
    usingFolderRoot = fs.statSync(sourcePaths[0]).isDirectory();
  } else {
    const files: string[] = [];
    for (const sp of sourcePaths) {
      collectFiles(sp, excludeSet, files);
    }
    if (files.length === 0) {
      throw new Error('No files to include — everything was excluded.');
    }
    input = files;
  }

  // Calculate total size (of included files) and optimal piece length
  const totalSize = Array.isArray(input)
    ? input.reduce((sum, f) => sum + safeSize(f), 0)
    : getTotalSize([input]);
  const pieceLength = options.pieceLength || calculatePieceLength(totalSize);

  log.debug('Calculated sizes', {
    totalSize,
    pieceLength,
    pieceCount: Math.ceil(totalSize / pieceLength),
    fileCount: Array.isArray(input) ? input.length : undefined,
    usingFolderRoot,
  });

  // Stage 2: hashing begins
  sendProgress(mainWindow, {
    stage: 'hashing',
    progress: 0.15,
    message: 'Hashing files...',
  });

  // Flatten announce list for WebTorrent
  const announceList = options.announceList.length > 0 
    ? options.announceList 
    : DEFAULT_TRACKERS;
  const announce = announceList.flat();

  return new Promise((resolve, reject) => {
    // Create a temporary WebTorrent client for seeding
    const client = new WebTorrent({ utp: false } as any);

    // create-torrent (used by WebTorrent.seed) doesn't expose hashing progress,
    // so we estimate it from total size at a conservative hash rate. This is an
    // ETA-based estimate, not a fake fixed ramp — it tracks real elapsed time
    // and is capped below 100% until hashing actually completes.
    const HASH_BYTES_PER_SEC = 80 * 1024 * 1024; // ~80 MB/s, conservative
    const estMs = Math.max(800, (totalSize / HASH_BYTES_PER_SEC) * 1000);
    const startedAt = Date.now();
    const HASH_FLOOR = 0.15;   // where hashing stage starts
    const HASH_CEIL = 0.9;     // never claim done until the callback fires
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const frac = Math.min(1, elapsed / estMs);
      const progress = HASH_FLOOR + (HASH_CEIL - HASH_FLOOR) * frac;
      sendProgress(mainWindow, {
        stage: 'hashing',
        progress,
        message: 'Hashing files...',
      });
    }, 250);

    // Seed options
    const seedOpts = {
      name: options.name || (usingFolderRoot ? path.basename(primaryPath) : undefined),
      comment: options.comment,
      createdBy: options.createdBy || 'TorrentHunt',
      announce,
      urlList: options.urlList,
      private: options.private || false,
      pieceLength,
      // Don't actually announce - we just want to create the torrent
      announceList,
    };

    client.seed(input, seedOpts, (torrent) => {
      clearInterval(progressInterval);

      try {
        // Send writing progress
        sendProgress(mainWindow, {
          stage: 'writing',
          progress: 0.9,
          message: 'Writing torrent file...',
        });

        // Get torrent file buffer
        const torrentBuffer = torrent.torrentFile;
        
        if (!torrentBuffer) {
          throw new Error('Failed to create torrent: No torrent file generated');
        }

        // Write torrent file
        fs.writeFileSync(outputPath, torrentBuffer);

        const infoHash = torrent.infoHash;
        const magnetUri = torrent.magnetURI;
        const pieceCount = torrent.pieces.length;
        const actualPieceLength = torrent.pieceLength;

        log.info('Torrent created successfully', {
          outputPath,
          infoHash,
          totalSize: torrent.length,
          pieceCount,
        });

        // Send complete progress
        sendProgress(mainWindow, {
          stage: 'complete',
          progress: 1,
          message: 'Torrent created successfully!',
        });

        // Destroy the temporary client (we don't want to seed from here)
        // The main TorrentManager will handle seeding if requested
        client.destroy();

        resolve({
          torrentFilePath: outputPath,
          infoHash,
          magnetUri,
          totalSize: torrent.length,
          pieceCount,
          pieceLength: actualPieceLength,
        });
      } catch (parseError) {
        clearInterval(progressInterval);
        client.destroy();
        log.error('Failed to write torrent', { error: parseError });
        reject(parseError);
      }
    });

    // Handle errors
    client.on('error', (err: string | Error) => {
      clearInterval(progressInterval);
      client.destroy();
      const errorMessage = typeof err === 'string' ? err : err.message;
      log.error('Failed to create torrent', { error: errorMessage });
      reject(new Error(`Failed to create torrent: ${errorMessage}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(progressInterval);
      client.destroy();
      reject(new Error('Torrent creation timed out'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Get default tracker list
 */
export function getDefaultTrackers(): string[][] {
  return DEFAULT_TRACKERS;
}
