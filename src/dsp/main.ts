// DSP: one screen, as in Circuits. The dial carries the threat (the pool, the
// flares, the moon) and how far the spectrum has closed on the chord; the
// spectrum panel carries the material (its lines against the chord) with
// charge and powers beside it; the hand docks below. Pick an attack and it is
// lined up where it would do most, its taps lit over the lines it covers; tap
// another line to line it up there. A note always explains what is picked.

import '../ui/style.css'
import '../circuits/circuits.css'
import './dsp.css'
import { sound } from '../ui/sound'
import { icon, element, ELEMENT_COLOR, moon, quintessence, card as cardSig } from '../circuits/sigils'
import { battery, cardSvg, kernelStrip } from './card'
import { dialSvg, waitIcon, type DialPreview } from './dial'
import { spectrumSvg, type Aim } from './spectrum'
import { spectrumVoice } from './audio'
import {
  BANDS,
  DEFAULT_SETTINGS,
  ELEMENTS,
  MUD,
  PHASE_NAMES,
  TICKS,
  bestLine,
  distance,
  distanceOf,
  footprint,
  lineName,
  livePowers,
  newGame,
  playCard,
  poolTotal,
  resolve,
  startingDeck,
  tapWords,
  threatOf,
  upcoming,
  wait,
  type AttackCard,
  type Card,
  type Game,
  type Pool,
  type Settings,
} from './engine'

const ui = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  game: null as Game | null,
  /** The card picked to play. */
  pick: null as number | null,
  /** For a picked attack: the line it is lined up on (its best line until you tap another). */
  aim: null as number | null,
  focus: null as 'dial' | 'spectrum' | null,
  popup: null as 'menu' | 'legend' | null,
  flash: '',
  fx: null as { paid: number; flared: boolean } | null,
}

const root = document.getElementById('app')!
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const EIGHTHS_WORDS = ['', 'an eighth', 'a quarter', 'three eighths', 'a half', 'five eighths', 'three quarters', 'seven eighths', 'a whole moon']
const ticks = (n: number) => (n % 2 === 0 && n <= 16 ? EIGHTHS_WORDS[n / 2] : `${n} sixteenths`)
const amounts = (p: Partial<Pool>) =>
  BANDS.filter((e) => p[e])
    .sort((x, y) => (p[y] ?? 0) - (p[x] ?? 0))
    .map((e) => `${p[e]} ${e}`)
    .join(' and ')
const KIND_NAME: Record<Card['kind'], string> = { drain: 'Drain', attack: 'Attack', power: 'Power' }

function start() {
  ui.game = newGame(Date.now(), ui.settings)
  ui.pick = null
  ui.aim = null
  ui.focus = null
  ui.popup = null
  ui.flash = ''
}

