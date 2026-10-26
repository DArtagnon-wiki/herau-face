# DSP: transmuting a spectrum

DSP keeps the circuit cards and the moon dial from [Circuits](CIRCUITS.md). A material is a spectrum: each element is a band of three spectral lines, and a commission hands you a raw spectrum and names the chord to transmute it into. The work is done when the spectrum matches the chord exactly. Meanwhile the commission's flares come either way, and charge and Ward are how you meet them.

## The fight

- **The threat.** The commission feeds instability into a pool on the moon dial. At its attack phases the pool flares for its total; Ward catches what it can, the rest costs quintessence, and the flare empties the pool. So each flare costs at most one feed's worth, and escalation is the commission's to author.
- **The spectrum.** Twelve lines, three to an element, low to high: earth the bass, water and air the mids, fire the treble. The distance is every line's gap from the chord, added up. You win at zero, a complete match.
- **Two kinds of card, each played one of two ways,** chosen when you play.

| | Defense | The spectrum |
| --- | --- | --- |
| **Attenuate** (sigils inside: it draws in) | **Drain**: takes up to 3 of each of its elements from the pool, before it flares; charge rises by what it took | **Lower**: brings down the line in each of its bands that stands furthest over the chord, by up to 3, stopping at the chord |
| **Amplify** (sigils outside: it puts out) | **Ward**: spends up to 3 charge for each of its elements and raises that much Ward, which catches flares and stays until used | **Raise**: brings up the line in each of its bands that stands furthest under the chord, by up to 3, stopping at the chord |

- **The spectrum is offense; charge and Ward are defense.** A drain blunts the flare that is coming and banks charge; a Ward turns banked charge into protection for a later flare. Only the spectrum ends the fight.
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

The raw spectrum is 20 from the chord. Its earth is too bright, its water too low in the middle, and air and fire hiss where mud has none. The air and fire Attenuates can't drain Mud's pool, which holds only water and earth, but they are the cards that clear that hiss.

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

| Strategy | Won | Flares, 1st to 4th | Quintessence left, when won | Cards played | Moons | Left over at the win: charge, Ward | Plays: drain, Ward, lower, raise, wasted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Random | 10% | 5.9, 5.9, 5.8, 5.8 | 6.0 | 17.2 | 4.15 | 3.3, 0.3 | 20%, 12%, 21%, 15%, 32% |
| Tuner: the spectrum whenever it moves a line | 100% | 7.0, 7.0, 7.0, 5.9 | 14.2 | 9.1 | 1.98 | 0.8, 0.0 | 4%, 1%, 50%, 41%, 5% |
| Defender: drain or Ward whenever it does anything | 0% | 3.8, 3.9, 3.8, 3.9 | – | 106.5 | 26.5 | – | 53%, 42%, 1%, 2%, 2% |
| Greedy: distance closed, plus instability drained and Ward the next flare needs | 92% | 5.4, 4.9, 4.5, 3.7 | 25.0 | 58.2 | 14.2 | 12.0, 5.1 | 58%, 26%, 7%, 6%, 3% |
| Lookahead | 100% | 5.1, 5.2, 5.4, 5.4 | 16.9 | 11.3 | 2.54 | 4.4, 0.1 | 21%, 7%, 37%, 29%, 7% |

- **Tuning carries the fight.** Tuning every card wins every Mud in about two moons with 14 quintessence left. Only the match ends the fight, so a defender never wins: it holds the flares near 4 for 26 moons and runs out.
- **Defense adds a little.** The lookahead player tunes on two thirds of its plays and drains or Wards on the rest, keeping about 17. The greedy player overvalues draining: it wins most fights with plenty left, but takes 14 moons over it.
- **Ward is the weakest way.** It takes two cards (a drain to charge, then the Ward) to block what one drain blocks at once, so even the lookahead raises Ward on only 7% of its plays and leaves about 4 charge unspent.

## Prototype

`dsp.html` (built to `dist/dsp.html` and `dist/dsp-artifact.html`) plays Mud on one screen: the dial with the pool, the flares, Ward and how far the spectrum has closed; the spectrum with how far off it is, charge and Ward; the hand; and a note that explains whatever is picked. Pick a card and both ways to play it show at once: its drain or Ward on the dial and the readout, its spectrum move on the spectrum; the two buttons say what each does. Tap the spectrum to hear it.

```
npm run dev                                  # then open /dsp.html
npx tsx scripts/dsp-sim.ts --games 1000      # the strategies above
```

## Earlier versions

The version before this one (commit 6748389) sealed the work with charge instead of a match: charge had to reach 10 plus the distance, so tuning lowered the bar and charging raised the bar's fill, and an Amplify could pour instability into the pool for charge. Both pure styles won Mud (charging every card 100% with about 20 quintessence left, tuning every card 79% with about 8), and mixed play kept about 27.

The first DSP (in git history up to commit 4dc73e0) split cards into drainers (defense, charging a battery) and sculptors (offense, playing elements into an attack). The attack had to reach the material's size and an 80% match to its element shape, and charge smoothed it, moving a unit of the wrong element into the most-missing one.

- **Flares that keep the pool run away.** Unanswered instability was paid at every flare after it, so flares grew 4, 8, 11 for the best player, who lost 23 quintessence a Mud. Emptying the pool at each flare held them near 4 and cut the loss to 14; drainers-first went from 2% to 64% wins. That rule carries over.
- **Neither half won alone.** Sculptors-first won 7%, since without charge it couldn't smooth the noise.
- **Materials became chords.** Each element's band held three notes, and each material its own chord, at first as its voice only.
- **Note-level shape was a real choice, but a cheap one.** With sculptor timbres and matching note by note, the best-fitting sculptor depended on the chord in about a third of hands, but the wrong pick cost only about one charge of ten. That pointed toward the spectrum lines here: definite targets you push from both sides.
