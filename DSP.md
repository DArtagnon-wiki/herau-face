# DSP: offense and defense apart

DSP keeps the circuit cards and the moon dial from [Circuits](CIRCUITS.md), and splits each card's job into defense or offense. In Circuits one card drained the pool and purified at once, so offense was defense too and purifiers beat everything built for defense alone. Here a card does one or the other, and the hand makes you choose.

## The fight

- **The threat is the same.** The commission feeds instability into a pool on the moon dial. At its attack phases the pool flares for its total against your quintessence, and stays.
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

Each element is a band of sound: earth the bass (110 Hz), water a low mid (330 Hz), air a high mid (660 Hz), fire the treble (1760 Hz). All four are harmonics of one root, so a material's shape sounds as one pure tone. Each band is as loud as its share of the attack. A band holding more than the material's share gets a detuned twin that beats against it, slow in the bass and harsh in the treble. The whole tone shudders and hisses as far as the shape is from the material's. Smoothing glides from the rough sound to the smoothed one. The spectrum panel draws the same thing: each band's share of the attack against the material's outline, with noise ringed in red.

## First numbers

`scripts/dsp-sim.ts` plays Mud 1000 times with each strategy (the lookahead 400):

| Strategy | Won | Quintessence left, when won | Flares | Cards played | Moons | Charge spent smoothing | Match before the last smoothing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Random cards | 59% | 13.3 | 3.5 | 8.0 | 1.83 | 9.8 | 52% |
| Sculptors first | 11% | 18.3 | 3.5 | 7.2 | 1.65 | 7.3 | 57% |
| Drainers first | 2% | 8.3 | 5.4 | 10.8 | 2.56 | 10.8 | 54% |
| Lookahead | 100% | 16.9 | 3.0 | 7.0 | 1.62 | 9.0 | 56% |

- **Neither half wins alone.** Playing sculptors first leaves too little charge to smooth the noise. Playing drainers first leaves the attack too small while the flares add up.
- **A mixed hand wins with room to spare.** The lookahead player wins every time and keeps about 17 of 40. Its playouts run on the real draw pile, so it knows the cards to come: take it as a ceiling.
- **A won Mud takes 7 cards over about 1.6 moons and 3 flares.** It spends about 9 charge, lifting the match from the mid 50s to past 80%.

## Prototype

`dsp.html` (built to `dist/dsp.html` and `dist/dsp-artifact.html`) plays Mud on one screen: the dial with the pool and flares, the spectrum with the match, the size and the battery, the hand, and a note that explains whatever is picked. Picking a card or the battery shows the result as a ghost before you commit. Tap the spectrum to hear the attack.

```
npm run dev                                  # then open /dsp.html
npx tsx scripts/dsp-sim.ts --games 1000      # the strategies above
```
