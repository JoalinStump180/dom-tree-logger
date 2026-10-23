document.getElementById("open").onclick = open;
document.getElementById("open2").onclick = (e) => { e.preventDefault(); open(); };
function open() {
  chrome.tabs.create({ url: chrome.runtime.getURL("explorer.html") });
}
