/**
 * Tracker Templates Component
 * 
 * Provides preset tracker lists for different content types.
 */

import React, { useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useTranslation } from '../utils/i18nContext';
import './TrackerTemplates.css';

export interface TrackerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  trackers: string[];
}

const DEFAULT_TEMPLATES: TrackerTemplate[] = [
  {
    id: 'public',
    name: 'trackerTemplates.public.name',
    description: 'trackerTemplates.public.desc',
    icon: 'globe',
    trackers: [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://tracker.moeking.me:6969/announce',
      'udp://explodie.org:6969/announce',
      'udp://tracker1.bt.moack.co.kr:80/announce',
      'udp://tracker.theoks.net:6969/announce',
      'http://tracker.openbittorrent.com:80/announce',
    ]
  },
  {
    id: 'anime',
    name: 'trackerTemplates.anime.name',
    description: 'trackerTemplates.anime.desc',
    icon: 'tv',
    trackers: [
      'http://nyaa.tracker.wf:7777/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
    ]
  },
  {
    id: 'games',
    name: 'trackerTemplates.games.name',
    description: 'trackerTemplates.games.desc',
    icon: 'gamepad-2',
    trackers: [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://open.stealth.si:80/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://tracker.moeking.me:6969/announce',
    ]
  },
  {
    id: 'software',
    name: 'trackerTemplates.software.name',
    description: 'trackerTemplates.software.desc',
    icon: 'package',
    trackers: [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
    ]
  },
  {
    id: 'music',
    name: 'trackerTemplates.music.name',
    description: 'trackerTemplates.music.desc',
    icon: 'music',
    trackers: [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://tracker.moeking.me:6969/announce',
    ]
  },
  {
    id: 'private',
    name: 'trackerTemplates.private.name',
    description: 'trackerTemplates.private.desc',
    icon: 'lock',
    trackers: []
  }
];

interface TrackerTemplatesProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (trackers: string[]) => void;
  customTemplates?: TrackerTemplate[];
}

export const TrackerTemplates: React.FC<TrackerTemplatesProps> = ({
  isOpen,
  onClose,
  onSelect,
  customTemplates = []
}) => {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates];

  if (!isOpen) return null;

  const handleSelect = (template: TrackerTemplate) => {
    setSelectedTemplate(template.id);
    setTimeout(() => {
      onSelect(template.trackers);
      onClose();
      setSelectedTemplate(null);
    }, 200);
  };

  return (
    <Modal onClose={onClose} title={t('trackerTemplates.title')} icon="server" size="xl">
      <p className="templates-description">
        {t('trackerTemplates.subtitle')}
      </p>

      <div className="templates-grid">
        {allTemplates.map((template) => (
          <button
            key={template.id}
            className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
            onClick={() => handleSelect(template)}
          >
            <div className="template-icon">
              <Icon name={template.icon as any} size={32} />
            </div>
            <div className="template-info">
              <h4 className="template-name">{t(template.name as Parameters<typeof t>[0])}</h4>
              <p className="template-description">{t(template.description as Parameters<typeof t>[0])}</p>
              <span className="template-count">
                {template.trackers.length} {template.trackers.length === 1 ? t('trackerTemplates.trackerSingular') : t('trackerTemplates.trackerPlural')}
              </span>
            </div>
            {selectedTemplate === template.id && (
              <div className="template-check">
                <Icon name="check" size={16} />
              </div>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
};

export default TrackerTemplates;
