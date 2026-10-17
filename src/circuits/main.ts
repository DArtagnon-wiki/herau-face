// Alchemical Circuits: one screen. The dial, the materials and the hand are
// always in view and carry the state in pictures; words live in popups.

import '../ui/style.css'
import './circuits.css'
import { sound } from '../ui/sound'
import { elementMote, makeRune } from '../sim/deck'
import { circuitSvg, offerSvg, recipeSvg } from './circuit'
import { dialSvg, waitIcon, type DialPreview } from './dial'
import {
  COMMISSIONS,
  DEFAULT_SETTINGS,
  ELEMENTS,
  EXTRA_RUNE_PRICE,
  GROUND_DRAIN,
  PHASE_NAMES,
  PRINCIPLES,
  PRINCIPLE_OF,
  RECIPES,
  canAfford,
  costOf,
  craft,
  feedOf,
  fits,
  newRun,
  nextFight,
  playCard,
  poolTotal,
  resolveCard,
  runeWords,
  takeRune,
  upcoming,
  wait,
  type Card,
  type Recipe,
  type Run,
  type Settings,
} from './engine'
import { ELEMENT_COLOR, element, ground, homunculus, icon, lead as leadSig, metal, moon, principle, quintessence, silver as silverSig, square, ward } from './sigils'

// ---------------------------------------------------------------------------
// State

type Pick = { kind: 'card'; id: number } | { kind: 'recipe'; key: Recipe['key'] } | null
type Popup = { kind: 'explain' } | { kind: 'card'; id: number } | { kind: 'dial' } | { kind: 'materials' } | { kind: 'legend' } | { kind: 'menu' } | { kind: 'offer'; i: number } | null

const ui = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  run: null as Run | null,
  pick: null as Pick,
  popup: null as Popup,
  /** Between fights: the rune picked from the offer. */
  offer: null as number | null,
  flash: '',
  /** What the last action did, played once by the next render. */
  fx: null as { paid: number; flared: boolean } | null,
}

const root = document.getElementById('app')!
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const eighths = (n: number) => (n === 1 ? 'an eighth' : n === 2 ? 'a quarter' : n === 3 ? 'three eighths' : n === 4 ? 'a half' : `${n} eighths`)
const pluralP = (n: number, p: string) => `${n} ${p}`

function start() {
  ui.run = newRun(Date.now(), ui.settings)
  ui.pick = null
  ui.popup = null
  ui.offer = null
  ui.flash = ''
  sound.deal(ui.run.fight.hand.length)
}

// ---------------------------------------------------------------------------
// Words, for popups only

function cardText(c: Card): string {
  const ins = c.channels.map((ch) => (ch.element === 'any' ? `up to ${ch.capacity} of whatever is most plentiful` : `up to ${ch.capacity} ${ch.element}`)).join(' and ')
  const ps = [...new Set(c.channels.flatMap((ch) => (ch.element === 'any' ? ['salt, sulfur or mercury'] : [PRINCIPLE_OF[ch.element]])))].join(' and ')
  const lines = [
    `Costs ${eighths(costOf(c))} of the moon: the crescents in its small circle. The arc on its link means that circle must run before the big one can.`,
    `The big circle takes ${ins} from the pool (its triangle${c.channels.length > 1 ? 's' : ''}), and purifies 1 for each${c.gain ? `, times ${1 + c.gain} through its ${c.gain === 1 ? 'gain stage' : 'gain stages'} (the circles above the square)` : ''} (the square).`,
    c.output === 'ward'
      ? `${c.threshold > 1 ? `If it takes ${c.threshold} or more (one arc each), it` : 'Whenever it takes anything (the one arc), it'} also raises Ward, 1 for each it takes (the shield): Ward catches the next flare.`
      : `${c.threshold > 1 ? `If it takes ${c.threshold} or more (one arc each), it` : 'Whenever it takes anything (the one arc), it'} also yields ${ps}${c.distill ? `, times ${1 + c.distill} through its distilling ${c.distill === 1 ? 'stage' : 'stages'}` : ''}.`,
    c.ground ? `Its ${c.ground === 1 ? 'ground drains' : 'grounds drain'} ${GROUND_DRAIN * c.ground} more of anything, purifying nothing.` : '',
  ]
  return lines.filter(Boolean).map((l) => `<p>${l}</p>`).join('')
}

