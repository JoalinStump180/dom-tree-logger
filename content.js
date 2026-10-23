const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|META|LINK)$/i;
const MAX_NODES = 50000;
//const DEFAULT_SCOPE = "ytd-comment-thread-renderer";
const DEFAULT_SCOPE = "html";

function norm(s) {
  return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseScope(raw) {
  return String(raw || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function ownText(el) {
  let s = "";
  if (!el || !el.childNodes) return "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue;
  }
  return norm(s);
}

function matchesAny(el, sels) {
  if (!el || el.nodeType !== 1 || !sels.length) return false;
  for (const sel of sels) {
    try {
      if (el.matches(sel)) return true;
    } catch (_) {
      if ((el.tagName || "").toLowerCase() === sel.toLowerCase()) return true;
    }
  }
  return false;
}

function collectTexts(node, parts) {
  if (!node) return;
  if (node.nodeType === 3) {
    const t = norm(node.nodeValue);
    if (t) parts.push(t);
    return;
  }
  if (node.nodeType !== 1 || SKIP.test(node.tagName)) return;
  if (node.shadowRoot) {
    for (const c of node.shadowRoot.childNodes) collectTexts(c, parts);
  }
  for (const c of node.childNodes) collectTexts(c, parts);
}

function dumpUnit(el) {
  const parts = [];
  collectTexts(el, parts);
  return parts.join("\n");
}

function labelOf(node) {
  let label = (node.tagName || "node").toLowerCase();
  if (node.id) label += "#" + node.id;
  else {
    const testid = node.getAttribute && node.getAttribute("data-testid");
    if (testid) label += '[data-testid="' + testid + '"]';
  }
  return label;
}

// Capture HTML attributes plus a small set of live DOM properties whose current
// values can differ from their markup attributes (for example input.value).
function propertiesOf(el) {
  const props = [];
  if (el.attributes) {
    for (const attr of el.attributes) props.push([attr.name, attr.value]);
  }
  const addLive = (name, value) => {
    if (!props.some(([key]) => key === name)) props.push([name, String(value)]);
  };
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") {
    if ("value" in el) addLive(".value", el.value);
  }
  if (tag === "INPUT") {
    addLive(".checked", !!el.checked);
    addLive(".disabled", !!el.disabled);
  } else if (tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
    addLive(".disabled", !!el.disabled);
  }
  if (tag === "A" && el.href) addLive(".href", el.href);
  if ((tag === "IMG" || tag === "IFRAME" || tag === "SOURCE" || tag === "VIDEO" || tag === "AUDIO") && el.src) {
    addLive(".src", el.src);
  }
  return props;
}

function walk(node, sels, inside, pathPrefix, budget) {
  if (!node || budget.n >= MAX_NODES) return null;
  if (node.nodeType === 3) {
    if (sels.length && !inside) return null;
    const t = norm(node.nodeValue);
    if (t.length < 1) return null;
    budget.n++;
    return { tag: "#text", text: t, kids: [], path: pathPrefix ? pathPrefix + " > #text" : "#text" };
  }
  if (node.nodeType !== 1) return null;
  if (SKIP.test(node.tagName)) return null;
  const label = labelOf(node);
  const path = pathPrefix ? pathPrefix + " > " + label : label;
  const nowInside = inside || !sels.length || matchesAny(node, sels);
  const kids = [];
  if (node.shadowRoot) {
    for (const c of node.shadowRoot.childNodes) {
      const k = walk(c, sels, nowInside, path, budget);
      if (k) kids.push(k);
    }
  }
  for (const c of node.childNodes) {
    const k = walk(c, sels, nowInside, path, budget);
    if (k) kids.push(k);
  }
  const text = nowInside ? ownText(node) : "";
  const props = propertiesOf(node);
  if (!kids.length && !text && !props.length) return null;
  budget.n++;
  return { tag: label, text, kids, path, props };
}

function collectUnits(node, sels, pathPrefix, out) {
  if (!node || node.nodeType !== 1 || SKIP.test(node.tagName)) return;
  const label = labelOf(node);
  const path = pathPrefix ? pathPrefix + " > " + label : label;
  if (sels.length && matchesAny(node, sels)) {
    const text = dumpUnit(node);
    if (text.length >= 2) out.push({ tag: label, path, text });
    return;
  }
  if (node.shadowRoot) {
    for (const c of node.shadowRoot.childNodes) collectUnits(c, sels, path, out);
  }
  for (const c of node.childNodes) collectUnits(c, sels, path, out);
}

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

let scope = DEFAULT_SCOPE;
let scanTimer = 0;
const sent = new Set();

function loadScope(cb) {
  chrome.storage.local.get({ lastScope: DEFAULT_SCOPE }, (bag) => {
    scope = String(bag.lastScope || "").trim() || DEFAULT_SCOPE;
    if (cb) cb();
  });
}

function scanAndLog() {
  const sels = parseScope(scope);
  if (!sels.length) return;
  const units = [];
  collectUnits(document.documentElement, sels, "", units);
  const host = location.hostname;
  const url = location.href;
  const title = document.title;
  for (const u of units.slice(0, 400)) {
    const unitKey = host + "|" + url + "|" + fnv1a(u.text);
    if (sent.has(unitKey)) continue;
    sent.add(unitKey);
    chrome.runtime.sendMessage({
      type: "log-unit",
      unitKey,
      url,
      host,
      title,
      path: u.path,
      tag: u.tag,
      text: u.text,
      ts: Date.now()
    }, () => void chrome.runtime.lastError);
  }
}

function schedule() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanAndLog, 500);
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (!msg || msg.type !== "walk-tree") return false;
  if (msg.scope != null) scope = String(msg.scope || "").trim() || DEFAULT_SCOPE;
  const sels = parseScope(scope);
  const tree = walk(document.documentElement, sels, false, "", { n: 0 }) || {
    tag: "html", text: "", kids: [], path: "html"
  };
  schedule();
  sendResponse({
    tree,
    url: location.href,
    title: document.title,
    host: location.hostname
  });
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.lastScope) return;
  scope = String(changes.lastScope.newValue || "").trim() || DEFAULT_SCOPE;
  schedule();
});

loadScope(() => {
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
});
