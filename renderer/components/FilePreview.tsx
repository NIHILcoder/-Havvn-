import React, { useEffect, useState } from 'react';
import { TorrentFile } from '../../shared/types';
import { Icon, IconName } from './Icon';
import { Modal } from './Modal';
import { Button } from './Button';
import { useTranslation } from '../utils/i18nContext';
import './FilePreview.css';

interface FilePreviewProps {
  downloadId: string;
  onClose: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ downloadId, onClose }) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const fileList = await window.api.getTorrentFiles(downloadId);
        setFiles(fileList);
      } catch (err) {
        setError(t('filePreview.loadFailed'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadFiles();
  }, [downloadId]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = React.useMemo(() => {
    const iconCache = new Map<string, IconName>();
    return (fileName: string): IconName => {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      if (iconCache.has(ext)) return iconCache.get(ext)!;
      let icon: IconName = 'file';
      if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) icon = 'film';
      else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) icon = 'music';
      else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) icon = 'image';
      else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) icon = 'archive';
      else if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) icon = 'file-text';
      iconCache.set(ext, icon);
      return icon;
    };
  }, []);

  const getFileTypeColor = React.useMemo(() => {
    const colorCache = new Map<string, string>();
    return (fileName: string): string => {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      if (colorCache.has(ext)) return colorCache.get(ext)!;
      let color = 'var(--color-text-tertiary)';
      if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) color = 'var(--color-video)';
      else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) color = 'var(--color-audio)';
      else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) color = 'var(--color-image)';
      else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) color = 'var(--color-archive)';
      else if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) color = 'var(--color-document)';
      colorCache.set(ext, color);
      return color;
    };
  }, []);

  const getFileExtension = (fileName: string): string => {
    return fileName.split('.').pop()?.toUpperCase() || 'FILE';
  };

  if (loading) {
    return (
      <Modal onClose={onClose} size="xl" ariaLabel={t('filePreview.loadingAria')}>
        <div className="file-preview-loading">
          <div className="fp-spinner"></div>
          <p>{t('filePreview.loading')}</p>
        </div>
      </Modal>
    );
  }

  if (error) {
    return (
      <Modal
        onClose={onClose}
        size="xl"
        ariaLabel={error}
        footer={<Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}
      >
        <div className="file-preview-error">
          <div className="fp-state-icon fp-state-icon--error">
            <Icon name="alert-circle" size={32} />
          </div>
          <p>{error}</p>
        </div>
      </Modal>
    );
  }

  if (files.length === 0) {
    return (
      <Modal onClose={onClose} size="xl" ariaLabel={t('downloads.files')}>
        <div className="file-preview-empty">
          <div className="fp-state-icon">
            <Icon name="inbox" size={32} />
          </div>
          <p>{t('filePreview.noInfo')}</p>
        </div>
      </Modal>
    );
  }

  const totalSize = files.reduce((sum, file) => sum + file.length, 0);
  const downloadedSize = files.reduce((sum, file) => sum + file.downloaded, 0);
  const totalProgress = totalSize > 0 ? downloadedSize / totalSize : 0;
  const completedCount = files.filter(f => f.progress === 1).length;

  const headerTitle = (
    <span className="fp-header-text">
      <span className="fp-title">{t('downloads.files')} ({files.length})</span>
      <span className="fp-subtitle">
        <span className="fp-chip">
          <Icon name="hard-drive" size={12} />
          {formatBytes(totalSize)}
        </span>
        <span className="fp-chip-sep">·</span>
        <span className="fp-chip">
          <Icon name="download" size={12} />
          {formatBytes(downloadedSize)} {t('filePreview.downloaded')}
        </span>
        <span className="fp-chip-sep">·</span>
        <span className="fp-chip fp-chip--progress">
          {(totalProgress * 100).toFixed(1)}% {t('filePreview.complete')}
        </span>
        {completedCount > 0 && (
          <>
            <span className="fp-chip-sep">·</span>
            <span className="fp-chip fp-chip--done">
              <Icon name="check-circle" size={12} />
              {completedCount} {t('filePreview.done')}
            </span>
          </>
        )}
      </span>
    </span>
  );

  return (
    <Modal
      onClose={onClose}
      size="xl"
      icon="layers"
      title={headerTitle}
      ariaLabel={`${t('downloads.files')} (${files.length})`}
      bodyClassName="fp-body"
    >
      {/* ── Overall progress bar (sticky) ── */}
      <div className="fp-total-progress">
        <div className="fp-total-bar">
          <div
            className="fp-total-fill"
            style={{ width: `${totalProgress * 100}%` }}
          />
        </div>
      </div>

      {/* ── File list ── */}
      <div className="fp-list">
        {files.map((file, index) => {
          const pct = Math.round(file.progress * 100);
          const isDone = file.progress === 1;
          const ext = getFileExtension(file.name);

          return (
            <div key={index} className={`fp-item ${isDone ? 'fp-item--done' : ''}`}>
              {/* Icon */}
              <div className="fp-item-icon" style={{ color: getFileTypeColor(file.name) }}>
                <Icon name={getFileIcon(file.name)} size={22} />
                <span className="fp-ext-badge">{ext}</span>
              </div>

              {/* Content */}
              <div className="fp-item-body">
                {/* Row 1: name + size */}
                <div className="fp-item-row">
                  <span className="fp-item-name" title={file.path}>{file.name}</span>
                  <span className="fp-item-size">{formatBytes(file.length)}</span>
                </div>

                {/* Row 2: path */}
                {file.path && file.path !== file.name && (
                  <div className="fp-item-path" title={file.path}>
                    <Icon name="folder" size={11} />
                    {file.path}
                  </div>
                )}

                {/* Row 3: progress bar */}
                <div className="fp-item-progress-track">
                  <div
                    className={`fp-item-progress-fill ${isDone ? 'fp-item-progress-fill--done' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Row 4: percent + downloaded/total */}
                <div className="fp-item-meta">
                  <span className="fp-item-pct">{pct}%</span>
                  {isDone ? (
                    <span className="fp-item-status fp-item-status--done">
                      <Icon name="check-circle" size={12} />
                      {t('status.completed')}
                    </span>
                  ) : (
                    <span className="fp-item-status">
                      <Icon name="download" size={12} />
                      {formatBytes(file.downloaded)} / {formatBytes(file.length)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
