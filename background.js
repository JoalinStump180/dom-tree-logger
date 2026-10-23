// Volatile in-memory log only: deliberately no IndexedDB reads or writes.
const MAX_MEMORY_UNITS = 2000;
const memoryUnits = [];
const memoryKeys = new Map();
let nextMemoryId = 1;

function putMemoryUnit(row) {
  const existing = memoryKeys.get(row.unitKey);
  if (existing) return Promise.resolve({ ok: true, dup: true, id: existing.id });
  const saved = { ...row, id: nextMemoryId++ };
  memoryUnits.push(saved);
  memoryKeys.set(saved.unitKey, saved);
  while (memoryUnits.length > MAX_MEMORY_UNITS) {
    const removed = memoryUnits.shift();
    if (removed) memoryKeys.delete(removed.unitKey);
  }
  return Promise.resolve({ ok: true, id: saved.id });
}

function getMemoryUnits() {
  return Promise.resolve(memoryUnits.slice());
}

function deleteMemoryUnit(id) {
  const index = memoryUnits.findIndex((row) => row.id === id);
  if (index >= 0) {
    const [removed] = memoryUnits.splice(index, 1);
    memoryKeys.delete(removed.unitKey);
  }
  return Promise.resolve({ ok: true });
}

function isPageUrl(url) {
  return /^https?:/i.test(url || "");
}

function pickTab(tabs) {
  const list = (tabs || []).filter((t) => t.id && isPageUrl(t.url));
  list.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return list[0] || null;
}

function sendWalk(tabId, scope) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "walk-tree", scope: scope || "" }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { error: "empty" });
    });
  });
}

async function walkActive(scope) {
  const tabs = await chrome.tabs.query({});
  const tab = pickTab(tabs);
  if (!tab) return { error: "no-http-tab" };
  let res = await sendWalk(tab.id, scope);
  if (res && res.error && /Receiving end does not exist/i.test(res.error)) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: ["content.js"]
      });
    } catch (err) {
      return { error: "inject-failed: " + String(err) + " @ " + tab.url };
    }
    res = await sendWalk(tab.id, scope);
  }
  if (res && !res.error) res.tabUrl = tab.url;
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === "walk-active") {
    walkActive(msg.scope || "").then(sendResponse);
    return true;
  }
  if (msg.type === "log-unit") {
    putMemoryUnit({
      unitKey: msg.unitKey,
      url: msg.url || "",
      host: msg.host || "",
      title: msg.title || "",
      path: msg.path || "",
      tag: msg.tag || "",
      text: msg.text || "",
      ts: msg.ts || Date.now()
    }).then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (msg.type === "get-units") {
    getMemoryUnits().then((rows) => sendResponse({ rows })).catch((err) => sendResponse({ error: String(err), rows: [] }));
    return true;
  }
  if (msg.type === "delete-unit") {
    deleteMemoryUnit(msg.id).then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  return false;
});
