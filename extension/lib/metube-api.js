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

/**
 * Build an add/add-batch body for a sniffed stream URL, optionally with cuts.
 * The captured Referer and User-Agent are forwarded to yt-dlp via http_headers
 * so token/referer-gated hosters (StreamSB, Streamtape, ...) accept the request
 * instead of returning 403. Clips marked inside the hoster iframe are applied
 * as clip_start/clip_end (single) or as a clips batch (multiple).
 *
 * Requires the MeTube server to run with ALLOW_YTDL_OPTIONS_OVERRIDES=true,
 * otherwise the http_headers override is rejected.
 *
 * @param {import('./storage.js').ExtensionSettings} settings
 * @param {{ url: string, referer?: string, origin?: string, userAgent?: string }} stream
 * @param {string|null} [pageUrl]
 * @param {{ start: string, end: string }[]} [clips]
 * @param {boolean} [mergeClips]
 */
export function buildStreamQueueBody(settings, stream, pageUrl, clips = [], mergeClips = false) {
  const headers = {};
  const referer = stream.referer || stream.origin || pageUrl || '';
  if (referer) headers.Referer = referer;
  if (stream.userAgent) headers['User-Agent'] = stream.userAgent;
  const overrides = {};
  if (Object.keys(headers).length) overrides.http_headers = headers;

  // Many iframe hosters serve HLS without an #EXT-X-ENDLIST tag, so yt-dlp
  // treats the playlist as live: the native downloader miscounts bytes
  // ("more expected") and ffmpeg section cuts abort with exit code 183.
  // Routing HLS through the ffmpeg downloader with mpegts is yt-dlp's own
  // recommended remedy and makes both full and clipped downloads work.
  const isHls = stream.kind === 'hls' || /\.m3u8(\?|$)/i.test(stream.url || '');
  if (isHls) {
    overrides.hls_use_mpegts = true;
    overrides.external_downloader = { m3u8: 'ffmpeg' };
  }

  const body = {
    url: stream.url,
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
    ytdl_options_overrides: Object.keys(overrides).length ? JSON.stringify(overrides) : '',
  };

  const validClips = Array.isArray(clips) ? clips.filter((c) => c && c.start && c.end) : [];

  if (validClips.length === 0) {
    return { endpoint: 'add', body };
  }
  if (validClips.length === 1 && !mergeClips) {
    body.clip_start = validClips[0].start;
    body.clip_end = validClips[0].end;
    return { endpoint: 'add', body };
  }
  return {
    endpoint: 'add-batch',
    body: {
      ...body,
      clip_start: null,
      clip_end: null,
      merge_clips: mergeClips,
      clips: validClips.map((c) => ({ start: c.start, end: c.end })),
    },
  };
}
