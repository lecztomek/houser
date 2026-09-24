// Konfiguracja Firebase dla kont i chmury (shared/cloud.js).
// Wklej tu obiekt firebaseConfig z konsoli Firebase: Ustawienia projektu → Twoje aplikacje → aplikacja internetowa.
// To nie jest sekret – te dane i tak widzi każda przeglądarka. Dostępu do danych pilnują reguły z firestore.rules.
// null = strona działa bez kont.
window.HOUSER_FIREBASE = {
  apiKey: "AIzaSyC-qtmmpSB3nhtoK50lCVlIRovZOUPAETI",
  authDomain: "houser-b9754.firebaseapp.com",
  projectId: "houser-b9754",
  storageBucket: "houser-b9754.firebasestorage.app",
  messagingSenderId: "562653656769",
  appId: "1:562653656769:web:7140d45b16b19e7dcac640"
};
/* przykład:
window.HOUSER_FIREBASE = {
  apiKey: "AIza…",
  authDomain: "twoj-projekt.firebaseapp.com",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
*/
