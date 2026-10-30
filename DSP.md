# DSP: transmuting a spectrum

DSP keeps the circuit cards and the moon dial from [Circuits](CIRCUITS.md). A material is a spectrum: each element is a band of three spectral lines, and a commission hands you a raw spectrum and names the chord to transmute it into. Attacks are kernels you line up on the spectrum; drains blunt the commission's flares and bank charge; powers spend that charge to make attacks stronger.

## The fight

- **The threat.** The commission feeds instability into a pool on the moon dial. At its attack phases the pool flares for its total, which costs that much quintessence and empties the pool. So each flare costs at most one feed's worth, and escalation is the commission's to author.
- **The spectrum.** Twelve lines, three to an element, low to high: earth the bass, water and air the mids, fire the treble. The distance is every line's gap from the chord, added up. A commission names a tolerance; Mud's is 2, so the work is done once the spectrum is within 2 of the chord.
- **Time.** Every card takes an eighth of the moon. You draw 4 at the new and full moons and discard your hand at the quarters.

### Attacks are kernels

An attack is a row of taps, such as Sharpen's **−1 +3 −1**. Line it up on any of the twelve lines and each tap works on the line beneath it: +3 adds 3, −1 takes 1 away, ×⅓ cuts the line to a third. One tap is the anchor (underlined on the card); it sits on the line you pick, and taps that fall off either end do nothing. A kernel can straddle two bands. Amplitudes stay whole (fractions are dropped) and never go below zero.

So an attack is a shape as well as a size. Sharpen lifts one line and trims its neighbours; Lift raises two side by side; Damp flattens three. Where you put it matters as much as which one you play.

### Charge and powers

- **Drains** take up to 3 of each of their elements out of the pool before it flares, and bank what they take as **charge** of that element. Charge is kept per element, starts each fight at 0, and lasts the whole fight.
- **Powers** stay in play once played. Each draws on one element's charge; with none of that charge left it goes quiet, and wakes again when a drain brings more.
- **Resonance of water**, the opening power, makes every attack one step stronger for 1 water charge an attack: each add or take-away moves 1 more (+3 to +4, −1 to −2) and ×⅓ becomes ×¼.

Defense feeds offense only through powers, so a deck that drains well needs the powers to spend it, and the size of a deck's charge is bounded by what the commissions feed.

## The opening deck

Twelve cards.

| Kind | Card | What it does |
| --- | --- | --- |
| Drain | Decant | Takes up to 3 water and 3 earth |
| Drain | Evaporate | Takes up to 3 water |
| Drain | Quench | Takes up to 3 water |
| Drain | Sift | Takes up to 3 earth |
| Drain | Smother | Takes up to 3 earth |
| Attack | Sharpen (×2) | −1 **+3** −1 |
| Attack | Lift (×2) | **+2** +2 |
| Attack | Cut | **−2** −2 |
| Attack | Damp | ×⅓ **×⅓** ×⅓ |
| Power | Resonance of water | Every attack one step stronger, for 1 water charge each |

(The anchor tap is in bold.)

## Mud

Mud feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. You start with 40 quintessence.

| Band | Raw spectrum, low to high | Chord of mud |
| --- | --- | --- |
| Earth | 2, 3, 3 | 5, 2, 1 |
| Water | 5, 2, 2 | 3, 6, 3 |
| Air | 2, 2, 0 | 0, 0, 0 |
| Fire | 0, 1, 2 | 0, 0, 0 |

The raw spectrum is 20 from the chord, and Mud is made within 2 of it. Its earth is too bright, its water too low in the middle, and air and fire hiss where mud has none.

## Sound

Each line is a note, a harmonic of one root (A, 55 Hz), together one A major sonority:

| Band | Element | Lines (Hz) |
| --- | --- | --- |
| Bass | Earth | 110, 165, 220 |
| Low mid | Water | 275, 330, 440 |
| High mid | Air | 550, 660, 825 |
| Treble | Fire | 1320, 1650, 1980 |

Each line sounds as loud as its share of the spectrum, so a material's chord is its own voice, and a spectrum tuned to it sounds exactly like it. Each line standing above the chord gets a detuned twin that beats against it, slow in the bass and harsh in the treble, and the whole tone shudders and hisses in proportion to the distance. An attack glides from the old sound to the new one; "Hear mud" in the menu plays the chord itself.

## First numbers

`scripts/dsp-sim.ts` plays Mud 1000 times with each strategy (the lookahead 300):

