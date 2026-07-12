import { describe, it, expect } from 'vitest';
import { parseAudioStreams, audioTrackList, audioTrackParam, parseAudioTrackParam, transcodeMapArgs } from './audio-probe';

const MKV_STDERR = `Input #0, matroska,webm, from 'movie.mkv':
  Metadata:
    title           : Some Movie
  Duration: 01:52:13.12, start: 0.000000, bitrate: 8000 kb/s
  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x800, 23.98 fps
  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s (default)
    Metadata:
      title           : English Stereo
  Stream #0:2(rus): Audio: ac3, 48000 Hz, 5.1(side), fltp, 448 kb/s
    Metadata:
      title           : Русский (5.1)
  Stream #0:3(jpn): Audio: truehd, 48000 Hz, 7.1, s32 (24 bit)
  Stream #0:4(eng): Subtitle: subrip (default)
`;

// mkvmerge writes BCP-47 tags (LanguageIETF) that ffmpeg prints verbatim —
// dropping such a line would shift every later track's -map ordinal.
const BCP47_STDERR = `Input #0, matroska,webm, from 'dual.mkv':
  Stream #0:0: Video: h264, yuv420p, 1920x1080
  Stream #0:1(pt-BR): Audio: aac (LC), 48000 Hz, stereo, fltp (default)
  Stream #0:2(rus): Audio: ac3, 48000 Hz, 5.1(side), fltp, 448 kb/s
`;

const MP4_STDERR = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':
  Stream #0:0[0x1](und): Video: h264 (avc1 / 0x31637661), yuv420p, 1280x720
  Stream #0:1[0x2](und): Audio: aac (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 96 kb/s (default)
`;

describe('parseAudioStreams', () => {
  it('extracts every audio stream with aligned -map ordinals', () => {
    const tracks = parseAudioStreams(MKV_STDERR);
    expect(tracks.map((t) => t.aIndex)).toEqual([0, 1, 2]);
    expect(tracks.map((t) => t.lang)).toEqual(['eng', 'rus', 'jpn']);
    expect(tracks.map((t) => t.codec)).toEqual(['aac', 'ac3', 'truehd']);
  });

  it('keeps BCP-47 language tags (pt-BR) without shifting ordinals', () => {
    const tracks = parseAudioStreams(BCP47_STDERR);
    expect(tracks.map((t) => [t.aIndex, t.lang])).toEqual([[0, 'pt-BR'], [1, 'rus']]);
  });

  it('parses channels, default flag, and metadata titles', () => {
    const [en, ru, jp] = parseAudioStreams(MKV_STDERR);
    expect(en.channels).toBe('stereo');
    expect(en.isDefault).toBe(true);
    expect(en.title).toBe('English Stereo');
    expect(ru.channels).toBe('5.1(side)');
    expect(ru.isDefault).toBeUndefined();
    expect(ru.title).toBe('Русский (5.1)');
    expect(jp.channels).toBe('7.1');
    expect(jp.title).toBeUndefined();
  });

  it('ignores video and subtitle streams', () => {
    expect(parseAudioStreams(MKV_STDERR)).toHaveLength(3);
  });

  it('handles mp4-style [0x…] stream ids', () => {
    const tracks = parseAudioStreams(MP4_STDERR);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ aIndex: 0, lang: 'und', codec: 'aac', channels: 'stereo', isDefault: true });
  });

  it('returns an empty list for no-audio or garbage input', () => {
    expect(parseAudioStreams('')).toEqual([]);
    expect(parseAudioStreams('Stream #0:0: Video: h264')).toEqual([]);
  });
});

describe('audioTrackList', () => {
  it('prefers the metadata title, else composes lang · codec · channels', () => {
    const [en, , jp] = audioTrackList(parseAudioStreams(MKV_STDERR));
    expect(en.label).toBe('English Stereo');
    expect(jp.label).toBe('JPN · truehd · 7.1');
  });
});

describe('URL param round-trip', () => {
  it('audioTrackParam emits only for a valid non-negative integer', () => {
    expect(audioTrackParam(1)).toBe('&a=1');
    expect(audioTrackParam(0)).toBe('&a=0'); // falsy zero is a real track
    expect(audioTrackParam(undefined)).toBe('');
    expect(audioTrackParam(-1)).toBe('');
    expect(audioTrackParam(1.5)).toBe('');
  });

  it('parseAudioTrackParam mirrors it', () => {
    expect(parseAudioTrackParam('1')).toBe(1);
    expect(parseAudioTrackParam('0')).toBe(0);
    expect(parseAudioTrackParam(null)).toBeUndefined();
    expect(parseAudioTrackParam('-1')).toBeUndefined();
    expect(parseAudioTrackParam('abc')).toBeUndefined();
  });
});

describe('transcodeMapArgs', () => {
  it('is empty for default playback (auto-selection preserved)', () => {
    expect(transcodeMapArgs('video', undefined)).toEqual([]);
    expect(transcodeMapArgs('audio', undefined)).toEqual([]);
  });

  it('uses the optional video map so video-less containers do not hard-fail', () => {
    expect(transcodeMapArgs('video', 1)).toEqual(['-map', '0:v:0?', '-map', '0:a:1']);
  });

  it('maps only audio for audio files', () => {
    expect(transcodeMapArgs('audio', 2)).toEqual(['-map', '0:a:2']);
  });

  it('aligns with parseAudioStreams ordinals end-to-end', () => {
    const tracks = audioTrackList(parseAudioStreams(BCP47_STDERR));
    const rus = tracks.find((t) => t.lang === 'rus')!;
    expect(transcodeMapArgs('video', rus.index)).toContain('0:a:1');
  });
});
