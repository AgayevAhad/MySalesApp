// assets/js/sync.js
(() => {
    let CFG = { base_url: "", api_key: "", seller_id: "seller-001" };
    let lastSyncAt = Number(localStorage.getItem("lastSyncAt") || 0);

    async function loadConfig() {
        if (CFG.base_url) return CFG;
        if (window.APP_CONFIG) { CFG = window.APP_CONFIG; return CFG; }
        const candidates = [
            "./config.json",
            "/config.json",
            "../config.json",
            "assets/config.json",
            "./assets/config.json"
        ];
        for (const p of candidates) {
            try {
                const r = await fetch(p, { cache: "no-store" });
                if (r.ok) { CFG = await r.json(); return CFG; }
            } catch (_) { }
        }
        const s = document.getElementById("syncStatus");
        if (s) s.textContent = "config.json tapılmadı — Sync offline.";
        throw new Error("config.json not found");
    }

    function uuid() { return crypto.randomUUID?.() ?? (Date.now() + "-" + Math.random().toString(16).slice(2)); }

    async function queueChange(table, op, row) {
        await DB.put("changes", {
            id: uuid(),
            table,
            row_id: row.id,
            op,
            payload_json: row,
            updated_at: row.updated_at || Date.now(),
            seller_id: (await loadConfig()).seller_id
        });
    }

    async function health() {
        const cfg = await loadConfig();
        const u = new URL("/health", cfg.base_url);
        u.searchParams.set("api_key", cfg.api_key);
        const r = await fetch(u);
        if (!r.ok) throw new Error("health fail");
        return r.json();
    }

    async function push() {
        const cfg = await loadConfig();
        const changes = await DB.listAll("changes");
        if (changes.length === 0) return;
        const u = new URL("/sync/push", cfg.base_url);
        u.searchParams.set("api_key", cfg.api_key);
        const payload = {
            changes: changes.map(c => ({
                table: c.table, row_id: c.row_id, op: c.op,
                payload_json: c.payload_json, updated_at: c.updated_at, seller_id: c.seller_id
            }))
        };
        const r = await fetch(u, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error("push fail");
        for (const c of changes) await DB.del("changes", c.id);
    }

    async function pull() {
        const cfg = await loadConfig();
        const u = new URL("/sync/pull", cfg.base_url);
        u.searchParams.set("seller_id", cfg.seller_id);
        u.searchParams.set("since", String(lastSyncAt));
        u.searchParams.set("api_key", cfg.api_key);
        const r = await fetch(u);
        if (!r.ok) throw new Error("pull fail");
        const { changes, server_time } = await r.json();

        for (const p of (changes.products || [])) {
            if (p.deleted) await DB.del("products", p.id);
            else await DB.put("products", p);
        }
        for (const c of (changes.customers || [])) {
            if (c.deleted) await DB.del("customers", c.id);
            else await DB.put("customers", c);
        }
        lastSyncAt = server_time;
        localStorage.setItem("lastSyncAt", String(lastSyncAt));
    }

    async function syncNow({ statusEl } = {}) {
        function setS(t) { if (statusEl) statusEl.textContent = t; }
        try {
            setS("Yoxlanır..."); await health();
            setS("Push..."); await push();
            setS("Pull..."); await pull();
            setS("Tamamlandı ✓");
        } catch (e) {
            setS("Xəta: " + e.message); throw e;
        }
    }

    window.Sync = { loadConfig, queueChange, syncNow };
})();
