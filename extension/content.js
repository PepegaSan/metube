function normalizeStorageKey(href) {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return `youtube:${id}`;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `youtube:${id}`;
    }
    u.hash = '';
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return href;
  }
}

function pageUrlForMeTube(href) {
  try {
    const u = new URL(href);
    u.hash = '';
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      u.searchParams.delete('t');
      u.searchParams.delete('start');
    }
    return u.toString();
  } catch {
    return href;
  }
}

function formatClipTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getActiveVideo() {
  const candidates = Array.from(document.querySelectorAll('video')).filter(
    (v) => v.readyState >= 1,
  );
  if (!candidates.length) {
    return null;
  }
  return candidates.reduce((best, v) => {
    const area = v.clientWidth * v.clientHeight;
    const bestArea = best.clientWidth * best.clientHeight;
    return area > bestArea ? v : best;
  });
}

/** Survives popup close — lives in this tab's content script. */
let pendingStart = null;

function storageKey() {
  return normalizeStorageKey(location.href);
}

function pendingStorageItemKey() {
  return `pending:${storageKey()}`;
}

function loadPendingFromStorage() {
  const key = pendingStorageItemKey();
  return chrome.storage.local.get(key).then((data) => {
    const value = data[key];
    return typeof value === 'string' && value ? value : null;
  });
}

function savePendingToStorage(value) {
  const key = pendingStorageItemKey();
  if (value) {
    return chrome.storage.local.set({ [key]: value });
  }
  return chrome.storage.local.remove(key);
}

function ensurePendingLoaded() {
  if (pendingStart) {
    return Promise.resolve(pendingStart);
  }
  return loadPendingFromStorage().then((stored) => {
    pendingStart = stored;
    return pendingStart;
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'getVideoState') {
    const pageUrl = pageUrlForMeTube(location.href);
    const pageKey = storageKey();
    ensurePendingLoaded().then((pending) => {
      const video = getActiveVideo();
      if (!video) {
        sendResponse({
          ok: false,
          error: 'no_video',
          pageUrl,
          pageKey,
          pendingStart: pending,
        });
        return;
      }
      sendResponse({
        ok: true,
        currentTime: video.currentTime,
        duration: video.duration,
        formatted: formatClipTime(video.currentTime),
        pageUrl,
        pageKey,
        pendingStart: pending,
      });
    });
    return true;
  }

  if (msg?.action === 'markStart') {
    const video = getActiveVideo();
    if (!video) {
      sendResponse({ ok: false, error: 'no_video' });
      return true;
    }
    pendingStart = formatClipTime(video.currentTime);
    savePendingToStorage(pendingStart).then(() => {
      sendResponse({
        ok: true,
        pendingStart,
        pageUrl: pageUrlForMeTube(location.href),
        pageKey: storageKey(),
      });
    });
    return true;
  }

  if (msg?.action === 'markEnd') {
    ensurePendingLoaded().then((start) => {
      const video = getActiveVideo();
      if (!video) {
        sendResponse({ ok: false, error: 'no_video' });
        return;
      }
      if (!start) {
        sendResponse({ ok: false, error: 'no_pending_start' });
        return;
      }
      const end = formatClipTime(video.currentTime);
      const clip = { start, end };
      pendingStart = null;
      savePendingToStorage(null).then(() => {
        sendResponse({
          ok: true,
          clip,
          pageUrl: pageUrlForMeTube(location.href),
          pageKey: storageKey(),
        });
      });
    });
    return true;
  }

  if (msg?.action === 'clearPending') {
    pendingStart = null;
    savePendingToStorage(null).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
