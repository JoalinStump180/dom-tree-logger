function $(id) { return document.getElementById(id); }

function countLeaves(n) {
  if (!n) return 0;
  if (!n.kids || !n.kids.length) return n.text ? 1 : 0;
  return n.kids.reduce((a, k) => a + countLeaves(k), 0) + (n.text ? 1 : 0);
}

function addPick(node) {
  const box = $("picks");
  if (!box || !node) return;
  box.querySelectorAll(".ptt-pick").forEach((r) => r.classList.remove("on"));
  const row = document.createElement("div");
  row.className = "ptt-pick on";
  const num = document.createElement("span");
  num.className = "ptt-n";
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = node.path || node.tag || "";
  inp.spellcheck = false;
  row.appendChild(num);
  row.appendChild(inp);
  box.appendChild(row);
  [...box.querySelectorAll(".ptt-pick")].forEach((r, i) => {
    const n = r.querySelector(".ptt-n");
    if (n) n.textContent = String(i + 1).padStart(4, "0");
  });
  inp.addEventListener("focus", () => {
    box.querySelectorAll(".ptt-pick").forEach((r) => r.classList.remove("on"));
    row.classList.add("on");
  });
  inp.focus();
  inp.select();
  box.scrollTop = box.scrollHeight;
}

function propSearchText(node) {
  return (node.props || []).map(([name, value]) => String(name) + "=" + String(value)).join("\n");
}

function renderNode(node) {
  const wrap = document.createElement("div");
  wrap.className = "ptt-node";
  const row = document.createElement("div");
  row.className = "ptt-row";
  const tog = document.createElement("button");
  tog.type = "button";
  tog.className = "ptt-tog";
  const hasKids = node.kids && node.kids.length;
  tog.textContent = hasKids ? "+" : "·";
  tog.disabled = !hasKids;
  const tag = document.createElement("span");
  tag.className = "ptt-tag";
  tag.textContent = node.tag;
  tag.title = node.path || node.tag || "";
  const txt = document.createElement("span");
  txt.className = "ptt-txt";
  const rawText = node.text ? "  " + node.text : "";
  txt.dataset.raw = rawText;
  txt.textContent = rawText;
  tag.addEventListener("click", (e) => { e.stopPropagation(); addPick(node); });
  txt.addEventListener("click", (e) => { e.stopPropagation(); addPick(node); });
  row.appendChild(tog);
  row.appendChild(tag);
  row.appendChild(txt);
  wrap.appendChild(row);

  let propsBox = null;
  if (node.props && node.props.length) {
    propsBox = document.createElement("div");
    propsBox.className = "ptt-props";
    propsBox.hidden = true;
    for (const [name, value] of node.props) {
      const line = document.createElement("div");
      line.className = "ptt-prop";
      const propName = document.createElement("span");
      propName.className = "ptt-prop-name";
      propName.dataset.raw = name;
      propName.textContent = name;
      const eq = document.createElement("span");
      eq.className = "ptt-prop-eq";
      eq.textContent = " = ";
      const propValue = document.createElement("span");
      propValue.className = "ptt-prop-value";
      propValue.dataset.raw = String(value);
      propValue.textContent = String(value);
      line.append(propName, eq, propValue);
      propsBox.appendChild(line);
    }
    wrap.appendChild(propsBox);
    const propTog = document.createElement("button");
    propTog.type = "button";
    propTog.className = "ptt-ptog";
    propTog.textContent = "P";
    propTog.title = "Toggle properties";
    propTog.addEventListener("click", (e) => {
      e.stopPropagation();
      propsBox.hidden = !propsBox.hidden;
      propTog.classList.toggle("on", !propsBox.hidden);
    });
    row.appendChild(propTog);
  }

  let kidsBox = null;
  if (hasKids) {
    kidsBox = document.createElement("div");
    kidsBox.className = "ptt-kids";
    kidsBox.hidden = true;
    node.kids.forEach((k) => kidsBox.appendChild(renderNode(k)));
    wrap.appendChild(kidsBox);
    tog.addEventListener("click", (e) => {
      e.stopPropagation();
      kidsBox.hidden = !kidsBox.hidden;
      tog.textContent = kidsBox.hidden ? "+" : "−";
    });
  }
  wrap._ptt = { node, row, tog, kidsBox, propsBox, txt };

  row.addEventListener("click", (e) => {
    if (handleNodeModifier(e, wrap)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);

  // Right-click on the row (tag area) — node-level menu
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, wrap, { kind: "node" });
  });

  // Right-click on text
  if (txt) {
    txt.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, wrap, { kind: "text" });
    });
  }

  // Right-click on each property line
  if (propsBox) {
    propsBox.querySelectorAll(".ptt-prop").forEach((line, idx) => {
      line.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, wrap, { kind: "prop", propIndex: idx });
      });
    });
  }

  return wrap;
}

