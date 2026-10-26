// DSP: one screen, as in Circuits. The dial carries the threat (the pool, the
// flares, Ward, the moon) and how far the spectrum has closed on the chord;
// the spectrum panel carries the material (its lines against the chord) with
// charge and Ward beside it; the hand docks below. Pick a card and both ways
// to play it show at once: its defensive way on the dial and the readout, its
// spectrum way on the spectrum. A note always explains what is picked.

import '../ui/style.css'
import '../circuits/circuits.css'
import './dsp.css'
import { sound } from '../ui/sound'
import { icon, element, ELEMENT_COLOR, moon, quintessence, card as cardSig, ward as wardSig } from '../circuits/sigils'
import { battery, cardSvg } from './card'
import { dialSvg, waitIcon, type DialPreview } from './dial'
import { spectrumSvg } from './spectrum'
import { spectrumVoice } from './audio'
import {
  BANDS,
  DEFAULT_SETTINGS,
  ELEMENTS,
  LINE_NAMES,
  MUD,
  PHASE_NAMES,
  TICKS,
  distance,
  distanceOf,
  modesOf,
  newGame,
  playCard,
  poolTotal,
  resolve,
  startingDeck,
  threatOf,
  upcoming,
  wait,
  type Card,
  type Effect,
  type Game,
  type Mode,
  type Pool,
  type Settings,
} from './engine'

const ui = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  game: null as Game | null,
  /** The card picked to play. */
  pick: null as number | null,
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
const both = (c: Card) => c.elements.join(' and ')
const KIND_NAME: Record<Card['kind'], string> = { attenuate: 'Attenuate', amplify: 'Amplify' }

function start() {
  ui.game = newGame(Date.now(), ui.settings)
  ui.pick = null
  ui.focus = null
  ui.popup = null
  ui.flash = ''
}

