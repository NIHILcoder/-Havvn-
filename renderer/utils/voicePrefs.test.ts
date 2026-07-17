import { describe, it, expect, afterEach } from 'vitest';
import { loadVoicePrefs, toVoiceSettings } from './voicePrefs';

// loadVoicePrefs reads localStorage; the tests run in Node, so stub it per case.
function stub(stored: Record<string, unknown> | null): void {
  (globalThis as any).localStorage = {
    getItem: () => (stored === null ? null : JSON.stringify(stored)),
    setItem: () => { /* not exercised */ },
  };
}
afterEach(() => { delete (globalThis as any).localStorage; });

describe('loadVoicePrefs — noiseSuppression mode migration', () => {
  it('defaults to enhanced when nothing is stored', () => {
    stub({});
    expect(loadVoicePrefs().noiseSuppressionMode).toBe('enhanced');
  });

  it('migrates the pre-2.20 boolean: true → enhanced (upgrade), false → off', () => {
    stub({ noiseSuppression: true });
    expect(loadVoicePrefs().noiseSuppressionMode).toBe('enhanced');
    stub({ noiseSuppression: false });
    expect(loadVoicePrefs().noiseSuppressionMode).toBe('off');
  });

  it('honors an explicit mode and lets it win over a stale boolean', () => {
    stub({ noiseSuppressionMode: 'standard' });
    expect(loadVoicePrefs().noiseSuppressionMode).toBe('standard');
    stub({ noiseSuppression: false, noiseSuppressionMode: 'enhanced' });
    expect(loadVoicePrefs().noiseSuppressionMode).toBe('enhanced');
  });

  it('falls back to enhanced for an unknown mode value', () => {
    stub({ noiseSuppressionMode: 'bogus' });
    expect(loadVoicePrefs().noiseSuppressionMode).toBe('enhanced');
  });

  it('carries the mode through toVoiceSettings', () => {
    stub({ noiseSuppressionMode: 'off' });
    expect(toVoiceSettings(loadVoicePrefs()).noiseSuppressionMode).toBe('off');
  });
});