function allSubtreeNodes(root) {
  const out = [];
  function visit(el) {
    if (!el || !el._ptt) return;
    out.push(el);
    if (el._ptt.kidsBox) Array.from(el._ptt.kidsBox.children).forEach(visit);
  }
  visit(root);
  return out;
}

function snapshotSubtree(root) {
  return allSubtreeNodes(root).map((el) => ({
    el,
    hidden: el._ptt.kidsBox ? el._ptt.kidsBox.hidden : null
  }));
}

function setSubtreeExpanded(root, expanded) {
  for (const el of allSubtreeNodes(root)) {
    const info = el._ptt;
    if (!info.kidsBox) continue;
    info.kidsBox.hidden = !expanded;
    info.tog.textContent = expanded ? "−" : "+";
  }
}

const savedSubtreeStates = new WeakMap();
const keysDown = new Set();
function isTypingTarget(target) {
  return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ""));
}
window.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;
  if (e.key === "8" || e.key === "9") keysDown.add(e.key);
});
window.addEventListener("keyup", (e) => keysDown.delete(e.key));
window.addEventListener("blur", () => keysDown.clear());

function handleNodeModifier(_event, root) {
  if (keysDown.has("8")) {
    if (!savedSubtreeStates.has(root)) savedSubtreeStates.set(root, snapshotSubtree(root));
    const nodes = allSubtreeNodes(root).filter((el) => el._ptt.kidsBox);
    const allExpanded = nodes.length > 0 && nodes.every((el) => !el._ptt.kidsBox.hidden);
    setSubtreeExpanded(root, !allExpanded);
    $("status").textContent = allExpanded ? "Subtree folded; press 9+click on the same node to restore" : "Subtree expanded; press 8+click again to fold";
    return true;
  }
  if (keysDown.has("9")) {
    const snapshot = savedSubtreeStates.get(root);
    if (snapshot) {
      snapshot.forEach(({ el, hidden }) => {
        if (!el.isConnected || !el._ptt.kidsBox || hidden == null) return;
        el._ptt.kidsBox.hidden = hidden;
        el._ptt.tog.textContent = hidden ? "+" : "−";
      });
      savedSubtreeStates.delete(root);
      $("status").textContent = "Subtree fold/unfold state restored";
    } else {
      $("status").textContent = "No saved state for this node; use 8+click first";
    }
    return true;
  }
  return false;
}

function matchesSearch(node, patterns) {
  const propHay = propSearchText(node).toLowerCase();
  const textHay = String(node.text || "").toLowerCase();
  const tagHay = String(node.tag || "").toLowerCase();
  const general = String(patterns.general || "").trim().toLowerCase();
  const prop = String(patterns.prop || "").trim().toLowerCase();
  const text = String(patterns.text || "").trim().toLowerCase();
  const generalHit = !general || propHay.includes(general) || textHay.includes(general) || tagHay.includes(general);
  const categoryHits = (!prop && !text) || (prop && propHay.includes(prop)) || (text && textHay.includes(text));
  return generalHit && categoryHits && (!!general || !!prop || !!text);
}

