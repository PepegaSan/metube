import { describe, expect, it } from 'vitest';
import { buildMetubeImportSearch, parseMetubeImportFromSearch } from './metube-import-query';

describe('parseMetubeImportFromSearch', () => {
  it('parses url and single clip from JSON clips', () => {
    const clips = encodeURIComponent(JSON.stringify([{ start: '1:30', end: '2:00' }]));
    const result = parseMetubeImportFromSearch(`?url=${encodeURIComponent('https://youtu.be/x')}&clips=${clips}`);
    expect(result?.url).toBe('https://youtu.be/x');
    expect(result?.clips).toEqual([{ start: '1:30', end: '2:00' }]);
  });

  it('parses compact clips syntax', () => {
    const result = parseMetubeImportFromSearch(
      `?url=https://example.com/v&clips=${encodeURIComponent('1:30-2:00;3:10-3:25')}`,
    );
    expect(result?.clips).toHaveLength(2);
    expect(result?.clips[1]).toEqual({ start: '3:10', end: '3:25' });
  });

  it('returns null without url', () => {
    expect(parseMetubeImportFromSearch('?clips=1:00-2:00')).toBeNull();
  });
});

describe('buildMetubeImportSearch', () => {
  it('round-trips clips', () => {
    const clips = [{ start: '0:05', end: '0:10' }];
    const search = buildMetubeImportSearch('https://a.test/v', clips, { mergeClips: true });
    const parsed = parseMetubeImportFromSearch(`?${search}`);
    expect(parsed?.mergeClips).toBe(true);
    expect(parsed?.clips).toEqual(clips);
  });
});
