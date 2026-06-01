/**
 * Privacy Settings Component
 *
 * Advanced privacy controls for TorrentHunt
 */

import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { Toggle } from './Toggle';
import { Button } from './Button';
import { Alert } from './Alert';
import { PrivacyConfig, VPNDetectionResult } from '../../shared/types';
import './PrivacySettings.css';

export const PrivacySettings: React.FC = () => {
  const [config, setConfig] = useState<PrivacyConfig>({
    anonymousMode: true,
    encryptStorage: true,
    disableLogs: false,
    vpnCheck: true,
    clearDataOnExit: false,
    ephemeralPeerId: true,
    sanitizeLogs: true,
    vpnKillSwitch: false,
  });

  const [vpnStatus, setVpnStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [vpnDetails, setVpnDetails] = useState<VPNDetectionResult | null>(null);
  const [isCheckingVPN, setIsCheckingVPN] = useState(false);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);

  useEffect(() => {
    void loadPrivacySettings();
    void checkVPNStatus();
    void window.api.isEncryptionAvailable().then(setEncryptionAvailable).catch(() => {});
  }, []);

  const loadPrivacySettings = async () => {
    try {
      const settings = await window.api.getPrivacyConfig();
      setConfig(settings);
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    }
  };

  const checkVPNStatus = async () => {
    setIsCheckingVPN(true);
    try {
      // Was incorrectly calling getPrivacyConfig(); use the real VPN detector
      const result = await window.api.checkVPN();
      setVpnDetails(result);
      setVpnStatus(result.isVPNActive ? 'connected' : 'disconnected');
    } catch (error) {
      console.error('Failed to check VPN status:', error);
      setVpnStatus('unknown');
    } finally {
      setIsCheckingVPN(false);
    }
  };

  const handleChange = async (key: keyof PrivacyConfig, value: boolean) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);

    try {
      await window.api.updatePrivacyConfig({ [key]: value });
    } catch (error) {
      console.error('Failed to save privacy setting:', error);
      // Revert on failure
      setConfig(config);
    }
  };

  const handleClearAllData = async () => {
    const confirmed = confirm(
      '⚠️ This will permanently delete all your data including:\n\n' +
      '• All downloads and torrents\n' +
      '• Reputation and transactions\n' +
      '• Categories and settings\n' +
      '• All logs and temporary files\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Are you absolutely sure?'
    );

    if (!confirmed) return;

    // Second confirmation
    const doubleConfirmed = confirm(
      '⚠️ FINAL WARNING!\n\n' +
      'You are about to delete ALL DATA.\n' +
      'Type YES in your mind and click OK to proceed.'
    );

    if (!doubleConfirmed) return;

    try {
      await window.api.clearAllData();
      alert('✅ All data cleared successfully!\n\nThe application will reload.');

      // Reload the page to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('❌ Failed to clear data. Check console for details.');
    }
  };

  return (
    <div className="privacy-settings">
      {/* Header */}
      <div className="settings-category-header">
        <h1 className="settings-category-title">🔒 Privacy & Anonymity</h1>
        <p className="settings-category-subtitle">
          Configure advanced privacy features to protect your anonymity
        </p>
      </div>

      {/* VPN Status */}
      {vpnStatus === 'connected' && vpnDetails && (
        <Alert variant="success">
          <strong>✅ VPN Detected!</strong>
          <p>
            {vpnDetails.details.vpnProvider
              ? `Connected via ${vpnDetails.details.vpnProvider}`
              : 'VPN connection detected'}
            {' '}(Confidence: {vpnDetails.confidence})
          </p>
          {vpnDetails.details.detectedInterfaces.length > 0 && (
            <p style={{ fontSize: '0.85em', opacity: 0.8 }}>
              Interfaces: {vpnDetails.details.detectedInterfaces.join(', ')}
            </p>
          )}
        </Alert>
      )}

      {vpnStatus === 'disconnected' && vpnDetails && (
        <Alert variant="warning">
          <strong>⚠️ VPN Not Detected!</strong>
          <p>Your real IP address may be visible to peers. Consider using a VPN for better privacy.</p>
          {vpnDetails.details.publicIP && (
            <p style={{ fontSize: '0.85em', opacity: 0.8 }}>
              Your public IP: {vpnDetails.details.publicIP}
            </p>
          )}
          <Button
            variant="secondary"
            onClick={checkVPNStatus}
            disabled={isCheckingVPN}
            style={{ marginTop: '8px' }}
          >
            <Icon name="refresh-cw" size={14} />
            {isCheckingVPN ? 'Checking...' : 'Re-check VPN'}
          </Button>
        </Alert>
      )}

      {vpnStatus === 'unknown' && (
        <Alert variant="info">
          <strong>ℹ️ VPN Status Unknown</strong>
          <p>Unable to determine VPN status. Click to check manually.</p>
          <Button
            variant="secondary"
            onClick={checkVPNStatus}
            disabled={isCheckingVPN}
            style={{ marginTop: '8px' }}
          >
            <Icon name="refresh-cw" size={14} />
            {isCheckingVPN ? 'Checking...' : 'Check VPN Status'}
          </Button>
        </Alert>
      )}

      {/* Encryption Status */}
      {!encryptionAvailable && (
        <Alert variant="info">
          <strong>ℹ️ Encryption Unavailable</strong>
          <p>Your system doesn't support secure encryption. Data will be obfuscated but not fully encrypted.</p>
        </Alert>
      )}

      {/* Anonymity */}
      <div className="settings-group">
        <h3 className="settings-group-title">ANONYMITY</h3>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="refresh-cw" size={16} />
              Ephemeral Peer ID
            </label>
            <p className="setting-description">
              The BitTorrent peer ID is randomized every launch (no machine-identifying
              data), so peers can&apos;t correlate your sessions over time.
            </p>
          </div>
          <div className="setting-control">
            <span className="privacy-status on"><Icon name="check-circle" size={14} /> Always on</span>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="shield" size={16} />
              VPN Detection
            </label>
            <p className="setting-description">
              Show a warning on startup if no VPN is detected. A VPN is the only way
              to actually hide your IP from peers.
            </p>
          </div>
          <div className="setting-control">
            <Toggle
              checked={config.vpnCheck}
              onChange={(checked) => handleChange('vpnCheck', checked)}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="shield" size={16} />
              VPN Kill-Switch
            </label>
            <p className="setting-description">
              Continuously monitor the VPN and automatically pause all torrents if it
              drops, so your real IP is never exposed. Resume is manual.
            </p>
          </div>
          <div className="setting-control">
            <Toggle
              checked={config.vpnKillSwitch}
              onChange={(checked) => handleChange('vpnKillSwitch', checked)}
            />
          </div>
        </div>
      </div>

      {/* Data Protection */}
      <div className="settings-group">
        <h3 className="settings-group-title">DATA PROTECTION</h3>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="lock" size={16} />
              Encrypted Secrets
            </label>
            <p className="setting-description">
              Proxy password and search-provider API keys are encrypted at rest using
              OS-level encryption (Keychain / DPAPI / libsecret).
            </p>
          </div>
          <div className="setting-control">
            {encryptionAvailable ? (
              <span className="privacy-status on"><Icon name="check-circle" size={14} /> Active</span>
            ) : (
              <span className="privacy-status off"><Icon name="alert-triangle" size={14} /> Unavailable</span>
            )}
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="trash" size={16} />
              Clear Data on Exit
            </label>
            <p className="setting-description">
              Automatically delete logs and temporary data when closing the app.
            </p>
          </div>
          <div className="setting-control">
            <Toggle
              checked={config.clearDataOnExit}
              onChange={(checked) => handleChange('clearDataOnExit', checked)}
            />
          </div>
        </div>
      </div>

      {/* Logging */}
      <div className="settings-group">
        <h3 className="settings-group-title">LOGGING</h3>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="file-text" size={16} />
              Sanitize Logs
            </label>
            <p className="setting-description">
              Remove or hash sensitive data (IPs, IDs) in log files.
            </p>
          </div>
          <div className="setting-control">
            <Toggle
              checked={config.sanitizeLogs}
              onChange={(checked) => handleChange('sanitizeLogs', checked)}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="x-circle" size={16} />
              Disable Logging
            </label>
            <p className="setting-description">
              Completely disable file logging. ⚠️ Makes debugging difficult.
            </p>
          </div>
          <div className="setting-control">
            <Toggle
              checked={config.disableLogs}
              onChange={(checked) => handleChange('disableLogs', checked)}
            />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="settings-group danger-zone">
        <h3 className="settings-group-title">⚠️ DANGER ZONE</h3>

        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">
              <Icon name="alert-triangle" size={16} />
              Clear All Data
            </label>
            <p className="setting-description">
              Permanently delete all data including reputation, downloads, and settings.
              This action cannot be undone!
            </p>
          </div>
          <div className="setting-control">
            <Button
              variant="danger"
              onClick={handleClearAllData}
            >
              <Icon name="trash" size={16} />
              Clear All Data
            </Button>
          </div>
        </div>
      </div>

      {/* Privacy Tips */}
      <div className="privacy-tips">
        <h3>💡 Privacy Tips</h3>
        <ul>
          <li><strong>Use VPN:</strong> Always use a trustworthy VPN to hide your real IP address</li>
          <li><strong>Bind to VPN:</strong> Configure network binding to VPN interface to prevent IP leaks</li>
          <li><strong>Disable WebRTC:</strong> If using magnet links in browser, disable WebRTC to prevent leaks</li>
          <li><strong>Use Private Trackers:</strong> Enable "Private torrent" option when creating torrents</li>
          <li><strong>Check Regularly:</strong> Use IPLeak.net to verify your IP is hidden</li>
        </ul>
      </div>

      {/* Privacy Score */}
      <div className="privacy-score">
        <h3>Privacy Score</h3>
        <div className="score-bar">
          <div
            className="score-fill"
            style={{
              width: `${calculatePrivacyScore(config, vpnStatus)}%`,
              backgroundColor: getScoreColor(calculatePrivacyScore(config, vpnStatus))
            }}
          />
        </div>
        <div className="score-label">
          {calculatePrivacyScore(config, vpnStatus)}/100 - {getScoreLabel(calculatePrivacyScore(config, vpnStatus))}
        </div>
      </div>
    </div>
  );
};

function calculatePrivacyScore(config: PrivacyConfig, vpnStatus: string): number {
  let score = 0;

  // Always-on protections (encrypted secrets + ephemeral peer id)
  score += 25;
  // VPN is the biggest factor for real network anonymity
  if (vpnStatus === 'connected') score += 45;
  // Opt-in hygiene
  if (config.sanitizeLogs) score += 12;
  if (config.clearDataOnExit) score += 10;
  if (config.disableLogs) score += 8;

  return Math.min(100, score);
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e'; // Green
  if (score >= 60) return '#f59e0b'; // Orange
  return '#ef4444'; // Red
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}
