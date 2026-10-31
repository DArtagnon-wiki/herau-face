# DSP: transmuting a spectrum

DSP keeps the circuit cards and the moon dial from [Circuits](CIRCUITS.md). A material is a spectrum: each element is a band of three spectral lines, and a commission hands you a raw spectrum and names the chord to transmute it into. Attacks are kernels you line up on the spectrum, and a line that matches the chord locks; drains blunt the commission's flares and bank charge; powers spend that charge to make attacks stronger. Six commissions run from easy to virtually impossible.

## The fight

- **The threat.** The commission feeds instability into a pool on the moon dial. At its attack phases the pool flares for its total, which costs that much quintessence and empties the pool. So each flare costs at most one feed's worth, and escalation is the commission's to author.
- **The spectrum.** Each element is a band of lines, low to high: earth the bass, water and air the mids, fire the treble. Easier commissions have three lines to an element, harder ones four or five. The distance is every line's gap from the chord, added up; the work is done once the spectrum is within 2 of the chord.
- **Locks.** A line that matches the chord is locked: no tap moves it again, so progress is never lost. A kernel that overshoots a line can still come back to it, but one that lands on the chord stays there.
- **Time.** Every card takes an eighth of the moon. You draw 4 at the new and full moons and discard your hand at the quarters.

### Attacks are kernels

An attack is a row of taps, such as Sharpen's **−1 +3 −1**. Pick it, then tap any line of the spectrum to line it up there, and each tap works on the line beneath it: +3 adds 3, −1 takes 1 away, ×⅓ cuts the line to a third. One tap is the anchor (underlined on the card); it sits on the line you tap, and taps that fall off either end do nothing. A kernel can straddle two bands. Amplitudes stay whole (fractions are dropped) and never go below zero, and locked lines don't move.

So an attack is a shape as well as a size. Sharpen lifts one line and trims its neighbours; Lift raises two side by side; Damp flattens three. Where you put it matters as much as which one you play.

### Charge and powers

- **Drains** take up to 3 of each of their elements out of the pool before it flares, and bank what they take as **charge** of that element. Charge is kept per element, starts each fight at 0, and lasts the whole fight.
- **Powers** stay in play once played. Each draws on one element's charge; with none of that charge left it goes quiet, and wakes again when a drain brings more.
- **Resonance of water**, the opening power, makes every attack one step stronger for 1 water charge an attack: each add or take-away moves 1 more (+3 to +4, −1 to −2) and ×⅓ becomes ×¼.

Defense feeds offense only through powers, so a deck that drains well needs the powers to spend it, and the size of a deck's charge is bounded by what the commissions feed.

## The opening deck

Thirteen cards: a drain for each pair of elements, so every element has three drains, and six elementless attacks.

| Kind | Card | What it does |
| --- | --- | --- |
| Drain | Decant | Takes up to 3 water and 3 earth |
| Drain | Evaporate | Takes up to 3 water and 3 air |
| Drain | Quench | Takes up to 3 water and 3 fire |
| Drain | Sift | Takes up to 3 earth and 3 air |
| Drain | Smother | Takes up to 3 earth and 3 fire |
| Drain | Snuff | Takes up to 3 air and 3 fire |
| Attack | Sharpen (×2) | −1 **+3** −1 |
| Attack | Lift (×2) | **+2** +2 |
| Attack | Cut | **−2** −2 |
| Attack | Damp | ×⅓ **×⅓** ×⅓ |
| Power | Resonance of water | Every attack one step stronger, for 1 water charge each |

(The anchor tap is in bold.)

## The commissions

Six fights, easiest first. Every one is won within 2 of its chord, and you start each with 40 quintessence. They get harder three ways: farther from the chord, more lines to an element, and fiercer flares.

