# herau-face

A roguelike deckbuilder of runes and alchemy, built from Circumgician's world. The design lives in [DESIGN.md](DESIGN.md).

## Prototype: mud to clay

One commission, playable end to end: 40 kg of mud (18 kg medium earth, 18 kg weak water, and 2 kg each of medium air and fire from its organics) to bring to clay before quintessence runs out. Clay is 75–85% earth, with air and fire each between 1% and 3%; bounds are strict.

Each term, mud shows its move. Tap a rune to anchor a sigil, then tap others and pick how each joins from the menu that opens around it. You compose and cast sigils from a 6-rune hand, as many as the hand allows; each resolves at once against an exact preview, and its Ward builds up for the term. When you end the term, mud acts: the term's Ward absorbs its flare and the rest costs quintessence. Unplayed runes stay in hand.

```sh
npm install
npm run dev        # play locally
npm test           # rules tests
npm run simulate   # a simulated player through many commissions
npm run simulate -- --deck late           # a deck from late in a run (opening, mid, late)
npm run simulate -- --links 4 --hand 10   # every body +4 links, a 10-rune hand (also --power)
npm run simulate -- --deck late --farm 250  # grow the clay to 250 kg before finishing
npm run simulate -- --trace 3             # print the first 3 commissions cast by cast
npm run simulate -- --farm 400 --ignore-spec --planner  # how fast the opening deck can grow mass at all
npm run simulate -- --equation             # the alchemical equation instead of Reach × Force
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
| Basic sapphire, emerald, topaz, ruby | Sets the element: water, earth, air, fire |
| Link mote | +1 link |
| Reach mote | The sigil's Reach ×1.5 |
| Guard mote | +4 Ward |

The standard deck is 14 runes: 4 circles (one of each element), 8 crescents (two of each element, each with a link mote) and 2 elementless triangles (a link, a reach and a guard mote). It used to be 8 circles and 4 crescents; under the equation a one-link anchor can only seal, never aim, so the deck leans on two-link runes. The opening hand always holds a water and an earth; the rest of the shuffle is random.

**Links** are how many runes the anchor holds, so a circle anchor makes a two-rune sigil and a crescent or triangle anchor makes three. Links on joined runes do nothing until that rune anchors. A first version treated links as connections, so 2-link runes extended any sigil for free; the simulator showed typical hands building five- and six-rune sigils and finishing in one term.

### Table metrics

A Table metrics panel counts what's on the table, or everything played this commission, by element and body: runes, gems (every element mote, so a rune with two gems counts twice) and sides (circle 1, crescent 2, triangle 3). It shows Earth − Air, Water − Fire and total imbalance under each of the three measures; strain still uses runes. "Copy the per-term record" copies a CSV with one row per term: the sigil, what it cost, and every measure on the table and played so far. `npm run simulate` prints the same measures averaged over many commissions.

With the standard deck, runes and gems always agree, because every elemental rune holds exactly one gem; they only diverge with multi-gem runes from the sandbox. Sides weight crescents and triangles more.

### Sandbox

The Sandbox panel changes the commission in progress, live: the mud's starting composition (kg and grade per element, which resets the amalgam) and the target bands; each body's power, links and bowls; the reach and guard mote values; any rune's body and motes, wherever it is in the deck; new runes straight into the hand; and removing runes. Restarting keeps every change, and "Restart with the standard deck" undoes them. "Decks along a run" loads the opening, mid-run or late-run deck, on the start screen too. The Tuning panel covers the rest: table strain, surplus Force, flare size, quintessence, hand size, sigils a term and discards.

### Rules the doc leaves open

- **Floating sigils and the table, both.** Each cast sigil takes effect, then stays in a slot around the amalgam.
- **Table imbalance adds strain.** Runes on the table are tallied Earth against Air and Water against Fire. Every point of imbalance past the first adds 1 instability a term (Tuning has gentler and harsher settings).
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
| Mud's moves | Flare 60, seep 20, harden 15, slump 15; seep, harden and slump bring a flare of 4–6 (+½ a term) |
| Seep, harden | 0.5 kg of earth back to water; 2 kg of weak water to medium |
| Flare size | 16–20, no escalation |
| Quintessence, hand, discards | 100, 6, 2 |
| Sigils a term | As many as the hand allows |

### What the simulated player found

400 commissions with the standard deck and a player that plays greedily within each term: it keeps casting the best sigil while that beats ending the term.

| Player | Median terms | Spent: none | 1–15 | 16–30 | over 30 |
| --- | --- | --- | --- | --- | --- |
| Careful (wards when it pays) | 6 | 21% | 70% | 7% | 3% |
| Careless (never wards on purpose) | 5 | 4% | 17% | 30% | 50% |

The careful player casts about 2 sigils a term and wins every commission; the careless one loses 2%. With a 5-rune hand the careful player's median cost rises from 5 to 16, it loses 7% of commissions, and the median commission takes 10 terms. Mud's organics add about one hand size of difficulty: without them, a 5-rune hand plays like a 6-rune hand with them. With the doc's capped formula the careful player wins only 68%.

Organics also put air and fire to work. Per commission the careful player plays about 7.8 water, 7.7 earth, 6.7 air and 6.8 fire gems, where air and fire were almost pure defence before. Tables end out of balance by 2.6 runes and 3.7 sides on average, against 4.4 and 6.2 with two-element mud.

### Decks along a run

The power arc's target: by the end of a run of 20 or more commissions, mud to clay takes one term, two at most, or the player can play on and make far more clay than the mud held. Three decks stand for points along a run, each keeping the standard deck's 14 runes and upgrading a few, about one upgrade per commission:

- **Opening:** the standard deck, 6-rune hand.
- **Mid-run** (about 10 upgrades): each crescent becomes a triangle with two link motes, so it anchors four-rune sigils; 7-rune hand.
- **Late-run** (about 20 upgrades): triangles hold 6 bowls, and each elemental triangle carries four link motes and a reach mote, so it anchors six-rune sigils; 8-rune hand.

| Deck | Hand | Median terms | Done in 1 term | In 2 or fewer | Median spent | Clay made |
| --- | --- | --- | --- | --- | --- | --- |
| Opening | 6 | 6 | 0% | 0% | 5 | 35 kg |
| Mid-run | 7 | 3 | 0% | 17% | 0 | 54 kg |
| Late-run | 8 | 1 | 59% | 99% | 0 | 91 kg |
| Late-run | 10 | 1 | 91% | 100% | 0 | 106 kg |

**Ring chains are the mass engine.** Earth → air → fire → earth multiplies converted earth by 20 × 1 × 2 = 40. One late sigil, an earth anchor ringed by air, fire and earth with a side link, turned 2.7 kg of earth into 108 kg and finished mud as 145 kg of clay. The new earth dilutes the traces into their band, so one cast fixes everything. A loop needs three rings, so it opens only once an anchor holds three links; the opening deck can't make one. A player that holds off finishing (`--farm`) grew the late deck's clay to 440 kg, 11 times the mud, in a median 7 terms for 2 quintessence.

**The opening deck can't overkill.** Asked to finish with even 41 kg of clay, 1 kg more than the mud held, the planning player lost 98% of commissions, bleeding quintessence over 24 terms. Chasing mass alone, it grew the amalgam to as much as 247 kg, but over three quarters of it was air from earth → air at ×20. Without three-ring loops, every gain lands as the wrong element, and three air runes with small Reach can't turn 100 kg of air back into earth before the stock runs out.

**What moves the arc,** with every body given extra links (`--links`):

- **Hand size most.** Finishing takes a bulk sigil plus trace fixes, so the right runes must be in hand together. With 4 extra links, one-term finishes went from 42% with a 6-rune hand to 85% with 8 and 96% with 10.
- **Links open chains,** then level off: 6 extra links did no better than 4.
- **Raw power hurts precision.** Power 8 instead of 5 cut one-term finishes from 85% to 52%, because the smallest sigil then overshoots a 2 kg trace.

The simulated player plans each term for big hands and high-link anchors: it tries the best sigil of every anchor and size, plus every ring chain of two or three, plays the rest of the term out greedily from each, and starts with the one that ends best. The opening deck still uses the exhaustive greedy player, so its numbers match those above.

### The alchemical equation

`src/sim/equation.ts` is a second model for what a sigil does. The page plays by it (Tuning switches back to Reach × Force), and the simulator runs it with `--equation`:

- **Resistance** = the material's base × the pool's grade multiplier × the step factor for every quality flipped along the runepath (a diagonal flips two).
- **Runepath:** from the anchor, walk the elemental square through the circumscribed and inscribed runes, easiest step first, ties going earth, fire, air, water. It ends at the seal, the last of those runes placed, whose element is the output.
- **Input kg** = neutral take × min(1, power ÷ resistance) × (reach up ÷ reach down) ^ ln(1 + power ÷ resistance). The neutral take is a flat 1 kg, a property of the material, so a heavier pool takes more work. Reach up is the anchor plus side links, times reach motes; reach down is the anchor plus tangents, a join that touches at a point; power is the anchor plus circumscribes and inscribes.
- **Output kg** = input × 1.1 per circumscribe ÷ 1.1 per inscribe. A boost mote adds 0.1 to its rune's multiplier. Element yields don't apply. A seal that's an inscribe of the anchor's element condenses.

Defaults: base 3.5, step ×2, a flat 1 kg take, power gate on. `--mix C:K[:T]` tries a starting deck of C circles and K crescents per element (and T plain triangles).

Against mud, 60 commissions each:

| Deck | Hand | Median terms | Done in 1 term | In 2 or fewer | Median spent |
| --- | --- | --- | --- | --- | --- |
| Opening | 6 | 7 | 0% | 0% | 3 |
| Mid-run | 7 | 4 | 0% | 17% | 0 |
| Late-run | 8 | 2 | 5% | 95% | 0 |
| Late-run, +1 link on every rune | 10 | 1 | 75% | 100% | 0 |

A one-link anchor plus its seal always takes the neutral 1 kg, so the deck mix matters. At base 5, 8 circles and 4 crescents took a median 18 terms and lost 30% of commissions; 4 and 8 took 13; all crescents took 9. A share-of-pool take instead (`--neutral 0 --share 0.2`) makes every pool fall in the same number of casts whatever it weighs.

### Mud's pressure

With the equation and the 4-circle, 8-crescent deck, the old mud (flares of 11–15 rising a point a term, nothing on its other moves, strain of 1 per 2 points past 2) cost the opening deck a median of only 4 quintessence. Raising pressure by escalation fattened the tail instead of the middle. Flares of 16–20 that don't escalate, small flares of 4–6 on seep, harden and slump turns, and a point of strain per point of imbalance past the first give the shape the design doc asks for (60 commissions each):

| Mud | Opening: median spent (p90) | Won | Median terms | Mid-run spent | Late-run spent |
| --- | --- | --- | --- | --- | --- |
| Old | 4 (11) | 100% | 6–7 | 0 | 0 |
| New | 8 (15) | 100% | 9 | 2 | 0 |
| New, flares +½ a term | 12 (54) | 93% | 9 | 3 | 0 |

Under the new mud, 3% of opening commissions cost nothing, 23% cost 1–5, 67% cost 6–15 and 7% cost 16–30. Flags: `--flare-min`, `--flare-max`, `--flare-rise`, `--flare-weight-rise`, `--debuff-flare`, `--strain-free`, `--strain-rate`.

### Boss: the Mire

Pick it from the commission buttons on the start screen or in the sandbox (`--commission mire` in the simulator). A 180 kg bog to fire into brick, 80–90% earth with air and fire each 1–3%. Each term it rolls surge, stiffen (resistance ×2 this term), bind (one sigil this term) or slag (two power-1, no-link slag runes into your draw pile), each carrying a flare of 32–36.

| Deck | Won | Spent when won (median, p10–p90) | Terms when won |
| --- | --- | --- | --- |
| Mid-run | 0% | — | — |
| Late-run | 70% | 68 (35–90) | 5 |
| Late-run, +1 link, 10-rune hand | 100% | 28 | 3 |

Tuning flags: `--boss-resistance`, `--boss-flare-min`, `--boss-flare-max`, `--boss-stiffen`, `--boss-junk`, `--boss-mass`. The simulated player now values progress twice as much as before (`--miss-weight 60`); at 30 it warded forever in cornered boss fights. With it, mud costs the opening deck a median of 13 (p90 24), mid-run 4 and late-run 0.

