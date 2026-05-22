/** @typedef {object} ExtensionSettings
 * @property {string} metubeBaseUrl
 * @property {string} downloadType
 * @property {string} codec
 * @property {string} quality
 * @property {string} format
 * @property {string} folder
 * @property {string} customNamePrefix
 * @property {number} playlistItemLimit
 * @property {boolean} autoStart
 * @property {string} subtitleLanguage
 * @property {string} subtitleMode
 */

export const DEFAULT_SETTINGS = {
  metubeBaseUrl: 'http://localhost:8081/',
  downloadType: 'video',
  codec: 'auto',
  quality: 'best',
  format: 'any',
  folder: '',
  customNamePrefix: '',
  playlistItemLimit: 0,
  autoStart: true,
  subtitleLanguage: 'en',
  subtitleMode: 'prefer_manual',
};

/** @returns {Promise<ExtensionSettings>} */
export async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data };
}

/** @param {Partial<ExtensionSettings>} patch */
export async function saveSettings(patch) {
  await chrome.storage.sync.set(patch);
}

/** Clip list keyed by page URL for the current tab session in popup. */
const CLIPS_KEY = 'clipDraftByUrl';
/** In-point not yet paired with end — survives popup close. */
const PENDING_START_KEY = 'pendingStartByUrl';

/** @returns {Promise<Record<string, { start: string, end: string }[]>>} */
export async function loadAllClipDrafts() {
  const data = await chrome.storage.session.get(CLIPS_KEY);
  return data[CLIPS_KEY] || {};
}

/** @param {string} pageUrl @param {{ start: string, end: string }[]} clips */
export async function saveClipDraft(pageUrl, clips) {
  const all = await loadAllClipDrafts();
  all[pageUrl] = clips;
  await chrome.storage.session.set({ [CLIPS_KEY]: all });
}

/** @param {string} pageUrl */
export async function loadPendingStart(pageUrl) {
  const data = await chrome.storage.session.get(PENDING_START_KEY);
  const map = data[PENDING_START_KEY] || {};
  const value = map[pageUrl];
  return typeof value === 'string' && value ? value : null;
}

/** @param {string} pageUrl @param {string | null} start */
export async function savePendingStart(pageUrl, start) {
  const data = await chrome.storage.session.get(PENDING_START_KEY);
  const map = { ...(data[PENDING_START_KEY] || {}) };
  if (start) {
    map[pageUrl] = start;
  } else {
    delete map[pageUrl];
  }
  await chrome.storage.session.set({ [PENDING_START_KEY]: map });
}
