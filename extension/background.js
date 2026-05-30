import { apiUrl, buildQueueBody, buildStreamQueueBody } from './lib/metube-api.js';
import { loadSettings } from './lib/storage.js';

// ---------------------------------------------------------------------------
// Media sniffer: observes network requests per tab and remembers detected
// stream manifests / media files together with the Referer + User-Agent that
// the browser actually used. This is the part that works for iframe hosters
// (StreamSB, Streamtape, ...) where the <video>/source code approach fails.
// ---------------------------------------------------------------------------

const SESSION_KEY = 'detectedStreams';
const CLIPS_SESSION_KEY = 'tabClips';
const MAX_PER_TAB = 30;
const BADGE_COLOR = '#0d6efd';

// tabId -> { clips, pageUrl, pageKey, ts }. Lets the popup attach cuts marked
// inside a cross-origin hoster iframe to a sniffed stream URL.
let tabClips = {};

chrome.storage.session
  .get(CLIPS_SESSION_KEY)
  .then((stored) => {
    const persisted = stored[CLIPS_SESSION_KEY] || {};
    for (const [tabId, value] of Object.entries(persisted)) {
      if (!tabClips[tabId]) tabClips[tabId] = value;
    }
  })
  .catch(() => {});

let clipsPersistTimer = null;
function persistClipsSoon() {
  if (clipsPersistTimer) return;
  clipsPersistTimer = setTimeout(() => {
    clipsPersistTimer = null;
    chrome.storage.session.set({ [CLIPS_SESSION_KEY]: tabClips }).catch(() => {});
  }, 250);
}

// Source of truth in the (possibly short-lived) service worker. Listeners are
// registered synchronously below (MV3 requirement), while the cache is
// rehydrated asynchronously from chrome.storage.session after a cold start.
let memCache = {};

chrome.storage.session
  .get(SESSION_KEY)
  .then((stored) => {
    const persisted = stored[SESSION_KEY] || {};
    // Merge so captures that arrived before rehydrate completes survive.
    for (const [tabId, list] of Object.entries(persisted)) {
      if (!memCache[tabId]) memCache[tabId] = list;
    }
  })
  .catch(() => {});

try {
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
} catch {
  /* ignore */
}

let persistTimer = null;
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    chrome.storage.session.set({ [SESSION_KEY]: memCache }).catch(() => {});
  }, 250);
}

function streamKind(url) {
  let path;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (path.endsWith('.f4m')) return 'hds';
  if (/\.(mp4|webm|mkv|mov)$/.test(path)) return 'file';
  if (/\.(m4a|mp3|aac|ogg)$/.test(path)) return 'audio';
  return null;
}

function headersToMap(requestHeaders) {
  const map = {};
  if (Array.isArray(requestHeaders)) {
    for (const h of requestHeaders) {
      if (h && h.name) map[h.name.toLowerCase()] = h.value || '';
    }
  }
  return map;
}

function updateBadge(tabId) {
  if (tabId == null || tabId < 0) return;
  const count = (memCache[tabId] || []).length;
  try {
    chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
  } catch {
    /* ignore */
  }
}

function captureRequest(details) {
  const { tabId, url, requestHeaders, type } = details;
  if (tabId == null || tabId < 0) return;
  const kind = streamKind(url);
  if (!kind) return;
  const headers = headersToMap(requestHeaders);
  const list = memCache[tabId] ? memCache[tabId] : [];
  if (list.some((e) => e.url === url)) return;
  list.unshift({
    url,
    kind,
    type: type || '',
    referer: headers['referer'] || '',
    origin: headers['origin'] || '',
    userAgent: headers['user-agent'] || '',
    ts: Date.now(),
  });
  memCache[tabId] = list.slice(0, MAX_PER_TAB);
  persistSoon();
  updateBadge(tabId);
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    try {
      captureRequest(details);
    } catch {
      /* never break the request */
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders'],
);

// New top-level navigation → forget the old tab's captures and clips.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type === 'main_frame' && details.tabId >= 0) {
      memCache[details.tabId] = [];
      persistSoon();
      updateBadge(details.tabId);
      if (tabClips[details.tabId]) {
        delete tabClips[details.tabId];
        persistClipsSoon();
      }
    }
  },
  { urls: ['<all_urls>'], types: ['main_frame'] },
);

chrome.tabs.onRemoved.addListener((tabId) => {
  if (memCache[tabId]) {
    delete memCache[tabId];
    persistSoon();
  }
  if (tabClips[tabId]) {
    delete tabClips[tabId];
    persistClipsSoon();
  }
});

