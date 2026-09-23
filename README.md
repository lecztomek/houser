# Houser – projektowanie domu w przeglądarce

Statyczna strona WWW: bez kont i bez serwera. Wczytujesz pliki JSON, pracujesz w przeglądarce, eksportujesz wynik na swój dysk.

## Struktura

```
index.html                  strona główna – spina moduły (zakładki; moduły trzymają stan między przełączeniami)
modules/
  projektowanie/index.html  edytor i walidator układu (rzut, pomieszczenia, otwory, meble, tarasy, elewacje)
  wnetrze-3d/index.html     podgląd 3D wnętrza z punktu obserwatora (meble z JSON)
  zewnatrz-3d/index.html    podgląd 3D bryły z zewnątrz (dach, okna, tarasy, pergole)
  meblowanie/index.html     osobny moduł meblowania – w przygotowaniu
shared/theme.css            wspólny jasny motyw (kolory, przyciski, nagłówki modułów)
shared/gl-renderer.js       wspólny renderer WebGL modułów 3D (bufor głębokości, bez bibliotek)
shared/nav.js               przycisk powrotu do strony głównej, gdy moduł otwarto samodzielnie
examples/                   przykładowa definicja domu i gotowy układ
.github/workflows/pages.yml automatyczna publikacja na GitHub Pages
```

Każdy moduł to samodzielny plik HTML – można go otworzyć bezpośrednio, a strona główna ładuje go w ramce.
Moduły wymieniają dane wyłącznie przez pliki JSON (eksport z Projektowania → wczytanie w podglądach 3D).

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
