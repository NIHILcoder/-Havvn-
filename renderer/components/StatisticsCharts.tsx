/**
 * Statistics Charts Component
 * Visualization of scan results using recharts
 */

import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  LineChart,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ScanResult, ScanHistoryEntry } from '../../shared/scan-report-types';
import { ThreatLevel, FileCategory } from '../../shared/virushunt-types';
import './StatisticsCharts.css';

interface StatisticsChartsProps {
  results?: ScanResult[];
  history?: ScanHistoryEntry[];
  showPie?: boolean;
  showBar?: boolean;
  showLine?: boolean;
  showHeatmap?: boolean;
}

const THREAT_COLORS = {
  [ThreatLevel.SAFE]: '#10b981',
  [ThreatLevel.SUSPICIOUS]: '#f59e0b',
  [ThreatLevel.DANGEROUS]: '#ef4444',
  [ThreatLevel.CRITICAL]: '#991b1b',
};

const CATEGORY_COLORS: Record<FileCategory, string> = {
  [FileCategory.SAFE]: '#10b981',
  [FileCategory.CRACK]: '#f59e0b',
  [FileCategory.KEYGEN]: '#eab308',
  [FileCategory.SUSPICIOUS]: '#f97316',
  [FileCategory.DANGEROUS]: '#ef4444',
  [FileCategory.UNKNOWN]: '#6b7280',
};

