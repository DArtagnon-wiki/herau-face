# Circuits: a new direction

Proposed, October 2026. A playable prototype is being built beside Mud to Clay. This file mirrors the "Circuits (new direction)" tab of the design doc.

Electrical schematics are a kind of runic composition. In this direction a card is a small circuit: instability flows in through its input channels, and purification flows out through its stages. Composition stays the cool factor, but it moves from play time into the run: the deck grows by adding runes to cards.

## Why

- **Turns were thinky.** A sigil composed at play time has hundreds of possible results and can't be scored in your head (see Turn complexity in DESIGN.md). A circuit card's output can: it is how much it takes in, times its gain.
- **Types stay linear.** Elements matter only on the input side, deciding which instability a card can take in. Purification is a single number, so 4 kinds of input cover the space instead of a 4×4 grid that fixed cards could never fill.
- **Transmutation becomes its own fantasy.** Turning one material into another moves from damage to crafting: processing leaves material behind, and recipes turn it into helpers, buffs and metals.

## The fight

- **The commission feeds instability into a pool,** per element, on a schedule: mud feeds mostly water and some earth.
- **Cards drain the pool** through their input channels and turn what they take into purification, plus a little material.
- **When the commission attacks, whatever is left in the pool flares** and costs quintessence. Every play is both defence (it drains the pool) and progress (it purifies), as block and attack are in one Slay the Spire card.
- **The commission is done when its purification requirement is met.** It asks for purification only, not for any particular element.
- **Elements work like damage types on defence.** A deck without fire channels suffers against a fire-heavy commission, so weaker any-element channels exist (half capacity, say) to make a missing element a problem rather than a hard loss.

## Cards as circuits

- **Input channel:** an element and a capacity, as in "up to 5 water".
- **Gain stage:** multiplies the card's purification.
- **Distilling rune:** adds a principle output to any card; the rune names the principle.
- **Later parts:** a ground or filter that soaks instability without purifying (Ward), a capacitor that stores flow for a later burst, a feedback loop (combo), a rail that caps output until it is raised.
- **Beginner cards have one input and no stages:** take up to 5 water, make 5 purification, and 1 mercury once they take 4 or more.
- **Deck growth adds runes to existing cards:** another input channel, a gain stage, a principle output or a ground. Composition is the deckbuilding.

```
Beginner:   WATER ─┤5├──────────► purification 5, mercury 1

Grown:      WATER ─┤5├─┐
                       ├──▷ ×2──► (min(water,5) + min(air,3)) × 2
            AIR   ─┤3├─┘
```

## Time: the celestial tracker

There are no turns. Every card costs time on a dial, and the dial's phases carry the events.

- **The moon.** The dial shows the moon's eight phases, and a fight opens at the first quarter. A beginner card costs an eighth of the moon, and each phase feeds the pool. You draw at every quarter. A weak commission flares at every full and new moon; a tough one flares at every quarter and grows at the phases between. (At first a card cost a quarter of a four-phase moon; the cycle was halved to slow the feel, with play unchanged.)
- **The draw needs care.** Drawing 4 every two plays grows the hand by 2 every half moon. The prototype refills the hand to 4 at every quarter instead, so you choose your best 2 of 4 before each event. But unplayed cards wait in hand for free, an advantage other deckbuilders make you pay for. **Half-moon turns** would add the discard: at every full and new moon, discard what is left and draw 4. The prototype has them as a tuning option; the attacks need rebalancing first (see the simulation below).
- **Cards can cost different amounts of time.** A quick circuit costs a sixteenth of the moon, a heavy amplifier chain a quarter. Gain stages add time, so a bigger circuit is also a slower one. "How much can I fit before the attack?" is the core decision.
- **Waiting.** When the hand can't help, waiting advances the dial an eighth, so you can never stall. With no cards and nothing to brew, the moon moves on by itself to the next draw.
- **Slower trackers can stack on the moon.** The Western zodiac cycles fire, earth, air and water around the wheel (Aries, Taurus, Gemini, Cancer, then again from Leo), so a zodiac dial gives a fight elemental seasons; its modalities fit too, with mutable signs suited to transmutation. Planetary hours, by which alchemists timed their work, could make a metal cheaper in its planet's hour. A boss can run its own clock for its signature moves.

