# Circumgician Deckbuilder — Design Doc

Last updated Oct 8, 2026. Started Oct 7, 2026.

## Overview

A roguelike deckbuilder in the spirit of Balatro: each term you compose a rune from drawn runic elements, and each encounter is an alchemical transmutation. Every term makes the work more unstable, and the run ends when you can no longer pay quintessence to hold it together.

**Design pillars**

- **Every hand is a composition.** Players build a structure by circumscribing, inscribing, linking and entwining, rather than matching a set.
- **Upgrades compound.** Motes and new elements stack across a run toward big, readable payoffs.
- **Hit the target, and make plenty.** Each commission asks for a specific constitution, so overshooting is a risk, but more product earns more. This is the main departure from Balatro.
- **Alchemy you can reason about.** Elemental changes follow one consistent logic, so players can predict which changes are cheap.
- **Symmetry is stability.** A rune's shape decides how well it holds the work together, and each class relates to that differently.
- **Familiarity pays.** Each source material attacks in a consistent, learnable way; targets supply the variety.

## Glossary

| Term | Meaning |
| --- | --- |
| Runic element | A card in the deck: one polygon glyph with an elemental affinity. Proposed short form "glyph", so it never collides with "elemental". |
| Rune | What the player plays in one term: an anchor plus one or more joins. |
| Anchor (leaning) | The element a rune is built from; its affinity is the source of the change. |
| Join (leaning) | How an element attaches: inscribe, circumscribe, side link or entwine. Each type does something different. |
| Rune table (leaning) | The diagram that collects every rune played in a commission; balance is measured from it. |
| Class | A deck family defined by symmetry: Regular, Isosceles or Scalene. |
| Mote | An earned token attached to a runic element to upgrade it permanently. |
| Elemental | One of the four classical elements: Earth, Water, Air, Fire. |
| Amalgam | The substance being worked, shown as one circle. Its constitution is the share and grade of each elemental. |
| Pool | One elemental at one grade within the amalgam, such as 3 kg of weak earth. An elemental can hold several pools. |
| Weight | How much of a pool the amalgam holds, in kg. |
| Grade | How hard a pool is to change: weak, medium, heavy, or inert for bosses. |
| Yield | Kg produced per kg changed, set by the from→to pair. |
| Change-inertia | Umbrella for how hard a change is (grade) and how much results (yield). |
| Condensing | Transmuting an elemental into itself, raising its grade at a cost in mass. |
| Commission | One encounter: a source material (the opponent) to transmute into a target material (the puzzle). Balatro's blind. |
| Action pool | A source's weighted set of moves; one is rolled and revealed each term. |
| Flare | A burst of instability from the commission. Ward absorbs part; the rest costs quintessence. |
| Ward | A rune's defensive output, mainly from entwines. |
| Quintessence | The run's life, spent only to stabilize. The run ends when it runs out. |
| Byproduct | A split lump tethered to the main amalgam; it vanishes when the main amalgam is done. |
| Required lump | A split lump that must reach a stable state before the commission can finish. |
| Stable state | Any named substance, such as clay or dross. A lump that reaches one is settled. |
| Term | One cycle: the commission reveals its action, the player composes and casts, then the commission acts. |
| Currency (name open) | What the workshop takes; earned from commissions in proportion to product made. |
| Reach, Force, Vector, Ward | A rune's four outputs: kg it can affect, inertia it can overcome, the from→to change, and defence. |
| Apparatus (proposed) | Passive run modifiers in limited slots, such as an athanor or alembic. Balatro's jokers. |

## Core loop

A run is a chain of commissions. Each commission repeats terms until it is done, and every term the commission acts against you.

1. The commission rolls an action from its pool and reveals it.
2. Draw up to hand size (proposed: 8 runic elements).
3. Compose a rune: an anchor plus joins, placed on the rune table. Or spend a discard to redraw.
4. Read the preview: the rune's Reach, Force, Vector and Ward against the selected pool.
5. Cast. The amalgam changes, and mote and apparatus effects trigger.
6. The commission acts. Ward absorbs part of any flare and the rest is paid in quintessence; disruptions hit the table.
7. Played elements go to the discard pile; unplayed ones stay in hand.

