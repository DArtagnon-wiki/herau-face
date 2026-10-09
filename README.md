# herau-face

A roguelike deckbuilder of runes and alchemy, built from Circumgician's world. The design lives in [DESIGN.md](DESIGN.md).

## Prototype: mud to clay

One commission, playable end to end: 36 kg of mud (18 kg medium earth, 18 kg weak water) to bring to clay, 75–85% earth by mass, before quintessence runs out. Read mud's move, compose a sigil from the runes in your hand, and cast against an exact preview.

```sh
npm install
npm run dev        # play locally
npm test           # rules tests
npm run simulate   # a simulated player through many commissions
npm run build      # dist/index.html, one self-contained page
```

The rules are pure TypeScript in `src/sim`, with no UI dependencies, so the simulator and tests drive the same code the page does. The page is plain DOM and SVG in `src/ui` and `src/main.ts`.

### Runes and motes

A rune is a body holding motes. The body sets power, links and bowls; the motes in its bowls give the element and any abilities.

| Body | Power | Links | Bowls |
| --- | --- | --- | --- |
| Circle | 5 | 1 | 1 |
| Crescent | 5 | 1 | 2 |
| Triangle | 5 | 1 | 3 |

| Mote | Effect |
| --- | --- |
| Basic sapphire, topaz, emerald, ruby | Sets the element: water, earth, air, fire |
| Link mote | +1 link |
| Reach mote | The sigil's Reach ×1.5 |
| Guard mote | +4 Ward |

The standard deck is 14 runes: 8 circles (two of each element), 4 crescents (one of each element, each with a link mote) and 2 elementless triangles (a link, a reach and a guard mote). The opening hand always holds a water and an earth; the rest of the shuffle is random.

**Links** are how many runes the anchor holds, so a circle anchor makes a two-rune sigil and a crescent or triangle anchor makes three. Links on joined runes do nothing until that rune anchors. A first version treated links as connections, so 2-link runes extended any sigil for free; the simulator showed typical hands building five- and six-rune sigils and finishing in one term.

### Sandbox

The Sandbox panel changes the commission in progress, live: each body's power, links and bowls; the reach and guard mote values; any rune's body and motes, wherever it is in the deck; new runes straight into the hand; and removing runes. Restarting keeps every change, and "Restart with the standard deck" undoes them. The Tuning panel covers the rest: table strain, surplus Force, flare size, quintessence, hand size and discards.

### Rules the doc leaves open

- **Floating sigils and the table, both.** Each cast sigil takes effect, then stays in a slot around the amalgam.
- **Table imbalance adds strain.** Runes on the table are tallied Earth against Air and Water against Fire. Every 2 points of imbalance past the first 2 add 1 instability a term.
- **Surplus Force multiplies Reach.** This departs from the doc's formula, which caps Force at the requirement. Under the cap, the standard deck wins only half its commissions against mud (see below).
- **Reach × Force.** Kilos converted = Reach × Force ÷ the Force the change needs. The preview spells this out, runes show what they'd add under the selected join, and a tip compares the best side link and best circumscribe left in hand.
- **Inscribe.** An inscribed rune of the anchor's own element condenses the selected pool. Any other halves Reach, for small precise casts.
- **Slump** knocks loose the table sigil whose loss leaves the table most lopsided. Entwined sigils hold.

### Numbers

| Constant | Value |
| --- | --- |
| Reach | 0.2 kg per point of power (anchor and side links) |
| Force | 1 per point (anchor, circumscribes, inscribes) |
| Ward | 1 per point (entwines), plus guard motes |
| Mud's moves | Flare 60 (+5 a term), seep 20, harden 15, slump 15 |
| Seep, harden | 0.5 kg of earth back to water; 2 kg of weak water to medium |
| Flare size | 10–14, +1 a term |
| Quintessence, hand, discards | 100, 7, 2 |

### What the simulated player found

400 commissions with the standard deck:

| Player | Median terms | Spent: none | 1–15 | 16–30 | over 30 |
| --- | --- | --- | --- | --- | --- |
| Careful (wards when it pays) | 4 | 12% | 75% | 12% | 2% |
| Careless (never wards on purpose) | 3 | 5% | 42% | 49% | 5% |

A careful player wards instead of transmuting in 1–2 terms a commission. With the doc's capped formula, the careful player wins only 51% of commissions.
