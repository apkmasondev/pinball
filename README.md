# Japanese Night Garden · Pinball

Autorska maszyna pinballowa w przeglądarce. Nocny japoński ogród: księżyc nad torii, koi pod taflą wody, lakierowane panele i mosiężne prowadnice. Trzy kule, fizyka w stałym kroku 240 Hz, własne oświetlenie i muzyka.

**▶ Zagraj: https://apkmasondev.github.io/pinball/**

Gra jest w całości statyczna. Nie wymaga konta, nie korzysta z CDN, analityki ani żadnych usług zewnętrznych. Po wczytaniu działa bez internetu.

## Sterowanie

| Akcja | Klawisze |
|---|---|
| Lewy flipper | A / ← / lewy Shift |
| Prawy flipper | D / → / prawy Shift |
| Wyrzutnia | przytrzymaj i puść Spację |
| Nudge | X; Z / C kierunkowo |
| Pauza | P / Esc |
| Pełny ekran | F lub przycisk ⛶ |

Na telefonie i tablecie dostępne są przyciski dotykowe. Przełączenie okna wstrzymuje fizykę i dźwięk.

## Zasady

- **Skill shot** — pierwsza kula przez środkowy górny przejazd: 5 000 punktów przed mnożnikami i +4 s ochrony. Siłę ustawiasz wyrzutnią. Flippery obracają zapalone światła przejazdów.
- **Moonlight Multiball** — zapal trzy księżycowe światła przejazdów. Pełna orbita lub torii dodaje brakujące światło. Startują trzy kule oraz 13 s ochrony.
- **Torii Jackpot** — w multiballu traf centralny otwór pod torii. Jackpot 15 000, co trzeci super jackpot 50 000, przed mnożnikami.
- **Koi Run** — trzy lewe cele dają 22 s podwójnych punktów.
- **Sakura Bloom** — trzy prawe cele podnoszą mnożnik o jeden.
- **Zen Flow** — różne punktowane strzały w odstępie do 5 s łączą się w combo. Combo 3 i 6 podnoszą mnożnik.
- **Lotos** — co 12 bumperów mnożnik rośnie o jeden, maksymalnie ×8.
- **Ball save** — 12 s po wyrzucie. Uratowana kula wraca widocznym kickoutem pod torii.
- **Dodatkowa kula** — raz na grę po osiągnięciu 150 000 punktów.
- **Bonus** — 8% bazowych nagród, na końcu kuli pomnożone przez bieżący mnożnik.
- **Tilt** — trzy szybkie potrząśnięcia odbierają kontrolę, ochronę, punkty i bonus do następnej kuli.

Rekord, trzy suwaki głośności i ustawienie ograniczenia ruchu zapisują się w `localStorage` przeglądarki. Nic nie opuszcza urządzenia.

## Jak to jest zrobione

**Fizyka.** Stały krok 240 Hz niezależny od liczby klatek, ograniczenie prędkości, dwie iteracje rozdzielania kontaktów, kolizje kula–kula. Flippery mają narastanie siły cewki, sprężynę powrotną, bezwładność, prędkość powierzchni, wymianę impulsu, tarcie i spin — kula nigdy nie jest teleportowana. Geometria rysowana jest z tych samych współrzędnych co kolizje.

**Grafika.** Canvas 2D z warstwami i oświetleniem 2.5D. Statyczna warstwa stołu powstaje raz w rozdzielczości 2×; światło to osobny przebieg addytywny z jednego buforowanego rozmycia radialnego, więc lampa, insert czy błysk kosztuje jedno `drawImage`. Na wierzchu leży zapieczona warstwa szkła: ukośne odbicia i winieta. W tło wtopione są matowe przetarcia lakieru wzdłuż tras, którymi faktycznie jeździ kula.

Stół składa się z 57 zasobów graficznych: 56 sprite'ów oraz ciągłej tafli wody. Grafika wygenerowana na potrzeby tego projektu, cięta na elementy runtime i czyszczona z artefaktów kanału alfa. Każdy sprite rysuje się we własnych proporcjach.

**Audio.** Web Audio. Zapętlona ścieżka z dwusekundowym przenikaniem na granicy pętli, automatycznie ściszana pod sygnałami jackpot / multiball / extra ball. Efekty syntezowane: pentatonika, struny, pogłos, szum wody, osobne dźwięki mechaniki, limiter miksu. Osobne szyny Master / Music / SFX. Gdy ścieżka się nie wczyta, gra wraca do w pełni proceduralnego podkładu. Dźwięk startuje dopiero po interakcji użytkownika, zgodnie z polityką przeglądarek.

**Wydajność.** DPR ograniczony do 2, efekty mają limity liczby obiektów. W przeglądarce testowej: klatka około 16,7 ms, aktualizacja i rysowanie 0,8–1,9 ms, również w multiballu z trzema kulami. To pomiar jednego środowiska, nie gwarancja 60 FPS na każdym urządzeniu.

## Uruchomienie lokalne

Gra używa modułów ES, więc nie zadziała otwarta przez `file://`. Wystarczy dowolny serwer statyczny z katalogu repozytorium:

```bash
python -m http.server 8000
```

Następnie otwórz `http://localhost:8000`. Dowolna alternatywa (`npx serve`, `php -S`) też się nada. Wszystkie ścieżki są względne, więc gra działa zarówno w katalogu głównym domeny, jak i w podkatalogu.

`?qa=1` włącza jawny panel testowy z autoplayem, scenariuszami multiballa i drenażu oraz pomiarem czasu klatki. Panel nie pojawia się w zwykłej grze, a rekordy z tego trybu trzymane są pod osobnym kluczem.

## Zawartość repozytorium

```
index.html      strona gry
style.css       oprawa kabinetu i UI
src/            moduły: fizyka, zasady, renderer, audio, panel QA
public/         sprite'y stołu, tafla wody, ścieżka dźwiękowa, ikona
```

Repozytorium zawiera wyłącznie pliki potrzebne do uruchomienia gry. Materiały źródłowe (arkusze grafiki, nagrania wyjściowe, skrypty przygotowania zasobów, testy i robocze raporty) pozostają poza nim.

## Materiały i licencja

Grafika powstała na potrzeby tego projektu. Warstwa dźwiękowa w `public/` jest pochodną materiałów wyjściowych: `garden-soundtrack.mp3` to przetworzona i zapętlona wersja dostarczonego utworu, a `drain.mp3` to 1,5-sekundowa próbka przygotowana z nagrania pobranego z Pixabay (autor podpisany jako `freesound_community`). Materiały źródłowe nie są tu rozpowszechniane.

Projekt nie ma jeszcze wybranej licencji, więc domyślnie obowiązują zwykłe prawa autorskie. Przed ponownym wykorzystaniem warstwy dźwiękowej sprawdź warunki licencji uzyskane przy pobraniu materiałów wyjściowych.