| | Commission | Lines an element | Off at the start | Feeds, at every new and full moon | Flares |
| --- | --- | --- | --- | --- | --- |
| 1 | **Brine** (Easy) | 3 | 13 | 4 water | 3/8 and 7/8 |
| 2 | **Mud** (Fair) | 3 | 20 | 5 water, 2 earth | 3/8 and 7/8 |
| 3 | **Fog** (Testing) | 4 | 27 | 4 water, 3 air | 3/8 and 7/8 |
| 4 | **Glass** (Hard) | 4 | 34 | 5 fire, 3 earth | 3/8 and 7/8 |
| 5 | **Quicksilver** (Brutal) | 5 | 43 | 4 water, 3 fire, 1 air | 3/8 and 7/8 |
| 6 | **The Stone** (Virtually impossible) | 5 | 53 | 1 of each | 1/8 and 5/8, an eighth after each feed |

The Stone feeds least, but it flares an eighth after every feed, before you can drain much, and its chord (1, 3, 5, 3, 1 in every band) is nothing like its raw spectrum.

| Commission | Raw spectrum, earth / water / air / fire | Chord |
| --- | --- | --- |
| Brine | 3 3 0 / 3 3 2 / 2 2 1 / 0 0 0 | 1 1 0 / 5 5 2 / 0 0 0 / 0 0 0 |
| Mud | 2 3 3 / 5 2 2 / 2 2 0 / 0 1 2 | 5 2 1 / 3 6 3 / 0 0 0 / 0 0 0 |
| Fog | 3 1 1 0 / 5 2 1 0 / 1 1 2 0 / 1 0 2 1 | 0 0 0 0 / 2 4 3 1 / 3 5 4 2 / 0 0 0 0 |
| Glass | 5 3 3 4 / 2 3 1 0 / 2 1 3 1 / 0 1 1 0 | 3 6 4 1 / 0 0 0 0 / 0 0 1 0 / 2 4 6 3 |
| Quicksilver | 2 3 1 2 1 / 4 1 2 1 3 / 3 0 1 4 1 / 3 2 0 1 0 | 0 0 0 0 0 / 1 3 6 3 1 / 0 2 3 2 0 / 0 1 2 4 2 |
| The Stone | 5 1 2 6 0 / 0 6 1 0 4 / 4 0 7 1 3 / 2 5 0 4 6 | 1 3 5 3 1 in every band |

Brine is built backwards from its chord: one Cut, one Lift and one Damp, each in the right place, make it exactly.

## Sound

Each line is a note in A major. With three lines a band, each is a harmonic of one root (A, 55 Hz):

| Band | Element | Lines (Hz) |
| --- | --- | --- |
| Bass | Earth | 110, 165, 220 |
| Low mid | Water | 275, 330, 440 |
| High mid | Air | 550, 660, 825 |
| Treble | Fire | 1320, 1650, 1980 |

With four or five lines a band, the notes spread evenly over the band's notes of the A major scale (fire with five: 1320, 1467, 1650, 1760 and 1980 Hz). Each line sounds as loud as its share of the spectrum, so a material's chord is its own voice, and a spectrum tuned to it sounds exactly like it. Each line standing above the chord gets a detuned twin that beats against it, slow in the bass and harsh in the treble, and the whole tone shudders and hisses in proportion to the distance. An attack glides from the old sound to the new one; "Hear mud" in the menu plays the chord itself.

## First numbers

`scripts/dsp-sim.ts` plays every commission 1000 times with a greedy player and 300 times with a planner:

- **Greedy** plays the power first; then the attack, at its best line, that closes most; with nothing that closes, the drain that takes most.
- **Planner** plans the rest of each hand before the next discard, trying every card at every line, and plays the first card of the best plan (closest to the chord, counting quintessence and what is left in the pool to flare). It sees only its hand, so it stands in for a careful player.

