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

function pageUrlForMeTube() {
  try {
    const u = new URL(location.href);
    u.hash = '';
    return u.toString();
  } catch {
    return location.href;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'getVideoState') {
    const video = getActiveVideo();
    if (!video) {
      sendResponse({ ok: false, error: 'no_video' });
      return;
    }
    sendResponse({
      ok: true,
      currentTime: video.currentTime,
      duration: video.duration,
      formatted: formatClipTime(video.currentTime),
      pageUrl: pageUrlForMeTube(),
    });
    return;
  }
  return false;
});