function applySearch(rootEl, queryOrPatterns) {
  const patterns = typeof queryOrPatterns === "string"
    ? { general: queryOrPatterns, prop: "", text: "" }
    : { general: "", prop: queryOrPatterns.prop || "", text: queryOrPatterns.text || "" };
  let hits = 0;
  function rec(el) {
    const info = el._ptt;
    if (!info) return false;
    const selfHit = matchesSearch(info.node, patterns);
    let childHit = false;
    if (info.kidsBox) {
      for (const c of info.kidsBox.children) if (rec(c)) childHit = true;
    }
    const hit = selfHit || childHit;
    el.classList.toggle("ptt-hit", !!selfHit);
    el.classList.toggle("ptt-openpath", !!hit);
    if (selfHit) hits++;
    // Search is reveal-only: it may expand a path but never folds anything.
    if (hit && info.kidsBox) {
      info.kidsBox.hidden = false;
      info.tog.textContent = "−";
    }
    return hit;
  }
  if (rootEl.firstChild) rec(rootEl.firstChild);
  return hits;
}

let textHits = [];
let textIndex = -1;
let propHits = [];
let propIndex = -1;

function collectHits(rootEl) {
  textHits = [];
  propHits = [];
  if (!rootEl) return;
  rootEl.querySelectorAll(".ptt-node").forEach((el) => {
    if (!el._ptt) return;
    const ownTxt = el.querySelector(":scope > .ptt-row .ptt-txt");
    if (ownTxt && ownTxt.querySelector(".ptt-mark")) textHits.push(el);
    const ownProps = el._ptt.propsBox;
    if (ownProps && ownProps.querySelector(".ptt-mark-prop")) propHits.push(el);
  });
  textIndex = textHits.length ? 0 : -1;
  propIndex = propHits.length ? 0 : -1;
}

function showTextHit(delta) {
  if (!textHits.length) { $("status").textContent = "No text hits"; return; }
  textIndex = (textIndex + delta + textHits.length) % textHits.length;
  const el = textHits[textIndex];
  document.querySelectorAll(".ptt-current").forEach((n) => n.classList.remove("ptt-current"));
  el.classList.add("ptt-current");
  ensurePathExpanded(el);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  $("status").textContent = "Text " + (textIndex + 1) + " / " + textHits.length;
}