function nowText(run: Run, c: Card): string {
  const r = resolveCard(c, run.fight.pool)
  if (!r.processed && !Object.values(r.drained).some(Boolean)) return '<p class="now">Right now there is nothing in the pool for it.</p>'
  const ps = PRINCIPLES.filter((p) => r.principles[p]).map((p) => `${r.principles[p]} ${p}`)
  const side = r.ward ? `, raising Ward ${r.ward}` : ps.length ? `, yielding ${ps.join(' and ')}` : c.threshold > 1 && r.processed ? `, short of the ${c.threshold} it needs to ${c.output === 'ward' ? 'raise Ward' : 'yield its principle'}` : ''
  return `<p class="now">Right now it would take ${poolTotal(r.drained)} and purify ${r.purification}${side}.</p>`
}

function recipeText(r: Recipe): string {
  const cost = PRINCIPLES.filter((p) => r.cost[p]).map((p) => pluralP(r.cost[p]!, p)).join(', ')
  return `<p>${esc(r.effect)}.</p><p>Brewing takes ${cost}, and ${eighths(r.time)} of the moon (the crescent inside).</p>`
}

function dialText(run: Run): string {
  const f = run.fight
  const items = upcoming(f, 4)
    .map((x) => {
      const what = [x.attack ? `${f.commission.name} flares whatever is in the pool` : '', x.buff ? 'it grows' : '', x.draw ? (run.settings.draw === 'refill' ? `you refill your hand to ${run.settings.hand}` : `you draw ${run.settings.hand}`) : '', `it feeds ${ELEMENTS.filter((e) => feedOf(f.commission, f.buffs + (x.buff ? 1 : 0))[e]).map((e) => `${feedOf(f.commission, f.buffs + (x.buff ? 1 : 0))[e]} ${e}`).join(', ')}`]
        .filter(Boolean)
        .join('; ')
      return `<li><b>${PHASE_NAMES[x.phase]}</b>, in ${eighths(x.pos - f.dial)}: ${what}.</li>`
    })
    .join('')
  return `<p>Every card costs time. The needle moves around the moon as you play; each quarter, ${esc(f.commission.name.toLowerCase())} feeds instability into the pool (the four triangles in the middle). A red star marks where it flares: whatever is left in the pool then costs quintessence, less any Ward. The red badge is what would flare now. The inner ring fills with purification; at ${f.commission.require} the commission is done.</p><ol class="pop-list">${items}</ol>`
}

function legendRow(svg: string, text: string): string {
  return `<li>${svg}<span>${text}</span></li>`
}

function legendText(): string {
  const I = (m: string) => icon(m, 26)
  return `<ul class="legend">
    ${legendRow(I(`<circle r="9" fill="none" stroke="var(--line)" stroke-width="1.5"/>`), 'A circle is a stage. Inside are its inputs; outside, its outputs and links to other stages.')}
    ${legendRow(I(moon(0, 0, 8, { stroke: 'var(--moon)' })), 'A crescent is time: a quarter of the moon each, a small one for an eighth.')}
    ${legendRow(I(element('water', -4, 0, 6.5, { stroke: ELEMENT_COLOR.water }) + element('fire', 5, 1, 6.5, { stroke: ELEMENT_COLOR.fire })), 'A triangle is an element taken from the pool, with the most it takes. Fire and air point up, water and earth down; air and earth are barred; the six-pointed star takes any.')}
    ${legendRow(I(square(0, 0, 7, { stroke: 'var(--lit)' })), 'A square is purification: progress against the commission.')}
    ${legendRow(I(`<path d="M-5 -9A11 11 0 0 1 -5 9M-1 -10A13 13 0 0 1 -1 10M3 -11A15 15 0 0 1 3 11" fill="none" stroke="var(--lit)" stroke-width="1.4" stroke-linecap="round"/>`), 'Arcs across an output are what it needs. One arc on a link: the stage before must run. Several before a principle: it must take at least that many. They light up as the pool fills.')}
    ${legendRow(I(principle('salt', -6, 0, 6, { stroke: 'var(--lit)' }) + principle('mercury', 6, 0, 6, { stroke: 'var(--lit)' })), 'Salt, sulfur and mercury: the principles left behind. Earth leaves salt, fire sulfur, water and air mercury. They brew recipes.')}
    ${legendRow(I(metal(0, 0, 8, { stroke: 'var(--lit)' })), 'Metal, counted by worth: what is left after a commission smelts into silver and lead. It buys extra runes.')}
    ${legendRow(I(ground(0, -1, 8, { stroke: 'var(--lit)' })), 'A ground drains instability away, purifying nothing.')}
    ${legendRow(I(ward(0, 0, 9, { stroke: 'var(--lit)' })), 'Ward catches the next flare. A shield on a card raises Ward, 1 for each it takes.')}
    ${legendRow(I(homunculus(0, 0, 9, { stroke: 'var(--lit)' })), 'A homunculus purifies on its own every quarter.')}
  </ul>`
}

