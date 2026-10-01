# Houser – zasady pracy

- **Testy obliczeń zawsze**: przed zmianą i po zmianie uruchom `node tests/run.js`. Nie commituj, jeśli coś jest czerwone.
  - Jeśli wynik zmienia się celowo (nowa cena, nowa reguła), sprawdź różnice, a potem zapisz nowe wartości wzorcowe: `node tests/run.js --update` i opisz to w commicie.
  - Nowy silnik obliczeń = dopisz go do `tests/load.js` i dodaj sprawdzenia w `tests/run.js` (liczby skończone, rozsądne granice, zależności).
- Publikacja strony (GitHub Pages) czeka na zielone testy (`.github/workflows/pages.yml`).
- Moduły mają być małe i niezależne; obliczenia w osobnym `engine.js`, a moduł oceniający dodaje doradcę w `modules/co-poprawic/advisors.js`.
- UI po polsku; nowe teksty dopisz do `shared/i18n-en.js`.
- Uwaga na komentarze `//` wstawiane w środek długiej linii – zjadają resztę kodu (dwa takie błędy już były).
