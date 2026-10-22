# DSP: offense and defense apart

DSP keeps the circuit cards and the moon dial from [Circuits](CIRCUITS.md), and splits each card's job into defense or offense. In Circuits one card drained the pool and purified at once, so offense was defense too and purifiers beat everything built for defense alone. Here a card does one or the other, and the hand makes you choose.

## The fight

- **The threat.** The commission feeds instability into a pool on the moon dial. At its attack phases the pool flares for its total against your quintessence, and the flare empties it. So each flare costs only what came in since the last, at most one feed's worth, and a full-effort defense can take it to zero. Escalation is the commission's to author (a feed that grows), not the player's backlog.
- **Defense: drainers.** Their sigils sit inside the circuit. A triangle inside takes up to its number of that element out of the pool. The cell below charges one battery, 1 for each unit taken.
- **Offense: sculptors.** Their sigils sit outside the circuit. A triangle outside plays its number of that element into the attack.
- **The goal is a material.** Each commission names a target profile. You make it once the attack is at least the target's size and its shape is a close enough match. The match compares shape only: the share of the attack that overlaps the target's proportions.
- **Smoothing.** At any time, and in no time, you can spend charge to smooth the attack. Each charge moves one unit from the band furthest over the target's shape into the band most short of it, off-target noise first, as long as the move improves the match.
- **Time.** Every card takes an eighth of the moon. You draw 4 at the new and full moons and discard your hand at the quarters.

## The opening deck

Twelve cards: a drainer and a sculptor for each pair of elements. Each drainer takes up to 3 of each of its two elements, and each sculptor plays 3 of each of its two.

| Pair | Drainer | Sculptor |
| --- | --- | --- |
| Water and earth | Decant | Dissolve |
| Water and air | Evaporate | Circulate |
| Water and fire | Quench | Digest |
| Earth and air | Sift | Sublime |
| Earth and fire | Smother | Coagulate |
| Air and fire | Snuff | Cupel |

## Mud

Mud feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. Its material is 12 water to 8 earth: an attack of at least 20, at least an 80% match to that shape. You start with 40 quintessence.

Only Dissolve plays nothing but Mud's elements; the other sculptors bring air or fire, which is noise. So a mud needs both halves of the deck: sculptors for size, drainers for charge to smooth the noise away, and drainers again to keep the flares small.

## Sound

Each element is a band of three notes, all harmonics of one root (A, 55 Hz), together one A major sonority:

| Band | Element | Notes (Hz) |
| --- | --- | --- |
| Bass | Earth | 110, 165, 220 |
| Low mid | Water | 275, 330, 440 |
| High mid | Air | 550, 660, 825 |
| Treble | Fire | 1320, 1650, 1980 |

**Each material is its own chord:** how strongly it sounds each note. Mud's earth leans on its lowest note (5, 2, 1) and its water on the middle one (3, 6, 3); each element's notes add up to its share of the material. The chord is the material's voice. Play still matches elements only.

The attack is voiced through the material's chord, each band as loud as its share of the attack, so an attack that matches sounds exactly like the material. A band the material lacks sounds its three notes evenly. A band holding more than the material's share gets detuned twins that beat against its notes, slow in the bass and harsh in the treble. The whole tone shudders and hisses as far as the shape is from the material's. Smoothing glides from the rough sound to the smoothed one; "Hear mud" in the menu plays the chord itself. The spectrum panel draws the same thing: each band's share of the attack against the material's outline, the chord's notes standing inside it as note heads, and noise ringed in red.

## First numbers

`scripts/dsp-sim.ts` plays Mud 1000 times with each strategy (the lookahead 400):

| Strategy | Won | Flares, 1st to 4th | Quintessence left, when won | Flares a fight | Cards played | Moons | Charge spent smoothing | Match before the last smoothing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Random cards | 88% | 4.7, 4.7, 4.6, 4.7 | 22.7 | 4.3 | 10.0 | 2.32 | 10.5 | 51% |
| Sculptors first | 7% | 6.2, 6.3, 6.3, 6.3 | 27.1 | 6.5 | 13.1 | 3.13 | 6.4 | 60% |
| Drainers first | 64% | 3.2, 3.3, 3.2, 3.2 | 10.3 | 10.9 | 23.0 | 5.54 | 11.9 | 50% |
| Lookahead | 100% | 4.1, 4.1, 4.3, 3.7 | 25.8 | 3.5 | 7.9 | 1.85 | 9.2 | 55% |

