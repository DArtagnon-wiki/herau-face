# Circuits: a new direction

Proposed, October 2026. A playable prototype is being built beside Mud to Clay. This file mirrors the "Circuits (new direction)" tab of the design doc.

Electrical schematics are a kind of runic composition. In this direction a card is a small circuit: instability flows in through its input channels, and purification flows out through its stages. Composition stays the cool factor, but it moves from play time into the run: the deck grows by adding runes to cards.

## Why

- **Turns were thinky.** A sigil composed at play time has hundreds of possible results and can't be scored in your head (see Turn complexity in DESIGN.md). A circuit card's output can: it is how much it takes in, times its gain.
- **Types stay linear.** Elements matter only on the input side, deciding which instability a card can take in. Purification is a single number, so 4 kinds of input cover the space instead of a 4×4 grid that fixed cards could never fill.
- **Transmutation becomes its own fantasy.** Turning one material into another moves from damage to crafting: processing leaves material behind, and recipes turn it into helpers, buffs and metals.

## The fight

- **The commission feeds instability into a pool** in bulk, at set phases: mud feeds 5 water and 2 earth at every new and full moon.
- **Cards drain the pool** through their input channels and turn what they take into purification, plus a little material.
- **When the commission attacks, whatever is in the pool flares** and costs quintessence, less Ward, and the pool stays: flares don't empty it. Every play is both defence (it drains the pool) and progress (it purifies), as block and attack are in one Slay the Spire card. (Flares used to empty the pool, which wiped the stock the gates need just as a good card arrived.)
- **The commission is done when its purification requirement is met.** It asks for purification only, not for any particular element.
- **Elements work like damage types on defence.** A deck without fire channels suffers against a fire-heavy commission, so weaker any-element channels exist (half capacity, say) to make a missing element a problem rather than a hard loss.

## Cards as circuits

- **Input channel:** an element and a capacity, as in "up to 5 water".
- **Inputs from elsewhere** have a fixed cost and collect their own number, whatever is in the pool: quintessence (pay 3 of yours, never your last), a discard (throw away another card from hand) or an eighth more of the moon. Everything a card collects goes through the same collector, so its outputs read one total. An element input does double duty, draining the commission while it powers the card; these only cost you, so they collect more for the same worth (a wild 3 and a quintessence 3 are about 6 apart by the time the flare hits).
- **Gain stage:** multiplies the card's purification.
- **Distilling rune:** adds a principle output to any card; the rune names the principle.
- **Later parts:** a ground or filter that soaks instability without purifying (Ward), a capacitor that stores flow for a later burst, a feedback loop (combo).
- **The opening cards come in two kinds.** Metal makers take up to 5 of one element and ground it, purifying nothing, and yield 1 principle once they take 4 or more; there is one for each element. Purifiers take up to 3 each of two elements and purify 1 for each, yielding nothing: slow to drain, but they cover two elements and hit hard; there is one for each of the six pairs of elements. Every hand asks which you need, defence and metal or progress.
- **More outputs:** draw a card or spare an eighth of the moon (each once the stage collects 3), gain quintessence (1 for each collected), and statuses.
- **Statuses** go on the commission or on you. Most take N, what the stage collected; the unit ones need 3. On the commission: Settle (at every phase N of the most plentiful instability settles and is purified, then N falls by 1, like poison), Starve (its next bulk feed is N smaller), Expose (your cards purify ×1.5 for the next N phases), Thorns (when it next flares, N of the pool is purified first), Stall (its next flare comes an eighth later) and Volatile (until its next flare your cards purify ×2, but that flare is doubled). On you: Condense (your next card also takes N of whatever is most plentiful), Mend (at every phase you gain N quintessence, then N falls by 1), Retain (at the next quarter moon you keep your hand) and Foresight (at the next quarter moon you draw 2).
- **The opening draft.** A run starts by drafting a twelfth rune: one of three, each an input and an output tuned by the balance simulator to be worth about two Washes. The rune also yields a principle (rolled with the draft) once it collects 1, a single arc.
- **Catalyst:** a card the shop can offer. It takes up to 2 of anything and purifies it, and the next card you play purifies ×2: little on its own, multiplicative before a big card.
- **Deck growth adds runes to existing cards:** another input channel, a gain stage, a principle output or a ground stage. Composition is the deckbuilding.

