# Eurosong — vizualizacija podataka

Interaktivna web-vizualizacija rezultata **finala Eurosonga od 2016. do 2023.**
— ere u kojoj se bodovi dijele na glasove stručnog žirija i glasove publike
(televote). Cilj je kroz nekoliko povezanih prikaza dati brz uvid u to koje
zemlje dominiraju, kako im rezultati variraju kroz godine te postoje li
zanimljive veze između pojedinih pokazatelja.

🔗 **Demo uživo:** _(dodati nakon postavljanja na GitHub Pages)_

## Što prikazuje

Aplikacija ima četiri prikaza koji dijele iste filtere (raspon godina, metriku
i odabrane zemlje) — promjena u jednom odmah se odražava na ostalima:

- **Karta Europe** — zemlje obojene prema odabranoj metrici (ukupni bodovi,
  prosječni plasman, broj pobjeda, broj top-5 plasmana, broj nastupa).
- **Top zemlje (stupčasti dijagram)** — rang-lista najuspješnijih zemalja
  prema istoj metrici.
- **Plasman kroz godine (linijski dijagram)** — kako su se plasmani vodećih
  zemalja kretali iz godine u godinu; zemlje koje se nisu plasirale u finale
  prikazane su u posebnom redu.
- **Usporedba metrika (dijagram raspršenja)** — dva načina: bodovi žirija vs.
  bodovi publike, te broj YouTube pregleda vs. konačni plasman.

Klikom na zemlju (na karti, stupcu ili točki) ona se istakne u svim prikazima.

## Podatci

Rezultati su prikupljeni iz javnog skupa
[Spijkervet/eurovision-dataset](https://github.com/Spijkervet/eurovision-dataset),
broj YouTube pregleda po nastupu, te granice država iz
[map-of-europe](https://github.com/leakyMirror/map-of-europe) (TopoJSON).
Obrađeni podatci nalaze se u `public/data/` i učitavaju se statički — aplikacija
ne ovisi ni o jednom vanjskom servisu u radu.

## Tehnologije

D3.js v7 · TypeScript · Vite · TopoJSON

## Pokretanje

```bash
npm install
npm run dev        # razvojni server na http://localhost:5173
npm run build      # produkcijski build u dist/
npm run preview    # lokalni pregled produkcijskog builda
```

## Hosting (GitHub Pages)

Repozitorij ima pripremljen workflow (`.github/workflows/deploy.yml`):

1. Postavi repozitorij na GitHub.
2. **Settings → Pages → Source: GitHub Actions**.
3. Svaki push na granu `main` automatski radi build i objavljuje stranicu.

## Dokumentacija

U `docs/` se nalazi seminarski rad (LaTeX izvor `seminar.tex`). Ne utječe na
vizualizaciju ni na build — prevodi se zasebno (npr. `pdflatex seminar.tex`).
