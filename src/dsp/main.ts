// DSP: one screen, as in Circuits. The dial carries the threat (the pool, the
// flares, the moon); the spectrum carries the attack (its shape against the
// material's, the match, the battery); the hand docks below. A note always
// explains what is picked, without covering anything.

import '../ui/style.css'
import '../circuits/circuits.css'
import './dsp.css'
import { sound } from '../ui/sound'
import { icon, element, ELEMENT_COLOR, moon, quintessence, card as cardSig } from '../circuits/sigils'
import { battery, batteryIcon, cardSvg } from './card'
import { dialSvg, waitIcon, type DialPreview } from './dial'
import { spectrumSvg } from './spectrum'
import { spectrumVoice } from './audio'
import {
  BANDS,
  CHARGE_PER_UNIT,
  DEFAULT_SETTINGS,
  MATCH_TO_FINISH,
  MUD,
  PHASE_NAMES,
  TICKS,
  isDrainer,
  isSculptor,
  matchOf,
  newGame,
  pct,
  playCard,
  poolTotal,
  resolve,
  smooth,
  startingDeck,
  threatOf,
  tune,
  upcoming,
  wait,
  type Card,
  type Game,
  type Pool,
  type Settings,
} from './engine'

type Pick = { kind: 'card'; id: number } | { kind: 'tune' } | null

const ui = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  game: null as Game | null,
  pick: null as Pick,
  focus: null as 'dial' | 'spectrum' | null,
  popup: null as 'menu' | 'legend' | null,
  flash: '',
  fx: null as { paid: number; flared: boolean } | null,
}

const root = document.getElementById('app')!
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const EIGHTHS_WORDS = ['', 'an eighth', 'a quarter', 'three eighths', 'a half', 'five eighths', 'three quarters', 'seven eighths', 'a whole moon']
const ticks = (n: number) => (n % 2 === 0 && n <= 16 ? EIGHTHS_WORDS[n / 2] : `${n} sixteenths`)
/** Amounts by element, the biggest first. */
const amounts = (p: Partial<Pool>) =>
  BANDS.filter((e) => p[e])
    .sort((x, y) => (p[y] ?? 0) - (p[x] ?? 0))
    .map((e) => `${p[e]} ${e}`)
    .join(' and ')
const need = (g: Game) => poolTotal(g.fight.commission.target)

function start() {
  ui.game = newGame(Date.now(), ui.settings)
  ui.pick = null
  ui.focus = null
  ui.popup = null
  ui.flash = ''
}

// ---------------------------------------------------------------------------
// Words, for the note

function materialWords(g: Game): string {
  const c = g.fight.commission
  return `make ${c.name.toLowerCase()}: an attack of at least ${need(g)}, at least ${pct(MATCH_TO_FINISH)} the shape of ${amounts(c.target)}`
}