## Materials and recipes

- **Cards yield Paracelsus's three principles** from their outputs: salt, sulfur and mercury. Which principle a card yields is its own design, not its element's (Wash happens to yield mercury), and distilling runes add principle outputs to any card. A principle output needs its stage to collect 4 or more.
- **Recipes are earned.** In a fight, crafting costs time on the dial: tinctures and elixirs for one-off effects (like Slay the Spire's potions), and the homunculus of Paracelsian lore, a helper that processes a little instability at every phase by itself.
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
- **Shapes name mechanics.** A crescent is time: an eighth of the moon each, a small one for a sixteenth. A triangle is an element, drawn as the alchemical element triangles: fire and air point up, water and earth down, air and earth are barred, and the hexagram of all four takes any. A square is purification, and a square drawn around it (circumscribed) multiplies it once more; a circle there would wrongly mean another stage. The principles keep their alchemical signs; a shield is Ward; a ground drains instability away. Later sigils will stand for quintessence, cards in hand and so on.
- **A card** is a small time stage (its crescents, with leads to the top) linked by one arc to a collecting stage holding its element triangles in a column, each with a level lead to the rim and the most it takes. The collector outputs its square below and its side outputs to the right, principles or shields, each on its own line behind its own arcs. Grounds hang down to the left.
- **The drawing shows the live state.** Triangles fill with what they would take from the pool now, arcs light one by one as the take grows, outputs that would fire glow, and a card with nothing to take dims.

![The designer's sketch of Wash beside the prototype's drawing, and Wash lit by different pools](docs/circuit-schema.png)

Wash, as sketched: a moon is its input and its circle must run before the collecting stage can; that stage takes up to 5 water and purifies 1 for each, and only from 4 water or more does it also yield mercury.

## To do

- **Extend the runic schema** to sigils for quintessence, cards in hand, Ward and other resources, as stronger cards need them.
- **Half-moon turns.** Discard and draw 4 at every full and new moon, so holding cards costs something; rebalance the attack cycles for it.
- **Make decisions meaningful.** The play loop works but offers few real choices; thresholds like Wash's (wait for the pool to fill, or wash now?) are one lever.
- **Tune the numbers:** feed rates, purification requirements, card capacities, the draw rule.
- **Decide crafting:** which recipes are in-fight, what each costs in time and material, how recipes are earned.
- **Decide the pool after an attack:** cleared by the flare, or carried over.
- **Try the zodiac and planetary trackers** once the moon works.

## Prototype

A separate page beside Mud to Clay (`circuits.html`), on one screen: the moon dial with the pool in its middle, materials and recipes always in view, the hand of circuit cards drawn with the runic schema, and a note that always explains whatever is picked, in its own slot under the dial (beside the game on wide screens). Only the menu and the reading guide open over the game. It plays a run of four commissions with single-number purification, the three principles, three recipes (a tincture for Ward, a spirit to draw 2, the homunculus), metal smelted after each fight, and runes added to cards between fights; the shop explains each rune in words and shows the card before and after.

- **Commissions,** each fed at every phase. Mud: 3 water and 1 earth, flares at every full and new moon, needs 30. The peat bog: 2 water, 2 earth and 1 fire, flares at every full and new moon, needs 45. The Fumarole: 2 air, 2 fire and 1 water, flares at every full and new moon, needs 40; it is there so a deck built only for water and earth suffers. The Mire: 3 water, 2 earth and 1 fire, grows by an earth at every crescent and gibbous moon, flares at every quarter, needs 50. The run starts with 80 quintessence (60 before the Fumarole).
- **The opening deck** is ten one-input circuits. The metal creators, four Wash (5 water, mercury), three Calcine (5 earth, salt), a Fan (5 air, mercury) and a Kindle (5 fire, sulfur), yield their principle once they take 4 or more. The Sieve (3 of any element) raises Ward, 1 for each it takes. A card holds at most 3 inputs, 2 gains, 3 side outputs and 2 grounds; distilling runes (salt, sulfur or mercury) go on any card.
- **Recipes.** Tincture of salt: 2 salt, a sixteenth of the moon, Ward 6. Spirit of mercury: 3 mercury, a sixteenth, draw 2. Homunculus: 3 mercury, 2 salt and 1 sulfur, an eighth, then it drains 2 of the most plentiful instability and purifies 2 at every phase.
- **Metal.** Silver from 2 mercury and a salt (worth 3), lead from any two principles (worth 1). The first rune between fights is free; more cost 3 metal.

### Simulated strategies

`scripts/circuits-sim.ts` plays the run three ways (600 runs each, refilling to 4 at every quarter, 80 quintessence):

- **Greedy** plays, brews or waits for whatever looks best right now: purification, quintessence kept, the pool it would face, helpers, Ward, cards in hand. It ignores the gates. Between fights it takes gains first, then inputs for the elements the coming commissions feed most.
- **Random** makes any legal move, and puts random runes on random cards.
- **Delay** keeps the fights before the boss going to gather principles, as long as doing so doesn't lose: a move is allowed only if playing greedy after it would still finish the fight with a chosen reserve of quintessence. It takes the move that gathers most, else the one that purifies least, and plays greedy when nothing is allowed. The engine is deterministic, so this look-ahead is exact.

| Strategy | Runs won | Paid in Mud | Metal | Paid in Peat | Metal | Paid in Fumarole | Metal | Into the Mire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Random | 0% | 24.5 | 1.3 | 39.6 | 2.1 | 26.3 | 0.0 | 7 (1% get there) |
| Greedy | 69% | 6.5 | 0.7 | 10.1 | 3.2 | 30.0 | 1.2 | 33 |
| Delay, keep 1 | 0% | 77.0 | 5.8 | 6.1 | 0.5 | 6.2 | 0.0 | none get there |
| Delay, keep 50 | 37% | 29.0 | 5.8 | 8.7 | 3.4 | 24.6 | 1.6 | 19 |
| Delay, keep 60 | 77% | 13.8 | 5.7 | 7.9 | 4.6 | 24.0 | 1.8 | 34 |
| Delay, keep 70 | 82% | 8.0 | 5.3 | 8.8 | 3.5 | 25.5 | 1.6 | 38 |
| Delay, keep 75 | 80% | 4.7 | 3.1 | 9.6 | 3.4 | 27.6 | 1.5 | 38 |
| Delay in Mud only, keep 70 | 82% | 8.0 | 5.3 | 9.2 | 3.3 | 25.6 | 1.6 | 37 |

- **Patience pays.** Keeping 70, the delay player spends 1.5 more quintessence in Mud than greedy, mostly waiting a phase or two for the pool to reach the gates, and leaves with 5.3 metal instead of 0.7: nearly two more runes. It reaches the Mire with more quintessence than greedy and wins 82%. Delaying after Mud adds nothing.
- **Sacrifice doesn't.** Mud yields about 6 metal at most however long you stall, because every principle comes with at least 4 purification and 30 ends the fight. Spending more buys almost nothing: keeping 50 wins 37%, keeping 1 none. As the rules stand, the answer to "save health or spend it for power" is: save it, but wait for the gates. A real trade would need power that doesn't bring the fight closer to its end.
- **Building for air and fire now matters.** With rune picks for only water and earth inputs (`--picks wet`), greedy wins 55% instead of 69%, delay 74% instead of 83%.
- **Half-moon turns need new attacks.** Against today's commissions, discarding and drawing 4 at every full and new moon (`--draw cycle`) wins 7% for greedy and 24% for delay. Mud alone costs greedy twice as much (14.6 against 6.5): a card that can't take anything, like a Fan in Mud, now uses up the turn instead of waiting in hand.
- **The draw rule** matters most: drawing 4 at every quarter without a cap wins every run (greedy) with 53 left; drawing 2 wins 5%.

Before the Fumarole, with 60 quintessence and three commissions, greedy won 83% and delay (keeping 50) 93%.