```
Metal maker:  WATER ─┤5├──────────► ground (purifies nothing), mercury 1 from 4

Purifier:     WATER ─┤3├─┐
                         ├────────► purification: min(water,3) + min(earth,3)
              EARTH ─┤3├─┘
```

## Time: the celestial tracker

There are no turns. Every card costs time on a dial, and the dial's phases carry the events.

- **The moon.** The dial shows the moon's eight phases, and a fight opens at the new moon. A beginner card costs an eighth of the moon.
- **The rhythm.** At every new and full moon you draw 4; at the first and last quarters you discard what is left. That leaves time for two plays before each discard: draw 4, play your best 2. With nothing to play, the moon moves on by itself to the next draw.
- **Commissions act on phase boundaries,** not a little at every phase. The common pattern: a bulk feed at the new and full moons and an attack at 3/8 and 7/8 of the moon, so a good pair of cards can drain a common feed completely before the attack. Advanced fights may run other rhythms, and the player should have tools to match, such as runes that say "on the next quarter moon, draw 2".
- **Cards can cost different amounts of time.** A quick circuit could cost a sixteenth of the moon, a heavy one a quarter; a moon input adds an eighth. Gain stages cost no time (they used to add a tick each). "How much can I fit before the attack?" is the core decision.
- **Waiting.** When the hand can't help, waiting advances the dial an eighth, so you can never stall.
- **Spare time.** An output that gives back an eighth doesn't wind the dial back; it pools as spare time, which your next cards spend before the dial moves.
- **Slower trackers can stack on the moon.** The Western zodiac cycles fire, earth, air and water around the wheel (Aries, Taurus, Gemini, Cancer, then again from Leo), so a zodiac dial gives a fight elemental seasons; its modalities fit too, with mutable signs suited to transmutation. Planetary hours, by which alchemists timed their work, could make a metal cheaper in its planet's hour. A boss can run its own clock for its signature moves.

## Materials and recipes

