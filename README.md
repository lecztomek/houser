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

1. Utwórz `modules/<nazwa>/index.html`: w `<head>` dodaj `<link rel="stylesheet" href="../../shared/theme.css">`, a przed `</body>` `<script src="../../shared/nav.js"></script>`.
2. Dopisz moduł do tablicy `MODULES` w `index.html`.

## Publikacja

Każdy push na `main` (lub `master`) publikuje stronę przez GitHub Actions.
Jednorazowo w repozytorium: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Uruchomienie lokalne

```
python3 -m http.server 8000
```
i otwórz http://localhost:8000