A commission is done when the main amalgam is in band and every required lump is stable. Rewards scale with the product made, so overkill pays and a poor commission still makes progress. Between commissions the player attaches motes, takes new runic elements and spends currency at the workshop.

![Commission loop: reveal and draw, compose, cast, the commission acts, then repeat until done](docs/diagrams/commission-loop.svg)

Running out of quintessence ends the run.

## Rune composition

Leaning: each play is a floating rune, an anchor plus one or more joins, and each join type does something different. The four joins are circumscribe, side link, entwine and inscribe; what each one drives is proposed.

| Join | Effect (proposed) | Feel |
| --- | --- | --- |
| Circumscribe | Force: pushes the change outward. The outermost element's affinity is the target. | Multiplicative, like Balatro's mult |
| Side link | Reach: how many kg the rune affects | Additive, like Balatro's chips |
| Entwine | Ward: absorbs flares and holds the table together | Defence |
| Inscribe | Inward: condensing and fine control | Precision |

**Rules (proposed)**

- Each runic element is a polygon from its class, with an affinity (Earth, Water, Air, Fire, or none) and base values.
- The anchor's affinity is the source of the change; the player selects which pool, and which lump, it works on.
- Inscribing elements of the anchor's own affinity condenses the selected pool one grade.
- Chained circumscribes route around the elemental square. An Earth anchor circumscribed by Water, then Air, takes two easy steps instead of one hard jump.
- Elements with no affinity add their value without changing the route.
- Shape sets aptitude: regular polygons entwine well, isosceles side-link well, scalene circumscribe well. Without that friction, choosing joins would be simple arithmetic.
- Side count sets how many joins an element can hold: three for a triangle, six for a hexagon.

**Example plays**

| Play | Result |
| --- | --- |
| Anchor + 4 circumscribes | All-out transmute |
| Anchor + 4 entwines | All-out stabilize |
| Anchor + 2 circumscribes + 1 entwine | Mostly progress, some Ward |
| Anchor + inscribes of its own affinity | Condense |

**Stabilizing patterns.** Entwines give Ward directly. Balance across the rune table can add to it: whole-table symmetry, and opposites linked together, Earth with Air or Water with Fire.

## Rune table (leaning)

Runes don't vanish after a term. Each one takes effect, then joins a growing diagram that records the whole commission, and ideals like balance are calculated from what is actually on it.

- **The table is the vessel circle.** It has a boundary, so running out of room becomes its own pressure.
- **Balance must be legible.** It comes from a few properties players can judge by eye, such as mirror symmetry, opposite pairs and filled quadrants, never an opaque geometric score.
- **Commissions attack the table.** Disruptions unravel links, slide runes, scorch elements or lock them in place, so defence is partly spatial. Entwined elements could resist displacement.
- **Imbalance may feed instability (open).** A string of all-out transmutes would leave the diagram lopsided and make the next flare worse, so the tension is self-made and visible.

## Classes

Three classes give distinct play paths, defined by the symmetry of their polygons. Symmetry is stability, so each class has a different relationship to instability.

| Class | Shapes | Identity (proposed) | Join aptitude and stability (proposed) |
| --- | --- | --- | --- |
| Regular | Regular polygons; many axes of symmetry | Steady: wards cheaply but progresses slowly | Entwines well; symmetric placements come easily |
| Isosceles | One axis of symmetry | Directed: precise routes and fine yields, the Vector class | Side-links well; stabilizes by pairing mirrored shapes base to base |
| Scalene | No axis of symmetry | Volatile: hits hardest; some elements grow stronger as instability rises | Circumscribes well; rarely wards, so it pushes progress and pays quintessence |

Runic elements from other classes are sometimes offered, and taking them isn't always good. The cost comes from existing rules rather than a penalty: a scalene element breaks a regular rune's symmetry, while a regular element gives a scalene deck a stable anchor. Off-class elements also dilute the draws a class depends on, such as isosceles pairs.

## Deck progression

Runic elements improve permanently through motes; the deck grows by earning new elements and, proposed, shrinks by dissolving them.

