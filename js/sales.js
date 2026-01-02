/* =========================================================
   Satış axını (müştəri seçimi + məhsul seçimi + tarix + edit/sil)
   ========================================================= */
if (window.__SALES_JS_LOADED__) {
    console.warn('sales.js already loaded; skipping duplicate init');
} else {
    window.__SALES_JS_LOADED__ = true;

    /* -------- utils -------- */
    function $(s) { return document.querySelector(s); }
    function on(el, e, fn) { if (el && el.addEventListener) el.addEventListener(e, fn); }
    function show(el) { el && el.classList.remove('hidden'); }
    function hide(el) { el && el.classList.add('hidden'); }
    function setText(el, t) { el && (el.textContent = t); }
    function pickLast(sel) { var n = document.querySelectorAll(sel); return n.length ? n[n.length - 1] : null; }

    /* -------- state -------- */
    var cart = [], currentCustomer = null, currentMode = 'view', editingSaleId = null;
    // window.allProducts is managed by product.js via Firestore
    // window.allCustomers is managed by customers.js via Firestore (we will listen to it or just use it)

    /* -------- dom -------- */
    var addBtn = $('#sales-add-toggle'), editBtn = $('#sales-edit-toggle'), delBtn = $('#sales-delete-toggle'), searchBtn = $('#sales-search-toggle');
    var searchPanel = $('#sales-search-panel'), searchInput = $('#universal-search-input'), searchResults = $('#universal-search-results');
    var custPanel = pickLast('#customer-select-panel'), custList = pickLast('#customer-list-select'), custFilter = pickLast('#customer-inline-search');
    var txnPanel = $('#sale-transaction-panel'), currentCust = $('#current-customer-name'), pickBtn = $('#select-product-btn');
    var cartList = $('#cart-item-list'), payBar = $('#payment-summary'), totalItems = $('#item-count-total'), totalAzN = $('#final-price-total');
    var btnSell = $('#pay-sell-btn'), btnCredit = $('#pay-credit-btn'), btnCancel = $('#pay-cancel-btn');
    var pmBackdrop = $('#product-modal-backdrop'), pmModal = $('#product-modal'), pmClose = $('#pm-close'), pmList = $('#pm-list'), pmSearch = $('#pm-search'), pmAdd = $('#pm-add-selected');
    var pmSelected = new Map();
    var emBackdrop = $('#edit-modal-backdrop'), emModal = $('#edit-modal'), emBody = $('#em-body'), emClose = $('#em-close'), emSave = $('#em-save');
    var historyEl = $('#sales-history-list');

    /* -------- Firestore Logic -------- */
    let allSales = [];
    let unsubscribeSales = null;

    function initFirestore() {
        const salesRef = window.collection(window.db, 'sales');
        // Real-time listener for sales
        // Order by ts descending
        const q = window.query(salesRef, window.orderBy('ts', 'desc'), window.limit(50));

        unsubscribeSales = window.onSnapshot(q, (snapshot) => {
            allSales = [];
            snapshot.forEach(doc => {
                allSales.push({ id: doc.id, ...doc.data() });
            });
            renderHistory(allSales);
        }, (err) => {
            console.error('Sales listener error:', err);
        });
    }

    /* -------- wiring -------- */
    function wire() {
        on(searchBtn, 'click', function (e) { e.preventDefault(); searchPanel.classList.toggle('hidden'); if (!searchPanel.classList.contains('hidden')) searchInput && searchInput.focus(); runHistorySearch((searchInput && searchInput.value || '').trim().toLowerCase()); });
        on(searchInput, 'input', function () { runHistorySearch((searchInput && searchInput.value || '').trim().toLowerCase()); });

        on(addBtn, 'click', function (e) {
            e.preventDefault();
            // Customers should be available via customers.js (window.allCustomers)
            if (custFilter) { custFilter.value = ''; window.__custFilter = ''; }
            renderCustomerList();
            hide(searchPanel);
            custPanel.classList.toggle('hidden');
            if (!custPanel.classList.contains('hidden') && custFilter) custFilter.focus();
        });
        on(custFilter, 'input', function () { window.__custFilter = (custFilter && custFilter.value || '').trim().toLowerCase(); renderCustomerList(); });

        on(editBtn, 'click', function (e) { e.preventDefault(); setMode(currentMode === 'edit' ? 'view' : 'edit'); });
        on(delBtn, 'click', function (e) { e.preventDefault(); setMode(currentMode === 'delete' ? 'view' : 'delete'); });

        on(pickBtn, 'click', function () { if (!currentCustomer) return alert('Əvvəl müştəri seçin'); openProductModal(); });
        on(btnCancel, 'click', function () { resetView(); alert('Satış ləğv edildi.'); });
        on(btnSell, 'click', function () { finalizeSale('sell'); });
        on(btnCredit, 'click', function () { finalizeSale('credit'); });

        on(pmClose, 'click', closeProductModal);
        on(pmBackdrop, 'click', closeProductModal);
        on(pmSearch, 'input', function () { renderProductModal((pmSearch && pmSearch.value || '').trim().toLowerCase()); });
        on(pmAdd, 'click', addSelectedFromModal);

        on(emClose, 'click', closeEditModal);
        on(emBackdrop, 'click', closeEditModal);
        on(emSave, 'click', saveEdit);
    }

    function setMode(m) {
        currentMode = m;
        editBtn && editBtn.classList.toggle('edit-active', m === 'edit');
        delBtn && delBtn.classList.toggle('delete-active', m === 'delete');
        [].forEach.call(document.querySelectorAll('.sale-card.selected-edit,.sale-card.selected-delete'), function (el) {
            el.classList.remove('selected-edit', 'selected-delete');
        });
    }

    /* -------- renderers -------- */
    function renderCustomerList() {
        if (!custList) return;
        custList.innerHTML = '';
        // Assuming window.allCustomers is populated by customers.js
        var list = window.allCustomers || [];
        if (!list.length) { custList.innerHTML = '<p>Müştəri datası tapılmadı.</p>'; return; }
        var q = (window.__custFilter || '').toLowerCase();

        list.forEach(function (c) {
            if (q) {
                var hay = (c.name || '') + ' ' + (c.phone || '');
                if (hay.toLowerCase().indexOf(q) === -1) return;
            }
            var div = document.createElement('div');
            div.className = 'customer-card'; div.setAttribute('data-id', c.id);
            div.innerHTML = '<i class="fa-solid fa-user"></i> ' + c.name + ' <span style="color:#888;font-size:.9em;">' + (c.phone || '') + '</span>';
            div.onclick = function () { currentCustomer = { id: c.id, name: c.name }; setText(currentCust, c.name); custPanel.classList.add('hidden'); show(txnPanel); show(payBar); updateTotals(); };
            custList.appendChild(div);
        });
    }

    function renderProductModal(filter) {
        if (!pmList) return; pmList.innerHTML = '';
        var cats = Object.keys(window.allProducts || {});
        if (!cats.length) { pmList.innerHTML = '<p style="color:#6c757d">Məhsul tapılmadı.</p>'; return; }

        cats.forEach(function (cat) {
            var items = (window.allProducts[cat] || []).filter(function (p) {
                if (!filter) return true; var name = (p.name || '').toLowerCase(), bc = (p.barcode || ''); return name.indexOf(filter) >= 0 || bc.indexOf(filter) >= 0;
            });
            if (!items.length) return;

            var box = document.createElement('div'); box.className = 'pm-category';
            var head = document.createElement('div'); head.className = 'pm-cat-head';
            var body = document.createElement('div'); body.className = 'pm-items';
            head.innerHTML = '<span>' + cat + '</span><span>' + items.length + '</span>';
            head.onclick = function () { body.classList.toggle('hidden'); };

            items.forEach(function (p) {
                var row = document.createElement('div'); row.className = 'pm-row';
                var id = p.id;
                row.innerHTML =
                    '<div class="pm-name">' + p.name + '</div>' +
                    '<div class="pm-price">' + Number(p.price || 0).toFixed(2) + ' AZN</div>' +
                    '<input class="pm-qty" type="number" min="0" step="0.01" placeholder="Miqdar">' +
                    '<button class="pm-pick">Seç</button>';
                var qty = row.querySelector('.pm-qty');
                row.querySelector('.pm-pick').onclick = function () {
                    var q = parseFloat(qty.value); if (isNaN(q) || q <= 0) return alert('Miqdar düzgün deyil');
                    if (q > Number(p.stock)) return alert('"' + p.name + '" stok kifayət deyil');
                    pmSelected.set(id, (pmSelected.get(id) || 0) + q); qty.value = '';
                };
                body.appendChild(row);
            });

            box.appendChild(head); box.appendChild(body); pmList.appendChild(box);
        });
    }

    function renderCart() {
        if (!cartList) return; cartList.innerHTML = '';
        if (!cart.length) { cartList.innerHTML = '<p style="text-align:center;color:#6c757d;margin-top:10px;">Səbət boşdur.</p>'; return; }
        cart.forEach(function (it) {
            var row = document.createElement('div'); row.className = 'cart-item-detail';
            row.innerHTML = '<span class="cart-item-name">' + it.name + '</span>' +
                '<span class="cart-item-qty">' + it.quantity + ' ' + (it.units || 'ədəd') + '</span>' +
                '<span class="cart-item-price">' + (it.price * it.quantity).toFixed(2) + ' AZN</span>';
            cartList.appendChild(row);
        });
    }

    function renderHistory(list) {
        if (!historyEl) return; historyEl.innerHTML = '';
        if (!list.length) { historyEl.innerHTML = '<p style="text-align:center;color:#6c757d;margin:20px 0;">Hələ satış yoxdur.</p>'; return; }
        list.forEach(function (sale) {
            var card = document.createElement('div'); card.className = 'sale-card'; card.setAttribute('data-id', sale.id);
            var badgeClass = sale.kind === 'sell' ? 'sell' : 'credit', badgeText = sale.kind === 'sell' ? 'Satıldı' : 'Borc verildi';
            card.innerHTML =
                '<div class="summary">' +
                '<div class="left"><i class="fa-solid fa-receipt"></i><strong>' + sale.customerName + '</strong></div>' +
                '<div class="right"><span class="badge ' + badgeClass + '">' + badgeText + '</span><span>' + sale.count + ' növ</span><strong>' + sale.total.toFixed(2) + ' AZN</strong></div>' +
                '</div>' +
                '<div class="details">' +
                '<div class="sale-items">' +
                sale.items.map(function (it) {
                    return '<div class="sale-item-row"><div>' + it.name + '</div><div class="qty">' + it.quantity + ' ' + (it.units || 'ədəd') + '</div><div>' + (it.price * it.quantity).toFixed(2) + ' AZN</div></div>';
                }).join('') +
                '</div>' +
                '<div class="sale-total-line"><span></span><span>Cəm: <strong>' + sale.total.toFixed(2) + ' AZN</strong></span></div>' +
                '</div>';

            card.querySelector('.summary').onclick = function () {
                if (currentMode === 'edit') { selectCard(card); openEdit(sale.id); return; }
                if (currentMode === 'delete') { selectCard(card); confirmDelete(sale.id); return; }
                card.classList.toggle('expanded');
            };
            historyEl.appendChild(card);
        });
    }
    function selectCard(card) {
        [].forEach.call(document.querySelectorAll('.sale-card.selected-edit,.sale-card.selected-delete'), function (el) {
            el.classList.remove('selected-edit', 'selected-delete');
        });
        card.classList.add(currentMode === 'edit' ? 'selected-edit' : 'selected-delete');
    }

    /* -------- flows -------- */
    function openProductModal() { pmSelected.clear(); renderProductModal(''); pmBackdrop && pmBackdrop.classList.remove('hidden'); pmModal && pmModal.classList.remove('hidden'); setTimeout(function () { pmSearch && pmSearch.focus(); }, 50); }
    function closeProductModal() { pmBackdrop && pmBackdrop.classList.add('hidden'); pmModal && pmModal.classList.add('hidden'); pmSearch && (pmSearch.value = ''); }
    function addSelectedFromModal() {
        if (!pmSelected.size) return alert('Məhsul seçilməyib');

        // Find product details from window.allProducts
        pmSelected.forEach(function (qty, id) {
            var found = null, cat, arr, i;
            for (cat in window.allProducts) {
                arr = window.allProducts[cat] || [];
                for (i = 0; i < arr.length; i++) {
                    if (arr[i].id === id) { found = arr[i]; break; }
                }
                if (found) break;
            }
            if (!found) return;
            // Note: found.stock is already checked inside modal picking, but we could double check here

            var ex = cart.filter(function (it) { return it.id === id; })[0];
            if (ex) ex.quantity += qty;
            else cart.push({ id: id, name: found.name, price: Number(found.price || 0), units: (found.units || 'ədəd'), quantity: qty });
        });
        renderCart(); updateTotals(); closeProductModal();
    }

    function updateTotals() {
        var total = cart.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
        setText(totalItems, cart.length + ' növ'); setText(totalAzN, total.toFixed(2) + ' AZN');
        var dis = (!cart.length || !currentCustomer); btnSell && (btnSell.disabled = dis); btnCredit && (btnCredit.disabled = dis);
    }

    async function finalizeSale(kind) {
        if (!currentCustomer || !cart.length) return;
        var total = cart.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
        if (!confirm(currentCustomer.name + ' üçün ' + (kind === 'sell' ? 'SATIŞ' : 'BORC') + '.\nCəm: ' + total.toFixed(2) + ' AZN')) return;

        try {
            await window.runTransaction(window.db, async (transaction) => {
                // 1. Check stocks from FS
                for (let item of cart) {
                    const sfDocRef = window.doc(window.db, "products", item.id);
                    const sfDoc = await transaction.get(sfDocRef);
                    if (!sfDoc.exists()) {
                        throw "Product does not exist: " + item.name;
                    }
                    const newStock = Number(sfDoc.data().stock || 0) - Number(item.quantity);
                    if (newStock < 0) {
                        throw "Stock insufficient for: " + item.name;
                    }
                    transaction.update(sfDocRef, { stock: newStock, updated_at: Date.now() });
                }

                // 2. Add Sale
                const salesRef = window.collection(window.db, "sales");
                // Note: cannot addDoc in transaction directly (need doc ref). 
                // We use setDoc with auto id? Or just update products in trans and addDoc after?
                // Proper way: use doc(salesRef) to generate ID, then transaction.set(newSaleRef, data)
                const newSaleRef = window.doc(salesRef);
                transaction.set(newSaleRef, {
                    customerId: currentCustomer.id,
                    customerName: currentCustomer.name,
                    kind: kind,
                    items: cart.map(function (i) { return { id: i.id, name: i.name, price: i.price, units: i.units, quantity: i.quantity }; }),
                    count: cart.length,
                    total: total,
                    ts: Date.now(),
                    updated_ts: null
                });
            });

            alert((kind === 'sell' ? 'Satıldı' : 'Borc verildi') + ' — Cəm: ' + total.toFixed(2) + ' AZN');
            resetView();
        } catch (e) {
            console.error("Transaction failed: ", e);
            alert("Xəta baş verdi: " + e);
        }
    }

    // EDIT MODAL — aç
    function openEdit(id) {
        editingSaleId = id;
        var sale = allSales.find(s => s.id === id);
        if (!sale) return;

        // radio
        var radios = document.querySelectorAll('input[name="em-kind"]');
        [].forEach.call(radios, function (r) { r.checked = (r.value === (sale.kind || 'sell')); });

        emBody.innerHTML = '';
        (sale.items || []).forEach(function (it) {
            var row = document.createElement('div'); row.className = 'em-row';
            row.setAttribute('data-pid', it.id);
            row.setAttribute('data-name', it.name);
            row.setAttribute('data-units', it.units || 'ədəd');

            var qty = Number(it.quantity || 0), prc = Number(it.price || 0), line = (qty * prc).toFixed(2);
            row.innerHTML =
                '<div class="em-name">' + it.name + '</div>' +
                '<input class="em-qty" type="number" min="0" step="0.01" value="' + qty + '">' +
                '<input class="em-price" type="number" min="0" step="0.01" value="' + prc + '">' +
                '<div class="em-line">' + line + ' AZN</div>' +
                '<button class="em-remove" title="Sətiri sil">&times;</button>';

            var qtyI = row.querySelector('.em-qty'), priceI = row.querySelector('.em-price');
            function recalc() { var q = parseFloat(qtyI.value || '0'); var p = parseFloat(priceI.value || '0'); row.querySelector('.em-line').textContent = ((isNaN(q) ? 0 : q) * (isNaN(p) ? 0 : p)).toFixed(2) + ' AZN'; }
            qtyI.addEventListener('input', recalc); priceI.addEventListener('input', recalc);
            row.querySelector('.em-remove').addEventListener('click', function () { row.parentNode.removeChild(row); });

            emBody.appendChild(row);
        });

        emBackdrop && emBackdrop.classList.remove('hidden'); emModal && emModal.classList.remove('hidden');
    }
    function closeEditModal() { emBackdrop && emBackdrop.classList.add('hidden'); emModal && emModal.classList.add('hidden'); editingSaleId = null; }

    // EDIT MODAL — yadda saxla
    async function saveEdit() {
        if (!editingSaleId) return;
        const sale = allSales.find(s => s.id === editingSaleId);
        if (!sale) return;

        // kind
        var kind = 'sell', r = document.querySelector('input[name="em-kind"]:checked'); if (r) kind = r.value;

        // rows
        var rows = [].slice.call(emBody.querySelectorAll('.em-row'));
        var items = rows.map(function (rw) {
            var pid = rw.getAttribute('data-pid'), name = rw.getAttribute('data-name'), units = rw.getAttribute('data-units') || 'ədəd';
            var qty = parseFloat(rw.querySelector('.em-qty').value || '0'), price = parseFloat(rw.querySelector('.em-price').value || '0');
            return { id: pid, name: name, price: (isNaN(price) ? 0 : price), units: units, quantity: (isNaN(qty) ? 0 : qty) };
        }).filter(function (x) { return x.quantity > 0; });

        if (!items.length) { alert('Heç bir məhsul qalmadı.'); return; }

        try {
            await window.runTransaction(window.db, async (transaction) => {
                // Calculate stock diff
                function sumMap(arr) { var m = {}; arr.forEach(function (i) { m[i.id] = (m[i.id] || 0) + Number(i.quantity); }); return m; }
                var prev = sumMap(sale.items), now = sumMap(items), all = {}, k;
                for (k in prev) all[k] = 1; for (k in now) all[k] = 1;

                for (k in all) {
                    var delta = (prev[k] || 0) - (now[k] || 0); // delta > 0 means we return stock, delta < 0 means we take more stock
                    if (delta !== 0) {
                        const ref = window.doc(window.db, "products", k);
                        const docSnap = await transaction.get(ref);
                        if (!docSnap.exists()) {
                            // product might be deleted, just ignore stock update or error?
                            // let's ignore stock update for deleted products but allow sale edit
                            continue;
                        }
                        const newStock = Number(docSnap.data().stock) + delta;
                        if (newStock < 0) throw "Stock insufficient for product id: " + k;
                        transaction.update(ref, { stock: newStock });
                    }
                }

                const total = items.reduce(function (s, i) { return s + (Number(i.price) * Number(i.quantity)); }, 0);
                const saleRef = window.doc(window.db, "sales", editingSaleId);
                transaction.update(saleRef, {
                    kind: kind,
                    items: items,
                    count: items.length,
                    total: total,
                    updated_ts: Date.now()
                });
            });

            alert('Satış düzənləndi.');
            closeEditModal(); setMode('view');
        } catch (e) {
            console.error(e);
            alert('Xəta: ' + e);
        }
    }

    // DELETE
    async function confirmDelete(id) {
        if (!confirm('Satışı silmək istəyirsiniz?')) return;
        var sale = allSales.find(function (s) { return s.id === id; }); if (!sale) return;

        try {
            await window.runTransaction(window.db, async (transaction) => {
                // Restore stock
                for (let item of sale.items) {
                    const ref = window.doc(window.db, "products", item.id);
                    const docSnap = await transaction.get(ref);
                    if (docSnap.exists()) {
                        const newStock = Number(docSnap.data().stock) + Number(item.quantity);
                        transaction.update(ref, { stock: newStock });
                    }
                }
                // Delete sale
                const saleRef = window.doc(window.db, "sales", id);
                transaction.delete(saleRef);
            });
            alert('Satış silindi.'); setMode('view');
        } catch (e) {
            console.error(e);
            alert('Xəta: ' + e);
        }
    }

    function runHistorySearch(q) {
        if (!q) { renderHistory(allSales); if (searchResults) searchResults.innerHTML = ''; return; }
        var f = allSales.filter(function (s) { return (s.customerName || '').toLowerCase().indexOf(q) >= 0; });
        renderHistory(f);
        if (!searchResults) return; searchResults.innerHTML = '';
        f.slice(0, 20).forEach(function (s) {
            var row = document.createElement('div'); row.className = 's-result';
            row.innerHTML = '<i class="fa-solid fa-receipt"></i><div><div>' + s.customerName + '</div><div class="kind">Satış</div></div><div class="right">' + s.total.toFixed(2) + ' AZN</div>';
            row.onclick = function () { var el = document.querySelector('.sale-card[data-id="' + s.id + '"]'); if (el) { el.classList.add('expanded'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
            searchResults.appendChild(row);
        });
    }

    function resetView() { cart = []; currentCustomer = null; hide(searchPanel); hide(custPanel); hide(txnPanel); hide(payBar); setText(currentCust, 'Seçilməyib'); renderCart(); updateTotals(); }

    function start() {
        initFirestore();
        wire();
        resetView();
    }

    if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
}