// ---------------------------------------------------------------------------
// Views

function header(run: Run, title: string): string {
  const dots = COMMISSIONS.map((_, i) => `<span class="dot ${i < run.fightIndex ? 'done' : i === run.fightIndex ? 'now' : ''}"></span>`).join('')
  return `<header class="cx-head">
    <button class="menu" data-act="menu" aria-label="Menu">${icon(`<path d="M-7 -5H7M-7 0H7M-7 5H7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`, 20)}</button>
    <div class="who"><h1>${esc(title)}</h1><span class="dots" aria-label="Commission ${run.fightIndex + 1} of ${COMMISSIONS.length}">${dots}</span></div>
    <div class="quint ${ui.fx?.paid ? 'drained' : ''}" aria-label="Quintessence ${run.quintessence}">${icon(quintessence(0, 0, 9, { stroke: 'var(--glass)', fill: 'color-mix(in srgb, var(--glass) 25%, transparent)' }), 22)}<b class="num">${run.quintessence}</b>${ui.fx?.paid ? `<span class="loss num">−${ui.fx.paid}</span>` : ''}</div>
  </header>`
}

function materials(run: Run): string {
  const f = run.fight
  const chip = (svg: string, n: number, label: string, hide = false) => (hide ? '' : `<span class="chip" aria-label="${label} ${n}">${svg}<b class="num">${n}</b></span>`)
  const color: Record<string, string> = { salt: 'var(--salt)', sulfur: 'var(--sulfur)', mercury: 'var(--mercury)' }
  return `<button class="mats" data-act="materials" aria-label="Materials">
    ${PRINCIPLES.map((p) => chip(icon(principle(p, 0, 0, 9, { stroke: color[p], width: 1.6 }), 20), f.principles[p], p)).join('')}
    ${chip(icon(metal(0, 0, 8, { stroke: 'var(--gilt)', width: 1.6 }), 20), run.metals, 'metal')}
    ${chip(icon(ward(0, 0, 9, { stroke: 'var(--glass)', width: 1.6 }), 20), f.ward, 'Ward', !f.ward)}
    ${chip(icon(homunculus(0, 0, 10, { stroke: 'var(--good)', width: 1.5 }), 20), f.homunculi, 'homunculi', !f.homunculi)}
  </button>`
}

function recipes(run: Run): string {
  return `<div class="recipes">${RECIPES.map((r) => {
    const on = ui.pick?.kind === 'recipe' && ui.pick.key === r.key
    const can = canAfford(run.fight, r)
    return `<button class="recipe ${on ? 'is-on' : ''} ${can ? '' : 'cant'}" data-act="pick-recipe" data-key="${r.key}" aria-pressed="${on}" aria-label="${esc(r.name)}${can ? '' : ', not enough principles'}">${recipeSvg(r, can, 70)}</button>`
  }).join('')}</div>`
}

function hand(run: Run): string {
  const f = run.fight
  if (!f.hand.length) return `<section class="hand-row empty"><p>No cards in hand. Wait for the next new or full moon.</p></section>`
  return `<section class="hand-row" aria-label="Hand">${f.hand
    .map((c) => {
      const live = resolveCard(c, f.pool)
      const on = ui.pick?.kind === 'card' && ui.pick.id === c.id
      const idle = !live.processed && !Object.values(live.drained).some(Boolean)
      return `<button class="ccard ${on ? 'is-on' : ''} ${idle ? 'idle' : ''}" data-act="pick-card" data-id="${c.id}" aria-pressed="${on}" aria-label="${esc(c.name)}: would purify ${live.purification}">${circuitSvg(c, { live, size: 120 })}<span class="cname">${esc(c.name)}</span></button>`
    })
    .join('')}</section>`
}

/** The picked move, run through the engine for the dial's ghost. */
function pickedResult(run: Run): Run | null {
  const p = ui.pick
  if (!p) return null
  try {
    if (p.kind === 'card') return run.fight.hand.some((c) => c.id === p.id) ? playCard(run, p.id) : null
    const r = RECIPES.find((x) => x.key === p.key)!
    return canAfford(run.fight, r) ? craft(run, p.key) : null
  } catch {
    return null
  }
}

function previewOf(run: Run, after: Run | null): DialPreview | null {
  if (!after) return null
  const p = ui.pick
  const c = p?.kind === 'card' ? run.fight.hand.find((x) => x.id === p.id) : null
  const drain = c ? resolveCard(c, run.fight.pool).drained : { water: 0, earth: 0, air: 0, fire: 0 }
  if (after.fightIndex !== run.fightIndex || after.stage === 'reward' || after.stage === 'won') {
    return { dial: run.fight.dial, purified: run.fight.commission.require, drain, flares: [] }
  }
  return { dial: after.fight.dial, purified: after.fight.purified, drain, flares: after.fight.flares.slice(run.fight.flares.length) }
}

function actions(run: Run, after: Run | null): string {
  const p = ui.pick
  const r = p?.kind === 'recipe' ? RECIPES.find((x) => x.key === p.key)! : null
  const c = p?.kind === 'card' ? run.fight.hand.find((x) => x.id === p.id) : null
  const label = r ? 'Brew' : c ? 'Play' : 'Pick a card'
  const finishes = after && (after.stage === 'reward' || after.stage === 'won')
  const flares = after && after.fightIndex === run.fightIndex ? after.fight.flares.length - run.fight.flares.length : 0
  const cost = after && after.fightIndex === run.fightIndex ? run.quintessence - after.quintessence : 0
  return `<div class="cx-actions">
    <button class="explain" data-act="explain" aria-label="Explain">?</button>
    <button class="wait" data-act="wait" aria-label="Wait a quarter">${waitIcon()}<span>Wait</span></button>
    <button class="primary go" data-act="go" ${after ? '' : 'disabled'}>${label}${finishes ? ' · done' : flares ? ` · <span class="warn-on-gold">flare −${cost}</span>` : ''}</button>
  </div>`
}

function popupView(run: Run | null): string {
  const p = ui.popup
  if (!p) return ''
  let title = ''
  let body = ''
  let act = ''
  if (p.kind === 'legend') {
    title = 'Reading a circuit'
    body = legendText()
  } else if (p.kind === 'menu') {
    title = 'Alchemical Circuits'
    const s = ui.settings
    const opt = (v: string, cur: string, label: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
    const drawKey = `${s.draw}-${s.hand}`
    body = `<div class="pop-actions"><button data-act="legend">Reading a circuit</button><button data-act="restart">Start again</button></div>
      ${run ? `<p class="label">What happened</p><ol class="pop-list log">${run.fight.log.slice(0, 10).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}
      <p class="label">Tuning, on restart</p>
      <div class="tune"><label>At new and full moons <select id="c-draw">${opt('refill-4', drawKey, 'Refill to 4')}${opt('draw-4', drawKey, 'Draw 4')}${opt('draw-2', drawKey, 'Draw 2')}${opt('refill-5', drawKey, 'Refill to 5')}</select></label>
      <label>Quintessence <select id="c-stock">${[40, 60, 80].map((v) => opt(String(v), String(s.stock), String(v))).join('')}</select></label></div>`
  } else if (!run) return ''
  else if (p.kind === 'dial') {
    title = 'The moon'
    body = dialText(run)
  } else if (p.kind === 'materials') {
    title = 'Materials'
    body = `<p>Cards leave principles behind: earth salt, fire sulfur, water and air mercury. Tap a recipe to see what it brews. When a commission is done, what is left smelts into metal: silver from 2 mercury and a salt (worth 3), lead from any two (worth 1). Metal buys extra runes between commissions.</p>${run.fight.ward ? `<p>Ward ${run.fight.ward} will catch the first of the next flare.</p>` : ''}${run.fight.homunculi ? `<p>Your homunculus purifies ${2 * run.fight.homunculi} every quarter.</p>` : ''}`
  } else if (p.kind === 'card' || (p.kind === 'explain' && ui.pick?.kind === 'card')) {
    const id = p.kind === 'card' ? p.id : (ui.pick as { id: number }).id
    const c = run.fight.hand.find((x) => x.id === id) ?? run.deck.find((x) => x.id === id)
    if (c) {
      title = c.name
      body = `<div class="pop-art">${circuitSvg(c, { size: 170 })}</div>${cardText(c)}${run.stage === 'fight' && run.fight.hand.includes(c) ? nowText(run, c) : ''}`
    }
  } else if (p.kind === 'explain' && ui.pick?.kind === 'recipe') {
    const r = RECIPES.find((x) => x.key === (ui.pick as { key: Recipe['key'] }).key)!
    title = r.name
    body = `<div class="pop-art">${recipeSvg(r, canAfford(run.fight, r), 160)}</div>${recipeText(r)}${canAfford(run.fight, r) ? '' : '<p class="now">You need more principles first.</p>'}`
  } else if (p.kind === 'explain' && run.stage === 'reward') {
    title = 'Between commissions'
    body = `<p>Pick a rune, then the card to add it to. The first is free; each more costs ${EXTRA_RUNE_PRICE} metal. Cards it can't go on are dimmed: each card holds at most 3 inputs, 2 gain stages, 2 distilling stages and 2 grounds, and only cards that yield principles can distil.</p>`
  } else if (p.kind === 'offer') {
    const r = run.offer[p.i]
    title = 'A rune'
    body = `<p>${esc(runeWords(r))}.</p>`
  } else if (p.kind === 'explain') {
    title = 'Your move'
    body = `<p>Pick a card to see on the dial what it would do: where the needle would land, how far purification would reach, what the pool would lose. Then play it. Tap the dial for what the moon brings next, the materials for what principles do, and the menu for how to read a circuit.</p>`
  }
  if (!title) return ''
  return `<div class="pop-veil" data-act="close"></div>
  <section class="pop" role="dialog" aria-label="${esc(title)}">
    <div class="pop-head"><h2>${esc(title)}</h2><button class="close" data-act="close" aria-label="Close">×</button></div>
    <div class="pop-body">${body}</div>${act}
  </section>`
}

