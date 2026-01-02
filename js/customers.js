(function () {
    if (window.__CUSTOMERS_JS_LOADED__) return;
    window.__CUSTOMERS_JS_LOADED__ = true;

    /* === helpers === */
    var $ = function (s) { return document.querySelector(s); };
    var $$ = function (s) { return Array.from(document.querySelectorAll(s)); };
    var on = function (el, ev, fn) { el && el.addEventListener(ev, fn); };
    var show = function (el) { el && el.classList.remove('hidden'); };
    var hide = function (el) { el && el.classList.add('hidden'); };
    var money = function (n) { return Number(n || 0).toFixed(2) + ' AZN'; };

    /* === state === */
    var mode = 'view'; // view | edit | delete
    // window.allCustomers is populated here and exposed for sales.js
    window.allCustomers = [];

    /* === Firestore Logic === */
    let unsubscribeCustomers = null;
    let saleHistoryMap = {}; // Cache for displaying history in customer card

    function initFirestore() {
        const custRef = window.collection(window.db, "customers");
        unsubscribeCustomers = window.onSnapshot(custRef, (snapshot) => {
            const list = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            // Sort by name
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            window.allCustomers = list;
            render();

            // Also listen to sales to show history per customer? 
            // Ideally we shouldn't query ALL sales here if there are thousands.
            // But valid for small app.
            // Rely on sales.js to load sales?
            // Since sales.js loads last 50 sales, we might not see all history here.
            // For now, let's load sales on demand or just use what we have?
            // To keep it simple and consistent with old app: Fetch sales for specific customer? 
            // Or fetch all sales (limit 500?) for history display?
            // Let's rely on a separate query for history if expanded?
            // For migration simplicity: separate listener for all sales (maybe limit 100) or just ignore history in customer card for now?
            // The old code loaded ALL history from localStorage.
            // Let's try to query sales for the customer when rendering history.

        }, (err) => {
            console.error("Customers listener error:", err);
        });
    }

    // Note: To show history in customer card without downloading all sales, we will fetch on expand?
    // The original code passed `getHistory()` which was sync from localStorage.
    // We will implementing "renderHistoryForCustomer" to fetch async or just show "Loading...".

    /* === dom === */
    var listEl = $('#customers-list');

    var searchToggle = $('#c-search-toggle');
    var addToggle = $('#c-add-toggle');
    var editToggle = $('#c-edit-toggle');
    var deleteToggle = $('#c-delete-toggle');

    var searchPanel = $('#c-search-panel');
    var searchInput = $('#c-search');

    // add modal
    var addBackdrop = $('#c-add-backdrop');
    var addModal = $('#c-add-modal');
    var addSave = $('#c-add-save');
    var addName = $('#add-name');
    var addPhone = $('#add-phone');
    var addMobile = $('#add-mobile');
    var addAddress = $('#add-address');
    var addError = $('#add-error');
    var addCancelBtn;

    // edit modal
    var eBackdrop = $('#c-edit-backdrop');
    var eModal = $('#c-edit-modal');
    var eBody = $('#c-edit-body');
    var eSave = $('#c-edit-save');
    var eCancelBtn;
    var editingId = null;

    /* === render === */
    function render() {
        if (!listEl) return;
        var q = (searchInput && searchInput.value || '').trim().toLowerCase();
        listEl.innerHTML = '';

        window.allCustomers
            .filter(function (c) {
                if (!q) return true;
                var s = (c.name || '') + ' ' + (c.phone || '') + ' ' + (c.mobile || '') + ' ' + (c.address || '');
                return s.toLowerCase().indexOf(q) >= 0;
            })
            .forEach(function (c) {
                listEl.appendChild(renderCard(c));
            });
    }

    function renderCard(c) {
        var card = document.createElement('div');
        card.className = 'c-card';
        card.dataset.id = c.id;

        var summary = document.createElement('div');
        summary.className = 'summary';
        summary.innerHTML =
            '<div class="left">' +
            '<i class="fa-solid fa-user" style="color:#2f8cff"></i>' +
            '<div>' +
            '<div class="name">' + (c.name || '-') + '</div>' +
            '<div class="sub">' + (c.phone || '') + (c.phone && c.mobile ? ' · ' : '') + (c.mobile || '') + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="right">' + (c.address || '') + '</div>';

        var details = document.createElement('div');
        details.className = 'details';
        // Details content will be loaded on click
        details.innerHTML = '<div style="padding:10px; color:#888;">Tarixçə yüklənir...</div>';

        summary.onclick = function () {
            if (mode === 'view') {
                const wasExpanded = card.classList.contains('expanded');
                card.classList.toggle('expanded');
                if (!wasExpanded) {
                    loadAndRenderHistory(c.id, details);
                }
            } else if (mode === 'edit') {
                selectOne(card, 'edit'); openEditModal(c);
            } else if (mode === 'delete') {
                selectOne(card, 'delete');
                if (confirm('Müştərini silmək istəyirsiniz?\n' + (c.name || ''))) {
                    deleteCustomer(c.id);
                }
            }
        };

        card.appendChild(summary);
        card.appendChild(details);
        return card;
    }

    async function loadAndRenderHistory(customerId, container) {
        try {
            const q = window.query(
                window.collection(window.db, "sales"),
                window.where("customerId", "==", customerId),
                window.orderBy("ts", "desc"),
                window.limit(20)
            );
            const snap = await window.getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));

            container.innerHTML = '';
            if (!list.length) {
                container.innerHTML = '<div class="sub">Hələ əməliyyat yoxdur.</div>';
                return;
            }

            var wrap = document.createElement('div');
            list.forEach(function (s) {
                var sg = document.createElement('div'); sg.className = 'sg';
                var head = document.createElement('div'); head.className = 'sg-head';
                head.innerHTML =
                    '<div class="date">' + new Date(s.ts).toLocaleDateString() + '</div>' +
                    (s.kind === 'sell' ? '<span class="badge sell">Satıldı</span>' : '<span class="badge credit">Borc</span>') +
                    '<div class="total">' + money(s.total) + '</div>';
                var body = document.createElement('div'); body.className = 'sg-body';

                (s.items || []).forEach(function (it) {
                    var row = document.createElement('div'); row.className = 'sale-item';
                    row.innerHTML =
                        '<div>' + it.name + '</div>' +
                        '<div class="qty">' + (it.quantity + ' ' + (it.units || 'ədəd')) + '</div>' +
                        '<div>' + money(Number(it.price) * Number(it.quantity)) + '</div>';
                    body.appendChild(row);
                });
                var tot = document.createElement('div'); tot.className = 'sale-total';
                tot.innerHTML = '<span></span><span>Cəm: <strong>' + money(s.total) + '</strong></span>';
                body.appendChild(tot);

                head.onclick = function () { sg.classList.toggle('open'); };

                sg.appendChild(head);
                sg.appendChild(body);
                wrap.appendChild(sg);
            });
            container.appendChild(wrap);

        } catch (e) {
            console.error(e);
            container.innerHTML = '<div class="sub text-danger">Tarixçə yüklənmədi.</div>';
        }
    }

    /* === mode === */
    function setMode(m) {
        mode = m;
        editToggle.classList.toggle('active', m === 'edit');
        deleteToggle.classList.toggle('active', m === 'delete');
        $$('.c-card.editing,.c-card.deleting').forEach(function (el) { el.classList.remove('editing', 'deleting'); });
    }
    function selectOne(card, kind) {
        $$('.c-card.editing,.c-card.deleting').forEach(function (el) { el.classList.remove('editing', 'deleting'); });
        if (kind === 'edit') card.classList.add('editing');
        if (kind === 'delete') card.classList.add('deleting');
    }

    /* === add modal === */
    function openAdd() {
        addName.value = ''; addPhone.value = ''; addMobile.value = ''; addAddress.value = '';
        hide(addError); show(addBackdrop); show(addModal);
        setTimeout(function () { addName.focus(); }, 50);
    }
    function closeAdd() { hide(addBackdrop); hide(addModal); }

    async function saveAdd() {
        if (!addName.value.trim()) { show(addError); return; }
        const data = {
            name: addName.value.trim(),
            phone: addPhone.value.trim(),
            mobile: addMobile.value.trim(),
            address: addAddress.value.trim(),
            created_at: Date.now()
        };
        try {
            await window.addDoc(window.collection(window.db, "customers"), data);
            render();
            closeAdd();
        } catch (e) {
            console.error(e);
            alert("Xəta: " + e.message);
        }
    }

    /* === edit modal (yalnız əlaqə məlumatı) === */
    function openEditModal(c) {
        editingId = c.id;
        eBody.innerHTML =
            '<div class="form-grid">' +
            '<label>Ad, Soyad<input id="e-name" type="text" value="' + (c.name || '') + '"></label>' +
            '<label>Telefon<input id="e-phone" type="text" value="' + (c.phone || '') + '"></label>' +
            '<label>Mobil<input id="e-mobile" type="text" value="' + (c.mobile || '') + '"></label>' +
            '<label>Ünvan<input id="e-address" type="text" value="' + (c.address || '') + '"></label>' +
            '</div>' +
            '<div style="margin-top:10px;color:#6c757d;font-size:.9rem">Qeyd: Müştərinin adı dəyişərsə, Satış tarixçəsində köhnə ad qala bilər.</div>';
        show(eBackdrop); show(eModal);
    }
    function closeEdit() { hide(eBackdrop); hide(eModal); editingId = null; setMode('view'); }

    async function saveEdit() {
        if (!editingId) return;
        var nm = ($('#e-name').value || '').trim();
        if (!nm) { alert('Ad, Soyad boş ola bilməz'); return; }

        const data = {
            name: nm,
            phone: ($('#e-phone').value || '').trim(),
            mobile: ($('#e-mobile').value || '').trim(),
            address: ($('#e-address').value || '').trim()
        };

        try {
            const ref = window.doc(window.db, "customers", editingId);
            await window.updateDoc(ref, data);

            // Note: We are NOT updating sales history names here to keep it simple and safe.
            // If strictly required, we would query sales where customerId == editingId and update them.

            render();
            closeEdit();
        } catch (e) {
            console.error(e);
            alert("Xəta: " + e.message);
        }
    }

    async function deleteCustomer(id) {
        try {
            await window.deleteDoc(window.doc(window.db, "customers", id));
            setMode('view');
        } catch (e) {
            console.error(e);
            alert("Silinmə xətası: " + e.message);
        }
    }

    /* === wiring === */
    function wire() {
        on(searchToggle, 'click', function () {
            if (searchPanel.classList.contains('hidden')) { show(searchPanel); searchInput && searchInput.focus(); }
            else hide(searchPanel);
        });
        on(searchInput, 'input', render);

        on(addToggle, 'click', openAdd);
        on(addSave, 'click', saveAdd);

        var addFooter = addModal.querySelector('.modal-footer');
        // Check if button already exists to avoid dupes if re-wired (though this runs once)
        if (!addFooter.querySelector('.btn.danger')) {
            addCancelBtn = document.createElement('button');
            addCancelBtn.className = 'btn danger';
            addCancelBtn.textContent = 'Ləğv et';
            addFooter.insertBefore(addCancelBtn, addFooter.firstChild);
            on(addCancelBtn, 'click', function () { closeAdd(); });
        }

        on(editToggle, 'click', function () { setMode(mode === 'edit' ? 'view' : 'edit'); });
        on(deleteToggle, 'click', function () { setMode(mode === 'delete' ? 'view' : 'delete'); });

        on(eSave, 'click', saveEdit);
        var eFooter = eModal.querySelector('.modal-footer');
        if (!eFooter.querySelector('.btn.danger')) {
            eCancelBtn = document.createElement('button');
            eCancelBtn.className = 'btn danger';
            eCancelBtn.textContent = 'Ləğv et';
            eFooter.insertBefore(eCancelBtn, eFooter.firstChild);
            on(eCancelBtn, 'click', function () { closeEdit(); });
        }

        on($('#c-add-backdrop'), 'click', closeAdd);
        on($('#c-edit-backdrop'), 'click', closeEdit);
    }

    /* === start === */
    function start() {
        initFirestore();
        wire();
    }
    if (document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start);
})();