function showPropHit(delta) {
  if (!propHits.length) { $("status").textContent = "No props hits"; return; }
  propIndex = (propIndex + delta + propHits.length) % propHits.length;
  const el = propHits[propIndex];
  document.querySelectorAll(".ptt-current").forEach((n) => n.classList.remove("ptt-current"));
  el.classList.add("ptt-current");
  ensurePathExpanded(el);
  if (el._ptt && el._ptt.propsBox) {
    el._ptt.propsBox.hidden = false;
    const btn = el.querySelector(":scope > .ptt-row .ptt-ptog");
    if (btn) btn.classList.add("on");
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  $("status").textContent = "Props " + (propIndex + 1) + " / " + propHits.length;
}

function ensurePathExpanded(el) {
  let cur = el;
  while (cur && cur._ptt) {
    const info = cur._ptt;
    if (info.kidsBox) {
      info.kidsBox.hidden = false;
      info.tog.textContent = "−";
    }
    cur = cur.parentElement && cur.parentElement.closest(".ptt-node");
  }
}

function showHit(delta) {
  showTextHit(delta);
}

function hideAllProps() {
  document.querySelectorAll(".ptt-props").forEach((p) => {
    p.hidden = true;
    p.classList.remove("revealed");
  });
  document.querySelectorAll(".ptt-ptog.on").forEach((b) => b.classList.remove("on"));
}

function revealProps(el) {
  if (!el || !el._ptt || !el._ptt.propsBox) return;
  el._ptt.propsBox.classList.add("revealed");
  el._ptt.propsBox.hidden = false;
  const btn = el.querySelector(":scope > .ptt-row .ptt-ptog");
  if (btn) btn.classList.add("on");
}

function siblingNodes(el) {
  if (!el || !el.parentElement) return [];
  return Array.from(el.parentElement.children).filter((c) => c !== el && c.classList && c.classList.contains("ptt-node"));
}

function ancestorsOf(el) {
  const out = [];
  let cur = el;
  while (cur) {
    const parent = cur.parentElement && cur.parentElement.closest(".ptt-node");
    if (!parent) break;
    out.push(parent);
    cur = parent;
  }
  return out;
}

function applyPropReveal() {
  hideAllProps();
  const hitOn = $("cbHitProps") && $("cbHitProps").checked;
  const parentOn = $("cbParentProps") && $("cbParentProps").checked;
  const childOn = $("cbChildProps") && $("cbChildProps").checked;
  const neighOn = $("cbNeighProps") && $("cbNeighProps").checked;
  if (!hitOn && !parentOn && !childOn && !neighOn) return;
  for (const hit of textHits.concat(propHits)) {
    const ancestors = ancestorsOf(hit);
    if (hitOn) {
      revealProps(hit);
      ancestors.forEach((a) => {
        ensurePathExpanded(a);
        revealProps(a);
      });
    }
    if (parentOn && ancestors[0]) {
      ensurePathExpanded(ancestors[0]);
      revealProps(ancestors[0]);
    }
    if (childOn && hit._ptt && hit._ptt.kidsBox) {
      hit._ptt.kidsBox.hidden = false;
      hit._ptt.tog.textContent = "−";
      Array.from(hit._ptt.kidsBox.children).forEach((c) => {
        if (c._ptt) revealProps(c);
      });
    }
    if (neighOn) {
      ancestors.forEach((a) => {
        siblingNodes(a).forEach((sib) => {
          ensurePathExpanded(sib);
          revealProps(sib);
        });
      });
    }
  }
}

function syncLowerPane() {
  const on = $("cbLower") && $("cbLower").checked;
  const logs = $("logs");
  if (logs) logs.style.display = on ? "" : "none";
}

function runAllSearches() {
  const box = $("tree");
  if (!box) return;
  applySearch(box, $("q").value);
  applyColorHighlights(box);
  collectHits(box);
  propHits.forEach((el) => {
    if (el._ptt && el._ptt.propsBox) {
      el._ptt.propsBox.hidden = false;
      const btn = el.querySelector(":scope > .ptt-row .ptt-ptog");
      if (btn) btn.classList.add("on");
    }
  });
  applyPropReveal();
  const t = textHits.length;
  const p = propHits.length;
  $("seek").textContent = "T" + t + " P" + p;
  if (t) showTextHit(0);
  else if (p) showPropHit(0);
  else $("status").textContent = "0 hits";
}
let contextInfo = null; // { kind: "node"|"prop"|"text", propIndex?: number }

function openContextMenu(x, y, nodeEl, info) {
  contextNode = nodeEl;
  contextInfo = info || { kind: "node" };
  const menu = $("nodeMenu");
  menu.textContent = "";
  const node = nodeEl && nodeEl._ptt ? nodeEl._ptt.node : null;
  const isDiv = node && /^div\b/i.test(node.tag || "");

  const addBtn = (label, action) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      closeContextMenu();
      action();
    });
    menu.appendChild(btn);
  };

  if (contextInfo.kind === "prop") {
    addBtn("Copy single prop", () => copySinglePropOrText("prop"));
  } else if (contextInfo.kind === "text") {
    addBtn("Copy single text", () => copySinglePropOrText("text"));
  }

  addBtn("Search…", openSearchDialog);

  if (isDiv) {
    addBtn("Copy relative path with curr level text and props", () => copyDivLevel(false, false));
    addBtn("Copy full path with curr level text and props", () => copyDivLevel(true, false));
    addBtn("Copy relative path with recursively all child text and props", () => copyDivLevel(false, true));
    addBtn("Copy full path with recursively all child text and props", () => copyDivLevel(true, true));
  }

  menu.hidden = false;
  menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 8) + "px";
  menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 8) + "px";
}

