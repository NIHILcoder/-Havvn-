/**
 * Phase-5 cross-link modals.
 *
 * ShareToRoomModal — "Share to room" on a transfer: pick one of your rooms and
 * the download's files are seeded into it (rooms:shareDownload).
 * TransferPickerModal — "Bring a file from Transfers" inside a room: pick a
 * finished download, same backend path.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { Download, RoomSummary, RoomState } from '../../shared/types';
import { Button } from './Button';
import { Icon } from './Icon';
import { formatBytes, cleanError } from '../utils/format-helpers';
import { useTranslation } from '../utils/i18nContext';
import './RoomShareModals.css';

/** Room initials tile, mirroring the sidebar rail's room chip. */
const RoomTile: React.FC<{ name: string }> = ({ name }) => (
  <span className="rsm-tile rsm-tile-room" aria-hidden="true">
    {name.trim().slice(0, 2).toUpperCase() || '?'}
  </span>
);

const useEscape = (onClose: () => void): void => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
};

/** Move focus into the dialog on open; hand it back where it was on close. */
const useModalFocus = (): React.RefObject<HTMLDivElement> => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  return ref;
};

// ── Share a download into a room ─────────────────────────────────────────────
interface ShareToRoomModalProps {
  downloadId: string;
  downloadName: string;
  /** Complete downloads only — incomplete ones show a hint + link fallback. */
  canShare: boolean;
  onClose: () => void;
  /** "Share as link instead" (opens the existing ShareLinkModal). */
  onShareLink?: () => void;
}

export const ShareToRoomModal: React.FC<ShareToRoomModalProps> = ({
  downloadId,
  downloadName,
  canShare,
  onClose,
  onShareLink,
}) => {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  useEscape(useCallback(() => { if (!busyRoomId) onClose(); }, [busyRoomId, onClose]));
  const dialogRef = useModalFocus();

  useEffect(() => {
    window.api.rooms.list().then(setRooms).catch(() => setRooms([]));
  }, []);

  const share = async (room: RoomSummary) => {
    if (busyRoomId || !canShare) return;
    setBusyRoomId(room.roomId);
    try {
      await window.api.rooms.shareDownload(room.roomId, downloadId);
      toast.success(`${t('share.toRoom.success')} ${room.name}`);
      onClose();
    } catch (e) {
      toast.error(cleanError(e));
      setBusyRoomId(null);
    }
  };

  return (
    <div className="rsm-backdrop" onClick={() => !busyRoomId && onClose()}>
      <div
        ref={dialogRef}
        className="rsm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('share.toRoom.title')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rsm-head">
          <h3><Icon name="share-2" size={15} /> {t('share.toRoom.title')}</h3>
          <button
            className="rsm-close"
            disabled={!!busyRoomId}
            onClick={() => !busyRoomId && onClose()}
            aria-label={t('common.cancel')}
          ><Icon name="x" size={16} /></button>
        </div>
        <div className="rsm-file" title={downloadName}>{downloadName}</div>

        {!canShare && (
          <div className="rsm-note warn">
            <Icon name="clock" size={14} />
            <span>{t('share.toRoom.incomplete')}</span>
          </div>
        )}

        {rooms === null ? (
          <div className="rsm-empty">{t('common.loading')}</div>
        ) : rooms.length === 0 ? (
          <div className="rsm-empty">{t('share.toRoom.empty')}</div>
        ) : (
          <>
            <p className="rsm-desc">{t('share.toRoom.pick')}</p>
            <div className="rsm-list">
              {rooms.map((room) => (
                <button
                  key={room.roomId}
                  className="rsm-item"
                  disabled={!canShare || !!busyRoomId}
                  onClick={() => share(room)}
                >
                  <RoomTile name={room.name} />
                  <span className="rsm-text">
                    <span className="rsm-name">{room.name}</span>
                    <span className="rsm-meta">
                      <Icon name="users" size={11} /> {room.memberCount}
                      <span className="rsm-dot">·</span>
                      <Icon name="folder" size={11} /> {room.fileCount}
                      {room.e2e && (
                        <>
                          <span className="rsm-dot">·</span>
                          <Icon name="lock" size={11} /> {t('share.toRoom.e2e')}
                        </>
                      )}
                    </span>
                  </span>
                  {busyRoomId === room.roomId
                    ? <span className="spinner" />
                    : <Icon name="chevron-right" size={15} className="rsm-go" />}
                </button>
              ))}
            </div>
          </>
        )}

        {onShareLink && (
          <div className="rsm-actions">
            <Button variant="ghost" size="sm" disabled={!!busyRoomId} icon={<Icon name="link" size={13} />} onClick={onShareLink}>
              {t('share.toRoom.linkInstead')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Bring a finished download into the current room ─────────────────────────
interface TransferPickerModalProps {
  roomId: string;
  onClose: () => void;
  /** Receives the room state returned by the share (already includes the file). */
  onShared: (state: RoomState) => void;
}

export const TransferPickerModal: React.FC<TransferPickerModalProps> = ({ roomId, onClose, onShared }) => {
  const { t } = useTranslation();
  const [downloads, setDownloads] = useState<Download[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEscape(useCallback(() => { if (!busyId) onClose(); }, [busyId, onClose]));
  const dialogRef = useModalFocus();

  useEffect(() => {
    window.api.getDownloads()
      .then((list) => setDownloads(
        // 'removed' records are tombstoned in the db until next boot — hide them.
        list.filter((d) => d.status !== 'removed'
          && (d.progress >= 1 || ['completed', 'seeding'].includes(d.status)))
      ))
      .catch(() => setDownloads([]));
  }, []);

  const share = async (download: Download) => {
    if (busyId) return;
    setBusyId(download.id);
    try {
      const state = await window.api.rooms.shareDownload(roomId, download.id);
      toast.success(`${t('share.toRoom.success')} ${state.name}`);
      onShared(state);
      onClose();
    } catch (e) {
      toast.error(cleanError(e));
      setBusyId(null);
    }
  };

  return (
    <div className="rsm-backdrop" onClick={() => !busyId && onClose()}>
      <div
        ref={dialogRef}
        className="rsm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('rooms.fromTransfers.title')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rsm-head">
          <h3><Icon name="download" size={15} /> {t('rooms.fromTransfers.title')}</h3>
          <button
            className="rsm-close"
            disabled={!!busyId}
            onClick={() => !busyId && onClose()}
            aria-label={t('common.cancel')}
          ><Icon name="x" size={16} /></button>
        </div>

        {downloads === null ? (
          <div className="rsm-empty">{t('common.loading')}</div>
        ) : downloads.length === 0 ? (
          <div className="rsm-empty">{t('rooms.fromTransfers.empty')}</div>
        ) : (
          <>
            <p className="rsm-desc">{t('rooms.fromTransfers.pick')}</p>
            <div className="rsm-list">
              {downloads.map((d) => (
                <button
                  key={d.id}
                  className="rsm-item"
                  disabled={!!busyId}
                  onClick={() => share(d)}
                >
                  <span className="rsm-tile" aria-hidden="true"><Icon name="file" size={15} /></span>
                  <span className="rsm-text">
                    <span className="rsm-name">{d.name}</span>
                    <span className="rsm-meta">{d.totalSize > 0 ? formatBytes(d.totalSize) : ''}</span>
                  </span>
                  {busyId === d.id
                    ? <span className="spinner" />
                    : <Icon name="chevron-right" size={15} className="rsm-go" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
