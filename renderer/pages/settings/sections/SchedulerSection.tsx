/**
 * Settings → Scheduler section, reworked to be actually useful.
 *
 * The scheduler engine (electron/scheduler/scheduler-engine.ts) applies
 * ScheduleEntry.speedLimit (KB/s, down + up) inside each window and restores
 * the user's defaults outside it — but the old UI never exposed speedLimit,
 * so every schedule users created was a silent no-op. This rewrite adds:
 *   - a per-entry speed-limit field with a "no effect" warning when unset,
 *   - a live "right now" status row (same day/midnight-wrap logic as the engine),
 *   - a 7-row week-at-a-glance strip showing every window as a mini-bar.
 *
 * Day mapping: ScheduleEntry.days uses JS getDay() numbering (0=Sunday), which
 * is what the engine checks against. dayNames from context is Monday-first, so
 * chip index i maps to engine day (i + 1) % 7. (The old UI passed the chip
 * index straight through — off by one vs the engine — but since no schedule
 * ever had a speedLimit, nothing observable breaks by fixing it.)
 */
import React, { useEffect, useState } from 'react';
import { useSettings } from '../SettingsContext';
import { SettingsCard, SettingRow, NumberField, StatusPill } from '../controls';
import { Button, Icon, Toggle } from '../../../components';
import { useTranslation } from '../../../utils/i18nContext';
import { ScheduleEntry } from '../../../../shared/types';

