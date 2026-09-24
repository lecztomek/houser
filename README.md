# Houser – projektowanie domu w przeglądarce

Statyczna strona WWW: bez kont i bez serwera. Pracujesz w przeglądarce, a cały projekt zapisujesz na dysk jednym plikiem JSON (pasek projektu u góry strony).

## Struktura

```
index.html                  strona główna – moduły jako kolejne kroki projektowania (zakładki)
modules/
  pomieszczenia/index.html  lista pomieszczeń na kondygnacjach (nazwy, kolory, wnęki), start nowego projektu
  warunki/index.html        edycja warunków układu, pogrupowane i rozwijane
  obrys/index.html          obrys budynku rysowany krawędziami (dowolny kształt), dopasowanie siatki i warstw
  projektowanie/index.html  Układ pomieszczeń: definicja, malowanie pomieszczeń, otwory, komin, walidacja, elewacje
  kondygnacje-dach/index.html widok z boku: piętro / poddasze, ścianka kolankowa, kąt i kierunek dachu
  galeria/index.html        wybrane zdjęcia domu (wizualizacje AI, 3D, własne), okładka, pokaz, przed/po
  przepisy/index.html       uproszczone sprawdzenie z warunkami technicznymi (WT 2021)
  codziennosc/              scenariusze codzienności (zakupy, pranie, palenie w piecu, goście, noc…): trasy po domu i ocena
  naslonecznienie/          zyski od słońca latem i zimą per pomieszczenie, ryzyko przegrzania, mapa ciepła
  hydraulika/               łatwość i koszt wod-kan: odległości od źródła ciepłej wody, piony parter–piętro, dopłata za układ
  akustyka/                 cisza w sypialniach: co za ścianą, nad i pod pokojem, ulica, antresola – ocena i podpowiedzi
  porownanie/               2–4 domy obok siebie (koszt z etapami, energia, codzienność, słońce, akustyka) + ocena ogólna wg wag
  energia/index.html        bilans cieplny, moc grzewcza, koszt ogrzewania
  wycena/index.html         orientacyjny koszt budowy z ilości w projekcie (ceny do edycji)
  wnetrze-3d/index.html     podgląd 3D wnętrza z punktu obserwatora (meble z JSON)
  wizualizacje/index.html   wizualizacje AI (Gemini, własny klucz API w przeglądarce) ze zdjęć podglądów 3D
  zewnatrz-3d/index.html    podgląd 3D bryły z zewnątrz (dach, okna, tarasy, pergole)
  schody/index.html         schody: proste, L, dwubiegowe 180°, kręcone – kratki i otwór w stropie wpisywane automatycznie
  okna-drzwi/index.html     rodzaje i wymiary okien i drzwi (niskie, balkonowe, ścięte, dachowe...) z podglądem elewacji
  drzwi-wewnetrzne/index.html drzwi między pomieszczeniami: rodzaj, wysokość, kierunek otwierania
  tarasy/index.html         tarasy, zadaszenia i pergole malowane kratkami wokół domu
  meblowanie/index.html     rozmieszczanie mebli na gotowym rzucie (pomieszczeń tu nie zmieniasz)
shared/theme.css            wspólny jasny motyw (kolory, przyciski, nagłówki modułów)
shared/gl-renderer.js       wspólny renderer WebGL modułów 3D (bufor głębokości, bez bibliotek)
shared/definition.js        wspólna obsługa definicji: typy warunków, normalizacja, etykiety
shared/validator.js         sprawdzanie warunków na rzucie (moduły Warunki i Układ pomieszczeń)
shared/openings.js          warianty okien i drzwi
shared/stairs.js            geometria schodów (rzut, kratki, stopnie 3D)
shared/house-model.js       wspólny model bryły (wysokości, poddasze, dach z kąta nachylenia)
shared/project-store.js     wspólny bieżący projekt w localStorage (moduły widzą nawzajem swoje zmiany)
shared/furniture.js         katalog mebli w kategoriach (wymiary, wysokość, kształt 3D)
shared/snapshots.js         zdjęcia z podglądów 3D i wizualizacje (IndexedDB)
shared/nav.js               przycisk powrotu do strony głównej, gdy moduł otwarto samodzielnie
examples/                   przykładowa definicja domu i gotowy układ
.github/workflows/pages.yml automatyczna publikacja na GitHub Pages
```