export const StatisticsCharts: React.FC<StatisticsChartsProps> = ({
  results = [],
  history = [],
  showPie = true,
  showBar = true,
  showLine = true,
  showHeatmap = true,
}) => {
  // Threat level distribution (Pie Chart)
  const threatDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      [ThreatLevel.SAFE]: 0,
      [ThreatLevel.SUSPICIOUS]: 0,
      [ThreatLevel.DANGEROUS]: 0,
      [ThreatLevel.CRITICAL]: 0,
    };

    results.forEach((result) => {
      counts[result.threatLevel]++;
    });

    return Object.entries(counts).map(([level, count]) => ({
      name: level.charAt(0).toUpperCase() + level.slice(1),
      value: count,
      percentage: results.length > 0 ? ((count / results.length) * 100).toFixed(1) : '0',
      color: THREAT_COLORS[level as ThreatLevel],
    }));
  }, [results]);

  // Category distribution (Pie Chart)
  const categoryDistribution = useMemo(() => {
    const counts = new Map<FileCategory, number>();

    results.forEach((result) => {
      counts.set(result.category, (counts.get(result.category) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([category, count]) => ({
      name: category.charAt(0).toUpperCase() + category.slice(1),
      value: count,
      percentage: results.length > 0 ? ((count / results.length) * 100).toFixed(1) : '0',
      color: CATEGORY_COLORS[category],
    }));
  }, [results]);

  // Directory statistics (Bar Chart)
  const directoryStats = useMemo(() => {
    const dirMap = new Map<
      string,
      { clean: number; suspicious: number; dangerous: number; critical: number }
    >();

    results.forEach((result) => {
      const dir = result.path.split(/[/\\]/).slice(0, -1).join('/') || 'root';
      const stats = dirMap.get(dir) || { clean: 0, suspicious: 0, dangerous: 0, critical: 0 };

      switch (result.threatLevel) {
        case ThreatLevel.SAFE:
          stats.clean++;
          break;
        case ThreatLevel.SUSPICIOUS:
          stats.suspicious++;
          break;
        case ThreatLevel.DANGEROUS:
          stats.dangerous++;
          break;
        case ThreatLevel.CRITICAL:
          stats.critical++;
          break;
      }

      dirMap.set(dir, stats);
    });

    return Array.from(dirMap.entries())
      .map(([directory, stats]) => ({
        directory: directory.split('/').pop() || directory,
        ...stats,
        total: stats.clean + stats.suspicious + stats.dangerous + stats.critical,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10 directories
  }, [results]);

  // Scan timeline (Line Chart)
  const scanTimeline = useMemo(() => {
    return history
      .slice(0, 30) // Last 30 scans
      .reverse()
      .map((scan) => ({
        date: new Date(scan.timestamp).toLocaleDateString(),
        threats: scan.summary.totalThreats,
        clean: scan.summary.cleanFiles,
        suspicious: scan.summary.suspiciousFiles,
        dangerous: scan.summary.dangerousFiles + scan.summary.criticalFiles,
      }));
  }, [history]);

  // Risk heatmap data (Top risky files)
  const riskHeatmap = useMemo(() => {
    return results
      .filter((r) => r.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map((r) => ({
        name: r.name.length > 30 ? r.name.substring(0, 27) + '...' : r.name,
        score: r.riskScore,
        level: r.threatLevel,
      }));
  }, [results]);

  const renderCustomTooltip = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{payload[0].name}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.dataKey}: {entry.value}
            {entry.payload.percentage && ` (${entry.payload.percentage}%)`}
          </p>
        ))}
      </div>
    );
  };

  if (results.length === 0 && history.length === 0) {
    return (
      <div className="statistics-charts-empty">
        <p>📊 No data available for visualization</p>
        <p className="empty-hint">Scan some files to see statistics</p>
      </div>
    );
  }

  return (
    <div className="statistics-charts">
      {showPie && results.length > 0 && (
        <div className="chart-section">
          <h3 className="chart-title">🎯 Threat Level Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={threatDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name} (${percentage}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {threatDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={renderCustomTooltip} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {showPie && results.length > 0 && (
        <div className="chart-section">
          <h3 className="chart-title">📂 File Category Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name} (${percentage}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={renderCustomTooltip} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {showBar && directoryStats.length > 0 && (
        <div className="chart-section chart-full-width">
          <h3 className="chart-title">📁 Top Directories by File Status</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={directoryStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="directory" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip content={renderCustomTooltip} />
              <Legend />
              <Bar dataKey="clean" stackId="a" fill={THREAT_COLORS[ThreatLevel.SAFE]} />
              <Bar
                dataKey="suspicious"
                stackId="a"
                fill={THREAT_COLORS[ThreatLevel.SUSPICIOUS]}
              />
              <Bar
                dataKey="dangerous"
                stackId="a"
                fill={THREAT_COLORS[ThreatLevel.DANGEROUS]}
              />
              <Bar
                dataKey="critical"
                stackId="a"
                fill={THREAT_COLORS[ThreatLevel.CRITICAL]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showLine && scanTimeline.length > 0 && (
        <div className="chart-section chart-full-width">
          <h3 className="chart-title">📈 Scan History Timeline</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={scanTimeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip content={renderCustomTooltip} />
              <Legend />
              <Line
                type="monotone"
                dataKey="threats"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="clean"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="suspicious"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="dangerous"
                stroke="#991b1b"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {showHeatmap && riskHeatmap.length > 0 && (
        <div className="chart-section chart-full-width">
          <h3 className="chart-title">🔥 Risk Score Heatmap (Top 10 Risky Files)</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={riskHeatmap} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={200} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="custom-tooltip">
                      <p className="tooltip-label">{data.name}</p>
                      <p style={{ color: THREAT_COLORS[data.level as ThreatLevel] }}>
                        Risk Score: {data.score}/100
                      </p>
                      <p>Level: {data.level}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="score">
                {riskHeatmap.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={THREAT_COLORS[entry.level as ThreatLevel]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {results.length > 0 && (
        <div className="chart-section chart-full-width">
          <h3 className="chart-title">📊 Summary Statistics</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{results.length}</div>
              <div className="stat-label">Total Files</div>
            </div>
            <div className="stat-item stat-success">
              <div className="stat-value">
                {results.filter((r) => r.threatLevel === ThreatLevel.SAFE).length}
              </div>
              <div className="stat-label">Clean</div>
            </div>
            <div className="stat-item stat-warning">
              <div className="stat-value">
                {results.filter((r) => r.threatLevel === ThreatLevel.SUSPICIOUS).length}
              </div>
              <div className="stat-label">Suspicious</div>
            </div>
            <div className="stat-item stat-danger">
              <div className="stat-value">
                {results.filter((r) => r.threatLevel === ThreatLevel.DANGEROUS).length}
              </div>
              <div className="stat-label">Dangerous</div>
            </div>
            <div className="stat-item stat-critical">
              <div className="stat-value">
                {results.filter((r) => r.threatLevel === ThreatLevel.CRITICAL).length}
              </div>
              <div className="stat-label">Critical</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">
                {results.reduce((sum, r) => sum + r.threats.length, 0)}
              </div>
              <div className="stat-label">Total Threats</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatisticsCharts;
