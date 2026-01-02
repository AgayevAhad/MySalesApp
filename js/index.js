// js/index.js — SPA naviqasiya: onclick üçün qlobal loadPage + sabit init

// ---- GLOBAL FUNKSİYALAR (onclick üçün həmişə mövcud olsun) ----
window.toggleMenu = window.toggleMenu || function () {
    document.getElementById("menu")?.classList.toggle("open");
};

window.loadPage = window.loadPage || async function (pageName) {
    try {
        const appContent = document.getElementById('app-content');
        if (!appContent) return true; // fallback: normal keçid

        const clean = String(pageName).replace('.html', '');
        const url = `${clean}.html`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fayl tapılmadı: ${url}`);

        const html = await res.text();
        appContent.innerHTML = html;
        window.location.hash = clean;

        // yüklənən parçanın içindəki skriptləri işə sal
        executeScripts(appContent);
    } catch (e) {
        console.error("Səhifə yüklənərkən xəta:", e);
        const appContent = document.getElementById('app-content');
        if (appContent) appContent.innerHTML = `<h2>Xəta!</h2><p>Səhifə yüklənə bilmədi: ${pageName}.html</p>`;
    }
    return false; // onclick default naviqasiyanı bloklasın
};

// yüklənən parçadakı skriptləri işə salır; index.js-i təkrar yükləmir
function executeScripts(targetElement) {
    const scripts = targetElement.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const src = oldScript.getAttribute('src') || '';
        // index.js heç vaxt təkrar yüklənməsin
        if (src.includes('js/index.js')) { oldScript.remove(); return; }

        const newScript = document.createElement('script');
        // atributları kopyala
        [...oldScript.attributes].forEach(a => { if (a.name !== 'src') newScript.setAttribute(a.name, a.value); });
        if (src) newScript.src = src; else newScript.textContent = oldScript.textContent;

        oldScript.remove();
        document.body.appendChild(newScript);
    });
}

// ---- BİR DƏFƏLİK INIT ----
if (window.__INDEX_JS_LOADED__) {
    console.warn('index.js already loaded; skipping duplicate init');
} else {
    window.__INDEX_JS_LOADED__ = true;

    function checkInitialHash() {
        const currentHash = window.location.hash.substring(1);
        loadPage(currentHash || 'home');
    }

    document.addEventListener('DOMContentLoaded', checkInitialHash);
    window.addEventListener('hashchange', checkInitialHash);
}