/** "HH:MM" → minutes since midnight (bad input → 0, matching engine leniency). */
const toMinutes = (hhmm: string): number => {
  const [h, m] = (hhmm || '').split(':').map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/**
 * The [start, end) minute segments a schedule paints on ONE of its days.
 * Mirrors the engine: start < end is a same-day window; start > end wraps past
 * midnight, so each selected day gets both the evening and the morning piece;
 * start == end is an empty window (the engine's `>= start && < end` never hits).
 */
const segmentsFor = (s: ScheduleEntry): Array<[number, number]> => {
  const a = toMinutes(s.startTime);
  const b = toMinutes(s.endTime);
  if (a === b) return [];
  return a < b ? [[a, b]] : [[a, 1440], [0, b]];
};

/** Exact client-side replica of the engine's "does this window match now?". */
const matchesNow = (s: ScheduleEntry, now: Date): boolean => {
  if (!s.days.includes(now.getDay())) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMinutes(s.startTime);
  const b = toMinutes(s.endTime);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
};

export const SchedulerSection: React.FC = () => {
  const { t } = useTranslation();
  const ctx = useSettings();
  const {
    schedulerEnabled,
    schedules,
    dayNames,
    handleSchedulerToggle,
    handleAddSchedule,
    handleRemoveSchedule,
    handleUpdateSchedule,
  } = ctx;

  // Tick every 30s so the "right now" pill and the today marker stay honest
  // while the page sits open (the engine itself polls every 60s).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeWindow = schedules.find((s) => matchesNow(s, now));
  const activeLimit = activeWindow?.speedLimit ?? 0;

  const renderStatusPill = () => {
    if (!activeWindow) return <StatusPill tone="muted">{t('settings.sched.idleNow')}</StatusPill>;
    if (activeLimit > 0) {
      return <StatusPill tone="ok">{`${t('settings.sched.limitedNow')} · ${activeLimit} KB/s`}</StatusPill>;
    }
    return <StatusPill tone="accent">{t('settings.sched.windowNoLimit')}</StatusPill>;
  };

  /** One horizontal mini-bar for a day: flex spacers + segments, no absolute pos. */
  const renderDayTrack = (engineDay: number) => {
    // Gather every segment any schedule paints on this day, tagging no-op
    // (limitless) windows so they render dimmed.
    const segs = schedules
      .filter((s) => s.days.includes(engineDay))
      .flatMap((s) =>
        segmentsFor(s).map(([a, b]) => ({ a, b, noop: !(s.speedLimit && s.speedLimit > 0) })),
      )
      .sort((x, y) => x.a - y.a);

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    segs.forEach((seg, i) => {
      const start = Math.max(seg.a, cursor); // clip overlaps instead of stacking
      if (start >= seg.b) return;
      if (start > cursor) {
        parts.push(<span key={`sp${i}`} className="sched-week-sp" style={{ width: `${((start - cursor) / 1440) * 100}%` }} />);
      }
      parts.push(
        <span
          key={`sg${i}`}
          className={`sched-week-seg${seg.noop ? ' noop' : ''}`}
          style={{ width: `${((seg.b - start) / 1440) * 100}%` }}
        />,
      );
      cursor = seg.b;
    });
    return <div className="sched-week-track">{parts}</div>;
  };

  return (
    <>
      <SettingsCard
        title={t('settings.scheduler')}
        icon="clock"
        description={t('settings.scheduler.sub')}
      >
        <SettingRow
          label={t('settings.schedEnable')}
          description={t('settings.sched.enable.desc')}
          control={
            <Toggle
              checked={schedulerEnabled}
              onChange={() => handleSchedulerToggle()}
              ariaLabel={t('settings.schedEnable')}
            />
          }
        />
        {schedulerEnabled && (
          <SettingRow
            label={t('settings.sched.status')}
            description={t('settings.sched.status.desc')}
            control={renderStatusPill()}
          />
        )}
      </SettingsCard>

      {schedulerEnabled && (
        <SettingsCard title={t('settings.card.schedules')} icon="calendar">
          {schedules.length === 0 ? (
            <div className="empty-state-compact">
              <Icon name="calendar" size={24} />
              <p>{t('settings.noSchedules')}</p>
            </div>
          ) : (
            <div className="sched-list">
              {schedules.map((schedule) => {
                const hasLimit = !!schedule.speedLimit && schedule.speedLimit > 0;
                return (
                  <div key={schedule.id} className="sched-entry">
                    <div className="sched-entry-top">
                      <div className="sched-days" role="group" aria-label={t('settings.card.schedules')}>
                        {dayNames.map((day, idx) => {
                          const engineDay = (idx + 1) % 7; // Mon-first labels → getDay() numbering
                          const active = schedule.days.includes(engineDay);
                          return (
                            <button
                              key={idx}
                              type="button"
                              className={`sched-day${active ? ' active' : ''}`}
                              aria-pressed={active}
                              onClick={() => {
                                const newDays = active
                                  ? schedule.days.filter((d) => d !== engineDay)
                                  : [...schedule.days, engineDay].sort((a, b) => a - b);
                                handleUpdateSchedule(schedule.id, { days: newDays });
                              }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="sched-del"
                        onClick={() => handleRemoveSchedule(schedule.id)}
                        aria-label={t('context.delete')}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>

                    <div className="sched-entry-fields">
                      <span className="sched-timepair">
                        <input
                          type="time"
                          className="sched-time"
                          value={schedule.startTime}
                          aria-label={t('settings.sched.start')}
                          onChange={(e) => handleUpdateSchedule(schedule.id, { startTime: e.target.value })}
                        />
                        <span className="sched-time-sep">—</span>
                        <input
                          type="time"
                          className="sched-time"
                          value={schedule.endTime}
                          aria-label={t('settings.sched.end')}
                          onChange={(e) => handleUpdateSchedule(schedule.id, { endTime: e.target.value })}
                        />
                      </span>
                      <NumberField
                        value={schedule.speedLimit ?? 0}
                        onChange={(v) => handleUpdateSchedule(schedule.id, { speedLimit: Math.max(0, Math.round(v)) })}
                        unit="KB/s"
                        min={0}
                        ariaLabel={t('settings.sched.limit')}
                      />
                      {!hasLimit && <StatusPill tone="accent">{t('settings.sched.noEffect')}</StatusPill>}
                    </div>
                    {!hasLimit && <p className="sched-hint">{t('settings.sched.limit.hint')}</p>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="sched-add">
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon name="plus" size={14} />}
              onClick={handleAddSchedule}
            >
              {t('settings.add')}
            </Button>
          </div>

          {schedules.length > 0 && (
            <div className="stg-sub">
              <div className="stg-row-label">
                <Icon name="activity" size={15} />
                <span>{t('settings.sched.week')}</span>
              </div>
              <div className="sched-week">
                {dayNames.map((name, idx) => {
                  const engineDay = (idx + 1) % 7;
                  return (
                    <div key={idx} className="sched-week-row">
                      <span className={`sched-week-day${engineDay === now.getDay() ? ' today' : ''}`}>
                        {name}
                      </span>
                      {renderDayTrack(engineDay)}
                    </div>
                  );
                })}
                <div className="sched-week-scale" aria-hidden="true">
                  <span>00:00</span>
                  <span>12:00</span>
                  <span>24:00</span>
                </div>
              </div>
            </div>
          )}

          <div className="settings-notice-compact">
            <Icon name="info" size={14} />
            <span>{t('settings.sched.saveNote')}</span>
          </div>
        </SettingsCard>
      )}
    </>
  );
};