- **Cards yield Paracelsus's three principles** from their outputs: salt, sulfur and mercury. Which principle a card yields is its own design, not its element's (Wash happens to yield mercury), and distilling runes add principle outputs to any card. A principle output needs its stage to collect 4 or more.
- **Recipes are earned.** In a fight, brewing costs principles but no time on the dial (with time it was too expensive to use): tinctures and elixirs for one-off effects (like Slay the Spire's potions), and the homunculus of Paracelsian lore, a helper that processes a little instability at every phase by itself.
- **After a fight, metals are currency.** The sulfur–mercury theory of the Jabirian writings makes every metal sulfur and mercury in some proportion and purity, with gold the perfect balance of pure principles. Crude principles make lead; pure ones are needed for gold. That gives purity its late payoff: rewarding early, required later.
- **Metals keep their planets:** the Sun gold, the Moon silver, Mars iron, Venus copper, Jupiter tin, Saturn lead, Mercury quicksilver.
- **Two outputs make two archetypes:** a fast deck heavy on gain stages that purifies, and a greedy deck heavy on principle outputs that farms principles for helpers and gold. It is the money-against-score tension of Balatro.

## The six archetypes, again

| Archetype | As circuits |
| --- | --- |
| Consistent ward | Grounds and filters that soak instability |
| Combo | Feedback loops |
| One great rune | One card with a long amplifier chain |
| Purity maxing | Pure principles for noble metals |
| Element mastery | Many input channels for one element |
| Deck thinning | Fewer, bigger circuits |

## What carries over

Elements, purity grades, rune bodies and rarities, motes as card parts, the archetypes, the sigil art and the sound carry over. The amalgam and its target bands, the runepath equation and composing at play time are left behind.

## Runic schema, version 1

A card is drawn as an alchemical circuit, from the designer's sketch of Wash. Reading the drawing explains the card; words are only in a popup.

- **Stages are circles.** Sigils inside a stage are its inputs, each with a lead to the rim. Sigils outside are its outputs, and lines to other stages are links.
- **Arcs are requirements.** One arc where a link meets the stage before means that stage must run; the link ends at the arc. N arcs on an output mean the stage must collect at least N for that output to fire.
- **Shapes name mechanics.** A crescent is time: an eighth of the moon each, a small one for a sixteenth. A triangle is an element, drawn as the alchemical element triangles: fire and air point up, water and earth down, air and earth are barred, and the hexagram of all four takes any. A square is purification, and a square drawn around it (circumscribed) multiplies it once more; a circle there would wrongly mean another stage. The principles keep their alchemical signs; a shield is Ward; a ground sign is an output that grounds what its stage took, purifying nothing; a card sign with ×2 is a catalyst, doubling the next card, and with +1 it draws one. The five-pointed star is quintessence: paid as an input, gained as an output. A struck card is a discard; a crescent inside a stage takes an eighth more of the moon; a turning arrow round a crescent spares an eighth. Each status has a sign: settle a chevron sinking onto its sediment, starve the feed's six-pointed star struck through, expose an eye, thorns a barbed stem, stall an hourglass, volatile a bolt, condense two arrows pressing in, mend a cross in a ring, retain a card held by a clip, foresight a card beside the half moon of the quarter.
- **A card** is a small time stage (its crescents, with leads to the top) linked by one arc to a collecting stage holding its element triangles in a column, each with a level lead to the rim and the most it takes. The collector's main output is below, its square (purification) or a ground sign (what it takes is grounded, purifying nothing), and its side outputs are to the right, principles or shields, each on its own line behind its own arcs. A ground stage is a stage of its own, hanging down to the left from the collector (a second hangs from the first): a wild 3 inside, its lead up to the rim, and a ground sign outside.
- **The drawing shows the live state.** Triangles fill with what they would take from the pool now, arcs light one by one as the take grows, outputs that would fire glow, and a card with nothing to take dims.

![The designer's sketch of Wash beside the prototype's drawing, and Wash lit by different pools](docs/circuit-schema.png)

Wash, as sketched: a moon is its input and its circle must run before the collecting stage can; that stage takes up to 5 water and purifies 1 for each, and only from 4 water or more does it also yield mercury.

## To do

- **Extend the runic schema** to more resources (Ward as an input, say) as stronger cards need them.
- **Advanced rhythms and tools.** Other attack rhythms for harder fights, and runes to meet them; Foresight ("on the next quarter moon, draw 2") is now in the draft.
- **What the draft should aim for.** Two Washes on the gallery bench is worth about −1 Wash against drafting nothing (a blank twelfth costs about 3), and the bench's element balance doesn't match the run's water-heavy commissions: a pool tuned there drops runs to 61%, against 77% without a draft. The game keeps the pool tuned on the run's own fights (78%). Either the target rises by the cost of a twelfth card, or the runs draw from the gallery, or both. The new inputs, outputs and statuses are only in the draft so far; the shop could sell them too.
- **Mend is far too strong as an added sigil** (8 to 9 Washes on any card: N, then N−1 and so on, is 15 to 21 quintessence from a card collecting 5 or 6), and Settle, Thorns and a quintessence output are strong too. Volatile costs more than it gives; Stall does nothing.
- **The bench's last residues.** Circulate sits about 0.08 Washes below the other purifiers and Kindle about 0.05 below Wash, close to what the bench can resolve. The principles aren't symmetric either (silver needs mercury and salt; sulfur only makes lead), which the bench averages away by turning them.
- **The gallery joins runs?** The ten new enemies are on the bench only; runs still play the four commissions. Their debuffs (locks, scattered hands, smaller draws) aren't drawn on the dial yet.
- **Make decisions meaningful.** The play loop works but offers few real choices; thresholds like Wash's (wait for the pool to fill, or wash now?) are one lever.
- **Tune the numbers:** feed rates, purification requirements, card capacities, the draw rule.
- **Decide crafting:** which recipes are in-fight, what each costs in material, how recipes are earned.
- **The pool after an attack.** Now trying non-resetting flares: the pool stays.
- **Try the zodiac and planetary trackers** once the moon works.

## Prototype

A separate page beside Mud to Clay (`circuits.html`), on one screen: the moon dial with the pool in its middle, materials and recipes always in view, the hand of circuit cards drawn with the runic schema, and a note that always explains whatever is picked, in its own slot under the dial (beside the game on wide screens). Only the menu and the reading guide open over the game. It plays a run of four commissions with single-number purification, the three principles, three recipes (a tincture for Ward, a spirit to draw 2, the homunculus), metal smelted after each fight, and runes added to cards between fights; the shop explains each rune in words and shows the card before and after.

- **Commissions,** each feeding in bulk at every new and full moon and flaring at 3/8 and 7/8 of the moon. Mud: 5 water and 2 earth, needs 20. The peat bog: 4 water, 4 earth and 1 fire, needs 30. The Fumarole: 4 air, 4 fire and 1 water, needs 30; it is there so a deck built only for water and earth suffers. The Mire: 5 water, 3 earth and 1 fire, an earth more at each feed after the first, needs 40. The run starts with 40 quintessence.
- **The opening deck** is eleven cards, and the draft adds a twelfth. Six purifiers take up to 3 each of two elements and purify 1 for each, yielding nothing, one for each pair: Dissolve (water and earth), Circulate (water and air), Digest (water and fire), Sublime (earth and air), Coagulate (earth and fire) and Cupel (air and fire). Four metal makers take up to 5 of one element and ground it, yielding their principle once they take 4 or more: Wash (water, mercury), Calcine (earth, salt), Fan (air, mercury) and Kindle (fire, sulfur). The Sieve takes 3 of anything, purifies it and raises Ward. Every card takes an eighth of the moon.
- **The draft** offers three runes, no two with the same output, from a pool of 39 that `scripts/circuits-balance.ts` tuned to about two Washes on the run's own fights (Mud, the peat bog, the Fumarole; metal not counted), in `src/circuits/draft-pairs.ts`. Their inputs are an element, any, quintessence, a discard or an eighth of the moon; their outputs purify, a ground stage, Ward, catalyst, draw, spare eighths, quintessence or a status. Six water purifying is one; so are a discard collecting 12 to purify, and a moon input collecting 9. The drafted rune is called Opus. A card holds at most 3 inputs, 2 gains (only on cards that purify), 3 side outputs and 2 ground stages; distilling runes (salt, sulfur or mercury) go on any card, and the shop sometimes offers a whole new card, the Catalyst.
- **Ties.** When elements tie for most plentiful (for any input, a ground stage, Settle, Thorns, the homunculus, Starve), each fight settles it in its own order of the elements, shuffled when the fight opens. A fixed order (water, earth, air, fire) always drained earth before air, which left more air for Fan and more fire for Kindle.
- **Recipes,** each brewed in no time. Tincture of salt: 2 salt, Ward 6. Spirit of mercury: 3 mercury, draw 2. Homunculus: 3 mercury, 2 salt and 1 sulfur, then it drains 2 of the most plentiful instability and purifies 2 at every phase.
- **Metal.** Silver from 2 mercury and a salt (worth 3), lead from any two principles (worth 1). The first rune between fights is free; more cost 3 metal.

### Simulated strategies

`scripts/circuits-sim.ts` plays the run three ways (600 runs each; draw 4 at new and full moons, discard at the quarters; 40 quintessence; non-resetting flares). Each run opens with the draft: greedy and delay take the rune the balance simulator found worth most, random any.

- **Greedy** plays, brews or waits for whatever looks best right now: purification, quintessence kept, the pool it would face, helpers, Ward, cards in hand, a catalyst waiting. It ignores the gates and doesn't value metal. Between fights it takes gains first, then a Catalyst, then inputs for the elements the coming commissions feed most.
- **Random** makes any legal move, and takes random runes for random cards.
- **Delay** keeps the fights before the boss going to gather principles, as long as doing so doesn't lose: a move is allowed only if playing greedy after it would still finish the fight with a chosen reserve of quintessence. The engine is deterministic, so this look-ahead is exact.

| Strategy | Runs won | Paid in Mud | Metal | Paid in Peat | Metal | Paid in Fumarole | Metal | Reach the Mire, with |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Random | 0% | 42.5 | 0.1 | 21.3 | 0.0 | 22.6 | 0.0 | none |
| Greedy, no twelfth rune | 77% | 3.5 | 0.1 | 6.6 | 0.1 | 8.7 | 0.2 | 99%, with 21 |
| Greedy | 78% | 3.2 | 0.3 | 6.6 | 0.3 | 9.3 | 0.3 | 99%, with 22 |
| Delay, keep 1 | 1% | 37.4 | 1.4 | 3.9 | 0.2 | 3.9 | 0.2 | 4%, with 1 |
| Delay, keep 25 | 54% | 14.1 | 1.3 | 6.0 | 0.5 | 8.6 | 0.3 | 93%, with 13 |
| Delay, keep 30 | 69% | 9.3 | 1.2 | 5.9 | 0.4 | 9.0 | 0.4 | 97%, with 17 |
| Delay, keep 35 | 78% | 5.0 | 1.0 | 6.1 | 0.4 | 9.2 | 0.4 | 99%, with 21 |

- **The opening deck alone** wins 77% for greedy; a drafted rune adds a point.
- **Full blocks:** greedy fully blocks 59% of Mud's flares, 33% of the peat bog's, 23% of the Fumarole's and 27% of the Mire's.
- **Fights last 1.7 to 1.8 moons,** about 8 cards.
- **Holding back doesn't pay.** Metal comes out at about one per fight, so stalling for it never beats greedy.

### The balance bench

`scripts/circuits-balance.ts` scores rune builds against a basic Wash. A build goes into the deck (as a twelfth card beside the eleven opening cards, or as a change to one of them), and greedy plays the same fights with it: every enemy in the rogues gallery but the Mire, each on its own at full quintessence, the same seeds for every build. What a fight costs is the quintessence it takes, less 3 for each metal smelted after it (the tincture of salt's floor; metal scales the run, so probably more). A build's worth is what it saves against a blank twelfth card that does nothing, over what a second Wash saves: blank 0, Wash 1. So no element is tied to a principle, the metal makers' principles turn over the seeds, and so does any principle output of the card measured. Errors are paired: what a build saves seed by seed, against the blank on the same seed.

#### The rogues gallery

The run's four commissions and ten more (`GALLERY` in the engine). Between them they feed every pair of elements twice and all four once, with fills of every shape and new debuffs: hands scattered, elements locked, draws cut, other attack rhythms. The cost is what each costs with a blank twelfth card: its difficulty.

| Enemy | Feeds | Flares | Debuff | Needs | Cost |
| --- | --- | --- | --- | --- | --- |
| Will-o'-the-wisp | 3 air, 5 fire at new and full | once, at 7/8 | – | 22 | 2.4 |
| Mud | 5 water, 2 earth at new and full | 3/8, 7/8 | – | 20 | 5.5 |
| Squall | 6 air at the new moon, 6 water at the full | at the quarters | it breaks just as you discard | 30 | 6.5 |
| Hot spring | 4 water, 5 fire at new and full | 3/8, 7/8 | scalds a card out of your hand at each flare | 18 | 7.1 |
| Geyser | 6 water, 5 fire, at the new moon only | once, at the full | – | 34 | 8.3 |
| Kiln | 2 earth, 3 fire at new and full, one more of each every time | 3/8, 7/8 | it grows | 24 | 10.0 |
| Dust devil | 3 earth, 1 air at every quarter | 3/8, 7/8 | – | 13 | 10.7 |
| Peat bog | 4 water, 4 earth, 1 fire at new and full | 3/8, 7/8 | – | 30 | 11.3 |
| Fumarole | 4 air, 4 fire, 1 water at new and full | 3/8, 7/8 | – | 30 | 11.3 |
| Prism | 2 of each at new and full | 3/8, 7/8 | locks whatever is most plentiful at new and full | 22 | 16.5 |
| Magma | 4 fire, 3 earth at new and full | 3/8, 7/8 | earth locked from the new moon to the full | 20 | 16.6 |
| Sandstorm | 4 earth, 4 air at new and full | 3/8, 7/8 | scours a card out of your hand right after each draw | 28 | 16.9 |
| Fog bank | 1 water, 1 air at every phase | 3/8, 7/8 | you draw one fewer | 18 | 20.2 |
| The Mire | 5 water, 3 earth, 1 fire, an earth more each time | 3/8, 7/8 | it grows | 40 | (the boss; not on the bench) |

`scripts/circuits-gallery-tune.ts` tuned the ten. A card's worth is a sum over enemies, so a change to one enemy moves only that enemy's column: it measures variants of each (an element more or less, the requirement 3 more or less), then searches the combination that evens out the symmetric cards while keeping each enemy in its band of difficulty. The last steps were by hand on fresh seeds, since the search fits its own seeds' noise.

| Over three fresh runs of 1000 seeds | Washes |
| --- | --- |
| Wash, Calcine, Fan, Kindle | 1.00, 0.96, 0.99, 0.94 |
| Dissolve, Circulate, Digest, Sublime, Coagulate, Cupel | 2.40, 2.30, 2.41, 2.37, 2.37, 2.39 |

- **It is a usable bench, at enough seeds.** With 1000 seeds an enemy a card's worth is known to about ±0.04 Washes; at 200 to 400 seeds runs disagree by 0.1 to 0.2, which is how the first tunings fooled themselves. The metal makers now agree within 0.06 and the purifiers within 0.11; Circulate is the one steadily low, by about 0.08.
- **Metal makers turn on their gate.** A feed of 4 or more of an element is what makes its metal maker pay: dropping the wisp's fire from 4 to 3 cut Kindle's worth there from 1.6 to 0.4.
- **Near-losses have huge leverage.** A card that flips a lost fight saves dozens of quintessence, so hard enemies swing the totals; the bands keep each one winnable.

| Card, as a twelfth | Washes |
| --- | --- |
| Sieve | 5.6 |
| Catalyst | 3.1 |
| The six purifiers | 2.3 to 2.6 |
| The four metal makers | 1.0 |

#### A twelfth card has a cost

The blank is not nothing. Against no twelfth card at all, a blank costs about 3.1 Washes (35 quintessence over the 13 fights): every draw it fills is a play lost. So a second Wash is worth +1 against the blank but about −2 against not having it, and a rune must be worth more than about 3 on this bench to beat leaving the deck at eleven. That is deck thinning, measured, and it is why worth here compares builds with each other rather than with nothing.

#### Tuning the draft

With `--calibrate` the bench finds, for each of the 136 input and output pairs, the amount that makes the rune worth two Washes: the input's number for outputs that read what it collects, the count for draw, spare eighths, Foresight and the catalyst. `--write` checks each on fresh seeds and keeps those within 0.3 of two both times: 51 on the gallery bench. Counting metal changed the amounts a lot, since the drafted rune's one-arc principle yields at every play. That pool isn't in the game: two Washes there is about −1 against drafting nothing, and its air and fire runes are dead weight in the run's water-heavy fights (runs won fall to 61%, from 77% without a draft; water runes alone hold 74 to 92%). The game keeps the earlier pool, tuned on the run's own fights.

| Amount in the pool | Purify | Ward | Condense | Settle |
| --- | --- | --- | --- | --- |
| Water | 4 | 4 | 3 | – |
| Air | 4 | 5 | 3 | – |
| Any | 1 | – | 1 | – |
| A moon input | 3 | 3 | 3 | 1 |
| A discard | 3 | 3 | 3 | 1 |
| Quintessence (3 paid) | 9 | 8 | 13 | 2 |

A dash: that pair didn't make the pool.

#### What adding a sigil is worth

`--sigils` adds each sigil to each opening card (within the caps) and measures the change, with how often the card is drawn and played. The Sieve is played 90% of the times it is drawn, the purifiers about 60%, the metal makers under a third.

| Sigil added | On the Sieve | On a purifier | On a metal maker |
| --- | --- | --- | --- |
| Mend | 8.4 | 8.9 | 8.1 |
| Settle | 6.2 | 5.2 | 3.0 |
| Thorns | 5.3 | 4.3 | 2.6 |
| A quintessence output | 4.8 | 4.3 | 2.6 |
| An input of 3 any | 5.4 | 3.6 | 2.3 |
| Foresight | 5.0 | 3.5 | 1.3 |
| Condense | 4.1 | 3.5 | 2.1 |
| A moon input (3) | 4.2 | 2.1 | 0.1 |
| A discard input (3) | 3.7 | 1.6 | 0.2 |
| An element input | 2.9 to 3.3 | 1.5 to 1.9 | 0.9 to 1.0 (0.2 to 0.3 of its own element) |
| Ward | 2.9 | 2.4 | 1.4 |
| Gain | 2.8 | 2.3 | – |
| Catalyst ×2 | 2.3 | 1.9 | 1.6 |
| Ground stage | 1.7 | 2.0 | 2.1 |
| Retain | 2.6 | 1.7 | 0.7 |
| Starve | 1.8 | 1.4 | 1.0 |
| Spare an eighth | 1.6 | 1.2 | 0.6 |
| Draw 1 | 1.6 | 1.1 | 0.1 |
| Expose | 1.1 | 1.0 | 0.8 |
| Distil (from 4) | 0.0 | 0.5 | 0.5 |
| Stall | 0.1 | 0.1 | 0.1 |
| A quintessence input (3) | 0.8 | −1.0 | −0.9 |
| Volatile | −2.6 | −1.3 | −0.8 |

`--curve` adds the same sigil again and again, caps lifted, and splits each step. A card's worth V (its deck against the same deck with the card blanked) is how often it is played a fight, P, times its worth a play, u. Each step's gain is ΔV = P̄·Δu (each play better: pure benefit) + ū·ΔP (played more often: the speculative part).

| Adding inputs of 3 any | Worth | Played when drawn | From better plays | From more plays |
| --- | --- | --- | --- | --- |
| Sieve as it opens | 8.3 | 90% | | |
| one more | 13.8 | 94% | +5.6 | −0.2 |
| two more | 14.8 | 93% | +1.5 | −0.4 |
| three more | 14.8 | 93% | +0.2 | −0.2 |
| Dissolve as it opens | 5.1 | 61% | | |
| one more | 8.8 | 89% | +1.5 | +2.2 |
| two more | 9.9 | 92% | +1.1 | 0.0 |
| Wash as it opens | 1.6 | 29% | | |
| one more | 3.9 | 53% | +0.5 | +1.7 |
| two more | 5.5 | 66% | +0.4 | +1.3 |
| three more | 6.0 | 68% | +0.1 | +0.3 |

- **The Sieve's inputs are pure benefit, and then the pool runs out.** It is played whenever it's drawn, so each input makes every play better (5.5 to 9.3 a play, for 5.4 Washes), and Ward doubles what purification already counts. By two more inputs it takes 9 of anything, about all a half-moon's pool holds: that is how good it gets, about 14.8 Washes. A second input of one element adds nearly nothing for the same reason.
- **On a card played conditionally, most of the gain is being played more.** A Wash with one more input is played 53% of the times it's drawn instead of 29%; three quarters of its gain is the extra plays. Once a card reaches its ceiling of plays (about 70% of draws for a metal maker, over 90% for the others) that part stops, and only better plays remain.
- **Gain doesn't run out on the pool but on the requirement.** On the Sieve: +2.8, +1.7, +1.4, +1.2, +0.6 for five gains, as fights end sooner and purification past the requirement is wasted (the "more plays" part turns negative because shorter fights have fewer plays).
- **So the derivative depends on where the card sits:** below its ceiling of plays it is mostly ū·dP, at the ceiling P̄·du, and both fall to zero once the card can take the whole pool or overkills the requirement.

Playtest: the scarcity felt right (one bought rune per shop, where the earlier version bought three), and so did two plays per draw.
