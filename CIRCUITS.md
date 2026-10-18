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
- **The draft's pool.** 39 of the 136 pairs reach about two Washes. Stall, Starve, Expose and Retain mostly can't, nor can draw with most inputs; Settle and Foresight jump past it in one step. The simulated player's guesses at what statuses are worth decide how it plays them, so some may be better than they score. The new inputs, outputs and statuses are only in the opening draft so far; the shop could sell them too.
- **Make decisions meaningful.** The play loop works but offers few real choices; thresholds like Wash's (wait for the pool to fill, or wash now?) are one lever.
- **Tune the numbers:** feed rates, purification requirements, card capacities, the draw rule.
- **Decide crafting:** which recipes are in-fight, what each costs in material, how recipes are earned.
- **The pool after an attack.** Now trying non-resetting flares: the pool stays.
- **Try the zodiac and planetary trackers** once the moon works.

## Prototype

A separate page beside Mud to Clay (`circuits.html`), on one screen: the moon dial with the pool in its middle, materials and recipes always in view, the hand of circuit cards drawn with the runic schema, and a note that always explains whatever is picked, in its own slot under the dial (beside the game on wide screens). Only the menu and the reading guide open over the game. It plays a run of four commissions with single-number purification, the three principles, three recipes (a tincture for Ward, a spirit to draw 2, the homunculus), metal smelted after each fight, and runes added to cards between fights; the shop explains each rune in words and shows the card before and after.

- **Commissions,** each feeding in bulk at every new and full moon and flaring at 3/8 and 7/8 of the moon. Mud: 5 water and 2 earth, needs 20. The peat bog: 4 water, 4 earth and 1 fire, needs 30. The Fumarole: 4 air, 4 fire and 1 water, needs 30; it is there so a deck built only for water and earth suffers. The Mire: 5 water, 3 earth and 1 fire, an earth more at each feed after the first, needs 40. The run starts with 40 quintessence.
- **The opening deck** is eleven cards, and the draft adds a twelfth. Six purifiers take up to 3 each of two elements and purify 1 for each, yielding nothing, one for each pair: Dissolve (water and earth), Circulate (water and air), Digest (water and fire), Sublime (earth and air), Coagulate (earth and fire) and Cupel (air and fire). Four metal makers take up to 5 of one element and ground it, yielding their principle once they take 4 or more: Wash (water, mercury), Calcine (earth, salt), Fan (air, mercury) and Kindle (fire, sulfur). The Sieve takes 3 of anything, purifies it and raises Ward. Every card takes an eighth of the moon.
- **The draft** offers three runes, no two with the same output, from a pool of 39 that `scripts/circuits-balance.ts` tuned to about two Washes (`src/circuits/draft-pairs.ts`). Their inputs are an element, any, quintessence, a discard or an eighth of the moon; their outputs purify, a ground stage, Ward, catalyst, draw, spare eighths, quintessence or a status. Six water purifying is one; so are a discard collecting 12 to purify, and a moon input collecting 9. The drafted rune is called Opus. A card holds at most 3 inputs, 2 gains (only on cards that purify), 3 side outputs and 2 ground stages; distilling runes (salt, sulfur or mercury) go on any card, and the shop sometimes offers a whole new card, the Catalyst.
- **Recipes,** each brewed in no time. Tincture of salt: 2 salt, Ward 6. Spirit of mercury: 3 mercury, draw 2. Homunculus: 3 mercury, 2 salt and 1 sulfur, then it drains 2 of the most plentiful instability and purifies 2 at every phase.
- **Metal.** Silver from 2 mercury and a salt (worth 3), lead from any two principles (worth 1). The first rune between fights is free; more cost 3 metal.

### Simulated strategies

`scripts/circuits-sim.ts` plays the run three ways (600 runs each; draw 4 at new and full moons, discard at the quarters; 40 quintessence; non-resetting flares). Each run opens with the draft: greedy and delay take the rune the balance simulator found worth most, random any.

- **Greedy** plays, brews or waits for whatever looks best right now: purification, quintessence kept, the pool it would face, helpers, Ward, cards in hand, a catalyst waiting. It ignores the gates and doesn't value metal. Between fights it takes gains first, then a Catalyst, then inputs for the elements the coming commissions feed most.
- **Random** makes any legal move, and takes random runes for random cards.
- **Delay** keeps the fights before the boss going to gather principles, as long as doing so doesn't lose: a move is allowed only if playing greedy after it would still finish the fight with a chosen reserve of quintessence. The engine is deterministic, so this look-ahead is exact.