- **Motes.** Attach to a runic element for the rest of the run. Proposed kinds: elemental motes (add or change affinity), potency motes (+Force), breadth motes (+Reach), and behaviour motes (triggers such as "retrigger when inscribed"). Proposed limit: one socket per element, more through upgrades, so placement is a decision.
- **New runic elements.** Earned from commission rewards or bought in the workshop, in rarity tiers. Elements from other classes appear only sometimes.
- **Currency.** The workshop takes an ordinary currency (name open), earned from commissions in proportion to product made. Quintessence is never spent here.
- **Dissolving (proposed).** Retire a runic element and recover its motes. Thinning lets players focus a deck, and recovering motes makes it feel like a gain.
- **Formulae (proposed).** Consumables that level up a join type, like Balatro's planet cards.
- **Apparatus (proposed).** Passive modifiers in limited slots, like Balatro's jokers, named for alchemical vessels. Examples: an athanor that adds Force to changes ending in Fire; an alembic that raises Water→Air yield.

## Challenge system: transmutation

Each commission is an amalgam to bring to a target constitution. Difficulty comes from how much there is (weight) and how hard each pool is to change (grade). Mud, the first example:

| Pool | Weight | Grade |
| --- | --- | --- |
| Earth | 5 kg | Medium |
| Water | 5 kg | Weak |

Change-inertia splits in two: the from→to pair sets yield, and the source pool's grade sets resistance.

**The amalgam is one circle, not four bars.** Wedge width shows each elemental's share of mass, and heavier grades sit nearer the center, so mixed pools show as a stepped edge. The target is a ghost silhouette on the same circle, and the amalgam takes a substance's name, such as clay, when it enters that region. Every named substance is also a stable state for split lumps.

![Mud, clay and steel drawn as amalgam circles](docs/diagrams/amalgam-circles.svg)

The clay holds two earth pools: the original medium earth and the weak earth made from water, which shows as the step in its edge.

**Targets are proportions plus quantity.** Clay is about 75–85% earth by mass, any grade; steel needs heavy earth. Final quantity matters: more product earns a bigger reward.

**Resistance from the elemental square (proposed).** Classical theory gives each elemental two qualities: Earth is cold and dry, Water cold and wet, Air hot and wet, Fire hot and dry. Flipping one quality is a 1-step change and flipping both is a 2-step change, so water to air is easier than earth to air.

![The elemental square: sides are 1-step changes, diagonals are 2-step changes](docs/diagrams/elemental-square.svg)

Each side of the square keeps one quality, so crossing it is a 1-step change; the diagonals, such as Earth to Air, are the 2-step changes.

Proposed base resistance: 10 for a 1-step change and 30 for a direct 2-step jump. Routing through a middle layer costs 10 + 10 = 20, which rewards deeper runes. The source pool's grade multiplies it:

| Grade | Resistance multiplier |
| --- | --- |
| Weak | ×0.5 |
| Medium | ×1 |
| Heavy | ×2 |
| Inert (bosses) | ×4 |

**New material comes out weak**, so a correction after an overshoot is always affordable.

**Yield is leverage, not reward.** A high yield is a sledgehammer: 1 kg Earth → 20 kg Air is fast but easy to overshoot. A low yield is a scalpel: 1 kg Water → 0.2 kg Fire. Proposed principle: every elemental gets at least one coarse route and one fine route. Mass is not conserved.

**Condensing** transmutes a pool into its own elemental, one grade heavier: weak to medium, medium to heavy. It uses the same resistance rule, so each step costs more, and its yield is below 1 (proposed: 2 kg in, 1 kg out). Steel from water: water to weak earth, condense to medium, condense to heavy.

## Multi-axis resolution

A cast converts up to Reach kg of the selected pool into the ring's elemental, at full strength only when Force meets the route's resistance. Proposed rules:

```math
\begin{aligned}
F_{\text{req}} &= g \times \sum_{\text{steps}} c \\
\text{converted} &= \min(R,\ W_{\text{pool}}) \times \min\left(1,\ \frac{F}{F_{\text{req}}}\right) \\
\text{produced} &= \text{converted} \times \prod_{\text{steps}} y
\end{aligned}
```

R is the rune's Reach and F its Force. W is the selected pool's weight in kg and g its grade multiplier. Each step on the route has a base cost c (10 or 30) and a yield y.

