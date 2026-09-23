# Houser – projektowanie domu w przeglądarce

Statyczna strona WWW: bez kont i bez serwera. Wczytujesz pliki JSON, pracujesz w przeglądarce, eksportujesz wynik na swój dysk.

## Struktura

```
index.html                  strona główna – moduły jako kolejne kroki projektowania (zakładki)
modules/
  pomieszczenia/index.html  lista pomieszczeń na kondygnacjach (nazwy, kolory, wnęki), start nowego projektu
  warunki/index.html        edycja warunków układu, pogrupowane i rozwijane
  projektowanie/index.html  Układ pomieszczeń: definicja, malowanie pomieszczeń, otwory, komin, walidacja, elewacje
  kondygnacje-dach/index.html widok z boku: piętro / poddasze, ścianka kolankowa, kąt i kierunek dachu
  wnetrze-3d/index.html     podgląd 3D wnętrza z punktu obserwatora (meble z JSON)
  zewnatrz-3d/index.html    podgląd 3D bryły z zewnątrz (dach, okna, tarasy, pergole)
  schody/index.html         schody: proste, L, dwubiegowe 180°, kręcone – kratki i otwór w stropie wpisywane automatycznie
  okna-drzwi/index.html     rodzaje i wymiary okien i drzwi (niskie, balkonowe, ścięte, dachowe...) z podglądem elewacji
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
shared/nav.js               przycisk powrotu do strony głównej, gdy moduł otwarto samodzielnie
examples/                   przykładowa definicja domu i gotowy układ
.github/workflows/pages.yml automatyczna publikacja na GitHub Pages
```

Każdy moduł to samodzielny plik HTML – można go otworzyć bezpośrednio, a strona główna ładuje go w ramce.
Moduły wymieniają dane przez wspólny bieżący projekt w pamięci przeglądarki (`shared/project-store.js`, format jak eksport JSON). Każdy moduł może też wczytać i wyeksportować plik JSON.

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