const picked = (g: Game) => (ui.pick !== null ? (g.fight.hand.find((x) => x.id === ui.pick) ?? null) : null)
const tryPlay = (g: Game, c: Card, mode: Mode) => {
  try {
    return playCard(g, c.id, mode)
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
  const lines = [
    atk ? `${esc(f.commission.name)} flares there for whatever is in the pool${f.ward ? `, less the ${f.ward} Ward catches` : ''} (${threatOf(f)} now, the red badge), and that empties it.` : '',
    dis && (!atk || dis.pos < atk.pos) ? `You discard your hand at the ${PHASE_NAMES[dis.phase].toLowerCase()}, before it.` : '',
    drw ? `You draw ${g.settings.hand} at the ${PHASE_NAMES[drw.phase].toLowerCase()}.` : '',
    `To make ${esc(f.commission.name.toLowerCase())}, match its chord exactly: the spectrum is ${distance(f)} off now.${f.charge || f.ward ? ` Charge ${f.charge}, Ward ${f.ward}.` : ''}`,
    'Pick a card to see both ways to play it.',
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
  return ['The moon', `${items.join('. ')}. The inner ring is how far the spectrum has closed on the chord: ${start - distance(f)} of ${start}.${f.ward ? ` Ward ${f.ward} (the shield) catches the next flare first.` : ''}`]
}

function spectrumNote(g: Game): [string, string] {
  const f = g.fight
  return [
    'The spectrum',
    `Twelve lines, three to an element, low to high: earth the bass, water and air the mids, fire the treble. Each line is as tall as its amplitude; the gilt bars with note heads are the chord of ${esc(f.commission.name.toLowerCase())}. What stands above the chord is ringed in red; what is missing below it is dashed. Every line's gap added up is the distance, ${distance(f)} now; the work is done at zero. Tap the spectrum to hear it; the closer to the chord, the purer it sounds. The menu plays the chord itself.`,
  ]
}

function lineWords(r: Effect): string {
  return r.moves.map((m) => `${m.element}'s ${LINE_NAMES[m.line]} line ${m.from} → ${m.to}`).join(', ')
}

function cardNote(g: Game, c: Card): [string, string] {
  const f = g.fight
  const guard = resolve(f, c, modesOf(c)[0])
  const spec = resolve(f, c, 'spectrum')
  const d0 = distance(f)
  const d1 = distanceOf(spec.spectrum, f.commission.chord)
  const flareNow = threatOf(f)
  const parts: string[] = []
  if (c.kind === 'attenuate') {
    const flareAfter = Math.max(0, poolTotal(f.pool) - poolTotal(guard.took) - f.ward)
    parts.push(`<b>Drain</b>: it takes up to ${c.power} each of ${both(c)} from the pool (the triangles inside), and charge rises by what it takes (the cell).`)
    parts.push(`<span class="now">Now: ${guard.charge ? `takes ${amounts(guard.took)}, charge +${guard.charge}, and the pool would flare ${flareAfter} instead of ${flareNow}.` : `no ${both(c)} in the pool, so nothing.`}</span>`)
    parts.push(`<b>Lower</b>: it lowers the ${both(c)} lines furthest over the chord, by up to ${c.power} each.`)
  } else {
    parts.push(`<b>Ward</b>: it spends up to ${c.power * c.elements.length} charge and raises that much Ward (the shield), which catches flares and stays until used.`)
    parts.push(`<span class="now">Now: ${guard.ward ? `charge ${f.charge} → ${f.charge + guard.charge}, Ward ${f.ward} → ${f.ward + guard.ward}.` : 'no charge to spend: drains make it.'}</span>`)
    parts.push(`<b>Raise</b>: it raises the ${both(c)} lines furthest under the chord, by up to ${c.power} each (the triangles outside).`)
  }
  parts.push(`<span class="now">Now: ${spec.moves.length ? `${lineWords(spec)}, so the spectrum would be ${d1 ? `${d1} off instead of ${d0}` : 'a match'}.` : `no ${both(c)} line is ${c.kind === 'attenuate' ? 'over' : 'under'} the chord, so nothing.`}</span>`)
  return [`${c.name}, ${KIND_NAME[c.kind]} · ${both(c)}`, parts.join(' ')]
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
  return `<ul class="legend">
    ${row(I(`<circle r="9" fill="none" stroke="var(--line)" stroke-width="1.3"/>${element('water', -2, -3, 4.5, { stroke: ELEMENT_COLOR.water })}${element('earth', -2, 5, 4.5, { stroke: ELEMENT_COLOR.earth })}`), '<b>Attenuate</b> has its triangles inside the circle: it draws in. Drain: it takes up to its number of each element out of the pool, and charges the cell below by what it took. Lower: it brings down the line in each of its bands furthest over the chord.')}
    ${row(I(`<circle cx="-5" r="7" fill="none" stroke="var(--line)" stroke-width="1.3"/>${element('fire', 7, 0, 5, { stroke: ELEMENT_COLOR.fire })}`), '<b>Amplify</b> has its triangles outside: it puts out. Ward: it spends charge to raise the shield below, 1 Ward for each charge. Raise: it brings up the line in each of its bands furthest under the chord.')}
    ${row(I(battery(0, 0, 8, { stroke: 'var(--lit)' })), 'Charge, the cell: drains fill it; Ward spends it.')}
    ${row(I(wardSig(0, 0, 9, { stroke: 'var(--glass)' })), 'Ward, the shield: it catches flares before they reach your quintessence, and stays until used.')}
    ${row(I(`<rect x="-9" y="-3" width="4" height="10" fill="var(--earth)" opacity="0.6"/><rect x="-3" y="-8" width="4" height="15" fill="var(--water)" opacity="0.6"/><path d="M-4 -8H2" stroke="var(--gilt-bright)" stroke-width="1.6"/><rect x="3" y="0" width="4" height="7" fill="var(--warn)" opacity="0.5" stroke="var(--warn)"/>`), 'The spectrum: twelve lines, three to an element, earth the bass to fire the treble. The gilt bars are the chord. The distance is every line’s gap from it, added up; match the chord exactly to make the material.')}
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

/** Beside the spectrum: how far off it is, charge and Ward, and what the picked card would make of them. */
function readout(g: Game, c: Card | null): string {
  const f = g.fight
  const d0 = distance(f)
  const start = distanceOf(f.commission.start, f.commission.chord)
  const spec = c ? resolve(f, c, 'spectrum') : null
  const guard = c ? resolve(f, c, modesOf(c)[0]) : null
  const d1 = spec ? distanceOf(spec.spectrum, f.commission.chord) : null
  const charge1 = guard ? f.charge + guard.charge : null
  const ward1 = guard ? f.ward + guard.ward : null
  const at = (v: number) => `${Math.round((100 * Math.max(0, start - v)) / Math.max(1, start))}%`
  const to = (a: number | null, b: number) => (a !== null && a !== b ? `<span class="to num">→ ${a}</span>` : '')
  return `<div class="seal">
      <p class="row"><span class="lbl">Off by</span><b class="num ${d0 === 0 ? 'ok' : ''}">${d0}</b>${to(d1, d0)}<span class="of">${d1 === 0 ? 'a match' : 'match at 0'}</span></p>
      <span class="meter" aria-hidden="true">
        <span class="fill" style="width:${at(d0)}"></span>
        ${d1 !== null && d1 < d0 ? `<span class="ghost" style="left:${at(d0)};width:calc(${at(d1)} - ${at(d0)})"></span>` : ''}
      </span>
      <p class="row">${icon(battery(0, 0, 8, { stroke: 'var(--lit)', width: 1.4 }), 18)}<b class="num">${f.charge}</b>${to(charge1, f.charge)}<span class="gap"></span>${icon(wardSig(0, 0, 9, { stroke: 'var(--glass)', width: 1.5 }), 18)}<b class="num">${f.ward}</b>${to(ward1, f.ward)}</p>
    </div>`
}

function spectrumPanel(g: Game, c: Card | null): string {
  const f = g.fight
  const ghost = c ? resolve(f, c, 'spectrum').spectrum : null
  return `<section class="bench spec" aria-label="The material">
    <button class="spec-art ${ui.focus === 'spectrum' ? 'is-on' : ''}" data-act="spectrum" aria-label="The spectrum: tap to hear it">${spectrumSvg(f.spectrum, f.commission.chord, ghost)}</button>
    ${readout(g, c)}
  </section>`
}

function hand(g: Game): string {
  const f = g.fight
  if (!f.hand.length) return `<section class="hand-row empty"><p>No cards in hand until the next new or full moon.</p></section>`
  return `<section class="hand-row" aria-label="Hand">${f.hand
    .map((c) => {
      const on = ui.pick === c.id
      const took = c.kind === 'attenuate' ? resolve(f, c, 'drain').took : {}
      return `<button class="ccard ${c.kind} ${on ? 'is-on' : ''}" data-act="pick-card" data-id="${c.id}" aria-pressed="${on}" aria-label="${esc(c.name)}, ${KIND_NAME[c.kind]} ${both(c)}">${cardSvg(c, { took, charged: f.charge > 0, size: 120 })}<span class="cname">${esc(c.name)}</span></button>`
    })
    .join('')}</section>`
}

function previewOf(g: Game, c: Card | null): DialPreview | null {
  if (!c) return null
  const f = g.fight
  const guard = resolve(f, c, modesOf(c)[0])
  const spec = resolve(f, c, 'spectrum')
  const delta = { water: 0, earth: 0, air: 0, fire: 0 }
  for (const e of ELEMENTS) delta[e] = -guard.took[e]
  const after = tryPlay(g, c, 'spectrum')
  return { dial: after && after.stage === 'fight' ? after.fight.dial : f.dial, distance: distanceOf(spec.spectrum, f.commission.chord), delta, ward: f.ward + guard.ward }
}

function modeButton(g: Game, c: Card, mode: Mode): string {
  const f = g.fight
  const r = resolve(f, c, mode)
  const after = tryPlay(g, c, mode)
  const title = mode === 'drain' ? 'Drain' : mode === 'ward' ? 'Ward' : c.kind === 'attenuate' ? 'Lower' : 'Raise'
  const closed = distance(f) - distanceOf(r.spectrum, f.commission.chord)
  const what =
    mode === 'drain' ? (r.charge ? `charge +${r.charge}` : 'nothing to take') : mode === 'ward' ? (r.ward ? `Ward +${r.ward}, charge −${r.ward}` : 'no charge') : r.moves.length ? `off −${closed}` : 'nothing to move'
  const flares = after && after.stage !== 'won' ? after.fight.flares.length - f.flares.length : 0
  const cost = after && after.stage !== 'won' ? g.quintessence - after.quintessence : 0
  const tail = after?.stage === 'won' ? 'a match' : flares ? (cost ? `<span class="warn-on-gold">flare −${cost}</span>` : 'flare caught') : ''
  const idle = mode === 'drain' ? !r.charge : mode === 'ward' ? !r.ward : !r.moves.length
  return `<button class="mode ${idle ? 'idle' : 'primary'}" data-act="play" data-mode="${mode}"><b>${title}</b><span>${what}${tail ? ` · ${tail}` : ''}</span></button>`
}

function actions(g: Game): string {
  const c = picked(g)
  if (!c)
    return `<div class="cx-actions">
    <button class="wait" data-act="wait" aria-label="Wait an eighth of the moon">${waitIcon()}<span>Wait</span></button>
    <button class="primary go" disabled>Pick a card</button>
  </div>`
  return `<div class="cx-actions modes">
    <button class="wait" data-act="wait" aria-label="Wait an eighth of the moon">${waitIcon()}</button>
    ${modeButton(g, c, modesOf(c)[0])}
    ${modeButton(g, c, 'spectrum')}
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
      <p>${won ? `The spectrum matches the chord, in ${f.dial > TICKS ? `${(f.dial / TICKS).toFixed(2)} moons` : ticks(f.dial)}. The flares took ${f.paid}${f.flares.length ? ` of ${f.flares.reduce((a, b) => a + b, 0)}` : ''}; ${g.quintessence} quintessence left.` : `${esc(f.commission.name)} wore you down with the spectrum ${distance(f)} off the chord.`} Tap the spectrum to hear it.</p>
    </section>
    <div class="cx-actions one"><button class="primary go" data-act="restart">Again</button></div>
  </div>${popupView(g)}`
}

function startView(): string {
  const deck = startingDeck()
  return `<div class="cx start dsp">
    <div class="start-art">${cardSvg(deck[0], { size: 150 })}${cardSvg(deck[6], { size: 150 })}</div>
    <div class="start-words">
      <p class="eyebrow">A prototype</p>
      <h1>DSP</h1>
      <p class="lede">Transmute a raw spectrum into a material's chord, line for line. Attenuate lowers the lines, or drains the coming flare into charge; Amplify raises them, or spends charge on Ward. The flares come either way.</p>
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

function apply(next: Game, mode: Mode | null) {
  const before = ui.game!
  ui.game = next
  ui.pick = null
  ui.focus = null
  const paid = before.quintessence - next.quintessence
  const newFlares = next.fight.flares.slice(before.fight.flares.length)
  if (newFlares.length) sound.turn(newFlares, 0, paid)
  ui.fx = { paid, flared: newFlares.length > 0 }
  if (mode === 'spectrum') spectrumVoice.tune(before.fight.spectrum, next.fight.spectrum, next.fight.commission.chord)
  const drawn = next.fight.hand.filter((c) => !before.fight.hand.some((h) => h.id === c.id)).length
  if (drawn) setTimeout(() => sound.deal(drawn), 350)
  if (next.stage === 'won') setTimeout(() => sound.win(), mode === 'spectrum' ? 2400 : 600)
  if (next.stage === 'lost') sound.lose()
}

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')
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
      case 'spectrum':
        if (g) spectrumVoice.play(g.fight.spectrum, g.fight.commission.chord, true)
        if (g?.stage === 'fight') ui.focus = ui.focus === 'spectrum' ? null : 'spectrum'
        break
      case 'pick-card': {
        const id = Number(el.dataset.id)
        ui.focus = null
        ui.pick = ui.pick === id ? null : id
        break
      }
      case 'play':
        if (g && ui.pick !== null) {
          const mode = el.dataset.mode as Mode
          apply(playCard(g, ui.pick, mode), mode)
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
