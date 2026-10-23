New Logger 0.3.0 - memory-only build

This build does not read from or write to IndexedDB. Logged units are held only in the background service worker's memory, with a cap of 2000 records. The Explorer displays the current in-memory records.

Explorer improvements:
- DOM tree nodes include HTML attributes and useful live form/link/media properties.
- SCRIPT, STYLE, NOSCRIPT, META, and LINK subtrees are skipped; SVG and form controls are inspectable.
- Existing search checks node tag, properties, and text. Search reveals matching paths but never folds already-open nodes.
- Right-click a tree node and choose Search to search property names/values and text separately. Either category can match; search applies to the captured tree.
- Right-click a property line to copy that single property as path + HTML fragment.
- Right-click the text span to copy that single text as path + HTML fragment.
- On div nodes, four extra copy options: relative/full path × current-level / recursive children (text and props).
- Three extra color search bars (each with a color picker). Only the matched substring is highlighted in the chosen color; paths are still expanded.
- Hold 8 and click a node to recursively expand its subtree; repeat to fold it. The original fold state is saved. Hold 9 and click the same node to restore that saved state.
- The top toolbar includes Fold all nodes.

Because this is a Manifest V3 extension, Chrome may suspend/restart the background service worker. When that happens, in-memory logs are lost. Closing/reopening the browser or reloading the extension also clears them. Existing IndexedDB data from older versions is left untouched but is no longer read.

Open Explorer, set the CSS selector scope, and press Refresh. The content script walks the active tab and sends matching text units to the background process.
