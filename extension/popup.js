import { buildMeTubeOpenUrl } from './lib/metube-api.js';
import { loadSettings, saveClipDraft, loadClipDraft } from './lib/storage.js';

const statusEl = document.getElementById('status');
const pageUrlEl = document.getElementById('pageUrl');
const pendingEl = document.getElementById('pending');
const clipListEl = document.getElementById('clipList');
const btnStart = document.getElementById('btnStart');
const btnEnd = document.getElementById('btnEnd');
const btnOpen = document.getElementById('btnOpen');
const btnQueueEach = document.getElementById('btnQueueEach');
const btnQueueMerge = document.getElementById('btnQueueMerge');
const btnCancelPending = document.getElementById('btnCancelPending');
const optionsLink = document.getElementById('optionsLink');

/** MeTube download URL */
let pageUrl = null;
/** Stable draft key (youtube:ID, etc.) */
let pageKey = null;
/** @type {{ start: string, end: string }[]} */
let clips = [];
/** @type {string | null} */
let pendingStart = null;

optionsLink.href = chrome.runtime.getURL('options.html');
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return { ok: false, error: 'no_content_script' };
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function renderClips() {
  clipListEl.innerHTML = '';
  clips.forEach((clip, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${clip.start} → ${clip.end}</span>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.title = 'Zeile entfernen';
    del.addEventListener('click', async () => {
      clips.splice(index, 1);
      await persistClips();
      renderClips();
      updateButtons();
    });
    li.appendChild(del);
    clipListEl.appendChild(li);
  });
}

function updateButtons() {
  const hasClips = clips.length > 0;
  btnOpen.disabled = !pageUrl || !hasClips;
  btnQueueEach.disabled = !pageUrl || !hasClips;
  btnQueueMerge.disabled = !pageUrl || clips.length < 2;
  if (btnCancelPending) {
    btnCancelPending.hidden = !pendingStart;
    btnCancelPending.disabled = !pendingStart;
  }
  btnEnd.disabled = !pendingStart;
  pendingEl.textContent = pendingStart
    ? `Start: ${pendingStart} — Video abspielen, Popup erneut öffnen, dann Ende setzen`
    : '';
}

async function persistClips() {
  if (pageKey) {
    await saveClipDraft(pageKey, clips);
  }
}

function applyState(state) {
  if (state.pageUrl) {
    pageUrl = state.pageUrl;
    pageUrlEl.hidden = false;
    pageUrlEl.textContent = pageUrl;
  }
  if (state.pageKey) {
    pageKey = state.pageKey;
  }
  if (state.pendingStart) {
    pendingStart = state.pendingStart;
  }
}

async function refresh() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('Kein aktiver Tab.');
    return;
  }

  const state = await sendTabMessage(tab.id, { action: 'getVideoState' });

  if (state?.pageKey) {
    pageKey = state.pageKey;
  } else if (tab.url) {
    pageKey = null;
  }

  if (state?.pageUrl) {
    pageUrl = state.pageUrl;
    pageUrlEl.hidden = false;
    pageUrlEl.textContent = pageUrl;
  } else if (tab.url && !tab.url.startsWith('chrome')) {
    pageUrl = tab.url;
    pageUrlEl.hidden = false;
    pageUrlEl.textContent = pageUrl;
  }

  pendingStart = state?.pendingStart || null;

  if (pageKey) {
    clips = await loadClipDraft(pageKey);
  }

  if (state?.ok) {
    setStatus(`Aktuell: ${state.formatted}`);
    btnStart.disabled = false;
  } else if (pendingStart) {
    setStatus('Start gespeichert — Video abspielen, dann Ende setzen.');
    btnStart.disabled = false;
  } else {
    setStatus('Kein Video auf dieser Seite (Seite einmal neu laden).');
    btnStart.disabled = true;
  }

  renderClips();
  updateButtons();
}

btnStart.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const res = await sendTabMessage(tab.id, { action: 'markStart' });
  if (!res?.ok) {
    setStatus('Konnte Start nicht setzen — Video läuft?');
    return;
  }
  applyState(res);
  updateButtons();
});

btnEnd.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const res = await sendTabMessage(tab.id, { action: 'markEnd' });
  if (!res?.ok) {
    if (res?.error === 'no_pending_start') {
      setStatus('Kein Start gespeichert — zuerst Start setzen.');
    } else {
      setStatus('Konnte Ende nicht setzen.');
    }
    return;
  }
  if (res.clip) {
    clips.push(res.clip);
  }
  pendingStart = null;
  applyState(res);
  await persistClips();
  renderClips();
  updateButtons();
});

btnCancelPending?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    await sendTabMessage(tab.id, { action: 'clearPending' });
  }
  pendingStart = null;
  updateButtons();
});

btnOpen.addEventListener('click', async () => {
  const settings = await loadSettings();
  const url = buildMeTubeOpenUrl(settings.metubeBaseUrl, pageUrl, clips);
  chrome.tabs.create({ url });
});

btnQueueEach.addEventListener('click', () => sendQueue(false));
btnQueueMerge.addEventListener('click', () => sendQueue(true));

async function sendQueue(mergeClips) {
  setStatus('Sende an MeTube…');
  const result = await chrome.runtime.sendMessage({
    action: 'queueClips',
    pageUrl,
    clips,
    mergeClips,
  });
  if (result?.ok) {
    setStatus('In der MeTube-Queue.');
  } else {
    setStatus(`Fehler: ${result?.error || 'unbekannt'}`);
  }
}

refresh();