Każdy moduł to samodzielny plik HTML – można go otworzyć bezpośrednio, a strona główna ładuje go w ramce.
Moduły wymieniają dane przez wspólny bieżący projekt w pamięci przeglądarki (`shared/project-store.js`). Plik obsługuje wyłącznie pasek projektu na stronie głównej (`index.html`): **Zapisz do pliku / Otwórz plik / Nowy / Przykład**. Jeden plik JSON zawiera wszystko – definicję pomieszczeń i warunki, rzut, otwory i ich warianty, schody, dach, tarasy, meble, grubość ścian i punkty widokowe 3D Zdjęcia z podglądów, wizualizacje AI i klucze API nie trafiają do pliku (zostają w przeglądarce). Moduł otwarty samodzielnie (poza stroną główną) nadal pokazuje własne przyciski wczytania/eksportu.

Zasada: każda funkcja to osobny, prosty moduł – lepiej dodać nowy moduł niż komplikować istniejący.

### Dodanie nowego modułu

1. Utwórz `modules/<nazwa>/index.html`: na początku `<head>` dodaj `<script src="../../shared/i18n-en.js"></script>` i `<script src="../../shared/i18n.js"></script>`, potem `<link rel="stylesheet" href="../../shared/theme.css">`, a przed `</body>` `<script src="../../shared/nav.js"></script>`.
2. Dopisz moduł do tablicy `MODULES` w `index.html`.
3. Nowe teksty dopisz po angielsku do `shared/i18n-en.js`.

### Konta i chmura (Firebase)

Projekt zapisuje się sam po każdej zmianie: bez logowania w tej przeglądarce (lista projektów w IndexedDB, `shared/library.js`), a po zalogowaniu przez Google także w chmurze, razem ze zdjęciami z Galerii. Moduł **Projekty** (na górze menu) zbiera wszystko w jednym miejscu: nowy projekt, import i eksport pliku JSON, zmiana nazwy, duplikat, udostępnianie, usuwanie, listy „W chmurze” i „Na tym urządzeniu”. Na stronie głównej są ostatnie projekty i **Projekty publiczne** innych osób (otwiera się kopia). Gdy ten sam projekt zmieni się na dwóch urządzeniach, strona pyta, którą wersję zostawić. Bez logowania wszystko działa jak dotąd, tylko w przeglądarce.

Kod jest w `shared/cloud.js`, a dane w Firestore (wystarczy darmowy plan Spark, bez Storage): `projects/{id}` (opis, miniaturka, prywatny/publiczny), `projects/{id}/content/main` (projekt JSON) i `projects/{id}/photos/{id}` (zdjęcia). Reguły dostępu są w `firestore.rules`: czyta właściciel albo każdy, jeśli projekt jest publiczny; zapisuje tylko właściciel.

Uruchomienie (jednorazowo, w https://console.firebase.google.com):

1. **Dodaj projekt** (Google Analytics niepotrzebne).
2. **Authentication → Rozpocznij → Metoda logowania → Google → Włącz**.
3. **Authentication → Ustawienia → Autoryzowane domeny → Dodaj domenę**: `lecztomek.github.io`.
4. **Firestore Database → Utwórz bazę danych**: lokalizacja w Europie (np. `eur3`), tryb produkcyjny. Potem zakładka **Reguły**: wklej zawartość `firestore.rules` → **Opublikuj**.
5. **Ustawienia projektu → Twoje aplikacje → Aplikacja internetowa (</>)** → zarejestruj i skopiuj obiekt `firebaseConfig` do `shared/firebase-config.js`. To nie jest sekret – można go trzymać w repozytorium.

Dopóki `shared/firebase-config.js` ma `null`, logowanie jest ukryte.

### Wersje językowe (PL / EN)

Strona jest pisana po polsku. Przełącznik **PL | EN** na pasku projektu zapisuje język w przeglądarce (`houser:lang`) i przeładowuje całość. W trybie EN `shared/i18n.js` tłumaczy w locie teksty strony i modułów (także te dopisywane później), podpowiedzi, okna dialogowe i napisy na rzutach według słownika `shared/i18n-en.js`. Klucze to polskie teksty, liczby zapisuje się jako `{n}`, a nazwy w cudzysłowie jako `„{q}”`, np. `"Salon: {n} m²": "Living room: {n} m²"`. Dłuższe teksty są dzielone na zdania i części (` – `, ` · `, `: `), a nazwy pomieszczeń są podmieniane także wewnątrz innych zdań. Element z atrybutem `data-noi18n` nie jest tłumaczony. Dane projektu (nazwy wpisane przez użytkownika, plik JSON) się nie zmieniają.

## Publikacja

Każdy push na `main` (lub `master`) publikuje stronę przez GitHub Actions.
Jednorazowo w repozytorium: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Uruchomienie lokalne

```
python3 -m http.server 8000
```
i otwórz http://localhost:8000
