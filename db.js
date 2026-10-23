const DB_NAME = "newLogger";
const DB_VERSION = 1;
const UNIT_STORE = "units";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(UNIT_STORE)) {
        const st = db.createObjectStore(UNIT_STORE, { keyPath: "id", autoIncrement: true });
        st.createIndex("byUrl", "url", { unique: false });
        st.createIndex("byKey", "unitKey", { unique: true });
        st.createIndex("byTs", "ts", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putUnit(row) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNIT_STORE, "readwrite");
    const st = tx.objectStore(UNIT_STORE);
    const idx = st.index("byKey");
    const g = idx.get(row.unitKey);
    g.onsuccess = () => {
      if (g.result) {
        resolve({ ok: true, dup: true, id: g.result.id });
        return;
      }
      const add = st.add(row);
      add.onsuccess = () => resolve({ ok: true, id: add.result });
      add.onerror = () => reject(add.error);
    };
    g.onerror = () => reject(g.error);
  });
}

async function getAllUnits() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(UNIT_STORE, "readonly").objectStore(UNIT_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteUnit(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNIT_STORE, "readwrite");
    tx.objectStore(UNIT_STORE).delete(id);
    tx.oncomplete = () => resolve({ ok: true });
    tx.onerror = () => reject(tx.error);
  });
}
