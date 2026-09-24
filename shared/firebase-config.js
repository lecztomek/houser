// Konfiguracja Firebase dla kont i chmury (shared/cloud.js).
// Wklej tu obiekt firebaseConfig z konsoli Firebase: Ustawienia projektu → Twoje aplikacje → aplikacja internetowa.
// To nie jest sekret – te dane i tak widzi każda przeglądarka. Dostępu do danych pilnują reguły z firestore.rules.
// Puste (null) = strona działa jak dotąd, bez kont.
window.HOUSER_FIREBASE = null;
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
