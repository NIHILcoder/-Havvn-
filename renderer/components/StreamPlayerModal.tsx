/**
 * StreamPlayerModal
 *
 * In-app player that streams a media file straight from a torrent — playback
 * starts while the torrent is still downloading. Formats Chromium can't decode
 * (avi, mkv, HEVC, …) are transcoded on the fly via the bundled ffmpeg; direct
 * playback that fails on an unsupported codec falls back to transcoding too.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../utils/i18nContext';
import { classifyMediaKind, MediaKind } from '../../shared/media';
import './StreamPlayerModal.css';

interface StreamFile {
  index: number;
  name: string;
  length: number;
  kind: MediaKind;
}

interface StreamPlayerModalProps {
  downloadId: string;
  downloadName: string;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const StreamPlayerModal: React.FC<StreamPlayerModalProps> = ({ downloadId, downloadName, onClose }) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<StreamFile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [forceTranscode, setForceTranscode] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<MediaKind>('video');
  const [transcoded, setTranscoded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the streamable files in this torrent once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await window.api.getTorrentFiles(downloadId);
        const streamable: StreamFile[] = all
          .map((f, index) => ({ index, name: f.name, length: f.length, kind: classifyMediaKind(f.name) }))
          .filter((f) => f.kind !== 'other')
          .sort((a, b) => b.length - a.length);
        if (cancelled) return;
        setFiles(streamable);
        if (streamable.length === 0) {
          setError(t('player.noMedia'));
          setLoading(false);
        } else {
          setActiveIndex(streamable[0].index);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || String(err));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [downloadId, t]);

  // Resolve a stream URL whenever the active file (or transcode mode) changes.
  useEffect(() => {
    if (activeIndex === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStreamUrl(null);
    (async () => {
      try {
        const info = await window.api.getStreamUrl(downloadId, activeIndex, { transcode: forceTranscode });
        if (cancelled) return;
        setStreamUrl(info.url);
        setKind(info.kind === 'other' ? 'video' : info.kind);
        setTranscoded(info.transcoded);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || String(err));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [downloadId, activeIndex, forceTranscode]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selectFile = useCallback((index: number) => {
    setActiveIndex(index);
    setForceTranscode(false);
    setError(null);
  }, []);

  // Direct playback failed — retry through the transcoder once.
  const handleMediaError = useCallback(() => {
    if (!transcoded) setForceTranscode(true);
    else setError(t('player.unsupported'));
  }, [transcoded, t]);

  const activeFile = files.find((f) => f.index === activeIndex) || null;

  const renderBody = useCallback(() => {
    if (error) {
      return (
        <div className="player-message">
          <Icon name="alert-triangle" size={30} />
          <p>{error}</p>
        </div>
      );
    }
    if (loading || !streamUrl) {
      return (
        <div className="player-message">
          <span className="spinner spinner-lg" />
          <p>{transcoded ? t('player.converting') : t('player.buffering')}</p>
        </div>
      );
    }
    if (kind === 'audio') {
      return (
        <div className="player-audio">
          <div className="player-audio-art"><Icon name="music" size={48} /></div>
          <div className="player-audio-name">{activeFile?.name}</div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={streamUrl} controls autoPlay onError={handleMediaError} />
        </div>
      );
    }
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        key={streamUrl}
        src={streamUrl}
        controls
        autoPlay
        className="player-video"
        onError={handleMediaError}
      />
    );
  }, [error, loading, streamUrl, kind, activeFile, transcoded, handleMediaError, t]);

  return (
    <div className="player-overlay" onClick={onClose}>
      <div className="player-modal" onClick={(e) => e.stopPropagation()}>
        <div className="player-header">
          <div className="player-title">
            <span className="player-title-icon">
              <Icon name={kind === 'audio' ? 'music' : 'play'} size={15} />
            </span>
            <span className="player-title-text" title={activeFile?.name || downloadName}>
              {activeFile?.name || downloadName}
            </span>
            {transcoded && (
              <span className="player-badge" title={t('player.transcodingNote')}>
                <Icon name="zap" size={11} /> {t('player.transcoding')}
              </span>
            )}
          </div>
          <button className="player-close" onClick={onClose} title={t('player.close')}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="player-body">{renderBody()}</div>

        {files.length > 1 && (
          <div className="player-files">
            {files.map((f) => (
              <button
                key={f.index}
                className={`player-file-chip ${f.index === activeIndex ? 'active' : ''}`}
                onClick={() => selectFile(f.index)}
                title={f.name}
              >
                <Icon name={f.kind === 'audio' ? 'music' : 'film'} size={12} />
                <span className="player-file-name">{f.name}</span>
                <span className="player-file-size">{formatBytes(f.length)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="player-note">
          <Icon name="info" size={12} />
          <span>{transcoded ? t('player.transcodingNote') : t('player.note')}</span>
        </div>
      </div>
    </div>
  );
};

export default StreamPlayerModal;