function fightView(run: Run): string {
  const after = pickedResult(run)
  const preview = previewOf(run, after)
  return `<div class="cx fight">
    ${header(run, run.fight.commission.name)}
    <button class="dial-box" data-act="dial" aria-label="The moon: what comes next">${dialSvg(run.fight, feedOf(run.fight.commission, run.fight.buffs), preview, !!ui.fx?.flared)}</button>
    <div class="bench">${materials(run)}${recipes(run)}</div>
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    ${hand(run)}
    ${actions(run, after)}
  </div>${popupView(run)}`
}

function rewardView(run: Run): string {
  const s = run.smelted
  const sel = ui.offer !== null ? run.offer[ui.offer] : null
  const price = run.tookFree ? EXTRA_RUNE_PRICE : 0
  const canTake = price <= run.metals
  const offerTile = (i: number) => {
    const r = run.offer[i]
    const svg = r.kind === 'channel' ? offerSvg('channel', r.element, r.capacity, 48) : offerSvg(r.kind, null, null, 48)
    return `<button class="offer ${ui.offer === i ? 'is-on' : ''}" data-act="offer" data-i="${i}" ${canTake ? '' : 'disabled'} aria-pressed="${ui.offer === i}" aria-label="${esc(runeWords(r))}">${svg}<span class="price">${price ? `${icon(metal(0, 0, 7, { stroke: 'var(--gilt)' }), 14)}${price}` : 'free'}</span></button>`
  }
  return `<div class="cx reward">
    ${header(run, `${run.fight.commission.name}, purified`)}
    <section class="smelt" aria-label="Smelted">
      ${s?.silver ? `<span class="chip">${icon(silverIcon(), 22)}<b class="num">${s.silver}</b></span>` : ''}
      ${s?.lead ? `<span class="chip">${icon(leadIcon(), 22)}<b class="num">${s.lead}</b></span>` : ''}
      <span class="chip total">${icon(metal(0, 0, 8, { stroke: 'var(--gilt)', width: 1.6 }), 22)}<b class="num">${run.metals}</b>${s?.value ? `<span class="gain num">+${s.value}</span>` : ''}</span>
    </section>
    <section class="offers" aria-label="Runes on offer">${run.offer.map((_, i) => offerTile(i)).join('') || '<p class="fine">Nothing left on offer.</p>'}</section>
    <section class="deck" aria-label="Your deck">${run.deck
      .map((c) => `<button class="ccard ${sel && fits(sel, c) ? 'fits' : ''}" data-act="${sel ? 'add' : 'look'}" data-id="${c.id}" ${sel && !fits(sel, c) ? 'disabled' : ''} aria-label="${esc(c.name)}">${circuitSvg(c, { size: 110 })}<span class="cname">${esc(c.name)}</span></button>`)
      .join('')}</section>
    <div class="cx-actions two">
      <button class="explain" data-act="explain" aria-label="Explain">?</button>
      <button class="primary go" data-act="next">On to ${esc(COMMISSIONS[run.fightIndex + 1].name)}</button>
    </div>
  </div>${popupView(run)}`
}
const silverIcon = () => silverSig(0, 0, 8, { stroke: 'var(--mercury)', width: 1.6 })
const leadIcon = () => leadSig(0, 0, 9, { stroke: 'var(--ink-soft)', width: 1.6 })

