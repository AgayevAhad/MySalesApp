// --- product.js SINGLETON GUARD ---
if (window.__PRODUCT_JS_LOADED__) {
    console.warn('product.js already loaded; skipping duplicate init');
} else {
    window.__PRODUCT_JS_LOADED__ = true;
    // ---- qalan bütün product.js kodun BURADAN sonra qalsın ----

    // js/product.js — API-FIRST + OFFLINE QUEUE (stabil)



    // js/product.js — FIREBASE EDITION
    // Global Firebase objects (window.db, window.collection, etc.) must be initialized by firebase-init.js

    window.allProducts = {};
    let currentMode = 'view';
    // Firestore unsubscribe function for real-time updates
    let unsubscribeProducts = null;

    let ptrIndicator = null, pageContent = null;
    let isRefreshing = false, touchstartY = 0, isReadyForRefresh = false;
    const REFRESH_THRESHOLD = 70;

    // --- Loading & Real-time Listener ---
    function loadAllProducts(refresh = false) {
        // Real-time listener: data dəyişən kimi avtomatik işləyir
        if (unsubscribeProducts) {
            // artıq dinləyirik isə, sadəcə manual refresh UI-ı reset edək
            if (refresh) resetPullToRefresh();
            return;
        }

        const productsRef = window.collection(window.db, "products");
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) statusEl.textContent = 'Syncing...';

        unsubscribeProducts = window.onSnapshot(productsRef, (snapshot) => {
            const map = {};
            snapshot.forEach((doc) => {
                const p = doc.data();
                // Firestore-dan gələn data. id-ni doc.id kimi götürək əgər yoxdursa
                p.id = doc.id;
                if (!p.deleted) { // Soft delete varsa yoxla
                    (map[p.category || "Digər"] ||= []).push(p);
                }
            });

            window.allProducts = map;
            renderByCategory(window.allProducts);
            populateCategorySelect(window.allProducts);

            if (statusEl) statusEl.textContent = 'Online';
            if (refresh) resetPullToRefresh();

            // Başqa səhifələrə (sales.js) xəbər ver
            localStorage.setItem('businessAppProducts', JSON.stringify(window.allProducts));
            window.dispatchEvent(new Event('products-updated'));

        }, (error) => {
            console.error("Firestore xətası:", error);
            if (statusEl) statusEl.textContent = 'Error';
            // Fallback: local cached data
            const cached = JSON.parse(localStorage.getItem('businessAppProducts') || '{}');
            window.allProducts = cached;
            renderByCategory(cached);
        });
    }

    function resetPullToRefresh() {
        setTimeout(() => {
            if (ptrIndicator) ptrIndicator.classList.remove('loading', 'visible');
            if (pageContent) pageContent.style.transform = `translateY(0)`;
            isRefreshing = false; window.scrollTo(0, 0);
        }, 600);
    }

    // --- CRUD with Firestore ---

    // --- UI + PTR ---
    function initUI() {
        ptrIndicator = document.getElementById('ptr-indicator');
        pageContent = document.getElementById('product-page-content');

        const searchBtn = document.getElementById('search-button');
        const searchInput = document.getElementById('product-search');
        if (searchBtn) searchBtn.onclick = searchProducts;
        if (searchInput) {
            searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchProducts(); };
            searchInput.oninput = () => {
                if (searchInput.value.trim() === '') {
                    document.getElementById('product-list').classList.add('hidden');
                    document.getElementById('notifications-container').classList.remove('hidden');
                    renderByCategory(window.allProducts);
                }
            };
        }

        const addBtn = document.getElementById('add-product-btn');
        const editBtn = document.getElementById('edit-mode-btn');
        const delBtn = document.getElementById('delete-mode-btn');
        if (addBtn) addBtn.onclick = () => setMode('add');
        if (editBtn) editBtn.onclick = () => setMode('edit');
        if (delBtn) delBtn.onclick = () => setMode('delete');

        const cancelBtn = document.getElementById('cancel-add-product');
        const form = document.getElementById('new-product-form');
        if (cancelBtn) cancelBtn.onclick = () => setMode('view');
        if (form) form.onsubmit = onSubmit;

        const syncBtn = document.getElementById('syncBtn');
        const syncStatus = document.getElementById('syncStatus');
        if (syncBtn) {
            syncBtn.onclick = async () => { await loadAllProducts(true); };
        }

        populateCategorySelect(window.allProducts);
        renderByCategory(window.allProducts);

        // PTR
        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }

    function onTouchStart(e) {
        if (currentMode !== 'view' || isRefreshing) return;
        isReadyForRefresh = window.scrollY === 0;
        if (isReadyForRefresh) touchstartY = e.touches[0].clientY;
    }
    function onTouchMove(e) {
        if (currentMode !== 'view' || isRefreshing || !isReadyForRefresh) return;
        const diff = e.touches[0].clientY - touchstartY;
        if (diff < 0) { isReadyForRefresh = false; if (ptrIndicator) ptrIndicator.classList.remove('visible'); if (pageContent) pageContent.style.transform = 'translateY(0)'; return; }
        if (diff > 10) { e.preventDefault(); if (ptrIndicator) ptrIndicator.classList.add('visible'); const pull = Math.min(diff, REFRESH_THRESHOLD * 1.5); if (pageContent) pageContent.style.transform = `translateY(${pull}px)`; }
    }
    function onTouchEnd(e) {
        if (currentMode !== 'view' || isRefreshing || !isReadyForRefresh) return;
        const diff = e.changedTouches[0].clientY - touchstartY;
        if (diff > REFRESH_THRESHOLD) { isRefreshing = true; loadAllProducts(true); }
        else { if (pageContent) pageContent.style.transform = 'translateY(0)'; if (ptrIndicator) ptrIndicator.classList.remove('visible'); }
        isReadyForRefresh = false;
    }

    // --- CRUD ---
    async function onSubmit(ev) {
        ev.preventDefault();
        const id = document.getElementById('new-product-id').value.trim();

        if (id) await updateProduct(id);
        else await addProduct();

        document.getElementById('new-product-form').reset();
        setMode('view');
    }

    function formValues() {
        return {
            name: document.getElementById('new-product-name').value.trim(),
            category: document.getElementById('new-product-category').value.trim(),
            barcode: document.getElementById('new-product-barcode').value.trim(),
            price: parseFloat(document.getElementById('new-product-price').value),
            stock: parseInt(document.getElementById('new-product-stock').value),
            units: document.getElementById('new-product-units').value.trim(),
            description: document.getElementById('new-product-description').value.trim()
        };
    }

    async function addProduct() {
        const v = formValues();
        if (!v.name || !v.category || !v.barcode || isNaN(v.price) || isNaN(v.stock) || !v.units) {
            alert('Zəhmət olmasa bütün tələb olunan xanaları doldurun (*).'); return;
        }

        // Barkod yoxlanışı (local)
        let existed = null;
        for (const cat in window.allProducts) {
            const f = (window.allProducts[cat] || []).find(p => p.barcode === v.barcode);
            if (f) { existed = f; break; }
        }

        try {
            if (existed) {
                // Stock artır
                const newStock = Number(existed.stock) + v.stock;
                const docRef = window.doc(window.db, "products", existed.id);
                await window.updateDoc(docRef, {
                    stock: newStock,
                    price: v.price, // qiyməti də yenilə
                    updated_at: Date.now()
                });
                alert('Mövcud məhsulun sayı artırıldı.');
            } else {
                // Yeni məhsul
                const newId = `p-${Date.now()}`; // Custom ID or auto-ID
                const docRef = window.doc(window.db, "products", newId);
                await window.setDoc(docRef, {
                    ...v,
                    id: newId,
                    updated_at: Date.now(),
                    deleted: 0
                });
                alert('Yeni məhsul əlavə edildi.');
            }
            // onSnapshot avtomatik UI-ı yeniləyəcək
            setMode('view');
            document.getElementById('new-product-form').reset();
        } catch (e) {
            console.error(e);
            alert('Xəta baş verdi: ' + e.message);
        }
    }


    async function updateProduct(productId) {
        const v = formValues();
        try {
            const docRef = window.doc(window.db, "products", productId);
            await window.updateDoc(docRef, {
                ...v,
                updated_at: Date.now()
            });
            alert('Məhsul uğurla yeniləndi.');
            setMode('view');
        } catch (e) {
            console.error(e);
            alert('Yeniləmə xətası: ' + e.message);
        }
    }

    async function removeProduct(productId) {
        if (!confirm('Əminsinizmi ki, bu məhsulu silmək istəyirsiniz?')) return;
        try {
            const docRef = window.doc(window.db, "products", productId);
            await window.deleteDoc(docRef);
            // deleted:0 update də edə bilərik (soft delete), amma birbaşa silmək də olar
            // Soft delete istəyiriksə: updateDoc(docRef, {deleted: 1})
            // Amma userin server.py kodu delete edəndə deleted=1 edirdi.
            // Firebase-də physical delete daha rahatdır əgər history saxlamırıqsa.
            // Gəlin soft delete edək ki, product history pozulmasın satışlarda.
            // Əslində satışlarda ad və qiymət saxlanılır, id yox.
            // Buna görə birbaşa silmək olar. Amma deleteDoc istifadə edirəm.

            alert('Məhsul silindi.');
            setMode('view');
        } catch (e) {
            console.error(e);
            alert('Silmə xətası: ' + e.message);
        }
    }

    // --- Render/Search ---
    function setMode(mode) {
        currentMode = (currentMode === mode) ? 'view' : mode;

        const formDiv = document.getElementById('add-product-form');
        const listWrapper = document.getElementById('product-list-wrapper');
        const searchInput = document.getElementById('product-search');

        document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
        formDiv.classList.add('hidden');
        listWrapper.classList.remove('edit-mode', 'delete-mode');

        if (searchInput) searchInput.value = '';
        document.getElementById('new-product-form').reset();
        document.getElementById('new-product-id').value = '';
        document.getElementById('save-new-product').textContent = 'Məhsulu Əlavə Et';
        document.getElementById('form-title').textContent = 'Yeni Məhsul Əlavə Et';

        if (currentMode === 'add') { document.getElementById('add-product-btn').classList.add('active'); formDiv.classList.remove('hidden'); }
        else if (currentMode === 'edit') { document.getElementById('edit-mode-btn').classList.add('active'); listWrapper.classList.add('edit-mode'); }
        else if (currentMode === 'delete') { document.getElementById('delete-mode-btn').classList.add('active'); listWrapper.classList.add('delete-mode'); }

        document.getElementById('product-list').classList.add('hidden');
        document.getElementById('notifications-container').classList.remove('hidden');
        renderByCategory(window.allProducts);
    }

    function populateCategorySelect(obj) {
        const select = document.getElementById('new-product-category');
        if (!select) return;
        select.innerHTML = '<option value="">Kateqoriya seçin</option>';
        Object.keys(obj).forEach(cat => {
            const o = document.createElement('option'); o.value = cat; o.textContent = cat; select.appendChild(o);
        });
    }

    function loadProductForEdit(id) {
        let found = null, catName = '';
        for (const c in window.allProducts) {
            found = (window.allProducts[c] || []).find(p => String(p.id) === String(id));
            if (found) { catName = c; break; }
        }
        if (!found) return alert('Düzənləmə üçün məhsul tapılmadı.');

        setMode('add');
        document.getElementById('form-title').textContent = 'Məhsulu Düzənlə';
        document.getElementById('save-new-product').textContent = 'Dəyişiklikləri Saxla';

        document.getElementById('new-product-id').value = found.id;
        document.getElementById('new-product-name').value = found.name || '';
        document.getElementById('new-product-category').value = catName;
        document.getElementById('new-product-barcode').value = found.barcode || '';
        document.getElementById('new-product-price').value = found.price ?? '';
        document.getElementById('new-product-stock').value = found.stock ?? '';
        document.getElementById('new-product-units').value = found.units || '';
        document.getElementById('new-product-description').value = found.description || '';
    }

    function renderByCategory(obj) {
        const boxes = document.querySelectorAll('#notifications-container .notification-box');
        boxes.forEach(box => {
            box.onclick = null;
            const det = box.querySelector('.details'); if (det) det.innerHTML = '';
        });

        boxes.forEach(box => {
            const det = box.querySelector('.details');
            const sum = box.querySelector('.summary');
            const h3 = sum ? sum.querySelector('h3') : null;
            if (!h3) return;
            const cat = h3.textContent.trim();
            const items = obj[cat];

            if (sum) {
                const p = sum.querySelector('p');
                if (p) p.innerHTML = 'Ətraflı görmək üçün toxunun.';
            }

            box.onclick = function (ev) {
                if (currentMode === 'view' && !ev.target.closest('.product-card')) this.classList.toggle('expanded');
            };

            if (items && det) {
                det.innerHTML = items.map(prod => {
                    const price = (prod.price !== undefined) ? Number(prod.price).toFixed(2) : 'N/A';
                    return `
          <div class="product-card" data-id="${prod.id}">
            <div class="summary">
              <h4>${prod.name}</h4>
              <div class="compact-info-group">
                <span class="stock-info">${prod.stock} ${prod.units || 'ədəd'}</span>
                <span class="price">${price} AZN</span>
              </div>
            </div>
            <div class="details">
              <p><strong>Barkod:</strong> ${prod.barcode || ''}</p>
              <p><strong>Təsvir:</strong> ${prod.description || 'Təsvir yoxdur.'}</p>
            </div>
          </div>`;
                }).join('');

                det.querySelectorAll('.product-card').forEach(card => {
                    card.onclick = (ev) => {
                        ev.stopPropagation();
                        const id = card.getAttribute('data-id');
                        if (currentMode === 'edit') loadProductForEdit(id);
                        else if (currentMode === 'delete') removeProduct(id);
                        else card.classList.toggle('expanded');
                    };
                });
            }
        });
    }

    function searchProducts() {
        const input = document.getElementById('product-search');
        const term = (input?.value || '').toLowerCase().trim();
        const out = [];

        for (const c in window.allProducts) {
            for (const p of (window.allProducts[c] || [])) {
                if ((p.name || '').toLowerCase().includes(term) || (p.barcode || '').includes(term)) {
                    out.push({ ...p, category: c });
                }
            }
        }
        renderSearch(out);
    }

    function renderSearch(arr) {
        const list = document.getElementById('product-list');
        const notif = document.getElementById('notifications-container');
        notif.classList.add('hidden'); list.classList.remove('hidden');

        if (!arr.length) {
            list.innerHTML = '<p style="margin:20px;color:#dc3545;font-weight:bold;padding-left:10px;">Axtarışa uyğun məhsul tapılmadı.</p>';
            return;
        }

        list.innerHTML = arr.map(prod => {
            const price = (prod.price !== undefined) ? Number(prod.price).toFixed(2) : 'N/A';
            return `
      <div class="product-card" data-id="${prod.id}">
        <div class="summary">
          <h4>${prod.name}</h4>
          <div class="compact-info-group">
            <span class="stock-info">${prod.stock} ${prod.units || 'ədəd'}</span>
            <span class="price">${price} AZN</span>
          </div>
        </div>
        <div class="details">
          <p><strong>Kateqoriya:</strong> ${prod.category}</p>
          <p><strong>Barkod:</strong> ${prod.barcode || ''}</p>
          <p><strong>Təsvir:</strong> ${prod.description || 'Təsvir yoxdur.'}</p>
        </div>
      </div>`;
        }).join('');

        list.querySelectorAll('.product-card').forEach(card => {
            card.onclick = () => {
                const id = card.getAttribute('data-id');
                if (currentMode === 'edit') loadProductForEdit(id);
                else if (currentMode === 'delete') removeProduct(id);
                else card.classList.toggle('expanded');
            };
        });
    }

    // --- BOOT ---
    loadAllProducts();

    // --- purchases.js stok dəyişəndə Products səhifəsinə siqnal gəlir ---
    window.addEventListener('products-updated', () => {
        try {
            const cached = localStorage.getItem('businessAppProducts');
            if (cached) {
                window.allProducts = JSON.parse(cached);
                // siyahını yenilə
                if (typeof renderByCategory === 'function') {
                    renderByCategory(window.allProducts);
                }
                // kateqoriya seçimlərini yenilə (form varsa)
                if (typeof populateCategorySelect === 'function') {
                    populateCategorySelect(window.allProducts);
                }
            }
        } catch (e) {
            console.warn('products-updated handle failed:', e);
        }
    });


    // ---- product.js kodunun SONU ----
}