function situationNote(g: Game): [string, string] {
  const f = g.fight
  const up = upcoming(f, 8)
  const atk = up.find((x) => x.attack)
  const dis = up.find((x) => x.discard)
  const drw = up.find((x) => x.draw)
  const m = matchOf(f.attack, f.commission.target)
  const size = poolTotal(f.attack)
  const title = atk ? `${PHASE_NAMES[atk.phase]} in ${ticks(atk.pos - f.dial)}` : 'The moon'
  const lines = [
    atk ? `${esc(f.commission.name)} flares there for whatever is in the pool (${threatOf(f)} now, the red badge), and that empties it.` : '',
    dis && (!atk || dis.pos < atk.pos) ? `You discard your hand at the ${PHASE_NAMES[dis.phase].toLowerCase()}, before it.` : '',
    drw ? `You draw ${g.settings.hand} at the ${PHASE_NAMES[drw.phase].toLowerCase()}.` : '',
    `To win, ${materialWords(g)}. ${size ? `The attack is ${size}, a ${pct(m)} match.` : 'The attack is empty.'}${f.charge ? ` The battery holds ${f.charge}.` : ''}`,
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
  return ['The moon', `${items.join('. ')}. The inner ring is the attack's size: ${poolTotal(f.attack)} of ${need(g)}.`]
}

function spectrumNote(g: Game): [string, string] {
  const f = g.fight
  const t = f.commission.target
  return [
    'The spectrum',
    `Each element is a band of sound: earth the bass, water and air the mids, fire the treble. The bars are the attack's shape, each band's share of it; the gilt outlines are ${esc(f.commission.name.toLowerCase())}'s shape, ${amounts(t)}. A band ringed in red is noise the material has none of. The closer the shape, the purer the sound: tap the spectrum to hear the attack. Match ${pct(matchOf(f.attack, t))} of ${pct(MATCH_TO_FINISH)}; size ${poolTotal(f.attack)} of ${need(g)}.`,
  ]
}

function cardNote(g: Game, c: Card): [string, string] {
  const f = g.fight
  const t = f.commission.target
  const r = resolve(f, c)
  const parts: string[] = []
  if (isDrainer(c)) {
    parts.push(`Takes up to ${amounts(c.takes)} from the pool (the triangles inside) and charges the battery ${CHARGE_PER_UNIT} for each (the cell below).`)
    const left = threatOf(f) - poolTotal(r.took)
    parts.push(`<span class="now">Now: ${poolTotal(r.took) ? `takes ${amounts(r.took)}, charge +${r.charge}; the pool would hold ${left} instead of ${threatOf(f)}.` : 'nothing of its elements in the pool.'}</span>`)
  }
  if (isSculptor(c)) {
    parts.push(`Plays ${amounts(c.gives)} into the attack (the triangles outside).`)
    const after = { ...f.attack }
    for (const e of BANDS) after[e] += r.gives[e]
    const s0 = poolTotal(f.attack)
    const noise = BANDS.filter((e) => r.gives[e] && !t[e])
    parts.push(`<span class="now">Now: size ${s0} → ${poolTotal(after)} of ${need(g)}, match ${pct(matchOf(f.attack, t))} → ${pct(matchOf(after, t))}${noise.length ? `; its ${noise.join(' and ')} is noise for ${esc(f.commission.name.toLowerCase())}` : ''}.</span>`)
  }
  return [`${c.name}, ${ticks(c.time)}`, parts.join(' ')]
}

function tuneNote(g: Game): [string, string] {
  const f = g.fight
  const t = f.commission.target
  const s = smooth(f.attack, t, f.charge)
  const head = `Smoothing spends charge: each moves one unit of the band furthest over ${esc(f.commission.name.toLowerCase())}'s shape (noise first) into the band most short of it. It takes no time.`
  if (!f.charge) return ['Smooth', `${head} <span class="now">The battery is empty: drainers charge it.</span>`]
  if (!s.spent) return ['Smooth', `${head} <span class="now">Nothing to smooth now: charge wouldn't bring the attack any closer.</span>`]
  const done = poolTotal(s.attack) >= need(g) && matchOf(s.attack, t) >= MATCH_TO_FINISH - 1e-9
  return ['Smooth', `${head} <span class="now">Now: spends ${s.spent} of ${f.charge} charge, match ${pct(matchOf(f.attack, t))} → ${pct(matchOf(s.attack, t))}${done ? `, and that makes the ${esc(f.commission.name.toLowerCase())}` : poolTotal(s.attack) < need(g) ? `; the attack still needs ${need(g) - poolTotal(s.attack)} more size` : ''}.</span>`]
}

function noteView(title: string, body: string): string {
  return `<section class="note" aria-live="polite"><p><b class="note-title">${esc(title)}</b> ${body}</p></section>`
}

function fightNote(g: Game): string {
  if (ui.focus === 'dial') return noteView(...dialNote(g))
  if (ui.focus === 'spectrum') return noteView(...spectrumNote(g))
  if (ui.pick?.kind === 'tune') return noteView(...tuneNote(g))
  const c = ui.pick?.kind === 'card' ? g.fight.hand.find((x) => x.id === (ui.pick as { id: number }).id) : null
  if (c) return noteView(...cardNote(g, c))
  return noteView(...situationNote(g))
}

function legendText(): string {
  const I = (m: string) => icon(m, 26)
  const row = (svg: string, text: string) => `<li>${svg}<span>${text}</span></li>`
  return `<ul class="legend">
    ${row(I(`<circle r="9" fill="none" stroke="var(--line)" stroke-width="1.5"/>`), 'A circle is a stage. Sigils inside it are what it takes in; sigils outside are what it puts out.')}
    ${row(I(`<circle r="9" fill="none" stroke="var(--line)" stroke-width="1.3"/>${element('water', -2, -3, 4.5, { stroke: ELEMENT_COLOR.water })}${element('earth', -2, 5, 4.5, { stroke: ELEMENT_COLOR.earth })}`), '<b>Inside is defense.</b> A triangle inside takes up to its number of that element out of the pool, so less is left to flare.')}
    ${row(I(battery(0, 0, 8, { stroke: 'var(--lit)' })), 'The cell below a drainer charges the battery, 1 for each unit it takes.')}
    ${row(I(`<circle cx="-5" r="7" fill="none" stroke="var(--line)" stroke-width="1.3"/>${element('fire', 7, 0, 5, { stroke: ELEMENT_COLOR.fire })}`), '<b>Outside is offense.</b> A triangle outside plays its number of that element into the attack.')}
    ${row(I(moon(0, 0, 8, { stroke: 'var(--moon)' })), 'A crescent is time: every card takes an eighth of the moon.')}
    ${row(I(batteryIcon(0, 0, 10, 'var(--lit)', 0.6)), 'Smoothing spends charge, at any time and in no time: each charge moves one unit of the wrong element into the one most missing.')}
    ${row(I(`<rect x="-8" y="-2" width="5" height="10" fill="var(--earth)" opacity="0.6"/><rect x="-1" y="-8" width="5" height="16" fill="var(--water)" opacity="0.6"/><rect x="6" y="2" width="4" height="6" fill="var(--fire)" opacity="0.6" stroke="var(--warn)"/>`), 'The spectrum is the attack: earth the bass, water and air the mids, fire the treble. Match its shape to the gilt outlines, and make it big enough, to make the material.')}
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

function spectrumPanel(g: Game, after: Game | null): string {
  const f = g.fight
  const t = f.commission.target
  const ghost = after && ui.pick ? after.fight.attack : null
  const m = matchOf(f.attack, t)
  const gm = ghost ? matchOf(ghost, t) : null
  const size = poolTotal(f.attack)
  const gsize = ghost ? poolTotal(ghost) : null
  const tuneOn = ui.pick?.kind === 'tune'
  const spend = tuneOn && after ? f.charge - after.fight.charge : 0
  const meter = (frac: number, ghostFrac: number | null) =>
    `<span class="meter" aria-hidden="true"><span class="fill" style="width:${Math.round(100 * Math.min(1, frac))}%"></span>${ghostFrac !== null && Math.abs(ghostFrac - frac) > 0.004 ? `<span class="ghost" style="left:${Math.round(100 * Math.min(frac, ghostFrac))}%;width:${Math.round(100 * Math.abs(Math.min(1, ghostFrac) - Math.min(1, frac)))}%"></span>` : ''}<span class="notch" style="left:${Math.round(100 * MATCH_TO_FINISH)}%"></span></span>`
  return `<section class="bench spec" aria-label="The attack">
    <button class="spec-art ${ui.focus === 'spectrum' ? 'is-on' : ''}" data-act="spectrum" aria-label="The spectrum: tap to hear the attack">${spectrumSvg(f.attack, t, ghost)}</button>
    <div class="spec-read">
      <p class="row"><span class="lbl">Match</span><b class="num ${m >= MATCH_TO_FINISH ? 'ok' : ''}">${pct(m)}</b>${gm !== null && Math.abs(gm - m) > 0.004 ? `<span class="to num">→ ${pct(gm)}</span>` : ''}<span class="of">of ${pct(MATCH_TO_FINISH)}</span></p>
      ${meter(m, gm)}
      <p class="row"><span class="lbl">Size</span><b class="num ${size >= need(g) ? 'ok' : ''}">${size}</b>${gsize !== null && gsize !== size ? `<span class="to num">→ ${gsize}</span>` : ''}<span class="of">of ${need(g)}</span></p>
    </div>
    <button class="cell ${tuneOn ? 'is-on' : ''} ${f.charge ? '' : 'empty'}" data-act="pick-tune" aria-pressed="${tuneOn}" aria-label="Battery ${f.charge}: smooth the attack">
      ${icon(batteryIcon(0, 0, 11, f.charge ? 'var(--lit)' : 'var(--dim)', Math.min(1, f.charge / 10)), 34)}
      <b class="num">${f.charge}${spend ? `<span class="to"> −${spend}</span>` : ''}</b>
      <span class="cell-lbl">Smooth</span>
    </button>
  </section>`
}

function hand(g: Game): string {
  const f = g.fight
  if (!f.hand.length) return `<section class="hand-row empty"><p>No cards in hand until the next new or full moon.</p></section>`
  return `<section class="hand-row" aria-label="Hand">${f.hand
    .map((c) => {
      const r = resolve(f, c)
      const on = ui.pick?.kind === 'card' && ui.pick.id === c.id
      const idle = isDrainer(c) && !isSculptor(c) && !poolTotal(r.took)
      const kind = isDrainer(c) ? 'drainer' : 'sculptor'
      return `<button class="ccard ${kind} ${on ? 'is-on' : ''} ${idle ? 'idle' : ''}" data-act="pick-card" data-id="${c.id}" aria-pressed="${on}" aria-label="${esc(c.name)}, ${kind}">${cardSvg(c, { took: isDrainer(c) ? r.took : null, size: 120 })}<span class="cname">${esc(c.name)}</span></button>`
    })
    .join('')}</section>`
}

function pickedResult(g: Game): Game | null {
  const p = ui.pick
  if (!p) return null
  try {
    return p.kind === 'card' ? playCard(g, p.id) : tune(g)
  } catch {
    return null
  }
}

function previewOf(g: Game, after: Game | null): DialPreview | null {
  if (!after) return null
  const p = ui.pick
  const c = p?.kind === 'card' ? g.fight.hand.find((x) => x.id === p.id) : null
  const drain = c ? resolve(g.fight, c).took : { water: 0, earth: 0, air: 0, fire: 0 }
  return { dial: after.stage === 'fight' ? after.fight.dial : g.fight.dial, size: poolTotal(after.fight.attack), drain }
}

function actions(g: Game, after: Game | null): string {
  const p = ui.pick
  const c = p?.kind === 'card' ? g.fight.hand.find((x) => x.id === p.id) : null
  const label = p?.kind === 'tune' ? 'Smooth' : c ? 'Play' : 'Pick a card'
  const done = after?.stage === 'won'
  const flares = after ? after.fight.flares.length - g.fight.flares.length : 0
  const cost = after ? g.quintessence - after.quintessence : 0
  return `<div class="cx-actions">
    <button class="wait" data-act="wait" aria-label="Wait an eighth of the moon">${waitIcon()}<span>Wait</span></button>
    <button class="primary go" data-act="go" ${after ? '' : 'disabled'}>${label}${done ? ` · makes the ${esc(g.fight.commission.name.toLowerCase())}` : flares ? ` · <span class="warn-on-gold">flare −${cost}</span>` : ''}</button>
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
  const after = pickedResult(g)
  return `<div class="cx fight dsp">
    ${header(g, g.fight.commission.name)}
    <button class="dial-box ${ui.focus === 'dial' ? 'is-on' : ''}" data-act="dial" aria-label="The moon: what comes next">${dialSvg(g.fight, previewOf(g, after), !!ui.fx?.flared)}</button>
    ${fightNote(g)}
    ${spectrumPanel(g, after)}
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    ${hand(g)}
    ${actions(g, after)}
  </div>${popupView(g)}`
}

function endView(g: Game): string {
  const won = g.stage === 'won'
  const f = g.fight
  const t = f.commission.target
  return `<div class="cx end dsp">
    ${header(g, won ? `${f.commission.name}, made` : 'Spent')}
    <section class="end-art">
      <button class="spec-art big" data-act="spectrum" aria-label="Hear the attack">${spectrumSvg(f.attack, t)}</button>
      <p>${won ? `An attack of ${poolTotal(f.attack)} at a ${pct(matchOf(f.attack, t))} match, in ${ticks(f.dial) || 'no time'}${f.dial > TICKS ? ` (${(f.dial / TICKS).toFixed(2)} moons)` : ''}. The flares took ${f.paid}; ${g.quintessence} quintessence left.` : `${esc(f.commission.name)} wore you down with the attack at ${poolTotal(f.attack)} of ${need(g)}, a ${pct(matchOf(f.attack, t))} match.`} Tap the spectrum to hear it.</p>
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
      <p class="lede">Inside a circuit is defense: drain the instability before it flares, and charge your battery. Outside is offense: play elements into an attack and shape it into the material. Spend charge to smooth a rough attack into a pure one.</p>
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

function apply(next: Game, kind: 'card' | 'tune' | 'wait', played?: Card) {
  const before = ui.game!
  ui.game = next
  ui.pick = null
  ui.focus = null
  const paid = before.quintessence - next.quintessence
  const newFlares = next.fight.flares.slice(before.fight.flares.length)
  if (newFlares.length) sound.turn(newFlares, 0, paid)
  ui.fx = { paid, flared: newFlares.length > 0 }
  const t = next.fight.commission.target
  if (kind === 'tune') spectrumVoice.smooth(before.fight.attack, next.fight.attack, t)
  else if (played && isSculptor(played)) spectrumVoice.play(next.fight.attack, t)
  const drawn = next.fight.hand.filter((c) => !before.fight.hand.some((h) => h.id === c.id)).length
  if (drawn) setTimeout(() => sound.deal(drawn), 350)
  if (next.stage === 'won') setTimeout(() => sound.win(), kind === 'tune' ? 2600 : 1200)
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
        spectrumVoice.material(MUD.target)
        break
      case 'dial':
        ui.focus = ui.focus === 'dial' ? null : 'dial'
        break
      case 'spectrum':
        if (g) spectrumVoice.play(g.fight.attack, g.fight.commission.target, true)
        if (g?.stage === 'fight') ui.focus = ui.focus === 'spectrum' ? null : 'spectrum'
        break
      case 'pick-card': {
        const id = Number(el.dataset.id)
        ui.focus = null
        ui.pick = ui.pick?.kind === 'card' && ui.pick.id === id ? null : { kind: 'card', id }
        break
      }
      case 'pick-tune':
        ui.focus = null
        ui.pick = ui.pick?.kind === 'tune' ? null : { kind: 'tune' }
        break
      case 'go':
        if (g && ui.pick?.kind === 'card') {
          const c = g.fight.hand.find((x) => x.id === (ui.pick as { id: number }).id)
          apply(playCard(g, ui.pick.id), 'card', c)
        } else if (g && ui.pick?.kind === 'tune') apply(tune(g), 'tune')
        break
      case 'wait':
        if (g) apply(wait(g), 'wait')
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