function closeContextMenu() { $("nodeMenu").hidden = true; }

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
}

function getTextSearches() {
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const qEl = $("q" + i);
    const cEl = $("c" + i);
    const q = (qEl && qEl.value || "").trim();
    const color = (cEl && cEl.value) || "#ff6b6b";
    if (q) out.push({ q, color });
  }
  return out;
}

function getPropSearches() {
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const qEl = $("p" + i);
    const cEl = $("pc" + i);
    const q = (qEl && qEl.value || "").trim();
    const color = (cEl && cEl.value) || "#f59f00";
    if (q) out.push({ q, color });
  }
  return out;
}

function buildMarkedHtml(raw, searches, kind) {
  const src = String(raw || "");
  if (!searches.length) return escapeText(src);
  const lower = src.toLowerCase();
  const ranges = [];
  for (const s of searches) {
    const needle = s.q.toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      ranges.push({ start: i, end: i + needle.length, color: s.color });
      from = i + Math.max(1, needle.length);
    }
  }
  if (!ranges.length) return escapeText(src);
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const r of ranges) {
    if (!merged.length || r.start >= merged[merged.length - 1].end) merged.push({ ...r });
    else if (r.end > merged[merged.length - 1].end) merged[merged.length - 1] = { ...r };
  }
  let html = "";
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) html += escapeText(src.slice(pos, r.start));
    if (kind === "prop") {
      html += '<span class="ptt-mark-prop" style="border-color:' + r.color + ';color:' + r.color + '">' + escapeText(src.slice(r.start, r.end)) + "</span>";
    } else {
      html += '<span class="ptt-mark" style="background:' + r.color + '">' + escapeText(src.slice(r.start, r.end)) + "</span>";
    }
    pos = r.end;
  }
  if (pos < src.length) html += escapeText(src.slice(pos));
  return html;
}

function applyColorHighlights(rootEl) {
  if (!rootEl) return 0;
  const textSearches = getTextSearches();
  const propSearches = getPropSearches();
  rootEl.querySelectorAll(".ptt-txt").forEach((el) => {
    const raw = el.dataset.raw != null ? el.dataset.raw : el.textContent;
    el.innerHTML = buildMarkedHtml(raw, textSearches, "text");
  });
  rootEl.querySelectorAll(".ptt-prop-name, .ptt-prop-value").forEach((el) => {
    const raw = el.dataset.raw != null ? el.dataset.raw : el.textContent;
    el.innerHTML = buildMarkedHtml(raw, propSearches, "prop");
  });
  const any = textSearches.length || propSearches.length;
  if (!any) return 0;
  let hits = 0;
  function rec(el) {
    const info = el._ptt;
    if (!info) return false;
    const text = String(info.node.text || "").toLowerCase();
    const prop = propSearchText(info.node).toLowerCase();
    let self = false;
    for (const s of textSearches) if (text.includes(s.q.toLowerCase())) { self = true; break; }
    if (!self) for (const s of propSearches) if (prop.includes(s.q.toLowerCase())) { self = true; break; }
    if (self) hits++;
    let child = false;
    if (info.kidsBox) for (const c of info.kidsBox.children) if (rec(c)) child = true;
    if ((self || child) && info.kidsBox) {
      info.kidsBox.hidden = false;
      info.tog.textContent = "−";
    }
    return self || child;
  }
  if (rootEl.firstChild) rec(rootEl.firstChild);
  return hits;
}

function scheduleColorHighlight() {
  clearTimeout(scheduleColorHighlight._t);
  scheduleColorHighlight._t = setTimeout(() => applyColorHighlights($("tree")), 60);
}

function propToAttr(name, value) {
  let n = String(name || "");
  if (n.startsWith(".")) n = n.slice(1);
  if (!n) return "";
  const v = String(value ?? "");
  if (n === "checked" || n === "disabled") {
    return v === "true" || v === "1" ? n : "";
  }
  return n + '="' + escapeAttr(v) + '"';
}

