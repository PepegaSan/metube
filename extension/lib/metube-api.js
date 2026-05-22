/**
 * @param {string} baseUrl e.g. http://localhost:8081/
 * @param {string} path e.g. add-batch
 */
export function apiUrl(baseUrl, path) {
  const base = baseUrl.replace(/\/+$/, '') + '/';
  const p = path.replace(/^\/+/, '');
  return new URL(p, base).toString();
}

/**
 * @param {import('./storage.js').ExtensionSettings} settings
 * @param {string} pageUrl
 * @param {{ start: string, end: string }[]} clips
 * @param {boolean} mergeClips
 */
export function buildQueueBody(settings, pageUrl, clips, mergeClips) {
  const body = {
    url: pageUrl,
    download_type: settings.downloadType,
    codec: settings.codec,
    quality: settings.quality,
    format: settings.format,
    folder: settings.folder,
    custom_name_prefix: settings.customNamePrefix,
    playlist_item_limit: settings.playlistItemLimit,
    auto_start: settings.autoStart,
    split_by_chapters: false,
    chapter_template: '',
    subtitle_language: settings.subtitleLanguage,
    subtitle_mode: settings.subtitleMode,
    ytdl_options_presets: [],
    ytdl_options_overrides: '',
  };
  if (clips.length === 1 && !mergeClips) {
    body.clip_start = clips[0].start;
    body.clip_end = clips[0].end;
    return { endpoint: 'add', body };
  }
  return {
    endpoint: 'add-batch',
    body: {
      ...body,
      clip_start: null,
      clip_end: null,
      merge_clips: mergeClips,
      clips: clips.map((c) => ({ start: c.start, end: c.end })),
    },
  };
}

function encodeImportHash(payload) {
  const json = JSON.stringify(payload);
  const b64 = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `#mt=${b64}`;
}

/**
 * Open MeTube with clips prefilled (#mt= base64 JSON — reliable with PWA/service worker).
 * @param {string} baseUrl
 * @param {string} pageUrl
 * @param {{ start: string, end: string }[]} clips
 * @param {{ mergeClips?: boolean }} [opts]
 */
export function buildMeTubeOpenUrl(baseUrl, pageUrl, clips, opts = {}) {
  const root = baseUrl.replace(/\/+$/, '') + '/';
  const payload = { url: pageUrl, clips, merge: !!opts.mergeClips };
  return root + encodeImportHash(payload);
}