- **Greedy** plays the power first; then the attack, at its best line, that closes most; with nothing that closes, the drain that takes most.
- **Guarded** is greedy, but drains first whenever a drain would take 3 or more.
- **Lookahead** tries the power, each drain, and each attack at its three best lines, plays each out ten times with a greedy player that plays at random a fifth of the time, and keeps the best. Its playouts see the real draw pile, so take it as a ceiling.

At Mud's tolerance of 2:

| Strategy | Won | Flares, 1st to 4th | Quintessence left, when won | Cards played | Moons | Charge left at the win | Plays: drain, attack, strengthened attack, power, wasted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Greedy | 42% | 6.3, 6.1, 5.8, 3.0 | 17.5 | 17.5 | 4.19 | 3.8 | 47%, 23%, 15%, 6%, 9% |
| Guarded | 10% | 4.1, 4.1, 4.0, 3.4 | 16.8 | 25.6 | 6.26 | 21.6 | 60%, 5%, 22%, 4%, 9% |
| Lookahead | 100% | 5.7, 5.7, 5.8, 4.7 | 16.9 | 10.0 | 2.20 | 5.9 | 24%, 60%, 10%, 6%, 1% |

How the tolerance changes it:

| Win at | Greedy | Guarded | Lookahead |
| --- | --- | --- | --- |
| A complete match | 0% | 0% | 33%, 15.2 left |
| Within 2 (Mud) | 42%, 17.5 left | 10%, 16.8 left | 100%, 16.9 left |
| Within 4 | 84%, 19.5 left | 43%, 15.2 left | 100%, 22.0 left |

- **A complete match is too hard with these kernels.** The taps are coarse (a +3 or a ×⅓), so the last few points are a puzzle the opening deck often can't solve: even the lookahead makes it only a third of the time. Within 2 it always wins, in about two moons.
- **Aim is the skill.** The greedy player takes the best single placement every time and still loses more than half, mostly 4 off: it spends the precise kernels early and is left with blunt ones. The lookahead keeps the right kernel for the last lines.
- **Draining has to be spent.** The guarded player banks over 20 charge it can't use, since one power drinks 1 water an attack. Drains blunt the flares (about 4 each instead of 6) but only the spectrum ends the fight.
- **Resonance is used, lightly.** The lookahead plays a strengthened attack on a tenth of its plays and leaves about 6 charge unspent.

## Prototype

`dsp.html` (built to `dist/dsp.html` and `dist/dsp-artifact.html`) plays Mud on one screen: the dial with the pool, the flares and how far the spectrum has closed; the spectrum with how far off it is, charge by element and the powers in play; the hand; and a note that explains whatever is picked. Pick an attack and it lines up where it would close most, its taps lit over the lines it covers and the result dashed in; tap another line to move it. Tap the spectrum to hear it.

```
npm run dev                                       # then open /dsp.html
npx tsx scripts/dsp-sim.ts --games 1000           # the strategies above
npx tsx scripts/dsp-sim.ts --tolerance 0          # ask for a complete match
```

## Earlier versions

The version before this one (commit e7d6986) had two kinds of card, each played one of two ways: Attenuate lowered the lines furthest over the chord or drained the coming flare into one battery of charge; Amplify raised the lines furthest under the chord or spent charge on Ward, which caught flares. A complete match won. Tuning every card won every Mud in about two moons with 14 left; a defender never won; Ward was the weakest play, since it took two cards to block what one drain blocked at once. The spectrum moves picked their own lines, so there was no aim.

The version before that (commit 6748389) sealed the work with charge instead of a match: charge had to reach 10 plus the distance, so tuning lowered the bar and charging raised the bar's fill. Both pure styles won Mud (charging every card 100% with about 20 quintessence left, tuning every card 79% with about 8), and mixed play kept about 27.

The first DSP (in git history up to commit 4dc73e0) split cards into drainers (defense, charging a battery) and sculptors (offense, playing elements into an attack). The attack had to reach the material's size and an 80% match to its element shape, and charge smoothed it.

- **Flares that keep the pool run away.** Unanswered instability was paid at every flare after it, so flares grew 4, 8, 11 for the best player. Emptying the pool at each flare held them near 4. That rule carries over.
- **Materials became chords.** Each element's band held three notes, and each material its own chord, at first as its voice only.
- **Note-level shape was a real choice, but a cheap one,** which pointed toward spectrum lines: definite targets you push from both sides.
