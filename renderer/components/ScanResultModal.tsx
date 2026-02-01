/**
 * ScanResultModal Component
 * 
 * Detailed view of scan result with tabs
 */

import React, { useState, useMemo } from 'react';
import { Dialog, Transition, Tab } from '@headlessui/react';
import { motion } from 'framer-motion';
import {
  HiX,
  HiInformationCircle,
  HiExclamation,
  HiCode,
  HiTrash,
  HiCheckCircle,
  HiShieldCheck,
} from 'react-icons/hi';
import { ScanResultRow, DetailTab, ThreatDetails, TechnicalDetails } from '../types/scan-results';
import { FileCategory } from '../../shared/virushunt-types';
import { getThreatColor } from '../stores/virusHuntStore';
import { Button } from './Button';
import './ScanResultModal.css';

interface ScanResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ScanResultRow;
}

const ScanResultModal: React.FC<ScanResultModalProps> = ({ isOpen, onClose, result }) => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Parse threats from result
  const threats: ThreatDetails[] = useMemo(() => {
    if (!result.matches) return [];
    
    return result.matches.map((match) => ({
      ruleId: match.ruleId,
      ruleName: match.ruleName,
      description: match.description,
      severity: match.severity as any,
      confidence: match.confidence,
      evidence: match.evidence || [],
      mitigation: (match as any).mitigation,
    }));
  }, [result]);

  // Parse technical details
  const technical: TechnicalDetails = useMemo(() => {
    return {
      peAnalysis: result.peAnalysis as any,
      entropyAnalysis: result.entropyAnalysis as any,
      signatureVerification: result.signatureVerification as any,
      stringAnalysis: result.stringAnalysis as any,
    } as TechnicalDetails;
  }, [result]);

  // Expected vs malicious behavior for cracks/keygens
  const expectedBehavior = useMemo(() => {
    if (result.category !== 'crack' && result.category !== 'keygen') return [];
    
    return [
      'Модификация исполняемых файлов',
      'Обращение к памяти процессов',
      'Генерация лицензионных ключей',
      'Обход защиты копирования',
    ];
  }, [result.category]);

  const maliciousBehavior = useMemo(() => {
    const behaviors: string[] = [];
    
    if (technical.stringAnalysis?.miningPools && technical.stringAnalysis.miningPools.length > 0) {
      behaviors.push('Обнаружены ссылки на криптомайнинг пулы');
    }
    
    if (technical.stringAnalysis?.c2Indicators && technical.stringAnalysis.c2Indicators.length > 0) {
      behaviors.push('Обнаружены индикаторы C&C серверов');
    }
    
    if (technical.peAnalysis?.suspiciousImports && technical.peAnalysis.suspiciousImports.length > 5) {
      behaviors.push('Множественные подозрительные WinAPI функции');
    }
    
    return behaviors;
  }, [technical]);

  // Handle delete
  const handleDelete = async () => {
    const confirmed = confirm(
      `Вы уверены, что хотите удалить файл "${result.fileName}"? Это действие необратимо.`
    );
    
    if (!confirmed) return;
    
    setIsDeleting(true);
    try {
      await window.api.invoke('fs:deleteFile', result.filePath);
      onClose();
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Не удалось удалить файл');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle whitelist
  const handleWhitelist = async () => {
    try {
      await window.api.virusHunt.addToWhitelist(result.hash, result.fileName, result.size);
      onClose();
    } catch (error) {
      console.error('Failed to add to whitelist:', error);
      alert('Не удалось добавить в исключения');
    }
  };

  // Handle ignore
  const handleIgnore = () => {
    // Just close modal - could add to ignored list
    onClose();
  };

  // Tab configuration
  const tabs: DetailTab[] = [
    {
      id: 'general',
      label: 'Общее',
      icon: <HiInformationCircle />,
    },
    {
      id: 'threats',
      label: 'Угрозы',
      icon: <HiExclamation />,
    },
    {
      id: 'technical',
      label: 'Технические детали',
      icon: <HiCode />,
    },
  ];

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="scan-result-modal" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="modal-overlay" />
        </Transition.Child>

        <div className="modal-wrapper">
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="modal-panel">
              {/* Header */}
              <div className="modal-header">
                <div className="modal-title-section">
                  <Dialog.Title className="modal-title">{result.fileName}</Dialog.Title>
                  <div className="modal-meta">
                    <span
                      className="category-badge"
                      style={{ backgroundColor: getThreatColor(result.category || FileCategory.UNKNOWN) }}
                    >
                      {result.categoryLabel}
                    </span>
                    <span className={`risk-badge risk-${result.riskLevel}`}>
                      Риск: {result.riskScore}/100
                    </span>
                  </div>
                </div>

                <button className="modal-close" onClick={onClose}>
                  <HiX />
                </button>
              </div>

              {/* Tabs */}
              <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
                <Tab.List className="modal-tabs">
                  {tabs.map((tab) => (
                    <Tab key={tab.id} className={({ selected }) => `modal-tab ${selected ? 'selected' : ''}`}>
                      {tab.icon}
                      <span>{tab.label}</span>
                    </Tab>
                  ))}
                </Tab.List>

                <Tab.Panels className="modal-content">
                  {/* General Tab */}
                  <Tab.Panel className="tab-panel">
                    <div className="info-grid">
                      <div className="info-item">
                        <label>Полный путь</label>
                        <div className="info-value file-path">{result.filePath}</div>
                      </div>

                      <div className="info-item">
                        <label>Размер</label>
                        <div className="info-value">{result.formattedSize}</div>
                      </div>

                      <div className="info-item">
                        <label>Хеш (SHA256)</label>
                        <div className="info-value hash">{result.hash}</div>
                      </div>

                      <div className="info-item">
                        <label>Дата сканирования</label>
                        <div className="info-value">
                          {result.scanDate ? new Date(result.scanDate).toLocaleString('ru-RU') : 'N/A'}
                        </div>
                      </div>

                      {result.isLegitCrack && (
                        <div className="info-item full-width">
                          <div className="crack-info">
                            <HiShieldCheck className="crack-icon" />
                            <div>
                              <strong>Легитимный крак/кейген</strong>
                              {result.releaseGroup && (
                                <p>Релиз-группа: {result.releaseGroup}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {result.assessment && (
                        <div className="info-item full-width">
                          <label>Оценка</label>
                          <div className="info-value">{result.assessment}</div>
                        </div>
                      )}

                      {result.reasons && result.reasons.length > 0 && (
                        <div className="info-item full-width">
                          <label>Причины классификации</label>
                          <ul className="reasons-list">
                            {result.reasons.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Expected vs Malicious for cracks */}
                    {(result.category === 'crack' || result.category === 'keygen') && (
                      <div className="behavior-comparison">
                        <div className="behavior-section expected">
                          <h3>
                            <HiCheckCircle /> Ожидаемое поведение
                          </h3>
                          <ul>
                            {expectedBehavior.map((behavior, i) => (
                              <li key={i}>{behavior}</li>
                            ))}
                          </ul>
                        </div>

                        {maliciousBehavior.length > 0 && (
                          <div className="behavior-section malicious">
                            <h3>
                              <HiExclamation /> Вредоносное поведение
                            </h3>
                            <ul>
                              {maliciousBehavior.map((behavior, i) => (
                                <li key={i}>{behavior}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </Tab.Panel>

                  {/* Threats Tab */}
                  <Tab.Panel className="tab-panel">
                    {threats.length === 0 ? (
                      <div className="empty-state">
                        <HiCheckCircle className="empty-icon success" />
                        <p>Угрозы не обнаружены</p>
                      </div>
                    ) : (
                      <div className="threats-list">
                        {threats.map((threat, i) => (
                          <motion.div
                            key={i}
                            className={`threat-card threat-${threat.severity}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                          >
                            <div className="threat-header">
                              <div>
                                <h4>
                                  [{threat.ruleId}] {threat.ruleName}
                                </h4>
                                <span className="threat-severity">{threat.severity}</span>
                              </div>
                              <span className="threat-confidence">{threat.confidence}%</span>
                            </div>

                            <p className="threat-description">{threat.description}</p>

                            {threat.evidence && threat.evidence.length > 0 && (
                              <div className="threat-evidence">
                                <strong>Доказательства:</strong>
                                <ul>
                                  {threat.evidence.map((ev, j) => (
                                    <li key={j}>{ev}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {threat.mitigation && (
                              <div className="threat-mitigation">
                                <strong>Рекомендации:</strong>
                                <p>{threat.mitigation}</p>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </Tab.Panel>

                  {/* Technical Tab */}
                  <Tab.Panel className="tab-panel">
                    <div className="technical-sections">
                      {/* PE Analysis */}
                      {technical.peAnalysis && (
                        <div className="technical-section">
                          <h3>PE Структура</h3>
                          <div className="technical-grid">
                            <div className="technical-item">
                              <label>Архитектура</label>
                              <div>{technical.peAnalysis.architecture}</div>
                            </div>
                            <div className="technical-item">
                              <label>Точка входа</label>
                              <div>0x{technical.peAnalysis.entryPoint}</div>
                            </div>
                          </div>

                          {technical.peAnalysis.sections && (
                            <div className="technical-subsection">
                              <h4>Секции</h4>
                              <table className="technical-table">
                                <thead>
                                  <tr>
                                    <th>Имя</th>
                                    <th>Энтропия</th>
                                    <th>Executable</th>
                                    <th>Writable</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {technical.peAnalysis.sections.map((section, i) => (
                                    <tr key={i}>
                                      <td>{section.name}</td>
                                      <td>{section.entropy.toFixed(2)}</td>
                                      <td>{section.isExecutable ? '✓' : '✗'}</td>
                                      <td>{section.isWritable ? '✓' : '✗'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {technical.peAnalysis.suspiciousImports && technical.peAnalysis.suspiciousImports.length > 0 && (
                            <div className="technical-subsection">
                              <h4>Подозрительные импорты</h4>
                              <ul className="imports-list">
                                {technical.peAnalysis.suspiciousImports.map((imp, i) => (
                                  <li key={i}>{imp}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Entropy Analysis */}
                      {technical.entropyAnalysis && (
                        <div className="technical-section">
                          <h3>Анализ энтропии</h3>
                          <div className="technical-grid">
                            <div className="technical-item">
                              <label>Энтропия файла</label>
                              <div>{technical.entropyAnalysis.fileEntropy.toFixed(2)}</div>
                            </div>
                            <div className="technical-item">
                              <label>Упакован</label>
                              <div>{technical.entropyAnalysis.isPacked ? 'Да' : 'Нет'}</div>
                            </div>
                            <div className="technical-item">
                              <label>Оценка</label>
                              <div>{technical.entropyAnalysis.assessment}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Signature Verification */}
                      {technical.signatureVerification && (
                        <div className="technical-section">
                          <h3>Цифровая подпись</h3>
                          <div className="technical-grid">
                            <div className="technical-item">
                              <label>Подписан</label>
                              <div>{technical.signatureVerification.isSigned ? 'Да' : 'Нет'}</div>
                            </div>
                            {technical.signatureVerification.isSigned && (
                              <>
                                <div className="technical-item">
                                  <label>Валидна</label>
                                  <div>{technical.signatureVerification.isValid ? 'Да' : 'Нет'}</div>
                                </div>
                                <div className="technical-item">
                                  <label>Издатель</label>
                                  <div>{technical.signatureVerification.signer}</div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* String Analysis */}
                      {technical.stringAnalysis && (
                        <div className="technical-section">
                          <h3>Анализ строк</h3>

                          {technical.stringAnalysis.miningPools && technical.stringAnalysis.miningPools.length > 0 && (
                            <div className="technical-subsection">
                              <h4>Майнинг пулы</h4>
                              <ul className="string-list danger">
                                {technical.stringAnalysis.miningPools.map((pool, i) => (
                                  <li key={i}>{pool}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {technical.stringAnalysis.c2Indicators && technical.stringAnalysis.c2Indicators.length > 0 && (
                            <div className="technical-subsection">
                              <h4>C&C индикаторы</h4>
                              <ul className="string-list danger">
                                {technical.stringAnalysis.c2Indicators.map((c2, i) => (
                                  <li key={i}>{c2}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {technical.stringAnalysis.suspiciousUrls && technical.stringAnalysis.suspiciousUrls.length > 0 && (
                            <div className="technical-subsection">
                              <h4>Подозрительные URL</h4>
                              <ul className="string-list warning">
                                {technical.stringAnalysis.suspiciousUrls.map((url, i) => (
                                  <li key={i}>{url}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {technical.stringAnalysis.ipAddresses && technical.stringAnalysis.ipAddresses.length > 0 && (
                            <div className="technical-subsection">
                              <h4>IP адреса</h4>
                              <ul className="string-list">
                                {technical.stringAnalysis.ipAddresses.map((ip, i) => (
                                  <li key={i}>{ip}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Tab.Panel>
                </Tab.Panels>
              </Tab.Group>

              {/* Footer Actions */}
              <div className="modal-footer">
                <div className="footer-actions">
                  <Button
                    variant="danger"
                    icon={<HiTrash />}
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    Удалить файл
                  </Button>

                  <Button variant="default" icon={<HiCheckCircle />} onClick={handleWhitelist}>
                    Добавить в исключения
                  </Button>

                  <Button variant="secondary" onClick={handleIgnore}>
                    Игнорировать
                  </Button>
                </div>

                <Button variant="secondary" onClick={onClose}>
                  Закрыть
                </Button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ScanResultModal;