- **The player picks the pool and the lump.** Tapping a band of the amalgam selects it, so steel can condense medium earth while weak earth is still present.
- **Condensing uses the same formula**, with the grade change as one step. Its product lands one grade heavier; every other product lands weak.
- **Proportional, not a hard gate.** A weak rune still moves something, so no cast is wasted outright.
- **Four outputs, four joins.** Circumscribes buy Force, side links buy Reach, entwines buy Ward, and inscribes condense or fine-tune. The anchor and the outermost circumscribe set the Vector.
- **Balatro feel.** Reach, Force and Ward tick up as each element and mote triggers, then the amalgam shifts.
- **Exact preview (proposed).** Because overshooting matters, the preview shows the base outcome; surprises come only from chance triggers.

## Instability and quintessence

The commission's flares are the main threat. Ward from the rune absorbs part of each flare and the rest is paid in quintessence; when quintessence runs out, the run is over.

- **Large flares, partial coverage.** Flares should be big enough that Ward rarely covers all of one, so splitting power between progress and defence is a decision nearly every term.
- **Quintessence does one job.** It is spent only to stabilize, so it never competes with upgrades.
- **Defending has a hidden cost.** A heavily warded rune moves less material, so the commission takes more terms and faces more actions.
- **Finer units (proposed).** A stock of about 100, with early flares around 5–10, gives partial coverage room to matter.
- **Overshoot costs quintessence.** A corrective term faces the commission's next action like any other.

| Situation | Target quintessence cost |
| --- | --- |
| Early commission, starting deck | A little most of the time; rarely nothing or a moderate amount; a lot only with very poor play |
| Early commission, a few upgrades | Rarely anything |
| Boss, inadequate deck | Half to three quarters of the stock |

A partial refill after each boss (proposed) keeps a weak deck's slide from feeling like a slow death sentence.

## Commissions: source and target

Each commission pairs a source material, the opponent, with a target material, the puzzle. A source behaves the same way whatever the target, which rewards familiarity; targets supply the variety.

- **A shallow weighted pool.** Each source draws three to five actions from a shared library, weighted to its personality. Players learn likelihoods, not a script.
- **Roll, then compose.** Each term's action is revealed before the player builds, so reacting is accessible without planning ahead.
- **Escalation lives in the weights (proposed).** Later terms shift weight toward bigger flares.
- **Bosses use the same template**, with heavier weights and nastier signature moves.

| Family | Examples |
| --- | --- |
| Destabilize | Flares of different sizes and timings |
| Self-transmute | Drift that follows the source's nature: mud dries, flax rots |
| Disrupt the table | Unravel a link, crystallize a rune, slide a rune, scorch an element |
| Summon | Add a little material: more work, but more potential product |
| Split | Throw off a second lump |
| Self-buff | Harden a pool, brace against the next cast, veil part of the constitution |
| Player debuff | Seed dead glyphs into the deck, lock a join type, shrink the next hand |

For example, flax might mix unravel, rot and tangle, while mud mixes seep, split and harden.

**Splits**

- **Byproducts** are tethered to the main amalgam and vanish when it is done, like minions. They act until then, and converting one adds bonus product.
- **Required lumps** stand alone and keep acting until each reaches a stable state. That can be any named substance; reaching the commission's target adds to the reward.
- **Settled lumps are banked (proposed):** set aside, no longer acting.
- **Non-target stable states are tracked, not rewarded,** in the first cut. The economy is decided once there is playtest data.
- **A tether line marks a byproduct (proposed)**, so the table shows which lumps can be ignored.

## Worked example: mud to clay

Two terms of a Water anchor circumscribed by Earth turn mud into 8.6 kg of clay. Clay here is a placeholder target: 75–85% earth by mass, any grade.

Water to Earth flips wet to dry (1 step), so required Force is 10 × 0.5 (weak water) = 5. The example assumes a Water→Earth yield of 0.6; the new earth arrives as a weak pool beside the medium one.

| Term | Rune | Reach | Force (needed) | Earth | Water | Earth share |
| --- | --- | --- | --- | --- | --- | --- |
| Start | — | — | — | 5.0 kg | 5.0 kg | 50% |
| 1 | Water anchor, Earth circumscribed | 2 kg | 6 (5) | 6.2 kg | 3.0 kg | 67% |
| 2 | Water anchor, Earth circumscribed | 1.5 kg | 6 (5) | 7.1 kg | 1.5 kg | 83% |