| Commission | Greedy wins | Planner wins | Planner's quintessence left | Planner's cards | Planner's moons |
| --- | --- | --- | --- | --- | --- |
| Brine (Easy) | 93% | 100% | 35.8 | 5.6 | 1.05 |
| Mud (Fair) | 80% | 100% | 22.3 | 9.5 | 2.03 |
| Fog (Testing) | 35% | 98% | 15.0 | 14.1 | 3.17 |
| Glass (Hard) | 13% | 56% | 4.0 | 15.9 | 3.72 |
| Quicksilver (Brutal) | 0% | 18% | 2.3 | 16.6 | 3.99 |
| The Stone (Virtually impossible) | 0% | 2% | 2.4 | 26.4 | 6.46 |

- **Locks made the coarse deck work.** Before locks, a planner won the first draft of Brine only 76% of the time, wasting 18% of its plays, because every coarse tap knocked matched lines back off the chord; with locks it won every time. Mud went from 91% to 100% for the planner and from 33% to 80% for the greedy player.
- **The race is cards against flares.** Each fight needs roughly a card for every 2 to 3 points of distance, and a moon gives you 8 cards against 2 flares. A point of feed per flare is worth a lot: Glass fed 7 a flare is won 95% of the time by the planner; fed 8, 56%; fed 9, 13%.
- **Planning matters more as fights get harder.** The greedy player keeps up on the easy fights and falls off from Fog on. The gap between the two is what aim and sequencing are worth.
- **Charge goes unused.** The planner almost never plays Resonance and finishes with 10 to 20 charge banked. That's the open question we set aside.

## Prototype

`dsp.html` (built to `dist/dsp.html` and `dist/dsp-artifact.html`) opens on the six commissions, each with its raw spectrum against its chord, and remembers which ones you've made in this browser and with how much left. In a fight: the dial with the pool, the flares and how far the spectrum has closed; the spectrum with how far off it is, charge by element and the powers in play; the hand; and a note that explains whatever is picked. Pick an attack, then tap a line on the spectrum to line it up: its taps light over the lines it covers and the result is dashed in before you play it. Locked lines are framed in gilt. Win and the end screen offers the next commission.

```
npm run dev                                         # then open /dsp.html
npx tsx scripts/dsp-sim.ts --games 1000 --ahead 0   # the table above
npx tsx scripts/dsp-sim.ts --fight glass --set '{"feed":{"fire":4,"earth":3}}'   # try other terms
```

## Earlier versions

The version before this one (commit ccef891) had only Mud, with a deck whose drains were all water and earth. Attacks lined up on their best line by themselves, and nothing locked. A complete match proved too hard with coarse kernels (the lookahead player won 33%), which is why every commission is won within 2.

The one before that (commit e7d6986) had two kinds of card, each played one of two ways: Attenuate lowered the lines furthest over the chord or drained the coming flare into one battery of charge; Amplify raised the lines furthest under the chord or spent charge on Ward, which caught flares. A complete match won. Tuning every card won every Mud in about two moons with 14 left; a defender never won; Ward was the weakest play, since it took two cards to block what one drain blocked at once. The spectrum moves picked their own lines, so there was no aim.

The version before that (commit 6748389) sealed the work with charge instead of a match: charge had to reach 10 plus the distance, so tuning lowered the bar and charging raised the bar's fill. Both pure styles won Mud (charging every card 100% with about 20 quintessence left, tuning every card 79% with about 8), and mixed play kept about 27.

The first DSP (in git history up to commit 4dc73e0) split cards into drainers (defense, charging a battery) and sculptors (offense, playing elements into an attack). The attack had to reach the material's size and an 80% match to its element shape, and charge smoothed it.

- **Flares that keep the pool run away.** Unanswered instability was paid at every flare after it, so flares grew 4, 8, 11 for the best player. Emptying the pool at each flare held them near 4. That rule carries over.
- **Materials became chords.** Each element's band held three notes, and each material its own chord, at first as its voice only.
- **Note-level shape was a real choice, but a cheap one,** which pointed toward spectrum lines: definite targets you push from both sides.
