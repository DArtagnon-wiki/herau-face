# herau-face

A roguelike deckbuilder of runes and alchemy, built from Circumgician's world. The design lives in [DESIGN.md](DESIGN.md).

## Prototype: mud to clay

One commission, playable end to end: 24 kg of mud (12 kg medium earth, 12 kg weak water) to bring to clay, 75–85% earth by mass, before quintessence runs out. Pick a starting deck (Regular, Isosceles or Scalene), read mud's move, compose a rune from your hand, and cast against an exact preview.

```sh
npm install
npm run dev        # play locally
npm test           # rules tests
npm run simulate   # a simulated player through many commissions
npm run build      # dist/index.html, one self-contained page
```

The rules are pure TypeScript in `src/sim`, with no UI dependencies, so the simulator and tests drive the same code the page does. The page is plain DOM and SVG in `src/ui` and `src/main.ts`.

### Choices the doc leaves open

- **Floating runes and the rune table, both.** Each cast rune takes effect, then stays in a slot around the amalgam.
- **Table imbalance adds strain.** Elements on the table are tallied Earth against Air and Water against Fire. Every 2 points of imbalance past the first 2 add 1 instability a term. Tuning can turn this off.
- **Surplus Force multiplies Reach.** This departs from the doc's formula, which caps Force at the requirement. Under the cap, circumscribing does nothing once a change is cheap enough, so the scalene deck's aptitude is wasted on mud (see below). Tuning can switch back to the cap.
- **Inscribe.** An inscribed element of the anchor's own element condenses the selected pool. Any other inscribed element halves Reach, which is how you make a small, precise cast near the band.
- **Slump** knocks loose the table rune whose loss leaves the table most lopsided. Entwined runes hold.

### Numbers

| Constant | Value |
| --- | --- |
| Element value by side count | 3 sides: 4 · 4 sides: 3 · 5 sides: 3 · 6 sides: 2 |
| Reach | 0.2 kg per point of value (anchor and links) |
| Force | 1 per point (anchor, circumscribes, inscribes) |
| Ward | 1 per point (entwines) |
| Class aptitude | ×1.5 on the apt join |
| Mud's moves | Flare 60 (+5 a term), seep 20, harden 15, slump 15 |
| Flare size | 10–14, +1 a term |
| Quintessence, hand, discards | 100, 7, 2 |

### What the simulated player found

400 commissions per starting deck, with a player that thinks one term ahead:

| Deck | Median terms | Spent: none | 1–15 | 16–30 | over 30 |
| --- | --- | --- | --- | --- | --- |
| Regular | 5 | 23% | 76% | 1% | 0% |
| Isosceles | 4 | 22% | 63% | 10% | 5% |
| Scalene | 4 | 19% | 68% | 11% | 4% |

That matches the doc's early-commission target: usually a little quintessence, rarely none or a moderate amount. With the doc's capped formula instead, the scalene deck spends a median of 30 and loses 15% of commissions.
