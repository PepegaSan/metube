export interface ImportClip {
  start: string;
  end: string;
}

export interface MetubeImportParams {
  url: string;
  clips: ImportClip[];
  mergeClips?: boolean;
}

/** Parse `?url=…&clips=…` from extension deep links. */
export function parseMetubeImportFromSearch(search: string): MetubeImportParams | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw.trim()) {
    return null;
  }
  const params = new URLSearchParams(raw);
  const url = params.get('url')?.trim();
  if (!url) {
    return null;
  }
  const clips = parseClipsParam(params.get('clips'));
  const mergeRaw = params.get('merge')?.trim().toLowerCase();
  const mergeClips = mergeRaw === '1' || mergeRaw === 'true' || mergeRaw === 'yes';
  return { url, clips, mergeClips: mergeClips || undefined };
}

function parseClipsParam(raw: string | null): ImportClip[] {
  if (!raw?.trim()) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
        .map((item) => ({
          start: String(item['start'] ?? '').trim(),
          end: String(item['end'] ?? '').trim(),
        }))
        .filter((c) => c.start && c.end);
    } catch {
      return [];
    }
  }
  return trimmed
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const dash = part.indexOf('-');
      if (dash <= 0) {
        return { start: '', end: '' };
      }
      return {
        start: part.slice(0, dash).trim(),
        end: part.slice(dash + 1).trim(),
      };
    })
    .filter((c) => c.start && c.end);
}

export function buildMetubeImportSearch(
  url: string,
  clips: ImportClip[],
  options?: { mergeClips?: boolean },
): string {
  const params = new URLSearchParams();
  params.set('url', url);
  if (clips.length) {
    params.set('clips', JSON.stringify(clips));
  }
  if (options?.mergeClips) {
    params.set('merge', '1');
  }
  return params.toString();
}
