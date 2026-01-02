/* =========================================================
   Purchases (Alışlar) — stokla tam inteqrasiya (FINAL)
   ES5 uyğundur. Sintaksis səhvi yoxdur.
   ========================================================= */
if (window.__PURCHASES_JS_LOADED__) {
    console.warn("purchases.js already loaded; skipping duplicate init");
} else {
    window.__PURCHASES_JS_LOADED__ = true;

    /* ---------------- Utils ---------------- */
    function $(s, r) { return (r || document).querySelector(s); }
    function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
    function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn); }
    function show(el) { if (el) el.classList.remove("hidden"); }
    function hide(el) { if (el) el.classList.add("hidden"); }
    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

    /* ---------------- LocalStorage Keys ---------------- */
    var PURCHASES_KEY = "purchaseHistory";
    var PRODUCTS_KEY = "businessAppProducts"; // product.js ilə eyni OLMALIDIR

    /* ---------------- Global Cache ---------------- */
    window.allProducts = window.allProducts || {}; // {category: [ {id,name,stock,price,units,...} ]}

    /* ---------------- DOM refs ---------------- */
    var addBtn = $("#p-add-toggle");
    var editBtn = $("#p-edit-toggle");
    var delBtn = $("#p-delete-toggle");
    var searchBtn = $("#p-search-toggle");
    var searchPanel = $("#p-search-panel");
    var searchInput = $("#p-search");
    var searchResults = $("#p-search-results");
    var listEl = $("#purchases-list");

    // Add modal
    var pmBackdrop = $("#purchase-modal-backdrop");
    var pmModal = $("#purchase-modal");
    var pmType = $("#purchase-type");
    var pmExisting = $("#pm-existing");
    var pmNew = $("#pm-new");
    var pmSearch = $("#pm-search");
    var pmList = $("#pm-list");
    var pmClose = $("#pm-close");
    var pmSave = $("#pm-save");

    var newName = $("#new-name");
    var newCat = $("#new-category");
    var newUnits = $("#new-units");
    var newQty = $("#new-qty");
    var newBuy = $("#new-buy");
    var newSale = $("#new-sale");
    var newBarcode = $("#new-barcode");
    var newDesc = $("#new-desc");

    // Edit modal
    var peBackdrop = $("#pe-backdrop");
    var peModal = $("#pe-modal");
    var peBody = $("#pe-body");
    var peClose = $("#pe-close");
    var peSave = $("#pe-save");
    var peDelete = $("#pe-delete");

    /* ---------------- State ---------------- */
    var state = { mode: "view", editingId: null };

    /* ---------------- Storage helpers ---------------- */
    function loadPurchases() {
        try { return JSON.parse(localStorage.getItem(PURCHASES_KEY) || "[]"); }
        catch (e) { return []; }
    }
    function savePurchases(arr) {
        localStorage.setItem(PURCHASES_KEY, JSON.stringify(arr || []));
    }
    function loadProductsLocal() {
        try { return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function saveProductsLocal(obj) {
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(obj || {}));
    }

    /* ---------------- Products load ---------------- */
    function ensureProducts(cb) {
        // 1) LocalStorage üstünlük
        var ls = loadProductsLocal();
        if (ls && Object.keys(ls).length) { window.allProducts = ls; return cb(); }

        // 2) JSON fallback
        fetch("./assets/data/products.json", { cache: "no-store" })
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (data) {
                if (Object.prototype.toString.call(data) === "[object Array]") {
                    var g = {};
                    data.forEach(function (p) {
                        var c = p.category || "Digər";
                        (g[c] || (g[c] = [])).push(p);
                    });
                    window.allProducts = g;
                } else {
                    window.allProducts = data || {};
                }
                saveProductsLocal(window.allProducts);
                cb();
            })
            .catch(function () { window.allProducts = {}; cb(); });
    }

    /* ---------------- Product helpers ---------------- */
    function productId(cat, name, id) {
        return id || (cat + "-" + String(name || "").replace(/\s/g, "-"));
    }
    function findById(pid) {
        var ap = window.allProducts || {};
        for (var cat in ap) {
            var arr = ap[cat] || [];
            for (var i = 0; i < arr.length; i++) {
                var p = arr[i];
                var id = productId(cat, p.name, p.id);
                if (String(id) === String(pid)) return { cat: cat, idx: i, p: p };
            }
        }
        return null;
    }
    function findByName(name) {
        var k = String(name || "").trim().toLowerCase();
        var ap = window.allProducts || {};
        for (var cat in ap) {
            var arr = ap[cat] || [];
            for (var i = 0; i < arr.length; i++) {
                var p = arr[i];
                if (String(p.name || "").trim().toLowerCase() === k) return { cat: cat, idx: i, p: p };
            }
        }
        return null;
    }

    /* ---------------- Stock math ---------------- */
    function notifyProductsUI() {
        // Products səhifəsinə xəbər ver
        try { window.dispatchEvent(new Event("products-updated")); } catch (e) { }
    }

    function addStock(items) {
        console.log("[PURCHASES] addStock()", items);
        (items || []).forEach(function (it) {
            var hit = it.id ? findById(it.id) : null;
            if (!hit) hit = findByName(it.name);
            if (!hit) { console.warn("Product not found to add stock:", it); return; }
            hit.p.stock = num(hit.p.stock) + num(it.qty || it.quantity);
            if (it.buyPrice != null) hit.p.last_buy = num(it.buyPrice);
        });
        saveProductsLocal(window.allProducts);
        notifyProductsUI();
    }

    function subStock(items) {
        console.log("[PURCHASES] subStock()", items);
        (items || []).forEach(function (it) {
            var hit = it.id ? findById(it.id) : null;
            if (!hit) hit = findByName(it.name);
            if (!hit) { console.warn("Product not found to sub stock:", it); return; }
            hit.p.stock = num(hit.p.stock) - num(it.qty || it.quantity);
        });
        saveProductsLocal(window.allProducts);
        notifyProductsUI();
    }

    function deltaStock(oldItems, newItems) {
        console.log("[PURCHASES] deltaStock() old->new", oldItems, newItems);
        function toMap(arr) {
            var m = {};
            (arr || []).forEach(function (it) {
                var key = it.id || String(it.name || "").toLowerCase();
                m[key] = (m[key] || 0) + num(it.qty || it.quantity);
            });
            return m;
        }
        var mOld = toMap(oldItems || []);
        var mNew = toMap(newItems || []);
        var keyset = {};
        for (var k1 in mOld) keyset[k1] = 1;
        for (var k2 in mNew) keyset[k2] = 1;
        for (var k in keyset) {
            var d = (mNew[k] || 0) - (mOld[k] || 0); // + əlavə, - azalma
            if (d === 0) continue;
            var hit = findById(k);
            if (!hit) hit = findByName(k);
            if (!hit) { console.warn("Product not found in delta:", k); continue; }
            hit.p.stock = num(hit.p.stock) + d;
        }
        saveProductsLocal(window.allProducts);
        notifyProductsUI();
    }

    /* ---------------- Render purchases ---------------- */
    function render(list) {
        if (!listEl) return;
        listEl.innerHTML = "";
        if (!list || !list.length) {
            listEl.innerHTML = '<p style="text-align:center;color:#6c757d;margin:12px 0">Hələ heç bir alış yoxdur.</p>';
            return;
        }

        list.forEach(function (pur) {
            var total = (pur.items || []).reduce(function (s, it) {
                return s + num(it.buyPrice) * num(it.qty);
            }, 0);

            var card = document.createElement("div");
            card.className = "p-card";
            card.setAttribute("data-id", pur.id);

            var summary = document.createElement("div");
            summary.className = "summary";

            var left = document.createElement("div");
            left.className = "left";
            left.innerHTML =
                '<i class="fa-solid fa-cart-shopping"></i>' +
                '<div>' +
                '<div class="title">Alış (' + (pur.items || []).length + ' sətir)</div>' +
                '<div class="meta">' + new Date(pur.ts).toLocaleString() + "</div>" +
                "</div>";

            var right = document.createElement("div");
            right.className = "right";
            right.innerHTML = "<strong>" + total.toFixed(2) + " AZN</strong>";

            summary.appendChild(left);
            summary.appendChild(right);

            var details = document.createElement("div");
            details.className = "details";
            var inner = "";
            (pur.items || []).forEach(function (it) {
                inner +=
                    '<div class="row">' +
                    '<div class="name">' + (it.name || "") + "</div>" +
                    '<div class="qty">' + num(it.qty) + " " + (it.units || "ədəd") + "</div>" +
                    '<div class="price">' + num(it.buyPrice).toFixed(2) + " AZN</div>" +
                    "</div>";
            });
            details.innerHTML = inner;

            summary.onclick = function () {
                if (state.mode === "edit") { selectCard(card); openEdit(pur.id); return; }
                if (state.mode === "delete") { selectCard(card); removePurchase(pur.id); return; }
                card.classList.toggle("expanded");
            };

            card.appendChild(summary);
            card.appendChild(details);
            listEl.appendChild(card);
        });
    }
    function selectCard(card) {
        $all(".p-card.selected-edit,.p-card.selected-delete").forEach(function (x) {
            x.classList.remove("selected-edit", "selected-delete");
        });
        card.classList.add(state.mode === "edit" ? "selected-edit" : "selected-delete");
    }

    /* ---------------- Existing products list (in add modal) ---------------- */
    function renderExisting(filter) {
        if (!pmList) return;
        pmList.innerHTML = "";

        var cats = Object.keys(window.allProducts || {});
        if (!cats.length) {
            pmList.innerHTML = '<p style="color:#6c757d">Məhsul tapılmadı.</p>';
            return;
        }
        var q = String(filter || "").trim().toLowerCase();

        cats.forEach(function (cat) {
            var items = (window.allProducts[cat] || []).filter(function (p) {
                if (!q) return true;
                return String(p.name || "").toLowerCase().indexOf(q) >= 0 ||
                    String(p.barcode || "").indexOf(q) >= 0;
            });
            if (!items.length) return;

            var box = document.createElement("div");
            box.className = "pm-category";

            var head = document.createElement("div");
            head.className = "pm-cat-head";
            head.innerHTML = "<span>" + cat + "</span><span>" + items.length + "</span>";
            head.onclick = function () { body.classList.toggle("hidden"); };

            var body = document.createElement("div");
            body.className = "pm-items";

            items.forEach(function (p) {
                var id = productId(cat, p.name, p.id);
                var row = document.createElement("div");
                row.className = "pm-row";
                row.setAttribute("data-id", id);
                row.setAttribute("data-name", p.name || "");
                row.setAttribute("data-units", p.units || "ədəd");

                row.innerHTML =
                    '<div class="pm-name">' + (p.name || "") + "</div>" +
                    '<div class="pm-price">Stok: ' + num(p.stock) + "</div>" +
                    '<input class="pm-qty" type="number" min="0" step="0.01" placeholder="Miqdar">' +
                    '<input class="pm-buy" type="number" min="0" step="0.01" placeholder="Alış qiyməti">';
                body.appendChild(row);
            });

            box.appendChild(head);
            box.appendChild(body);
            pmList.appendChild(box);
        });
    }
    function collectExisting() {
        var rows = $all(".pm-row", pmList);
        var items = [];
        rows.forEach(function (r) {
            var qtyEl = r.querySelector(".pm-qty");
            var buyEl = r.querySelector(".pm-buy");
            var qty = num(qtyEl && qtyEl.value);
            var buy = num(buyEl && buyEl.value);
            if (qty > 0) {
                items.push({
                    id: r.getAttribute("data-id"),
                    name: r.getAttribute("data-name"),
                    units: r.getAttribute("data-units") || "ədəd",
                    qty: qty,
                    buyPrice: buy
                });
            }
        });
        return items;
    }

    /* ---------------- New product in add modal ---------------- */
    function collectNewProduct() {
        var name = String(newName.value || "").trim();
        var cat = String(newCat.value || "Digər").trim();
        var units = String(newUnits.value || "ədəd").trim();
        var qty = num(newQty.value);
        var buy = num(newBuy.value);
        var saleV = newSale.value ? num(newSale.value) : null;

        if (!name || qty <= 0) { alert("Ad və başlanğıc stok tələb olunur."); return null; }

        // Yeni məhsulu məhsullar bazasına yaz
        var prod = {
            id: "p-" + Date.now(),
            name: name,
            category: cat,
            units: units,
            stock: qty,
            price: (saleV != null ? saleV : 0),
            barcode: String(newBarcode.value || "").trim(),
            description: String(newDesc.value || "").trim(),
            last_buy: buy
        };
        (window.allProducts[cat] || (window.allProducts[cat] = [])).push(prod);
        saveProductsLocal(window.allProducts);

        // Purchase-ə yazılacaq sətir
        return [{
            id: prod.id,
            name: prod.name,
            units: prod.units,
            qty: qty,
            buyPrice: buy
        }];
    }

    /* ---------------- Add modal flow ---------------- */
    function openAdd() {
        ensureProducts(function () {
            // Kateqoriya datalisti (varsa)
            var dl = $("#pm-cat-datalist");
            if (dl) {
                dl.innerHTML = "";
                Object.keys(window.allProducts || {}).forEach(function (c) {
                    var o = document.createElement("option");
                    o.value = c;
                    dl.appendChild(o);
                });
            }

            pmType.value = "existing";
            show(pmExisting); hide(pmNew);
            if (pmSearch) pmSearch.value = "";
            renderExisting("");

            show(pmBackdrop); show(pmModal);
            setTimeout(function () { if (pmSearch) pmSearch.focus(); }, 30);
        });
    }
    function closeAdd() { hide(pmBackdrop); hide(pmModal); }

    function saveAdd() {
        var items;
        if (pmType.value === "existing") {
            items = collectExisting();
            if (!items.length) { alert("Heç bir sətir doldurulmayıb."); return; }
        } else {
            var it = collectNewProduct();
            if (!it) return;
            items = it;
        }

        // Purchase yaz
        var h = loadPurchases();
        h.unshift({
            id: "buy-" + Date.now(),
            items: items,
            ts: Date.now(),
            updated_ts: null
        });
        savePurchases(h);

        // STOKU ARTIR
        addStock(items);

        render(h);
        closeAdd();
        alert("Alış əlavə olundu.");
        setMode("view");
    }

    /* ---------------- Edit/Delete flow ---------------- */
    function openEdit(id) {
        state.editingId = id;
        var h = loadPurchases();
        var pur = null, i;
        for (i = 0; i < h.length; i++) { if (h[i].id === id) { pur = h[i]; break; } }
        if (!pur) return;

        peBody.innerHTML = "";
        (pur.items || []).forEach(function (it) {
            var row = document.createElement("div");
            row.className = "em-row";
            row.setAttribute("data-id", it.id || "");
            row.setAttribute("data-name", it.name || "");
            row.setAttribute("data-units", it.units || "ədəd");

            row.innerHTML =
                '<div>' + (it.name || "") + "</div>" +
                '<input class="em-qty" type="number" min="0" step="0.01" value="' + num(it.qty) + '">' +
                '<input class="em-buy" type="number" min="0" step="0.01" value="' + num(it.buyPrice) + '">' +
                '<button class="btn-plain em-remove" title="Sətiri sil">&times;</button>';

            var rm = row.querySelector(".em-remove");
            if (rm) rm.onclick = function () { row.parentNode.removeChild(row); };
            peBody.appendChild(row);
        });

        show(peBackdrop); show(peModal);
    }
    function closeEdit() { hide(peBackdrop); hide(peModal); state.editingId = null; }

    function saveEdit() {
        var id = state.editingId; if (!id) return;
        var h = loadPurchases();
        var idx = -1, i;
        for (i = 0; i < h.length; i++) { if (h[i].id === id) { idx = i; break; } }
        if (idx === -1) return;

        var old = h[idx];

        var rows = $all(".em-row", peBody);
        var items = rows.map(function (r) {
            var qEl = r.querySelector(".em-qty");
            var bEl = r.querySelector(".em-buy");
            return {
                id: r.getAttribute("data-id") || null,
                name: r.getAttribute("data-name") || "",
                units: r.getAttribute("data-units") || "ədəd",
                qty: num(qEl && qEl.value),
                buyPrice: num(bEl && bEl.value)
            };
        }).filter(function (x) { return x.qty > 0; });

        if (!items.length) { alert("Heç bir sətir qalmadı."); return; }

        // STOK FƏRQİ
        deltaStock(old.items || [], items);

        h[idx] = { id: old.id, items: items, ts: old.ts, updated_ts: Date.now() };
        savePurchases(h);
        render(h);
        closeEdit();
        alert("Alış düzənləndi.");
        setMode("view");
    }

    function removePurchase(id) {
        if (!confirm("Alışı silmək istəyirsiniz?")) return;
        var h = loadPurchases();
        var pur = null, i;
        for (i = 0; i < h.length; i++) { if (h[i].id === id) { pur = h[i]; break; } }
        if (!pur) return;

        // Silinən alışın miqdarını stokdan ÇIX
        subStock(pur.items || []);

        var nh = h.filter(function (x) { return x.id !== id; });
        savePurchases(nh);
        render(nh);
        setMode("view");
        alert("Alış silindi.");
    }

    /* ---------------- Search ---------------- */
    function runSearch(q) {
        var h = loadPurchases();
        if (!q) {
            render(h);
            if (searchResults) searchResults.innerHTML = "";
            return;
        }
        var f = String(q).trim().toLowerCase();
        var m = h.filter(function (p) {
            return (p.items || []).some(function (it) {
                return String(it.name || "").toLowerCase().indexOf(f) >= 0;
            });
        });
        render(m);

        if (!searchResults) return;
        searchResults.innerHTML = "";
        m.slice(0, 25).forEach(function (p) {
            var sum = (p.items || []).reduce(function (s, it) {
                return s + num(it.buyPrice) * num(it.qty);
            }, 0);
            var row = document.createElement("div");
            row.className = "s-result";
            row.innerHTML =
                '<i class="fa-solid fa-cart-shopping"></i>' +
                '<div><div>Alış</div><div class="kind">' + new Date(p.ts).toLocaleDateString() + "</div></div>" +
                '<div class="right">' + sum.toFixed(2) + " AZN</div>";
            row.onclick = function () {
                var el = document.querySelector('.p-card[data-id="' + p.id + '"]');
                if (el) { el.classList.add("expanded"); try { el.scrollIntoView({ behavior: "smooth" }); } catch (e) { } }
            };
            searchResults.appendChild(row);
        });
    }

    /* ---------------- Mode toggle ---------------- */
    function setMode(m) {
        state.mode = m;
        if (editBtn) editBtn.classList.toggle("edit-active", m === "edit");
        if (delBtn) delBtn.classList.toggle("delete-active", m === "delete");
        $all(".p-card.selected-edit,.p-card.selected-delete").forEach(function (x) {
            x.classList.remove("selected-edit", "selected-delete");
        });
    }

    /* ---------------- Wire ---------------- */
    function wire() {
        on(addBtn, "click", openAdd);
        on(pmClose, "click", closeAdd);
        on(pmBackdrop, "click", closeAdd);
        on(pmType, "change", function () {
            if (pmType.value === "existing") { show(pmExisting); hide(pmNew); setTimeout(function () { if (pmSearch) pmSearch.focus(); }, 20); }
            else { hide(pmExisting); show(pmNew); setTimeout(function () { if (newName) newName.focus(); }, 20); }
        });
        on(pmSearch, "input", function () { renderExisting(pmSearch.value || ""); });
        on(pmSave, "click", saveAdd);

        on(editBtn, "click", function () { setMode(state.mode === "edit" ? "view" : "edit"); });
        on(delBtn, "click", function () { setMode(state.mode === "delete" ? "view" : "delete"); });

        on(peClose, "click", closeEdit);
        on(peBackdrop, "click", closeEdit);
        on(peSave, "click", saveEdit);
        on(peDelete, "click", function () { if (state.editingId) removePurchase(state.editingId); });

        on(searchBtn, "click", function () {
            if (!searchPanel) return;
            searchPanel.classList.toggle("hidden");
            if (!searchPanel.classList.contains("hidden") && searchInput) searchInput.focus();
            runSearch((searchInput && searchInput.value) || "");
        });
        on(searchInput, "input", function () { runSearch(searchInput.value || ""); });

        // Products UI bizi dinləsin (istəyə bağlı)
        try {
            window.addEventListener("products-updated", function () { /* burada ayrıca re-render lazım deyil */ });
        } catch (e) { }
    }

    /* ---------------- Start ---------------- */
    function start() {
        ensureProducts(function () {
            render(loadPurchases());
            wire();
        });
    }

    if (document.readyState !== "loading") start();
    else document.addEventListener("DOMContentLoaded", start);
}