function nodeToHtml(node, recursive, indent = 0) {
  if (!node) return "";
  const tag = (node.tag || "div").split(/[#\[]/)[0] || "div";
  const pad = "  ".repeat(indent);
  const attrs = (node.props || [])
    .map(([n, v]) => propToAttr(n, v))
    .filter(Boolean)
    .join(" ");
  const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
  const text = node.text ? escapeText(node.text) : "";
  const kids = recursive && node.kids ? node.kids : [];
  const kidHtml = kids.map(k => nodeToHtml(k, true, indent + 1)).filter(Boolean).join("\n");

  if (!text && !kidHtml) {
    return pad + (attrs ? `<${tag} ${attrs} />` : `<${tag} />`);
  }
  if (!kidHtml) {
    return pad + open + (text ? text : "") + `</${tag}>`;
  }
  let lines = [pad + open];
  if (text) lines.push(pad + "  " + text);
  if (kidHtml) lines.push(kidHtml);
  lines.push(pad + `</${tag}>`);
  return lines.join("\n");
}

async function writeClip(text) {
  try {
    await navigator.clipboard.writeText(text);
    $("status").textContent = "Copied to clipboard";
  } catch (err) {
    $("status").textContent = "Clipboard failed: " + String(err);
  }
}

function copySinglePropOrText(kind) {
  const node = contextNode && contextNode._ptt ? contextNode._ptt.node : null;
  if (!node) return;
  const pathLine = node.path || node.tag || "";
  let html = "";
  if (kind === "prop" && contextInfo && contextInfo.propIndex != null) {
    const pair = (node.props || [])[contextInfo.propIndex];
    if (!pair) return;
    const attr = propToAttr(pair[0], pair[1]);
    const tag = (node.tag || "div").split(/[#\[]/)[0] || "div";
    html = attr ? `<${tag} ${attr} />` : `<${tag} />`;
  } else if (kind === "text") {
    const tag = (node.tag || "div").split(/[#\[]/)[0] || "div";
    const t = escapeText(node.text || "");
    html = t ? `<${tag}>\n  ${t}\n</${tag}>` : `<${tag} />`;
  }
  const out = pathLine + "\n\n" + html;
  writeClip(out);
}

function copyDivLevel(fullPath, recursive) {
  const node = contextNode && contextNode._ptt ? contextNode._ptt.node : null;
  if (!node) return;
  const pathLine = fullPath ? (node.path || node.tag || "") : (node.tag || "");
  const html = nodeToHtml(node, recursive, 0);
  const out = pathLine + "\n\n" + html;
  writeClip(out);
}

function openSearchDialog() {
  closeContextMenu();
  const dialog = $("searchDialog");
  const node = contextNode && contextNode._ptt ? contextNode._ptt.node : null;
  $("searchTarget").textContent = node ? (node.path || node.tag) : "Entire tree";
  $("propPattern").value = $("propPattern").value || "";
  $("textPattern").value = $("textPattern").value || "";
  dialog.hidden = false;
  $("propPattern").focus();
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#nodeMenu")) closeContextMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeContextMenu(); $("searchDialog").hidden = true; }
});
$("searchCancel").addEventListener("click", () => { $("searchDialog").hidden = true; });
$("searchRun").addEventListener("click", () => {
  const prop = $("propPattern").value;
  const text = $("textPattern").value;
  if (!prop.trim() && !text.trim()) {
    $("status").textContent = "Enter a property pattern, a text pattern, or both";
    return;
  }
  const hits = applySearch($("tree"), { prop, text });
  applyColorHighlights($("tree"));
  collectHits($("tree"));
  $("searchDialog").hidden = true;
  $("seek").textContent = hits + " hits";
  if (hits) showHit(0);
  else $("status").textContent = "0 matching nodes";
});
$("foldAllBtn").addEventListener("click", () => {
  const root = $("tree");
  root.querySelectorAll(".ptt-node").forEach((el) => {
    if (!el._ptt || !el._ptt.kidsBox) return;
    el._ptt.kidsBox.hidden = true;
    el._ptt.tog.textContent = "+";
  });
  root.querySelectorAll(".ptt-hit, .ptt-openpath, .ptt-current").forEach((el) => el.classList.remove("ptt-hit", "ptt-openpath", "ptt-current"));
  textHits = [];
  propHits = [];
  textIndex = -1;
  propIndex = -1;
  $("status").textContent = "All tree nodes folded";
});

const DEFAULT_SCOPE = "ytd-comment-thread-renderer";

async function loadLogs() {
  const box = $("logs");
  if (!box) return;
  const res = await chrome.runtime.sendMessage({ type: "get-units" });
  const rows = ((res && res.rows) || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  box.textContent = "";
  rows.slice(0, 200).forEach((r) => {
    const div = document.createElement("div");
    div.style.margin = "6px 0";
    div.style.borderBottom = "1px solid #eee";
    const meta = document.createElement("div");
    meta.style.color = "#666";
    meta.textContent = new Date(r.ts || 0).toISOString() + "  " + (r.host || "") + "  " + (r.url || "");
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.margin = "2px 0 8px";
    pre.textContent = (r.text || "").slice(0, 4000);
    div.appendChild(meta);
    div.appendChild(pre);
    box.appendChild(div);
  });
}

async function refresh() {
  const scope = ($("scope").value || "").trim() || DEFAULT_SCOPE;
  $("scope").value = scope;
  chrome.storage.local.set({ lastScope: scope });
  $("status").textContent = "Walking active tab…";
  const res = await chrome.runtime.sendMessage({ type: "walk-active", scope });
  const box = $("tree");
  box.textContent = "";
  if (!res || res.error) {
    box.textContent = "Walk failed: " + ((res && res.error) || "unknown") +
      ". Open YouTube (or any https page) in another tab, then Refresh here. Explorer itself cannot be walked.";
    $("status").textContent = "error";
    await loadLogs();
    return;
  }
  const tree = res.tree || { tag: "html", text: "", kids: [], path: "html" };
  box.appendChild(renderNode(tree));
  const n = countLeaves(tree);
  $("status").textContent = (res.host || "") + " · " + n + " text pieces · folded · press Enter to search";
  $("seek").textContent = n + " nodes";
  await loadLogs();
}

$("reloadBtn").onclick = refresh;
$("prevText").onclick = () => showTextHit(-1);
$("nextText").onclick = () => showTextHit(1);
$("prevProps").onclick = () => showPropHit(-1);
$("nextProps").onclick = () => showPropHit(1);

function onSearchEnter(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    runAllSearches();
  }
}
$("q").addEventListener("keydown", onSearchEnter);
for (let i = 1; i <= 3; i++) {
  const qEl = $("q" + i);
  const cEl = $("c" + i);
  const pEl = $("p" + i);
  const pcEl = $("pc" + i);
  if (qEl) qEl.addEventListener("keydown", onSearchEnter);
  if (pEl) pEl.addEventListener("keydown", onSearchEnter);
  if (cEl) cEl.addEventListener("input", () => applyColorHighlights($("tree")));
  if (pcEl) pcEl.addEventListener("input", () => applyColorHighlights($("tree")));
}
let st = 0;
$("scope").addEventListener("input", () => {
  clearTimeout(st);
  st = setTimeout(refresh, 400);
});

if ($("cbLower")) $("cbLower").addEventListener("change", syncLowerPane);
["cbHitProps", "cbParentProps", "cbChildProps", "cbNeighProps"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("change", () => { applyPropReveal(); });
});
syncLowerPane();

chrome.storage.local.get({ lastScope: DEFAULT_SCOPE }, (bag) => {
  $("scope").value = bag.lastScope || DEFAULT_SCOPE;
  refresh();
});
