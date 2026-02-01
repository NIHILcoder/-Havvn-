/**
 * Export Modal Component
 * Modal for exporting scan reports in various formats
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiX,
  HiDocumentText,
  HiDocumentReport,
  HiCode,
  HiDocument,
  HiCheck,
  HiExclamationCircle,
  HiFolderOpen,
} from 'react-icons/hi';
import { Button } from './Button';
import { ProgressBar } from './ProgressBar';
import type {
  ReportFormat,
  ExportOptions,
  ExportResult,
  ScanResult,
  ScanSummary,
} from '../../shared/scan-report-types';
import './ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: ScanResult[];
  summary: ScanSummary;
}

const FORMAT_OPTIONS: Array<{
  value: ReportFormat;
  label: string;
  icon: React.ReactNode;
  description: string;
  extension: string;
}> = [
  {
    value: 'html',
    label: 'HTML Report',
    icon: <HiDocumentText />,
    description: 'Interactive web page with charts and filtering',
    extension: '.html',
  },
  {
    value: 'pdf',
    label: 'PDF Document',
    icon: <HiDocumentReport />,
    description: 'Professional PDF report for sharing',
    extension: '.pdf',
  },
  {
    value: 'json',
    label: 'JSON Data',
    icon: <HiCode />,
    description: 'Machine-readable structured data',
    extension: '.json',
  },
  {
    value: 'txt',
    label: 'Plain Text',
    icon: <HiDocument />,
    description: 'Simple text file for quick reading',
    extension: '.txt',
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  results,
  summary,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('html');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeSystemInfo, setIncludeSystemInfo] = useState(false);
  const [anonymizePaths, setAnonymizePaths] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setExportResult(null);
      setIsExporting(false);
      setExportProgress(0);
      setOutputPath('');
    }
  }, [isOpen]);

  const handleChooseLocation = async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const defaultName = `virusहunt-report-${timestamp}`;

    const extension = FORMAT_OPTIONS.find((opt) => opt.value === selectedFormat)
      ?.extension;

    const filters = FORMAT_OPTIONS.map((opt) => ({
      name: opt.label,
      extensions: [opt.extension.replace('.', '')],
    }));

    const path = await window.api.reports.showSaveDialog({
      defaultPath: `${defaultName}${extension}`,
      filters,
    });

    if (path) {
      setOutputPath(path);
    }
  };

  const handleExport = async () => {
    if (!outputPath) {
      await handleChooseLocation();
      return;
    }

    setIsExporting(true);
    setExportProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setExportProgress((prev) => Math.min(prev + 10, 90));
      }, 300);

      const options: ExportOptions = {
        format: selectedFormat,
        outputPath,
        includeCharts,
        theme,
        includeSystemInfo,
        anonymizePaths,
      };

      const result = await window.api.reports.exportReport(results, summary, options);

      clearInterval(progressInterval);
      setExportProgress(100);
      setExportResult(result);

      if (result.success) {
        // Auto-close after 2 seconds on success
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (error) {
      setExportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenFile = async () => {
    if (exportResult?.filePath) {
      await window.api.reports.openFile(exportResult.filePath);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getPreviewContent = (): string => {
    const format = FORMAT_OPTIONS.find((opt) => opt.value === selectedFormat);
    const fileCount = results.length;
    const threatCount = results.filter((r) => r.threatLevel !== 'safe').length;

    return `
📄 ${format?.label}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Summary:
  • Total Files: ${fileCount}
  • Threats Detected: ${threatCount}
  • Clean Files: ${fileCount - threatCount}

⚙️ Options:
  • Theme: ${theme === 'light' ? '☀️ Light' : '🌙 Dark'}
  • Charts: ${includeCharts ? '✅ Included' : '❌ Excluded'}
  • System Info: ${includeSystemInfo ? '✅ Included' : '❌ Excluded'}
  • Anonymize Paths: ${anonymizePaths ? '✅ Yes' : '❌ No'}

📁 Output: ${outputPath || 'Not selected'}
    `.trim();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="export-modal-overlay" onClick={onClose}>
        <motion.div
          className="export-modal"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="export-modal-header">
            <h2>📤 Export Scan Report</h2>
            <button className="close-button" onClick={onClose}>
              <HiX />
            </button>
          </div>

          {/* Body */}
          <div className="export-modal-body">
            {!exportResult && (
              <>
                {/* Format Selection */}
                <section className="export-section">
                  <h3>1. Select Format</h3>
                  <div className="format-grid">
                    {FORMAT_OPTIONS.map((format) => (
                      <button
                        key={format.value}
                        className={`format-option ${
                          selectedFormat === format.value ? 'selected' : ''
                        }`}
                        onClick={() => setSelectedFormat(format.value)}
                        disabled={isExporting}
                      >
                        <div className="format-icon">{format.icon}</div>
                        <div className="format-label">{format.label}</div>
                        <div className="format-description">{format.description}</div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Options */}
                <section className="export-section">
                  <h3>2. Configure Options</h3>
                  <div className="options-grid">
                    {(selectedFormat === 'html' || selectedFormat === 'pdf') && (
                      <>
                        <label className="option-item">
                          <input
                            type="checkbox"
                            checked={includeCharts}
                            onChange={(e) => setIncludeCharts(e.target.checked)}
                            disabled={isExporting}
                          />
                          <span>Include Charts & Visualizations</span>
                        </label>

                        <label className="option-item">
                          <span>Theme:</span>
                          <select
                            value={theme}
                            onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
                            disabled={isExporting}
                          >
                            <option value="light">☀️ Light</option>
                            <option value="dark">🌙 Dark</option>
                          </select>
                        </label>
                      </>
                    )}

                    <label className="option-item">
                      <input
                        type="checkbox"
                        checked={includeSystemInfo}
                        onChange={(e) => setIncludeSystemInfo(e.target.checked)}
                        disabled={isExporting}
                      />
                      <span>Include System Information</span>
                    </label>

                    <label className="option-item">
                      <input
                        type="checkbox"
                        checked={anonymizePaths}
                        onChange={(e) => setAnonymizePaths(e.target.checked)}
                        disabled={isExporting}
                      />
                      <span>Anonymize File Paths</span>
                    </label>
                  </div>
                </section>

                {/* Output Location */}
                <section className="export-section">
                  <h3>3. Choose Output Location</h3>
                  <div className="output-location">
                    <input
                      type="text"
                      value={outputPath}
                      placeholder="Click 'Browse...' to select output location"
                      readOnly
                      className="output-input"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleChooseLocation}
                      disabled={isExporting}
                    >
                      <HiFolderOpen />
                      Browse...
                    </Button>
                  </div>
                </section>

                {/* Preview */}
                {showPreview && (
                  <section className="export-section">
                    <h3>Preview</h3>
                    <pre className="preview-content">{getPreviewContent()}</pre>
                  </section>
                )}
              </>
            )}

            {/* Export Progress */}
            {isExporting && (
              <section className="export-section">
                <h3>Generating Report...</h3>
                <ProgressBar
                  value={exportProgress}
                  max={100}
                  showLabel
                  className="export-progress"
                />
                <p className="progress-message">
                  {exportProgress < 30 && 'Preparing data...'}
                  {exportProgress >= 30 && exportProgress < 60 && 'Generating content...'}
                  {exportProgress >= 60 && exportProgress < 90 && 'Rendering report...'}
                  {exportProgress >= 90 && 'Finalizing...'}
                </p>
              </section>
            )}

            {/* Export Result */}
            {exportResult && (
              <section className="export-section">
                {exportResult.success ? (
                  <div className="export-success">
                    <div className="success-icon">
                      <HiCheck />
                    </div>
                    <h3>✅ Export Successful!</h3>
                    <p className="success-message">
                      Report generated successfully in{' '}
                      {((exportResult.duration || 0) / 1000).toFixed(2)}s
                    </p>
                    <div className="file-info">
                      <p>
                        <strong>File:</strong> {exportResult.filePath}
                      </p>
                      <p>
                        <strong>Size:</strong>{' '}
                        {formatFileSize(exportResult.fileSize || 0)}
                      </p>
                    </div>
                    <div className="result-actions">
                      <Button onClick={handleOpenFile}>Open File</Button>
                      <Button variant="secondary" onClick={onClose}>
                        Close
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="export-error">
                    <div className="error-icon">
                      <HiExclamationCircle />
                    </div>
                    <h3>❌ Export Failed</h3>
                    <p className="error-message">{exportResult.error}</p>
                    <div className="result-actions">
                      <Button onClick={() => setExportResult(null)}>Try Again</Button>
                      <Button variant="secondary" onClick={onClose}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Footer */}
          {!exportResult && (
            <div className="export-modal-footer">
              <Button variant="ghost" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? 'Hide' : 'Show'} Preview
              </Button>
              <div className="footer-actions">
                <Button variant="secondary" onClick={onClose} disabled={isExporting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={!outputPath || isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ExportModal;
