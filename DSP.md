# DSP: transmuting a spectrum

DSP keeps the circuit cards and the moon dial from [Circuits](CIRCUITS.md). A material is a spectrum: each element is a band of three spectral lines, and a commission hands you a raw spectrum and names the chord to transmute it into. You seal the work with charge, and the closer the tuning, the less charge the seal asks. So there are two ways to win: overcharge a rough spectrum, or tune it precisely and seal it cheaply. In a hallway fight either earns the same; later challenges can ask for high charge or precise tuning.

## The fight

- **The threat.** The commission feeds instability into a pool on the moon dial. At its attack phases the pool flares for its total against your quintessence, and the flare empties it. So each flare costs only what came in since the last, at most one feed's worth, and escalation is the commission's to author (a feed that grows), not the player's backlog.
- **The spectrum.** Twelve lines, three to an element, low to high: earth the bass, water and air the mids, fire the treble. The distance is every line's gap from the chord, added up.
- **The seal.** Charge must reach the seal's base (10) plus the distance. You win the moment it does.
- **Two kinds of card, each played one of two ways.** You choose the way when you play.

| | On instability | On the spectrum |
| --- | --- | --- |
| **Attenuate** (sigils inside: it draws in) | Takes up to 3 of each of its elements from the pool; charge rises by what it took | Lowers the line in each of its bands that stands furthest over the chord, by up to 3, stopping at the chord |
| **Amplify** (sigils outside: it puts out) | Pours 3 of each of its elements into the pool; charge rises by 6 | Raises the line in each of its bands that stands furthest under the chord, by up to 3, stopping at the chord |

- **So every card makes progress either way.** Charging raises charge; tuning lowers what charge must reach. Draining is limited by what instability there is to drain. Pouring in is risky, since it all flares unless something drains it first. Tuning is safe, and limited by how far off the spectrum is.
- **Time.** Every card takes an eighth of the moon. You draw 4 at the new and full moons and discard your hand at the quarters.

## The opening deck

Twelve cards: an Attenuate and an Amplify for each pair of elements.

| Pair | Attenuate | Amplify |
| --- | --- | --- |
| Water and earth | Decant | Dissolve |
| Water and air | Evaporate | Circulate |
| Water and fire | Quench | Digest |
| Earth and air | Sift | Sublime |
| Earth and fire | Smother | Coagulate |
| Air and fire | Snuff | Cupel |

## Mud

Mud feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. You start with 40 quintessence.

| Band | Raw spectrum, low to high | Chord of mud |
| --- | --- | --- |
| Earth | 2, 3, 3 | 5, 2, 1 |
| Water | 5, 2, 2 | 3, 6, 3 |
| Air | 2, 2, 0 | 0, 0, 0 |
| Fire | 0, 1, 2 | 0, 0, 0 |

The raw spectrum is 20 from the chord, so the seal starts at 30. Its earth is too bright, its water too low in the middle, and air and fire hiss where mud has none. The air and fire Attenuates can't drain Mud's pool, which holds only water and earth, but they are the cards that clear that hiss.

## Sound

Each line is a note, a harmonic of one root (A, 55 Hz), together one A major sonority:

| Band | Element | Lines (Hz) |
| --- | --- | --- |
| Bass | Earth | 110, 165, 220 |
| Low mid | Water | 275, 330, 440 |
| High mid | Air | 550, 660, 825 |
| Treble | Fire | 1320, 1650, 1980 |

Each line sounds as loud as its share of the spectrum, so a material's chord is its own voice, and a spectrum tuned to it sounds exactly like it. Each line standing above the chord gets a detuned twin that beats against it, slow in the bass and harsh in the treble, and the whole tone shudders and hisses in proportion to the distance. A tuning glides from the old sound to the new one; "Hear mud" in the menu plays the chord itself. The spectrum panel draws the same: each line in its element's colour up to the chord, a gilt bar and note head at the chord, excess ringed in red, missing amplitude dashed.

## First numbers

`scripts/dsp-sim.ts` plays Mud 1000 times with each strategy (the lookahead 400):

| Strategy | Won | Flares, 1st to 4th | Quintessence left, when won | Cards played | Moons | At the seal: charge, distance | Plays: drain, pour in, lower, raise, wasted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Random | 82% | 8.9, 8.6, 8.6, 7.8 | 9.8 | 9.0 | 1.96 | 20.4, 8.6 | 20%, 25%, 24%, 18%, 13% |
| Charger: every card on instability | 100% | 5.6, 5.8, 5.7, 4.1 | 19.7 | 9.2 | 1.97 | 31.8, 20.0 | 73%, 23%, 0%, 0%, 5% |
| Tuner: every card on the spectrum when it tunes anything | 79% | 7.0, 7.1, 7.1, 7.9 | 8.3 | 10.5 | 2.34 | 12.4, 0.2 | 9%, 13%, 43%, 34%, 2% |
| Greedy: most progress now, the pool counted | 100% | 3.2, 3.3, 3.3, 3.2 | 27.4 | 9.2 | 1.99 | 19.4, 8.1 | 65%, 1%, 16%, 19%, 0% |
| Lookahead | 100% | 5.9, 5.2, 3.5 | 26.8 | 7.0 | 1.40 | 24.6, 13.1 | 46%, 29%, 13%, 11%, 0% |

- **Both pure styles win.** Charging every card wins every Mud without tuning at all (sealing at 32 charge, distance still 20). Tuning every card wins 79%, sealing at 12 charge against a near-perfect chord.
- **But draining is the strongest single play.** It charges and defends at once, so the charger keeps about 20 quintessence and the tuner about 8: tuning makes progress but leaves the pool to flare.
- **Mixing does best.** The greedy and lookahead players keep about 27 of 40. The lookahead pours instability in on 29% of its plays and drains it back, finishing in 1.4 moons; the greedy player drains and tunes, and takes two moons with smaller flares.

## Prototype

`dsp.html` (built to `dist/dsp.html` and `dist/dsp-artifact.html`) plays Mud on one screen: the dial with the pool, the flares and the charge toward the seal; the spectrum with the seal's charge and need; the hand; and a note that explains whatever is picked. Pick a card and both ways to play it show at once: the dial and the charge show it on instability, the spectrum and the seal show it on the spectrum; the two buttons say what each does. Tap the spectrum to hear it.

```
npm run dev                                  # then open /dsp.html
npx tsx scripts/dsp-sim.ts --games 1000      # the strategies above
```

## Earlier versions

The first DSP (in git history up to commit 4dc73e0) split cards into drainers (defense, charging a battery) and sculptors (offense, playing elements into an attack). The attack had to reach the material's size and an 80% match to its element shape, and charge smoothed it, moving a unit of the wrong element into the most-missing one.

- **Flares that keep the pool run away.** Unanswered instability was paid at every flare after it, so flares grew 4, 8, 11 for the best player, who lost 23 quintessence a Mud. Emptying the pool at each flare held them near 4 and cut the loss to 14; drainers-first went from 2% to 64% wins. That rule carries over.
- **Neither half won alone.** Sculptors-first won 7%, since without charge it couldn't smooth the noise.
- **Materials became chords.** Each element's band held three notes, and each material its own chord, at first as its voice only.
- **Note-level shape was a real choice, but a cheap one.** With sculptor timbres and matching note by note, the best-fitting sculptor depended on the chord in about a third of hands, but the wrong pick cost only about one charge of ten. That pointed toward the spectrum lines here: definite targets you push from both sides.