function endView(run: Run): string {
  const won = run.stage === 'won'
  return `<div class="cx end">
    ${header(run, won ? 'The work is done' : 'Spent')}
    <section class="end-art">${icon(won ? metal(0, 0, 9, { stroke: 'var(--gilt)', width: 1.4 }) : quintessence(0, 0, 9, { stroke: 'var(--warn)', width: 1.2 }), 120)}
      <p>${won ? `All three commissions purified, with ${run.quintessence} quintessence and ${run.metals} metal left.` : `${esc(run.fight.commission.name)} wore you down at ${run.fight.purified} of ${run.fight.commission.require} purified.`}</p>
    </section>
    <div class="cx-actions one"><button class="primary go" data-act="restart">Start again</button></div>
  </div>${popupView(run)}`
}

function startView(): string {
  const wash = newRun(1).deck[0]
  return `<div class="cx start">
    <div class="start-art">${circuitSvg(wash, { size: 220 })}</div>
    <div class="start-words">
      <p class="eyebrow">A prototype</p>
      <h1>Alchemical Circuits</h1>
      <p class="lede">Every card is a small circuit. Catch the instability a commission feeds into the pool, purify it, keep what it leaves behind. Every card costs time on the moon.</p>
    </div>
    <div class="cx-actions two">
      <button data-act="legend">Reading a circuit</button>
      <button class="primary go" data-act="restart">Begin</button>
    </div>
  </div>${popupView(null)}`
}

