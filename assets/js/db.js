// assets/js/db.js
(() => {
    const DB_NAME = "sales-app-db";
    const DB_VERSION = 1;
    const STORES = {
        products: { keyPath: "id" },
        customers: { keyPath: "id" },
        sales: { keyPath: "id" },
        changes: { keyPath: "id" }
    };

    let _db;

    async function openDB() {
        if (_db) return _db;
        _db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (event) => {
                const db = req.result;
                const tx = req.transaction || event.target.transaction;
                Object.entries(STORES).forEach(([name, opts]) => {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, { keyPath: opts.keyPath });
                    }
                });
                // (opsional) index nümunələri:
                try {
                    const s = tx?.objectStore("sales");
                    // s?.createIndex("byCustomer", "customer_id", { unique: false });
                } catch (_) { }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return _db;
    }

    async function put(store, obj) {
        await openDB();
        return new Promise((res, rej) => {
            const tx = _db.transaction(store, "readwrite");
            tx.objectStore(store).put(obj);
            tx.oncomplete = () => res(true);
            tx.onerror = () => rej(tx.error);
        });
    }

    async function get(store, id) {
        await openDB();
        return new Promise((res, rej) => {
            const tx = _db.transaction(store, "readonly");
            const r = tx.objectStore(store).get(id);
            r.onsuccess = () => res(r.result ?? null);
            r.onerror = () => rej(r.error);
        });
    }

    async function del(store, id) {
        await openDB();
        return new Promise((res, rej) => {
            const tx = _db.transaction(store, "readwrite");
            tx.objectStore(store).delete(id);
            tx.oncomplete = () => res(true);
            tx.onerror = () => rej(tx.error);
        });
    }

    async function listAll(store) {
        await openDB();
        return new Promise((res, rej) => {
            const tx = _db.transaction(store, "readonly");
            const r = tx.objectStore(store).getAll();
            r.onsuccess = () => res(r.result || []);
            r.onerror = () => rej(r.error);
        });
    }

    window.DB = { openDB, put, get, del, listAll };
})();
