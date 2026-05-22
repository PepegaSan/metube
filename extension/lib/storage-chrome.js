/** Promise wrappers — content scripts may not get promise-returning storage APIs. */

function mtStorageLocalGet(keys) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve({});
      return;
    }
    const api = chrome.storage.local;
    try {
      const maybe = api.get(keys);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then((data) => resolve(data || {})).catch(() => resolve({}));
        return;
      }
    } catch {
      /* use callback */
    }
    api.get(keys, (data) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(data || {});
    });
  });
}

function mtStorageLocalSet(items) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('no_storage'));
      return;
    }
    const api = chrome.storage.local;
    try {
      const maybe = api.set(items);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(() => resolve()).catch((e) => reject(e));
        return;
      }
    } catch {
      /* use callback */
    }
    api.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function mtStorageLocalRemove(keys) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('no_storage'));
      return;
    }
    const api = chrome.storage.local;
    try {
      const maybe = api.remove(keys);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(() => resolve()).catch((e) => reject(e));
        return;
      }
    } catch {
      /* use callback */
    }
    api.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}