| Strategy | Runs won | Paid in Mud | Metal | Paid in Peat | Metal | Paid in Fumarole | Metal | Reach the Mire, with |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Random | 0% | 42.4 | 0.1 | 20.9 | 0.0 | 11.9 | 0.0 | none |
| Greedy, no twelfth rune | 78% | 3.7 | 0.1 | 6.8 | 0.1 | 8.6 | 0.2 | 99%, with 21 |
| Greedy | 80% | 3.2 | 0.3 | 6.8 | 0.3 | 9.1 | 0.3 | 99%, with 21 |
| Delay, keep 1 | 0% | 37.4 | 1.4 | 3.8 | 0.3 | 3.6 | 0.2 | 4%, with 1 |
| Delay, keep 25 | 55% | 14.1 | 1.2 | 6.3 | 0.5 | 8.9 | 0.3 | 90%, with 13 |
| Delay, keep 30 | 68% | 9.3 | 1.1 | 5.9 | 0.5 | 8.9 | 0.3 | 98%, with 17 |
| Delay, keep 35 | 79% | 4.9 | 1.0 | 6.2 | 0.5 | 8.9 | 0.3 | 99%, with 21 |

- **The opening deck alone** wins 78% for greedy (76% while gains still cost a tick); a drafted rune worth two Washes adds 2 points.
- **Full blocks:** greedy fully blocks 59% of Mud's flares, 33% of the peat bog's, 21% of the Fumarole's and 28% of the Mire's.
- **Fights last 1.7 to 1.8 moons,** about 8 cards.
- **Holding back doesn't pay.** Metal comes out at about one per fight, so stalling for it never beats greedy.

### Balance simulator

`scripts/circuits-balance.ts` scores rune builds against a basic Wash. A build goes into the deck as a twelfth card beside the eleven opening cards, and greedy plays the same fights with it: Mud, the peat bog and the Fumarole, each on its own at full quintessence, 400 seeds each, the same seeds for every build. What a fight costs is the quintessence it takes: flares, plus whatever the cards pay, less whatever they gain. A build's worth is what it saves against a blank twelfth card that does nothing, over what a second Wash saves: blank 0, Wash 1. (The Mire is left out by default: the opening deck alone loses it nearly every time, so what a card saves there is mostly whether it turns a loss into a win.) A blank twelfth card costs 5.8, 12.0 and 12.0 quintessence in the three fights, and a Wash saves 2.4, 1.8 and nothing.

| Opening card, as a twelfth | Washes |
| --- | --- |
| Sieve | 3.6 |
| Dissolve | 2.4 |
| Digest | 1.9 |
| Circulate | 1.6 |
| Catalyst, Cupel | 1.5 |
| Coagulate | 1.2 |
| Wash | 1.0 |
| Sublime | 0.9 |
| Calcine | 0.7 |
| Kindle | 0.4 |
| Fan | 0.3 |

With `--calibrate` it finds, for each of the 136 input and output pairs, the amount that makes the rune worth two Washes: the input's number for outputs that read what it collects, the count for draw, spare eighths, Foresight and the catalyst. `--write` checks each on fresh seeds and keeps the ones within 0.3 of two both times.

| Amount in the pool | Purify | Ward | Thorns | Settle |
| --- | --- | --- | --- | --- |
| Water | 6 | 4 | 2 | – |
| Any | 3 | 2 | – | – |
| Earth | – | – | – | 2 |
| A moon input | 9 | 8 | 3 | 2 |
| A discard | 12 | 8 | 3 | 2 |
| Quintessence | 16 | 13 | – | 3 |

A dash: that pair didn't make the pool, being past two at its smallest step (any → Thorns 2 is 2.8), short of it at its largest, or off on the second run of seeds.

- **Element inputs do double duty.** Purifying like six water takes 9 from an eighth of the moon, 12 from a discard and 16 from 3 quintessence.
- **The opening cards are uneven:** the Sieve is worth 3.6 Washes, Fan and Kindle under half of one (their metal isn't counted).
- **Settle is strong per point** (2 or 3 is enough from anything), and Foresight draws its 2 into the gap between a quarter's discard and the next draw.

Playtest: the scarcity felt right (one bought rune per shop, where the earlier version bought three), and so did two plays per draw.