function render() {
  const run = ui.run
  root.innerHTML = !run ? startView() : run.stage === 'fight' ? fightView(run) : run.stage === 'reward' ? rewardView(run) : endView(run)
  ui.fx = null
}

// ---------------------------------------------------------------------------
// Events

function readTuning() {
  const draw = (document.getElementById('c-draw') as HTMLSelectElement | null)?.value
  if (draw) {
    const [mode, n] = draw.split('-')
    ui.settings.draw = mode as Settings['draw']
    ui.settings.hand = Number(n)
  }
  const stock = (document.getElementById('c-stock') as HTMLSelectElement | null)?.value
  if (stock) ui.settings.stock = Number(stock)
}

function apply(next: Run) {
  const before = ui.run!
  const flaresBefore = before.fight.flares.length
  ui.run = next
  ui.pick = null
  const same = next.fightIndex === before.fightIndex
  const paid = same ? before.quintessence - next.quintessence : 0
  const flared = same && next.fight.flares.length > flaresBefore
  if (flared) {
    const flares = next.fight.flares.slice(flaresBefore)
    sound.turn(flares, flares.reduce((a, b) => a + b, 0) - paid, paid)
  }
  ui.fx = { paid, flared }
  const drawn = same ? next.fight.hand.filter((c) => !before.fight.hand.some((h) => h.id === c.id)).length : 0
  if (drawn) setTimeout(() => sound.deal(drawn), 350)
  if (next.stage === 'won' || next.stage === 'reward') sound.win()
  if (next.stage === 'lost') sound.lose()
}