- **Overshoot.** Reach 2.5 in term 2 leaves 0.5 kg water and 94% earth, over the band; the fix costs another term and another commission action.
- **A tempting wrong route.** Evaporating water into air is just as cheap, but the air stays in the amalgam, so earth never reaches its share.
- **Stability.** Suppose mud rolls a flare of 8 in term 2. Spending one element on an entwine for Ward 5 leaves 3 to pay, out of a stock of about 100.

## Run structure

A run climbs material tiers, each ending in a stubborn boss substance, toward the Great Work: lead into gold. All of this is proposed.

| Tier | Example commissions | New pressure |
| --- | --- | --- |
| 1. Earthen | Mud to clay; sand to glass | Two elementals; weak and medium grades |
| 2. Mineral | Brine to salt; ore to metal | Three elementals; heavy grades |
| 3. Noble | Tin to silver | Four elementals; narrow bands |
| 4. Great Work | Lead to gold | Inert grades throughout |

Boss sources use the same action template as everything else, with heavier weights and nastier signature moves, such as:

- **Volatile:** produced Air escapes the vessel.
- **Stubborn:** grades rise one step after each term.
- **Unstable:** the amalgam drifts between terms.
- **Sealed:** inscribing is disabled.
- **Lead weighs down:** it amplifies whichever side of the table is already heavier.

## Theme and assets from Circumgician

Circumgician is built on Pixi.js, TypeScript and Vite, and most of its look is generated in code rather than drawn as image files, so what carries over is code and tuning. Its runes are already nested polygons, which is inscribing in all but name.

| Asset | In Circumgician | Use here |
| --- | --- | --- |
| Polygon runes | Rune and obstacle layers are regular polygons with a side count (`drawPolygon.ts`) | Runic elements; isosceles and scalene shapes need adding |
| Motes | Smoky wisps that condense into glowing liquid when caught (`MoteView.ts`, `SmokeSystem.ts`) | Motes, quintessence and flares |
| Glass and liquid | Glassy bowls, liquid-filled glass tubes, frosted nested layers | The vessel and amalgam pools |
| Link threads | Shimmering threads with drifting glyph beads (`LinkThreads.ts`) | Side links and entwines |
| Obsidian | Faceted obsidian obstacles and slabs (`obsidian.ts`) | Source materials and bosses |
| Palettes | Four jewel-tone palettes of five hues, tested for colour-blind distance (`Theme.ts`) | Elemental colours, and the same testing approach |
| Backdrop | Violet nebula, slow stars, arcane circles, an etched field ring | The rune table |
| Type and UI | Cinzel and Cormorant Garamond (both OFL); frosted-glass panels with gilt borders | Reuse as is |
| Audio | A generative D-minor pad and bell bed, plus code-synthesized effects; no audio files | Reuse the bed; add transmutation sounds |
| Framing | Levels follow the tarot: 22 major arcana and four suits of 14 | A possible run or map structure |

## Open questions

| Question | Current proposal |
| --- | --- |
| Floating runes, the rune table, or both? | Both: each term's floating rune takes effect, then stays on the table |
| Should table imbalance itself cause instability? | Yes, on top of the flares a commission rolls |
| How is table balance measured? | A few properties readable by eye: mirror symmetry, opposite pairs, filled quadrants |
| How big are the quintessence stock and flares? | Tune against the difficulty targets; start near 100 and 5–10 |
| How is quintessence restored? | A partial refill after each boss; small refills from efficient commissions |
| How does product convert to reward? | Currency in proportion to product made |
| Are non-target stable states worth anything? | Tracked, not rewarded, in the first cut; decide from playtest data |
| Can a player end a commission early with partial product? | Yes, at reduced reward, so a poor encounter still makes progress |
| What is condensing's yield? | 2 kg in, 1 kg out per grade |
| Is routing through chained circumscribes too strong? | Tune step costs once the first commissions are playable |
| Names: working title, the currency, "glyph" or "runic element"? | Open |