const picked = (g: Game) => (ui.pick !== null ? (g.fight.hand.find((x) => x.id === ui.pick) ?? null) : null)
/** Where a picked attack is lined up: where you tapped, else where it would do most. */
const aimOf = (g: Game, c: AttackCard) => ui.aim ?? bestLine(g.fight, c).line
const tryPlay = (g: Game, c: Card, line?: number) => {
  try {
    return playCard(g, c.id, line)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Words, for the note

function situationNote(g: Game): [string, string] {
  const f = g.fight
  const up = upcoming(f, 8)
  const atk = up.find((x) => x.attack)
  const dis = up.find((x) => x.discard)
  const drw = up.find((x) => x.draw)
  const title = atk ? `${PHASE_NAMES[atk.phase]} in ${ticks(atk.pos - f.dial)}` : 'The moon'
  const charged = ELEMENTS.filter((e) => f.charge[e])
  const lines = [
    atk ? `${esc(f.commission.name)} flares there for whatever is in the pool (${threatOf(f)} now, the red badge), and that empties it.` : '',
    dis && (!atk || dis.pos < atk.pos) ? `You discard your hand at the ${PHASE_NAMES[dis.phase].toLowerCase()}, before it.` : '',
    drw ? `You draw ${g.settings.hand} at the ${PHASE_NAMES[drw.phase].toLowerCase()}.` : '',
    `To make ${esc(f.commission.name.toLowerCase())}, bring the spectrum within ${f.commission.tolerance} of its chord: it is ${distance(f)} off now.`,
    charged.length ? `Charge: ${charged.map((e) => `${f.charge[e]} ${e}`).join(', ')}.` : '',
    f.powers.length ? `In play: ${f.powers.map((p) => `${p.name} (${f.charge[p.element] ? 'working' : `quiet, no ${p.element} charge`})`).join(', ')}.` : '',
    'Pick a card to see what it would do.',
  ]
  return [title, lines.filter(Boolean).join(' ')]
}

function dialNote(g: Game): [string, string] {
  const f = g.fight
  const items = upcoming(f, 4).map((x) => {
    const what = [x.attack ? 'flare' : '', x.feed ? `it feeds ${amounts(f.commission.feed)}` : '', x.discard ? 'you discard' : '', x.draw ? `you draw ${g.settings.hand}` : ''].filter(Boolean)
    return `<b>${PHASE_NAMES[x.phase]}</b> (${ticks(x.pos - f.dial)}): ${what.length ? what.join(', ') : 'nothing'}`
  })
  const start = distanceOf(f.commission.start, f.commission.chord)
  return ['The moon', `${items.join('. ')}. The inner ring is how far the spectrum has closed on the chord: ${start - distance(f)} of ${start}.`]
}

function spectrumNote(g: Game): [string, string] {
  const f = g.fight
  return [
    'The spectrum',
    `Twelve lines, three to an element, low to high: earth the bass, water and air the mids, fire the treble. Each line is as tall as its amplitude; the gilt bars with note heads are the chord of ${esc(f.commission.name.toLowerCase())}. What stands above the chord is ringed in red; what is missing below it is dashed. Every line’s gap added up is the distance, ${distance(f)} now; the work is done at ${f.commission.tolerance} or under. Tap the spectrum to hear it; the closer to the chord, the purer it sounds. The menu plays the chord itself.`,
  ]
}

function cardNote(g: Game, c: Card): [string, string] {
  const f = g.fight
  const d0 = distance(f)
  if (c.kind === 'drain') {
    const r = resolve(f, c)
    const left = threatOf(f) - poolTotal(r.took)
    return [
      `${c.name}, a drain`,
      `Takes up to 3 each of ${c.elements.join(' and ')} from the pool before it flares, and banks what it takes as charge. <span class="now">Now: ${poolTotal(r.took) ? `takes ${amounts(r.took)}; the flare would be ${left}, not ${threatOf(f)}.` : `no ${c.elements.join(' or ')} in the pool, so nothing.`}</span>`,
    ]
  }
  if (c.kind === 'power') {
    const has = f.charge[c.element]
    return [
      `${c.name}, a power`,
      `Stays in play. While there is ${c.element} charge, every attack is one step stronger (+3 to +4, −1 to −2, ×⅓ to ×¼), for 1 ${c.element} charge each; with none it goes quiet. <span class="now">Now: ${has ? `${has} ${c.element} charge, enough for ${has} ${has === 1 ? 'attack' : 'attacks'}.` : `no ${c.element} charge yet: drain ${c.element} to wake it.`}</span>`,
    ]
  }
  const line = aimOf(g, c)
  const r = resolve(f, c, line)
  const d1 = distanceOf(r.spectrum, f.commission.chord)
  const best = bestLine(f, c)
  return [
    `${c.name}, an attack`,
    `Taps ${r.kernel.map(tapWords).join(' ')}, each on the line beneath it${r.boosted.length ? ` (${r.boosted.map((p) => p.name).join(' and ')} strengthens it, for 1 ${r.boosted.map((p) => p.element).join(' and ')} charge)` : ''}. <span class="now">On ${lineName(line)}: ${r.moves.length ? (d1 <= f.commission.tolerance ? 'that makes the material.' : `${d1} off, from ${d0}.`) : 'nothing would move.'}${line !== best.line && best.closed > d0 - d1 ? ` On ${lineName(best.line)} it would close ${best.closed}.` : ''} Tap a line to move it.</span>`,
  ]
}

function noteView(title: string, body: string): string {
  return `<section class="note" aria-live="polite"><p><b class="note-title">${esc(title)}</b> ${body}</p></section>`
}

function fightNote(g: Game): string {
  if (ui.focus === 'dial') return noteView(...dialNote(g))
  if (ui.focus === 'spectrum') return noteView(...spectrumNote(g))
  const c = picked(g)
  if (c) return noteView(...cardNote(g, c))
  return noteView(...situationNote(g))
}

function legendText(): string {
  const I = (m: string) => icon(m, 26)
  const row = (svg: string, text: string) => `<li>${svg}<span>${text}</span></li>`
  const sharpen = startingDeck().find((c) => c.kind === 'attack') as AttackCard
  return `<ul class="legend">
    ${row(I(`<circle r="9" fill="none" stroke="var(--line)" stroke-width="1.3"/>${element('water', -2, -3, 4.5, { stroke: ELEMENT_COLOR.water })}${element('earth', -2, 5, 4.5, { stroke: ELEMENT_COLOR.earth })}`), '<b>A drain</b> has its triangles inside: it takes up to 3 of each element out of the pool before it flares, and banks what it takes as charge of that element.')}
    ${row(I(kernelStrip(sharpen.kernel, sharpen.anchor, 0, 0, 7)), '<b>An attack</b> is a kernel, a row of taps: +3 adds 3 to the line beneath it, −1 takes 1 away, ×⅓ cuts it to a third. Line it up on the spectrum; the underlined tap sits on the line you pick.')}
    ${row(I(battery(0, 0, 8, { stroke: 'var(--lit)' })), 'Charge, by element: drains bank it, powers draw on it. It keeps through the fight.')}
    ${row(I(`<circle r="8" fill="none" stroke="var(--line)" stroke-width="1.3"/>${element('water', 0, 0, 5, { stroke: ELEMENT_COLOR.water })}`), '<b>A power</b> stays in play once played and draws on its element’s charge; with none left it goes quiet. Resonance makes every attack one step stronger, for 1 charge an attack.')}
    ${row(I(`<rect x="-9" y="-3" width="4" height="10" fill="var(--earth)" opacity="0.6"/><rect x="-3" y="-8" width="4" height="15" fill="var(--water)" opacity="0.6"/><path d="M-4 -8H2" stroke="var(--gilt-bright)" stroke-width="1.6"/><rect x="3" y="0" width="4" height="7" fill="var(--warn)" opacity="0.5" stroke="var(--warn)"/>`), 'The spectrum: twelve lines, three to an element, earth the bass to fire the treble. The gilt bars are the chord. The distance is every line’s gap from it, added up; bring it within the commission’s tolerance to make the material.')}
    ${row(I(moon(0, 0, 8, { stroke: 'var(--moon)' })), 'A crescent is time: every card takes an eighth of the moon.')}
    ${row(I(quintessence(0, 0, 8, { stroke: 'var(--fire)', fill: 'var(--fire)' })), 'A red star on the dial is a flare: whatever is in the pool costs you that much quintessence, and the pool empties.')}
    ${row(I(cardSig(0, 0, 7, { stroke: 'var(--ink-soft)' })), 'You draw at the new and full moons, and discard your hand at the quarters.')}
  </ul>`
}

// ---------------------------------------------------------------------------
// Views

function header(g: Game | null, title: string): string {
  return `<header class="cx-head">
    <button class="menu" data-act="menu" aria-label="Menu">${icon(`<path d="M-7 -5H7M-7 0H7M-7 5H7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`, 20)}</button>
    <div class="who"><span class="eyebrow">DSP</span><h1>${esc(title)}</h1></div>
    ${g ? `<div class="quint ${ui.fx?.paid ? 'drained' : ''}" aria-label="Quintessence ${g.quintessence}">${icon(quintessence(0, 0, 9, { stroke: 'var(--glass)', fill: 'color-mix(in srgb, var(--glass) 25%, transparent)' }), 22)}<b class="num">${g.quintessence}</b>${ui.fx?.paid ? `<span class="loss num">−${ui.fx.paid}</span>` : ''}</div>` : '<span></span>'}
  </header>`
}

/** Beside the spectrum: how far off it is, charge by element, and the powers in play. */
function readout(g: Game, c: Card | null): string {
  const f = g.fight
  const d0 = distance(f)
  const start = distanceOf(f.commission.start, f.commission.chord)
  const r = c ? resolve(f, c, c.kind === 'attack' ? aimOf(g, c) : 0) : null
  const d1 = r ? distanceOf(r.spectrum, f.commission.chord) : null
  const at = (v: number) => `${Math.round((100 * Math.max(0, start - v)) / Math.max(1, start))}%`
  const chips = BANDS.map((e) => {
    const after = r ? f.charge[e] + r.charge[e] : f.charge[e]
    return `<span class="chg ${f.charge[e] || after ? '' : 'none'}" aria-label="${e} charge ${f.charge[e]}">${icon(element(e, 0, 0, 8, { stroke: ELEMENT_COLOR[e], width: 1.5 }), 15)}<b class="num">${f.charge[e]}</b>${after !== f.charge[e] ? `<span class="to num">→${after}</span>` : ''}</span>`
  }).join('')
  const live = livePowers(f)
  const powers = f.powers.map((p) => `<span class="pow ${live.includes(p) ? 'on' : 'quiet'}">${esc(p.name)}${live.includes(p) ? '' : ' · quiet'}</span>`).join('')
  return `<div class="seal">
      <p class="row"><span class="lbl">Off by</span><b class="num ${d0 <= f.commission.tolerance ? 'ok' : ''}">${d0}</b>${d1 !== null && d1 !== d0 ? `<span class="to num">→ ${d1}</span>` : ''}<span class="of">done at ${f.commission.tolerance}</span></p>
      <span class="meter" aria-hidden="true">
        <span class="fill" style="width:${at(d0)}"></span>
        ${d1 !== null && d1 < d0 ? `<span class="ghost" style="left:${at(d0)};width:calc(${at(d1)} - ${at(d0)})"></span>` : ''}
        <span class="notch" style="left:${at(f.commission.tolerance)}"></span>
      </span>
      <p class="row chips">${icon(battery(0, 0, 8, { stroke: 'var(--lit)', width: 1.4 }), 16)}${chips}</p>
      ${powers ? `<p class="row pows">${powers}</p>` : ''}
    </div>`
}

function spectrumPanel(g: Game, c: Card | null): string {
  const f = g.fight
  let aim: Aim | null = null
  let ghost = null
  if (c?.kind === 'attack') {
    const line = aimOf(g, c)
    const r = resolve(f, c, line)
    aim = { lines: footprint(c, line), taps: r.kernel }
    ghost = r.spectrum
  }
  return `<section class="bench spec" aria-label="The material">
    <button class="spec-art ${ui.focus === 'spectrum' ? 'is-on' : ''} ${aim ? 'aiming' : ''}" data-act="spectrum" aria-label="${aim ? 'The spectrum: tap a line to line the attack up there' : 'The spectrum: tap to hear it'}">${spectrumSvg(f.spectrum, f.commission.chord, ghost, aim)}</button>
    ${readout(g, c)}
  </section>`
}

function hand(g: Game): string {
  const f = g.fight
  if (!f.hand.length) return `<section class="hand-row empty"><p>No cards in hand until the next new or full moon.</p></section>`
  return `<section class="hand-row" aria-label="Hand">${f.hand
    .map((c) => {
      const on = ui.pick === c.id
      const took = c.kind === 'drain' ? resolve(f, c).took : null
      const charged = c.kind === 'power' ? f.charge[c.element] > 0 : undefined
      return `<button class="ccard ${c.kind} ${on ? 'is-on' : ''}" data-act="pick-card" data-id="${c.id}" aria-pressed="${on}" aria-label="${esc(c.name)}, ${KIND_NAME[c.kind]}">${cardSvg(c, { took, charged, size: 120 })}<span class="cname">${esc(c.name)}</span></button>`
    })
    .join('')}</section>`
}

function previewOf(g: Game, c: Card | null): DialPreview | null {
  if (!c) return null
  const f = g.fight
  const line = c.kind === 'attack' ? aimOf(g, c) : 0
  const r = resolve(f, c, line)
  const delta = { water: 0, earth: 0, air: 0, fire: 0 }
  for (const e of ELEMENTS) delta[e] = -r.took[e]
  const after = tryPlay(g, c, line)
  return { dial: after && after.stage === 'fight' ? after.fight.dial : f.dial, distance: distanceOf(r.spectrum, f.commission.chord), delta }
}

function actions(g: Game): string {
  const c = picked(g)
  const f = g.fight
  let label = 'Pick a card'
  let ready = false
  if (c) {
    const line = c.kind === 'attack' ? aimOf(g, c) : undefined
    const r = resolve(f, c, line)
    const after = tryPlay(g, c, line)
    const flares = after && after.stage !== 'won' ? after.fight.flares.length - f.flares.length : 0
    const cost = after && after.stage !== 'won' ? g.quintessence - after.quintessence : 0
    const tail = after?.stage === 'won' ? ' · makes it' : flares ? ` · <span class="warn-on-gold">flare −${cost}</span>` : ''
    const closed = distance(f) - distanceOf(r.spectrum, f.commission.chord)
    label =
      c.kind === 'drain'
        ? `Drain${poolTotal(r.took) ? ` · ${amounts(r.took)}` : ' · nothing'}`
        : c.kind === 'power'
          ? 'Play power'
          : `On ${lineName(line!)} · ${closed > 0 ? `off −${closed}` : closed < 0 ? `off +${-closed}` : 'no change'}`
    label += tail
    ready = true
  }
  return `<div class="cx-actions">
    <button class="wait" data-act="wait" aria-label="Wait an eighth of the moon">${waitIcon()}<span>Wait</span></button>
    <button class="primary go" data-act="go" ${ready ? '' : 'disabled'}>${label}</button>
  </div>`
}

function popupView(g: Game | null): string {
  if (!ui.popup) return ''
  let title = ''
  let body = ''
  if (ui.popup === 'legend') {
    title = 'Reading a circuit'
    body = legendText()
  } else {
    title = 'DSP'
    const s = ui.settings
    const opt = (v: number, cur: number) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v}</option>`
    body = `<div class="pop-actions"><button data-act="legend">Reading a circuit</button><button data-act="material">Hear ${esc(MUD.name.toLowerCase())}</button><button data-act="sound">Sound ${sound.enabled ? 'on' : 'off'}</button><button data-act="restart">Start again</button></div>
      ${g ? `<p class="label">What happened</p><ol class="pop-list log">${g.fight.log.slice(0, 12).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}
      <p class="label">Tuning, on restart</p>
      <div class="tune"><label>Drawn at new and full moons <select id="d-hand">${[3, 4, 5].map((v) => opt(v, s.hand)).join('')}</select></label>
      <label>Quintessence <select id="d-stock">${[30, 40, 50, 60].map((v) => opt(v, s.stock)).join('')}</select></label></div>`
  }
  return `<div class="pop-veil" data-act="close"></div>
  <section class="pop" role="dialog" aria-label="${esc(title)}">
    <div class="pop-head"><h2>${esc(title)}</h2><button class="close" data-act="close" aria-label="Close">×</button></div>
    <div class="pop-body">${body}</div>
  </section>`
}

function fightView(g: Game): string {
  const c = picked(g)
  return `<div class="cx fight dsp">
    ${header(g, g.fight.commission.name)}
    <button class="dial-box ${ui.focus === 'dial' ? 'is-on' : ''}" data-act="dial" aria-label="The moon: what comes next">${dialSvg(g.fight, previewOf(g, c), !!ui.fx?.flared)}</button>
    ${fightNote(g)}
    ${spectrumPanel(g, c)}
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    ${hand(g)}
    ${actions(g)}
  </div>${popupView(g)}`
}

function endView(g: Game): string {
  const won = g.stage === 'won'
  const f = g.fight
  return `<div class="cx end dsp">
    ${header(g, won ? `${f.commission.name}, made` : 'Spent')}
    <section class="end-art">
      <button class="spec-art big" data-act="spectrum" aria-label="Hear the spectrum">${spectrumSvg(f.spectrum, f.commission.chord)}</button>
      <p>${won ? `The spectrum is ${distance(f) ? `${distance(f)} off the chord, within its ${f.commission.tolerance}` : 'a perfect match for the chord'}, in ${f.dial > TICKS ? `${(f.dial / TICKS).toFixed(2)} moons` : ticks(f.dial)}. The flares took ${f.paid}; ${g.quintessence} quintessence left.` : `${esc(f.commission.name)} wore you down with the spectrum ${distance(f)} off the chord.`} Tap the spectrum to hear it.</p>
    </section>
    <div class="cx-actions one"><button class="primary go" data-act="restart">Again</button></div>
  </div>${popupView(g)}`
}

function startView(): string {
  const deck = startingDeck()
  return `<div class="cx start dsp">
    <div class="start-art">${cardSvg(deck[0], { size: 140 })}${cardSvg(deck[5], { size: 140 })}${cardSvg(deck[11], { size: 140 })}</div>
    <div class="start-words">
      <p class="eyebrow">A prototype</p>
      <h1>DSP</h1>
      <p class="lede">Transmute a raw spectrum into a material’s chord. Attacks are kernels: line them up so every tap lands where it helps. Drains take the instability before it flares and bank it as charge, and powers draw on that charge to make your attacks stronger.</p>
    </div>
    <div class="cx-actions">
      <button data-act="legend">Reading a circuit</button>
      <button class="primary go" data-act="restart">Begin: ${esc(MUD.name)}</button>
    </div>
  </div>${popupView(null)}`
}

function render() {
  const g = ui.game
  root.innerHTML = !g ? startView() : g.stage === 'fight' ? fightView(g) : endView(g)
  ui.fx = null
}

// ---------------------------------------------------------------------------
// Events

function readTuning() {
  const hand = (document.getElementById('d-hand') as HTMLSelectElement | null)?.value
  if (hand) ui.settings.hand = Number(hand)
  const stock = (document.getElementById('d-stock') as HTMLSelectElement | null)?.value
  if (stock) ui.settings.stock = Number(stock)
}

function apply(next: Game, played: Card | null) {
  const before = ui.game!
  ui.game = next
  ui.pick = null
  ui.aim = null
  ui.focus = null
  const paid = before.quintessence - next.quintessence
  const newFlares = next.fight.flares.slice(before.fight.flares.length)
  if (newFlares.length) sound.turn(newFlares, 0, paid)
  ui.fx = { paid, flared: newFlares.length > 0 }
  if (played?.kind === 'attack') spectrumVoice.tune(before.fight.spectrum, next.fight.spectrum, next.fight.commission.chord)
  const drawn = next.fight.hand.filter((c) => !before.fight.hand.some((h) => h.id === c.id)).length
  if (drawn) setTimeout(() => sound.deal(drawn), 350)
  if (next.stage === 'won') setTimeout(() => sound.win(), played?.kind === 'attack' ? 2200 : 600)
  if (next.stage === 'lost') sound.lose()
}

root.addEventListener('click', (ev) => {
  const el = (ev.target as Element).closest<HTMLElement | SVGElement>('[data-act]')
  if (!el || (el as HTMLButtonElement).disabled) return
  sound.unlock()
  spectrumVoice.unlock()
  const g = ui.game
  ui.flash = ''
  try {
    switch (el.dataset.act) {
      case 'restart':
        readTuning()
        start()
        if (ui.game) setTimeout(() => sound.deal(ui.game!.fight.hand.length), 200)
        break
      case 'menu':
        ui.popup = 'menu'
        break
      case 'legend':
        ui.popup = 'legend'
        break
      case 'close':
        if (ui.popup === 'menu') readTuning()
        ui.popup = null
        break
      case 'sound':
        sound.setEnabled(!sound.enabled)
        break
      case 'material':
        spectrumVoice.material(MUD.chord)
        break
      case 'dial':
        ui.focus = ui.focus === 'dial' ? null : 'dial'
        break
      case 'aim':
        ui.aim = Number(el.dataset.k)
        ui.focus = null
        break
      case 'spectrum':
        if (g) spectrumVoice.play(g.fight.spectrum, g.fight.commission.chord, true)
        if (g?.stage === 'fight') ui.focus = ui.focus === 'spectrum' ? null : 'spectrum'
        break
      case 'pick-card': {
        const id = Number(el.dataset.id)
        ui.focus = null
        ui.pick = ui.pick === id ? null : id
        ui.aim = null
        break
      }
      case 'go':
        if (g && ui.pick !== null) {
          const c = picked(g)!
          apply(playCard(g, c.id, c.kind === 'attack' ? aimOf(g, c) : undefined), c)
        }
        break
      case 'wait':
        if (g) apply(wait(g), null)
        break
    }
  } catch (e) {
    ui.flash = (e as Error).message
  }
  render()
})

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && ui.popup) {
    ui.popup = null
    render()
  }
})

render()