let pressTimer = 0
root.addEventListener('contextmenu', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act="pick-card"], [data-act="look"], [data-act="add"]')
  if (!el) return
  ev.preventDefault()
  ui.popup = { kind: 'card', id: Number(el.dataset.id) }
  render()
})
root.addEventListener('pointerdown', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act="pick-card"]')
  if (!el) return
  clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    ui.popup = { kind: 'card', id: Number(el.dataset.id) }
    pressTimer = -1
    render()
  }, 550)
})
const cancelPress = () => clearTimeout(pressTimer)
root.addEventListener('pointerup', cancelPress)
root.addEventListener('pointercancel', cancelPress)
root.addEventListener('pointerleave', cancelPress)

root.addEventListener('click', (ev) => {
  if (pressTimer === -1) {
    pressTimer = 0
    return
  }
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!el || (el as HTMLButtonElement).disabled) return
  sound.unlock()
  const run = ui.run
  ui.flash = ''
  try {
    switch (el.dataset.act) {
      case 'restart':
        readTuning()
        start()
        break
      case 'menu':
        ui.popup = { kind: 'menu' }
        break
      case 'legend':
        ui.popup = { kind: 'legend' }
        break
      case 'close':
        if (ui.popup?.kind === 'menu') readTuning()
        ui.popup = null
        break
      case 'explain':
        ui.popup = { kind: 'explain' }
        break
      case 'dial':
        ui.popup = { kind: 'dial' }
        break
      case 'materials':
        ui.popup = { kind: 'materials' }
        break
      case 'pick-card': {
        const id = Number(el.dataset.id)
        ui.pick = ui.pick?.kind === 'card' && ui.pick.id === id ? null : { kind: 'card', id }
        const c = run?.fight.hand.find((x) => x.id === id)
        if (c && ui.pick) sound.tap(makeRune(4_000_000 + id, { body: 'triangle', motes: c.channels[0].element === 'any' ? [] : [elementMote(c.channels[0].element)] }))
        break
      }
      case 'pick-recipe': {
        const key = el.dataset.key as Recipe['key']
        ui.pick = ui.pick?.kind === 'recipe' && ui.pick.key === key ? null : { kind: 'recipe', key }
        break
      }
      case 'go':
        if (run && ui.pick) apply(ui.pick.kind === 'card' ? playCard(run, ui.pick.id) : craft(run, ui.pick.key))
        break
      case 'wait':
        if (run) apply(wait(run))
        break
      case 'offer':
        ui.offer = ui.offer === Number(el.dataset.i) ? null : Number(el.dataset.i)
        break
      case 'look':
        ui.popup = { kind: 'card', id: Number(el.dataset.id) }
        break
      case 'add':
        if (run && ui.offer !== null) {
          ui.run = takeRune(run, ui.offer, Number(el.dataset.id))
          ui.offer = null
          sound.tap(makeRune(3_000_000, { body: 'circle', motes: [elementMote('earth')] }))
        }
        break
      case 'next':
        if (run) {
          ui.run = nextFight(run)
          ui.offer = null
          ui.pick = null
          sound.deal(ui.run.fight.hand.length)
        }
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
