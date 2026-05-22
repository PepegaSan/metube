import { buildMeTubeOpenUrl } from './lib/metube-api.js';
import { loadSettings, saveClipDraft, loadAllClipDrafts } from './lib/storage.js';

const statusEl = document.getElementById('status');
const pageUrlEl = document.getElementById('pageUrl');
const pendingEl = document.getElementById('pending');
const clipListEl = document.getElementById('clipList');
const btnStart = document.getElementById('btnStart');
const btnEnd = document.getElementById('btnEnd');
const btnOpen = document.getElementById('btnOpen');
const btnQueueEach = document.getElementById('btnQueueEach');
const btnQueueMerge = document.getElementById('btnQueueMerge');
const optionsLink = document.getElementById('optionsLink');

/** @type {string | null} */
let pageUrl = null;
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

async function getVideoState(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: 'getVideoState' });
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
  const hasVideo = btnStart.disabled === false;
  const hasClips = clips.length > 0;
  btnOpen.disabled = !pageUrl || !hasClips;
  btnQueueEach.disabled = !pageUrl || !hasClips;
  btnQueueMerge.disabled = !pageUrl || clips.length < 2;
  pendingEl.textContent = pendingStart ? `Start: ${pendingStart}` : '';
}

async function persistClips() {
  if (pageUrl) {
    await saveClipDraft(pageUrl, clips);
  }
}

async function refresh() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('Kein aktiver Tab.');
    return;
  }
  const state = await getVideoState(tab.id);
  if (!state?.ok) {
    setStatus('Kein Video auf dieser Seite (oder Seite neu laden).');
    btnStart.disabled = true;
    btnEnd.disabled = true;
    pageUrl = tab.url ? normalizeUrl(tab.url) : null;
    return;
  }
  pageUrl = state.pageUrl;
  pageUrlEl.hidden = false;
  pageUrlEl.textContent = pageUrl;
  setStatus(`Aktuell: ${state.formatted}`);
  btnStart.disabled = false;
  btnEnd.disabled = !pendingStart;
  const drafts = await loadAllClipDrafts();
  clips = pageUrl && drafts[pageUrl] ? [...drafts[pageUrl]] : [];
  renderClips();
  updateButtons();
}

function normalizeUrl(href) {
  try {
    const u = new URL(href);
    u.hash = '';
    return u.toString();
  } catch {
    return href;
  }
}

btnStart.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const state = await getVideoState(tab.id);
  if (!state?.ok) return;
  pendingStart = state.formatted;
  btnEnd.disabled = false;
  updateButtons();
});

btnEnd.addEventListener('click', async () => {
  if (!pendingStart) return;
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const state = await getVideoState(tab.id);
  if (!state?.ok) return;
  const end = state.formatted;
  clips.push({ start: pendingStart, end });
  pendingStart = null;
  await persistClips();
  renderClips();
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
