import { apiUrl, buildQueueBody } from './lib/metube-api.js';
import { loadSettings } from './lib/storage.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'queueClips') {
    queueClips(msg.pageUrl, msg.clips, msg.mergeClips)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
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
