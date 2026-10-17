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
- **Distilling stage:** multiplies the material the card yields.
- **Later parts:** a ground or filter that soaks instability without purifying (Ward), a capacitor that stores flow for a later burst, a feedback loop (combo), a rail that caps output until it is raised.
- **Beginner cards have one input and no stages:** take up to 5 water, make 5 purification and 1 mercury.
- **Deck growth adds runes to existing cards:** another input channel, a gain stage or a distilling stage. Composition is the deckbuilding.

```
Beginner:   WATER ─┤5├──────────► purification 5, mercury 1

Grown:      WATER ─┤5├─┐
                       ├──▷ ×2──► (min(water,5) + min(air,3)) × 2
            AIR   ─┤3├─┘
```

## Time: the celestial tracker

There are no turns. Every card costs time on a dial, and the dial's phases carry the events.

- **The moon.** A beginner card costs a quarter moon. You draw at each new and full moon. A weak commission attacks at every full moon; a tough one gains a buff at each quarter and attacks every half.
- **The draw needs care.** Drawing 4 every two plays grows the hand by 2 every half moon. The prototype refills the hand to 4 at each new and full moon instead, so you choose your best 2 of 4 before each event. Other options: draw 2, cap the hand at 8, or make heavier cards the norm.
- **Cards can cost different amounts of time.** A quick circuit costs an eighth, a heavy amplifier chain a half. Gain stages could add time, so a bigger circuit is also a slower one. "How much can I fit before the attack?" is the core decision.
- **Waiting.** When the hand can't help, waiting advances the dial a quarter, so you can never stall.
- **Slower trackers can stack on the moon.** The Western zodiac cycles fire, earth, air and water around the wheel (Aries, Taurus, Gemini, Cancer, then again from Leo), so a zodiac dial gives a fight elemental seasons; its modalities fit too, with mutable signs suited to transmutation. Planetary hours, by which alchemists timed their work, could make a metal cheaper in its planet's hour. A boss can run its own clock for its signature moves.

## Materials and recipes

- **Processing leaves Paracelsus's three principles:** earth leaves salt, fire leaves sulfur, water and air (the volatile elements) leave mercury.
- **Recipes are earned.** In a fight, crafting costs time on the dial: tinctures and elixirs for one-off effects (like Slay the Spire's potions), and the homunculus of Paracelsian lore, a helper that processes a little instability every quarter by itself.
- **After a fight, metals are currency.** The sulfur–mercury theory of the Jabirian writings makes every metal sulfur and mercury in some proportion and purity, with gold the perfect balance of pure principles. Crude principles make lead; pure ones are needed for gold. That gives purity its late payoff: rewarding early, required later.
- **Metals keep their planets:** the Sun gold, the Moon silver, Mars iron, Venus copper, Jupiter tin, Saturn lead, Mercury quicksilver.
- **Two outputs make two archetypes:** a fast deck heavy on gain stages that purifies, and a greedy deck heavy on distilling stages that farms principles for helpers and gold. It is the money-against-score tension of Balatro.

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

- **Stages are circles.** Sigils inside a stage are its inputs. Sigils outside are its outputs, and lines to other stages are links.
- **Arcs are requirements.** One arc across a link means the stage before must run. N arcs across an output mean the stage must collect at least N.
- **Shapes name mechanics.** A crescent is time on the moon (one per quarter, a small one for an eighth). A triangle is an element, drawn as the alchemical element triangles: fire and air point up, water and earth down, air and earth are barred, and the hexagram of all four takes any. A square is purification. The principles and metals keep their alchemical signs. A ground drains instability away. Later sigils will stand for quintessence, cards in hand, Ward and so on.
- **A card** is a small time stage (its crescents), linked by one arc to a collecting stage holding its element triangles, each with the most it takes. The collector outputs a square (purification) below and its principle to the right, behind its threshold arcs. Gain stages chain below the square (a circle holding a square), distilling stages after the principle (a circle holding the principle), grounds hang down-left.
- **The drawing shows the live state.** Triangles fill with what they would take from the pool now, threshold arcs light one by one as the pool fills, outputs that would fire glow, and a card with nothing to take dims.

![The designer's sketch of Wash beside the prototype's drawing, and Wash lit by different pools](docs/circuit-schema.png)

Wash, as sketched: a moon is its input and its circle must run before the collecting stage can; that stage takes up to 5 water and purifies 1 for each, and only from 4 water or more does it also yield mercury.

## To do

- **Extend the runic schema** to sigils for quintessence, cards in hand, Ward and other resources, as stronger cards need them.
- **Make decisions meaningful.** The play loop works but offers few real choices; thresholds like Wash's (wait for the pool to fill, or wash now?) are one lever.
- **Tune the numbers:** feed rates, purification requirements, card capacities, the draw rule.
- **Decide crafting:** which recipes are in-fight, what each costs in time and material, how recipes are earned.
- **Decide the pool after an attack:** cleared by the flare, or carried over.
- **Try the zodiac and planetary trackers** once the moon works.

## Prototype

A separate page beside Mud to Clay (`circuits.html`), on one screen: the moon dial with the pool in its middle, materials and recipes always in view, the hand of circuit cards drawn with the runic schema, and every explanation in a popup. It plays a run of three commissions with single-number purification, the three principles, three recipes (a tincture for Ward, a spirit to draw 2, the homunculus), metal smelted after each fight, and a rune added to a card between fights.

- **Commissions.** Mud feeds 3 water and 1 earth a quarter, flares at every full moon, and needs 30 purification. The peat bog feeds 2 water, 2 earth and 1 fire, flares at every full moon, and needs 45. The Mire feeds 3 water, 2 earth and 1 fire, grows by an earth at each quarter moon, flares at every new and full moon, and needs 50.
- **The opening deck** is ten one-input circuits: four Wash (5 water, mercury only from 4 or more), three Calcine (5 earth), a Fan (5 air), a Kindle (5 fire) and a Sieve (3 of any element). A card holds at most 3 inputs, 2 gain stages, 2 distilling stages and 2 grounds.
- **Recipes.** Tincture of salt: 2 salt, an eighth, Ward 6. Spirit of mercury: 3 mercury, an eighth, draw 2. Homunculus: 3 mercury, 2 salt and 1 sulfur, a quarter, then it drains 2 of the most plentiful instability and purifies 2 at every quarter.
- **Metal.** Silver from 2 mercury and a salt (worth 3), lead from any two principles (worth 1). The first rune between fights is free; more cost 3 metal.

Simulated with a simple player, 300 runs, refilling to 4, 60 quintessence:

| Commission | Won | Quintessence paid (median) | Moons | Cards played |
| --- | --- | --- | --- | --- |
| Mud | 100% | 6 | 2.6 | 11 |
| Peat bog | 100% | 10 | 3.2 | 12 |
| The Mire | 90% | 29 | 2.4 | 9 |

The run is won 90% of the time with a median of 17 quintessence left. (Before Wash needed 4 water for its mercury, and while cores could be expanded, it was 80%.) The draw rule matters most: drawing 4 at each new and full moon without a cap wins every run with 38 left, and drawing 2 wins about half.