function detectedForTab(tabId) {
  return tabId != null && memCache[tabId] ? memCache[tabId] : [];
}

function clipsForTab(tabId) {
  return tabId != null && tabClips[tabId] ? tabClips[tabId] : null;
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function queueStream(stream, pageUrl, clips, mergeClips) {
  if (!stream?.url) {
    return { ok: false, error: 'no_stream' };
  }
  const settings = await loadSettings();
  const { endpoint, body } = buildStreamQueueBody(
    settings,
    stream,
    pageUrl,
    Array.isArray(clips) ? clips : [],
    !!mergeClips,
  );
  return postToMeTube(settings, endpoint, body);
}

async function postToMeTube(settings, endpoint, body) {
  const url = apiUrl(settings.metubeBaseUrl, endpoint);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: text || res.statusText };
  }
  return { ok: true, body: text };
}

async function sendToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('Receiving end does not exist')) {
      return { ok: false, error: 'no_content_script', hint: 'reload_tab' };
    }
    return { ok: false, error: msg };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'queueClips') {
    queueClips(msg.pageUrl, msg.clips, msg.mergeClips)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg?.action === 'reportClips') {
    const tabId = _sender?.tab?.id;
    if (tabId != null && tabId >= 0) {
      const clips = Array.isArray(msg.clips) ? msg.clips : [];
      if (clips.length) {
        tabClips[tabId] = {
          clips,
          pageUrl: msg.pageUrl || '',
          pageKey: msg.pageKey || '',
          ts: Date.now(),
        };
      } else if (tabClips[tabId]) {
        // Only the reporting frame's clips count; clear if it emptied them.
        delete tabClips[tabId];
      }
      persistClipsSoon();
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.action === 'getTabClips') {
    (async () => {
      const tabId = msg.tabId ?? (await getActiveTabId());
      sendResponse({ ok: true, tabClips: clipsForTab(tabId) });
    })();
    return true;
  }

  if (msg?.action === 'removeTabClip') {
    (async () => {
      const tabId = msg.tabId ?? (await getActiveTabId());
      const entry = tabId != null ? tabClips[tabId] : null;
      if (!entry || !Array.isArray(entry.clips)) {
        sendResponse({ ok: false, error: 'no_clips', clips: [] });
        return;
      }
      const index = Number(msg.index);
      const clips = entry.clips.slice();
      if (!Number.isInteger(index) || index < 0 || index >= clips.length) {
        sendResponse({ ok: false, error: 'bad_index', clips });
        return;
      }
      const pageKey = entry.pageKey || '';
      clips.splice(index, 1);
      if (clips.length) {
        entry.clips = clips;
        entry.ts = Date.now();
      } else {
        delete tabClips[tabId];
      }
      persistClipsSoon();
      // Best-effort: let the owning (possibly iframe) content script drop it
      // from its persistent draft too, so it stays gone across reloads.
      try {
        chrome.tabs.sendMessage(tabId, { action: 'removeClip', pageKey, index });
      } catch {
        /* frame may be gone; background copy is already updated */
      }
      sendResponse({ ok: true, clips });
    })();
    return true;
  }

  if (msg?.action === 'getDetectedStreams') {
    (async () => {
      const tabId = msg.tabId ?? (await getActiveTabId());
      sendResponse({ ok: true, streams: detectedForTab(tabId) });
    })();
    return true;
  }

  if (msg?.action === 'queueStream') {
    queueStream(msg.stream, msg.pageUrl, msg.clips, msg.mergeClips)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg?.action === 'clearDetectedStreams') {
    (async () => {
      const tabId = msg.tabId ?? (await getActiveTabId());
      if (tabId != null) {
        memCache[tabId] = [];
        persistSoon();
        updateBadge(tabId);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  const tabActions = ['getVideoState', 'markStart', 'markEnd', 'clearPending', 'showBar'];
  if (tabActions.includes(msg?.action)) {
    (async () => {
      const tabId = msg.tabId ?? (await getActiveTabId());
      if (!tabId) {
        sendResponse({ ok: false, error: 'no_tab' });
        return;
      }
      const result = await sendToTab(tabId, { action: msg.action });
      sendResponse(result);
    })();
    return true;
  }

  return false;
});

async function queueClips(pageUrl, clips, mergeClips) {
  if (!clips?.length) {
    return { ok: false, error: 'no_clips' };
  }
  const settings = await loadSettings();
  const { endpoint, body } = buildQueueBody(settings, pageUrl, clips, !!mergeClips);
  return postToMeTube(settings, endpoint, body);
}