- **The threat is flat.** Each flare is about the same size from the first to the fourth. When the pool stayed between flares, they grew with the backlog: 4.1, 7.8 and 11.4 for the lookahead, which lost 23 quintessence a Mud against 14 now.
- **Neither half wins alone, but defense is a plan now.** Sculptors first still wins only 7%, because without charge it can't smooth the noise. Drainers first wins 64%, up from 2%.
- **A mixed hand wins with room to spare.** The lookahead player wins every time and keeps about 26 of 40. Its playouts run on the real draw pile, so it knows the cards to come: take it as a ceiling.
- **A won Mud takes about 8 cards over 1.85 moons and 3.5 flares,** spending about 9 charge to lift the match from the mid 50s past 80%.
- **Charge works both ways.** Offense protects you by finishing sooner, which skips flares; defense powers offense, since drained instability becomes the charge that finishes the material.

## Does note-level shape earn its place?

`scripts/dsp-timbre.ts` plays Mud with three chords of the same material (12 water to 8 earth, voiced dark, even or bright within each band) under three rules: the match on elements (the game now); on notes with every sculptor spreading its elements evenly over a band; and on notes with sculptor timbres (Circulate and Coagulate dark, Digest and Sublime bright, Dissolve and Cupel even; dark plays each 3 units as 2, 1, 0 low to high, bright as 0, 1, 2). The lookahead plays 150 games of each. Whenever two or more sculptors are in hand, it judges which fits best, by the charge the attack would still need to reach the match, and checks whether another chord would pick a different one. (The lookahead's own moves can't answer this: 63% of them change with nothing but a reshuffle of its playouts, since most moves come out nearly tied.)

| Rule | Bar | Best-fitting sculptor depends on the chord | Extra charge the wrong one costs | Charge spent a win | Quintessence left |
| --- | --- | --- | --- | --- | --- |
| Match on elements (now) | 80% | 0% | 0 | 9.2 | 25.8 |
| Notes, spread evenly | 80% | 4 to 5% | 0 to 1.1 | 9.2 to 10.1 | 25.7 to 25.8 |
| Notes, timbres | 80% | 31 to 32% | 0.5 to 1.3 | 9.4 to 10.3 | 25.6 to 26.0 |
| Notes, spread evenly | 90% | 16 to 18% | 0.3 to 1.9 | 10.2 to 11.2 | 25.1 to 25.5 |
| Notes, timbres | 90% | 30 to 34% | 0.8 to 1.5 | 10.4 to 11.3 | 24.9 to 25.3 |

- **Timbres make a real choice.** In about a third of hands with two or more sculptors, which one fits best depends on the material's chord. Spreading evenly barely does (4 to 5%), and matching on elements never can.
- **But it is worth about one charge.** Playing another chord's best fit costs about 1 more charge, against about 10 spent smoothing a win, so outcomes hardly move: the lookahead still wins every game with about 25 left, and note-level matching costs it about one more charge a fight. A 90% bar adds a charge and a quintessence, not much more.
- **So shape stays a voice for now.** Note-level matching and timbres are in the engine behind settings (`match: 'notes'`, `Card.timbre`, `bar`), ready for when charge is scarcer, chords are sharper, or timbres differ more, any of which would raise the stakes.

## Prototype

`dsp.html` (built to `dist/dsp.html` and `dist/dsp-artifact.html`) plays Mud on one screen: the dial with the pool and flares, the spectrum with the match, the size and the battery, the hand, and a note that explains whatever is picked. Picking a card or the battery shows the result as a ghost before you commit. Tap the spectrum to hear the attack.

```
npm run dev                                  # then open /dsp.html
npx tsx scripts/dsp-sim.ts --games 1000      # the strategies above
```
