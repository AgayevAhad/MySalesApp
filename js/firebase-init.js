// --- FIREBASE QURAŞDIRILMASI ---
// 1. Aşağıdakı kod, Firebase Console-dan alacağınız məlumatlardır.
// 2. Siz domen almalı deyilsiniz! "authDomain" hissəsini Google özü sizə verir (məsələn: sizin-ad.firebaseapp.com).
// 3. Oradakı kodu bütövlüklə kopyalayıb, aşağıdakı `const firebaseConfig = { ... }` hissəsi ilə əvəzləyin.

// ⬇️ BURANI DƏYİŞƏCƏKSİNİZ ⬇️
const firebaseConfig = {
    apiKey: "AIzaSyCp1OSFoI-m435B7nV-eKlvclgtPSWgxRg",
    authDomain: "mysaleapp687.firebaseapp.com",
    projectId: "mysaleapp687",
    storageBucket: "mysaleapp687.firebasestorage.app",
    messagingSenderId: "850263618848",
    appId: "1:850263618848:web:0000000000" // Web app yaradılmadığı üçün placeholder
};
// ⬆️ BURANI DƏYİŞƏCƏKSİNİZ ⬆️

// Firebase-i işə salırıq (Bura dəyməyin)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, setDoc, doc, updateDoc, deleteDoc, onSnapshot, runTransaction, writeBatch, increment, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Digər fayllarda işlətmək üçün ixrac edirik
window.db = db;
window.auth = auth;
window.collection = collection;
window.addDoc = addDoc;
window.setDoc = setDoc;
window.doc = doc;
window.updateDoc = updateDoc;
window.deleteDoc = deleteDoc;
window.onSnapshot = onSnapshot;
window.runTransaction = runTransaction;
window.writeBatch = writeBatch;
window.increment = increment;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;

console.log("Firebase yükləndi!");
