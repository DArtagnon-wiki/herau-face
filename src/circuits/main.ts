// Alchemical Circuits: one screen. The dial, the materials and the hand are
// always in view and carry the state in pictures. A note beside them always
// explains what you are looking at, following what you pick, without covering
// anything; only the menu and the reading guide open over the game.

import '../ui/style.css'
import './circuits.css'
import { sound } from '../ui/sound'
import { elementMote, makeRune } from '../sim/deck'
import { circuitSvg, draftSvg, offerSvg, recipeSvg } from './circuit'
import { dialSvg, waitIcon, type DialPreview } from './dial'
import {
  COMMISSIONS,
  DEFAULT_SETTINGS,
  ELEMENTS,
  EXTRA_RUNE_PRICE,
  FORESIGHT_DRAW,
  GROUND_DRAIN,
  METAL_GATE,
  PHASE_NAMES,
  PRINCIPLES,
  RECIPES,
  STATUSES,
  UNIT_GATE,
  addRune,
  canAfford,
  catalystCard,
  costOf,
  craft,
  draftCard,
  draftPick,
  feedOf,
  fits,
  fromPool,
  newRun,
  nextFight,
  playCard,
  poolTotal,
  resolveIn,
  statusDef,
  takeRune,
  threatOf,
  upcoming,
  wait,
  type Card,
  type Channel,
  type DraftOutput,
  type Output,
  type Pool,
  type Principle,
  type Recipe,
  type RewardRune,
  type Run,
  type Settings,
} from './engine'
import { ELEMENT_COLOR, card as cardSig, discard as discardSig, element, ground, homunculus, icon, lead as leadSig, metal, moon, principle, quintessence, regain as regainSig, silver as silverSig, square, status as statusSig, ward } from './sigils'

// ---------------------------------------------------------------------------
// State

type Pick = { kind: 'card'; id: number } | { kind: 'recipe'; key: Recipe['key'] } | null
type Popup = { kind: 'legend' } | { kind: 'menu' } | null

const ui = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  run: null as Run | null,
  /** In a fight: the card or recipe picked to play. */
  pick: null as Pick,
  /** What the note explains when it is not the pick: the dial or the materials. */
  focus: null as 'dial' | 'materials' | null,
  popup: null as Popup,
  /** Between fights: the rune picked from the offer, the card it would go on, a card being read. */
  offer: null as number | null,
  target: null as number | null,
  look: null as number | null,
  flash: '',
  /** What the last action did, played once by the next render. */
  fx: null as { paid: number; flared: boolean } | null,
  /** In the draft: the option picked to read before taking it. */
  draft: null as number | null,
  /** In a fight: the card picked to discard for a card with a discard input. */
  discard: null as number | null,
}

const root = document.getElementById('app')!
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Time on the dial in words: a tick is a sixteenth of the moon. */
const EIGHTHS_WORDS = ['', 'an eighth', 'a quarter', 'three eighths', 'a half', 'five eighths', 'three quarters', 'seven eighths', 'a whole moon']
const ticks = (n: number) => (n % 2 === 0 && n <= 16 ? EIGHTHS_WORDS[n / 2] : n === 1 ? 'a sixteenth' : n === 3 ? 'three sixteenths' : `${n} sixteenths`)

function start() {
  ui.run = newRun(Date.now(), ui.settings)
  ui.pick = null
  ui.focus = null
  ui.popup = null
  ui.offer = ui.target = ui.look = null
  ui.draft = ui.discard = null
  ui.flash = ''
}

// ---------------------------------------------------------------------------
// Words, for the note

const PRINCIPLE_USE: Record<Principle, string> = {
  salt: 'Salt brews tinctures (Ward) and homunculi, and smelts with mercury into silver.',
  sulfur: 'Sulfur brews homunculi, and smelts into lead.',
  mercury: 'Mercury brews spirits (draw 2) and homunculi, and smelts with salt into silver.',
}
const sumCap = (c: Card) => c.channels.reduce((n, ch) => n + ch.capacity, 0)
const maxPurify = (c: Card) => sumCap(c) * (1 + c.gain)
const arcsWord = (n: number) => `${n} ${n === 1 ? 'arc' : 'arcs'}`

function inputWords(ch: Channel): string {
  switch (ch.element) {
    case 'any':
      return `up to ${ch.capacity} of whatever is most plentiful`
    case 'quintessence':
      return `${ch.capacity} for as much of your quintessence (the star; never your last)`
    case 'discard':
      return `${ch.capacity} for a card you discard from your hand (the struck card)`
    case 'moon':
      return `${ch.capacity} for an eighth more of the moon (the crescent inside)`
    default:
      return `up to ${ch.capacity} ${ch.element}`
  }
}

function statusWords(k: Output & { kind: 'status' }): string {
  const d = statusDef(k.status)
  return d.unit ? `${d.name} once it collects ${k.gate} or more (${arcsWord(k.gate)}): ${d.text}` : `${d.name} N, N for what it collects: ${d.text}`
}

function outputWords(o: Output): string {
  switch (o.kind) {
    case 'ward':
      return 'Ward 1 for each it collects (the shield)'
    case 'catalyst':
      return `the next card you play purifies ×${o.factor} (the card sign)`
    case 'principle':
      return `1 ${o.principle} once it collects ${o.gate} or more (${arcsWord(o.gate)})`
    case 'draw':
      return `draw a card once it collects ${o.gate} or more (the card with +1, ${arcsWord(o.gate)})`
    case 'regain':
      return `spare an eighth of the moon once it collects ${o.gate} or more (the turning arrow): your next cards spend it before the moon moves`
    case 'quintessence':
      return '1 quintessence for each it collects (the star)'
    case 'status':
      return statusWords(o)
  }
}

function cardLines(c: Card): string[] {
  const ins = c.channels.map(inputWords).join(' and ')
  const pool = c.channels.every((ch) => fromPool(ch.element))
  const verb = pool ? 'Takes' : 'Collects'
  return [
    c.purifies
      ? `${verb} ${ins} and purifies 1 for each${c.gain ? `, ×${1 + c.gain} through the ${c.gain === 1 ? 'square' : 'squares'} drawn around its square` : ''}.`
      : c.channels.some((ch) => fromPool(ch.element))
        ? `${verb} ${ins}, and grounds what it takes from the pool (the ground sign below), purifying nothing.`
        : `${verb} ${ins}.`,
    c.outputs.length ? `${cap(c.outputs.map(outputWords).join('; '))}.` : '',
    c.ground ? `${c.ground === 1 ? 'Its ground stage takes' : `Each of its ${c.ground} ground stages takes`} up to ${GROUND_DRAIN} of whatever is most plentiful (the star in the small circle below) and grounds it (the ground sign), purifying nothing.` : '',
  ].filter(Boolean)
}

function nowLine(run: Run, c: Card): string {
  const boost = run.fight.catalyst
  const r = resolveIn(run, c)
  if (!r.processed && !Object.values(r.drained).some(Boolean)) return `Now: nothing for it to collect${r.catalyst > 1 ? `, but the next card would purify ×${r.catalyst}` : ''}.`
  const got = PRINCIPLES.filter((p) => r.principles[p]).map((p) => `${r.principles[p]} ${p}`)
  const short = c.outputs.filter((o) => o.gate > 1 && r.processed > 0 && r.processed < o.gate).map((o) => `${o.gate - r.processed} short of ${o.kind === 'principle' ? o.principle : o.kind === 'status' ? statusDef(o.status).name : o.kind === 'regain' ? 'the spare eighth' : o.kind === 'draw' ? 'the draw' : o.kind}`)
  const mult = boost > 1 || (run.fight.status.expose || run.fight.status.volatile) ? ` (×${boost * (run.fight.status.expose ? 1.5 : 1) * (run.fight.status.volatile ? 2 : 1)} from ${[boost > 1 ? 'the catalyst' : '', run.fight.status.expose ? 'Expose' : '', run.fight.status.volatile ? 'Volatile' : ''].filter(Boolean).join(' and ')})` : ''
  const what = [
    r.paid ? `pays ${r.paid} quintessence` : '',
    r.discards ? `discards ${r.discards === 1 ? 'a card' : `${r.discards} cards`}` : '',
    `collects ${r.processed}${r.condensed ? ` (${r.condensed} from Condense)` : ''}`,
    c.purifies ? `purifies ${r.purification}${mult}` : poolTotal(r.drained) ? 'grounds what it takes' : '',
    r.catalyst > 1 ? `the next card ×${r.catalyst}` : '',
    got.length ? `yields ${got.join(' and ')}` : '',
    r.ward ? `Ward ${r.ward}` : '',
    r.gain ? `gains ${r.gain} quintessence` : '',
    r.draw ? `draws ${r.draw}` : '',
    r.regain ? 'spares an eighth' : '',
    ...Object.entries(r.statuses).map(([k, n]) => (statusDef(k as never).unit ? statusDef(k as never).name : `${statusDef(k as never).name} ${n}`)),
  ].filter(Boolean)
  return `Now: ${what.join(', ')}${short.length ? `; ${short.join(', ')}` : ''}.`
}

function runeTitle(r: RewardRune): string {
  switch (r.kind) {
    case 'channel':
      return r.element === 'any' ? `Input: ${r.capacity} of any` : `Input: ${r.capacity} ${r.element}`
    case 'gain':
      return 'Gain'
    case 'distill':
      return `Distil ${r.principle}`
    case 'ground':
      return 'Ground'
    case 'card':
      return 'Catalyst, a new card'
  }
}

function runeText(r: RewardRune): string {
  switch (r.kind) {
    case 'channel':
      return `A new triangle in the card's collecting stage: it also takes up to ${r.capacity} ${r.element === 'any' ? 'of whatever is most plentiful' : r.element}, and purifies 1 for each. More drained before the flare, and more toward its outputs' arcs.`
    case 'gain':
      return "A square drawn around the card's square: its purification is multiplied once more (×2, then ×3). It also takes a tick longer, a small crescent more of the moon."
    case 'distill':
      return `A new output on the right of the card, behind ${METAL_GATE} arcs: whenever it takes ${METAL_GATE} or more, it also yields 1 ${r.principle}. ${PRINCIPLE_USE[r.principle]}`
    case 'ground':
      return `A new stage on the card, a small circle hanging from it: it takes up to ${GROUND_DRAIN} of whatever is most plentiful (the six-pointed star with its ${GROUND_DRAIN}) and grounds it (the ground sign outside), purifying nothing. Less is left to flare.`
    case 'card':
      return 'A whole new card for your deck. It takes up to 2 of whatever is most plentiful and purifies 1 for each; whenever you play it, the next card you play purifies ×2 (the card sign). Little on its own, big before your strongest card.'
  }
}

/** What adding this rune to this card changes, in a sentence. */
function changeText(r: RewardRune, before: Card): string {
  const after = addRune(before, r)
  switch (r.kind) {
    case 'channel':
      return `${before.name} would take up to ${sumCap(after)} instead of ${sumCap(before)}, for up to ${maxPurify(after)} purification.`
    case 'gain':
      return `${before.name} would purify up to ${maxPurify(after)} instead of ${maxPurify(before)}, in ${ticks(costOf(after))} of the moon instead of ${ticks(costOf(before))}.`
    case 'distill':
      return `${before.name} would also yield 1 ${r.principle} whenever it takes ${METAL_GATE} or more${sumCap(before) < METAL_GATE ? `, but it can take only ${sumCap(before)} until it gets another input` : ''}.`
    case 'ground':
      return `${before.name} would get a ground stage${before.ground ? ', its second' : ''}: ${GROUND_DRAIN} more of anything drained each time you play it, purifying nothing.`
    case 'card':
      return 'The Catalyst joins your deck.'
  }
}

/** The next bulk feed, with any growth that comes with it. */
function nextFeed(run: Run): { phase: string; feed: Pool } | null {
  const f = run.fight
  const x = upcoming(f, 8).find((u) => u.feed)
  if (!x) return null
  return { phase: PHASE_NAMES[x.phase].toLowerCase(), feed: feedOf(f.commission, f.buffs + (x.buff ? 1 : 0)) }
}
const feedWords = (p: Pool) => ELEMENTS.filter((e) => p[e]).map((e) => `${p[e]} ${e}`).join(', ')

function situationNote(run: Run): [string, string] {
  const f = run.fight
  const up = upcoming(f, 8)
  const atk = up.find((x) => x.attack)
  const dis = up.find((x) => x.discard)
  const drw = up.find((x) => x.draw)
  const nf = nextFeed(run)
  const threat = threatOf(f)
  const title = atk ? `${PHASE_NAMES[atk.phase]} in ${ticks(atk.pos - f.dial)}` : 'The moon'
  const on = STATUSES.filter((d) => f.status[d.key] > 0)
  const lines = [
    atk ? `${f.commission.name} flares there${atk.rhythm ? '' : ', held back by a Stall'}: whatever is in the pool, less Ward (${threat} now, the red badge). The pool stays.` : '',
    dis && (!atk || dis.pos < atk.pos) ? `You discard your hand at the ${PHASE_NAMES[dis.phase].toLowerCase()}, before it.` : '',
    drw ? `You draw ${run.settings.hand} at the ${PHASE_NAMES[drw.phase].toLowerCase()}${nf ? `, when ${f.commission.name.toLowerCase()} feeds ${feedWords(nf.feed)}` : ''}.` : '',
    f.catalyst > 1 ? `The next card you play purifies ×${f.catalyst}.` : '',
    f.spare ? `You have ${ticks(f.spare)} of the moon spare: your next cards spend it before the moon moves.` : '',
    on.length ? `On: ${on.map((d) => (d.unit && d.cap === 1 ? d.name : `${d.name} ${f.status[d.key]}`)).join(', ')} (tap the materials to read them).` : '',
    'Pick a card to see what it would do.',
  ]
  return [title, lines.filter(Boolean).join(' ')]
}

function dialNote(run: Run): [string, string] {
  const f = run.fight
  const items = upcoming(f, 4).map((x) => {
    const fd = feedOf(f.commission, f.buffs + (x.buff ? 1 : 0))
    const what = [x.attack ? 'flare' : x.held ? 'its flare is held back' : '', x.buff ? 'it grows' : '', x.feed ? `it feeds ${feedWords(fd)}` : '', x.discard ? 'you discard' : '', x.draw ? `you draw ${run.settings.hand}` : ''].filter(Boolean)
    return `<b>${PHASE_NAMES[x.phase]}</b> (${ticks(x.pos - f.dial)}): ${what.length ? what.join(', ') : 'nothing'}`
  })
  return ['The moon', `${items.join('. ')}. Purified ${f.purified} of ${f.commission.require} (the inner ring).`]
}

function materialsNote(run: Run): [string, string] {
  const f = run.fight
  return [
    'Materials',
    `${STATUSES.filter((d) => f.status[d.key] > 0).map((d) => `<b>${d.name}${d.unit && d.cap === 1 ? '' : ` ${f.status[d.key]}`}</b>${d.on === 'commission' ? ` on ${esc(f.commission.name.toLowerCase())}` : ''}: ${d.text.replace(/\bN\b/g, String(f.status[d.key])).replace('you draw 2', `you draw ${FORESIGHT_DRAW * f.status[d.key]}`).replace('an eighth later', f.status[d.key] > 1 ? `${ticks(2 * f.status[d.key])} later` : 'an eighth later')}. `).join('')}${f.spare ? `<b>Spare time</b>: ${ticks(f.spare)}, spent by your next cards before the moon moves. ` : ''}Cards yield principles from their outputs. ${PRINCIPLE_USE.salt} ${PRINCIPLE_USE.mercury} After a commission what is left smelts into metal: silver from 2 mercury and a salt (worth 3), lead from any two (worth 1). Metal buys extra runes.${f.ward ? ` Ward ${f.ward} catches the next flare first.` : ''}${f.homunculi ? ` Your homunculus purifies ${2 * f.homunculi} at every phase.` : ''}`,
  ]
}

function recipeNote(run: Run, r: Recipe): [string, string] {
  const cost = PRINCIPLES.filter((p) => r.cost[p]).map((p) => `${r.cost[p]} ${p}`).join(', ')
  return [r.name, `${r.effect}. Takes ${cost}${r.time ? ` and ${ticks(r.time)} of the moon` : ', and no time'}.${canAfford(run.fight, r) ? '' : ' <span class="now">You need more principles first.</span>'}`]
}

function noteView(title: string, body: string, art = ''): string {
  return `<section class="note" aria-live="polite">${art ? `<div class="note-art">${art}</div>` : ''}<p><b class="note-title">${esc(title)}</b> ${body}</p></section>`
}

function fightNote(run: Run): string {
  const p = ui.pick
  if (ui.focus === 'dial') return noteView(...dialNote(run))
  if (ui.focus === 'materials') return noteView(...materialsNote(run))
  if (p?.kind === 'recipe') return noteView(...recipeNote(run, RECIPES.find((x) => x.key === p.key)!))
  const c = p?.kind === 'card' ? run.fight.hand.find((x) => x.id === p.id) : null
  if (c) {
    const target = ui.discard !== null ? run.fight.hand.find((x) => x.id === ui.discard) : null
    const ask = needsTarget(run, c) ? (target ? ` It will discard ${esc(target.name)}; tap another card to change that.` : ' Tap another card in your hand to discard it for this one.') : ''
    return noteView(`${c.name}, ${ticks(costOf(c))}`, `${cardLines(c).join(' ')} <span class="now">${esc(nowLine(run, c))}${ask}</span>`)
  }
  return noteView(...situationNote(run))
}

function legendRow(svg: string, text: string): string {
  return `<li>${svg}<span>${text}</span></li>`
}

function legendText(): string {
  const I = (m: string) => icon(m, 26)
  return `<ul class="legend">
    ${legendRow(I(`<circle r="9" fill="none" stroke="var(--line)" stroke-width="1.5"/>`), 'A circle is a stage. Inside are its inputs, each with a lead to the rim; outside, its outputs and links to other stages.')}
    ${legendRow(I(moon(0, 0, 8, { stroke: 'var(--moon)' })), 'A crescent is time: an eighth of the moon each, a small one for a sixteenth.')}
    ${legendRow(I(element('water', -4, 0, 6.5, { stroke: ELEMENT_COLOR.water }) + element('fire', 5, 1, 6.5, { stroke: ELEMENT_COLOR.fire })), 'A triangle is an element taken from the pool, with the most it takes. Fire and air point up, water and earth down; air and earth are barred; the six-pointed star takes any.')}
    ${legendRow(I(square(0, 0, 9, { stroke: 'var(--lit)' }) + square(0, 0, 5, { stroke: 'var(--lit)' })), 'A square is purification: progress against the commission. Each square drawn around it multiplies it once more.')}
    ${legendRow(I(`<path d="M-5 -9A11 11 0 0 1 -5 9M-1 -10A13 13 0 0 1 -1 10M3 -11A15 15 0 0 1 3 11" fill="none" stroke="var(--lit)" stroke-width="1.4" stroke-linecap="round"/>`), 'Arcs across a line are what it needs. One arc on a link: the stage before must run. Several on an output: the stage must take at least that many. They light up as the pool fills.')}
    ${legendRow(I(principle('salt', -6, 0, 6, { stroke: 'var(--lit)' }) + principle('mercury', 6, 0, 6, { stroke: 'var(--lit)' })), 'Salt, sulfur and mercury: the principles a card yields from its outputs. They brew recipes and smelt into metal.')}
    ${legendRow(I(ward(0, 0, 9, { stroke: 'var(--lit)' })), 'A shield is Ward: it catches the next flare. A shield on a card raises Ward, 1 for each it takes.')}
    ${legendRow(I(ground(0, -1, 8, { stroke: 'var(--lit)' })), `A ground sign is an output that grounds what its stage took, purifying nothing. A ground stage takes ${GROUND_DRAIN} of whatever is most plentiful.`)}
    ${legendRow(I(metal(0, 0, 8, { stroke: 'var(--lit)' })), 'Metal, counted by worth: what is left after a commission smelts into silver and lead. It buys extra runes.')}
    ${legendRow(I(homunculus(0, 0, 9, { stroke: 'var(--lit)' })), 'A homunculus purifies on its own at every phase.')}
    ${legendRow(I(cardSig(-3, 0, 7, { stroke: 'var(--lit)' }) + '<text x="6" y="5" font-size="9" fill="var(--ink)" class="sig-num">×2</text>'), 'A card sign with ×2 is a catalyst: when this card is played, the next card you play purifies twice over. With +1 it draws a card.')}
    ${legendRow(I(quintessence(-5, 0, 6, { stroke: 'var(--glass)' }) + discardSig(6, 0, 6, { stroke: 'var(--ink-soft)' })), 'Inputs that feed a stage from elsewhere: a star pays your quintessence, a struck card discards one from your hand, a crescent inside takes an eighth more of the moon. Each collects its number.')}
    ${legendRow(I(regainSig(0, 0, 8, { stroke: 'var(--lit)' })), 'A turning arrow round a crescent spares an eighth of the moon: your next cards spend it before the moon moves. A star outside a stage gains quintessence.')}
    ${legendRow(I(statusSig('settle', -5, 0, 5.5, { stroke: 'var(--lit)' }) + statusSig('stall', 6, 0, 5.5, { stroke: 'var(--lit)' })), `Status signs put a status on the commission or on you: ${STATUSES.map((d) => d.name).join(', ')}. Most take N from what the stage collects; the rest need ${UNIT_GATE}.`)}
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
  return `<button class="mats ${ui.focus === 'materials' ? 'is-on' : ''}" data-act="materials" aria-label="Materials">
    ${PRINCIPLES.map((p) => chip(icon(principle(p, 0, 0, 9, { stroke: color[p], width: 1.6 }), 20), f.principles[p], p)).join('')}
    ${chip(icon(metal(0, 0, 8, { stroke: 'var(--gilt)', width: 1.6 }), 20), run.metals, 'metal')}
    ${chip(icon(ward(0, 0, 9, { stroke: 'var(--glass)', width: 1.6 }), 20), f.ward, 'Ward', !f.ward)}
    ${chip(icon(homunculus(0, 0, 10, { stroke: 'var(--good)', width: 1.5 }), 20), f.homunculi, 'homunculi', !f.homunculi)}
    ${f.catalyst > 1 ? `<span class="chip" aria-label="Next card purifies times ${f.catalyst}">${icon(cardSig(0, 0, 8, { stroke: 'var(--lit)', width: 1.5 }), 20)}<b class="num">×${f.catalyst}</b></span>` : ''}
    ${f.spare ? `<span class="chip" aria-label="Spare time ${f.spare} sixteenths">${icon(regainSig(0, 0, 8, { stroke: 'var(--moon)', width: 1.5 }), 20)}<b class="num">${f.spare / 2}</b></span>` : ''}
    ${STATUSES.filter((d) => f.status[d.key] > 0).map((d) => `<span class="chip status ${d.on}" aria-label="${d.name} ${f.status[d.key]}">${icon(statusSig(d.key, 0, 0, 8, { stroke: d.on === 'commission' ? 'var(--fire)' : 'var(--good)', width: 1.5 }), 20)}${d.unit && d.cap === 1 ? '' : `<b class="num">${f.status[d.key]}</b>`}</span>`).join('')}
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
  if (!f.hand.length) return `<section class="hand-row empty"><p>No cards in hand until the next new or full moon.</p></section>`
  return `<section class="hand-row" aria-label="Hand">${f.hand
    .map((c) => {
      const live = resolveIn(run, c)
      const on = ui.pick?.kind === 'card' && ui.pick.id === c.id
      const thrown = ui.discard === c.id && !on
      const idle = !live.processed && !Object.values(live.drained).some(Boolean)
      return `<button class="ccard ${on ? 'is-on' : ''} ${idle ? 'idle' : ''} ${thrown ? 'thrown' : ''}" data-act="pick-card" data-id="${c.id}" aria-pressed="${on}" aria-label="${esc(c.name)}${thrown ? ', to be discarded' : ''}: would purify ${live.purification}">${circuitSvg(c, { live, size: 120 })}<span class="cname">${thrown ? `${icon(discardSig(0, 0, 7, { stroke: 'var(--warn)', width: 1.5 }), 13)} ` : ''}${esc(c.name)}</span></button>`
    })
    .join('')}</section>`
}

/** Whether this card, picked, waits for a card to discard: it has a discard input and there is another card to throw. */
const needsTarget = (run: Run, c: Card) => c.channels.some((ch) => ch.element === 'discard') && run.fight.hand.length > 1

/** The picked move, run through the engine for the dial's ghost. */
function pickedResult(run: Run): Run | null {
  const p = ui.pick
  if (!p) return null
  try {
    if (p.kind === 'card') {
      const c = run.fight.hand.find((x) => x.id === p.id)
      if (!c || (needsTarget(run, c) && ui.discard === null)) return null
      return playCard(run, p.id, ui.discard ?? undefined)
    }
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
  const drain = c ? resolveIn(run, c).drained : { water: 0, earth: 0, air: 0, fire: 0 }
  if (after.fightIndex !== run.fightIndex || after.stage === 'reward' || after.stage === 'won') {
    return { dial: run.fight.dial, purified: run.fight.commission.require, drain, flares: [] }
  }
  return { dial: after.fight.dial, purified: after.fight.purified, drain, flares: after.fight.flares.slice(run.fight.flares.length) }
}

function actions(run: Run, after: Run | null): string {
  const p = ui.pick
  const r = p?.kind === 'recipe' ? RECIPES.find((x) => x.key === p.key)! : null
  const c = p?.kind === 'card' ? run.fight.hand.find((x) => x.id === p.id) : null
  const label = r ? 'Brew' : c ? (needsTarget(run, c) && ui.discard === null ? 'Pick a card to discard' : 'Play') : 'Pick a card'
  const finishes = after && (after.stage === 'reward' || after.stage === 'won')
  const flares = after && after.fightIndex === run.fightIndex ? after.fight.flares.length - run.fight.flares.length : 0
  const cost = after && after.fightIndex === run.fightIndex ? run.quintessence - after.quintessence : 0
  return `<div class="cx-actions">
    <button class="wait" data-act="wait" aria-label="Wait an eighth of the moon">${waitIcon()}<span>Wait</span></button>
    <button class="primary go" data-act="go" ${after ? '' : 'disabled'}>${label}${finishes ? ' · done' : flares ? ` · <span class="warn-on-gold">flare −${cost}</span>` : ''}</button>
  </div>`
}

function popupView(run: Run | null): string {
  const p = ui.popup
  if (!p) return ''
  let title = ''
  let body = ''
  if (p.kind === 'legend') {
    title = 'Reading a circuit'
    body = legendText()
  } else if (p.kind === 'menu') {
    title = 'Alchemical Circuits'
    const s = ui.settings
    const opt = (v: string, cur: string, label: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
    body = `<div class="pop-actions"><button data-act="legend">Reading a circuit</button><button data-act="restart">Start again</button></div>
      ${run ? `<p class="label">What happened</p><ol class="pop-list log">${run.fight.log.slice(0, 10).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}
      <p class="label">Tuning, on restart</p>
      <div class="tune"><label>Drawn at new and full moons <select id="c-hand">${[3, 4, 5].map((v) => opt(String(v), String(s.hand), String(v))).join('')}</select></label>
      <label>Quintessence <select id="c-stock">${[30, 40, 60, 80].map((v) => opt(String(v), String(s.stock), String(v))).join('')}</select></label></div>`
  }
  if (!title) return ''
  return `<div class="pop-veil" data-act="close"></div>
  <section class="pop" role="dialog" aria-label="${esc(title)}">
    <div class="pop-head"><h2>${esc(title)}</h2><button class="close" data-act="close" aria-label="Close">×</button></div>
    <div class="pop-body">${body}</div>
  </section>`
}

function fightView(run: Run): string {
  const after = pickedResult(run)
  const preview = previewOf(run, after)
  return `<div class="cx fight">
    ${header(run, run.fight.commission.name)}
    <button class="dial-box ${ui.focus === 'dial' ? 'is-on' : ''}" data-act="dial" aria-label="The moon: what comes next">${dialSvg(run.fight, nextFeed(run)?.feed ?? feedOf(run.fight.commission, run.fight.buffs), preview, !!ui.fx?.flared)}</button>
    ${fightNote(run)}
    <div class="bench">${materials(run)}${recipes(run)}</div>
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    ${hand(run)}
    ${actions(run, after)}
  </div>${popupView(run)}`
}

function rewardNote(run: Run): string {
  const r = ui.offer !== null ? run.offer[ui.offer] : null
  const target = ui.target !== null ? run.deck.find((c) => c.id === ui.target) : null
  if (r?.kind === 'card') return noteView(runeTitle(r), esc(runeText(r)), circuitSvg(catalystCard(0), { size: 84 }))
  if (r && target) {
    const art = `${circuitSvg(target, { size: 84 })}<span class="arrow" aria-hidden="true">→</span>${circuitSvg(addRune(target, r), { size: 84 })}`
    return noteView(`${runeTitle(r)} on ${target.name}`, `${esc(changeText(r, target))}`, art)
  }
  if (r) return noteView(runeTitle(r), `${esc(runeText(r))} The cards it fits are lit; tap one to see it before and after.`)
  const look = ui.look !== null ? run.deck.find((c) => c.id === ui.look) : null
  if (look) return noteView(`${look.name}, ${ticks(costOf(look))}`, cardLines(look).join(' '))
  const s = run.smelted
  return noteView(
    'Between commissions',
    `${s?.value ? `What was left smelted into ${[s.silver ? `${s.silver} silver` : '', s.lead ? `${s.lead} lead` : ''].filter(Boolean).join(' and ')}, worth ${s.value}. ` : ''}Pick a rune on offer to read what it does, then a card to put it on. The first is free; each more costs ${EXTRA_RUNE_PRICE} metal. Tap a card in your deck to read it.`,
  )
}

function rewardView(run: Run): string {
  const s = run.smelted
  const sel = ui.offer !== null ? run.offer[ui.offer] : null
  const price = run.tookFree ? EXTRA_RUNE_PRICE : 0
  const canTake = price <= run.metals
  const offerTile = (i: number) => {
    const r = run.offer[i]
    const art = r.kind === 'card' ? circuitSvg(catalystCard(0), { size: 54 }) : offerSvg(r, 48)
    return `<button class="offer ${ui.offer === i ? 'is-on' : ''}" data-act="offer" data-i="${i}" ${canTake ? '' : 'disabled'} aria-pressed="${ui.offer === i}" aria-label="${esc(runeTitle(r))}">${art}<span class="price">${price ? `${icon(metal(0, 0, 7, { stroke: 'var(--gilt)' }), 14)}${price}` : 'free'}</span></button>`
  }
  const target = ui.target !== null ? run.deck.find((c) => c.id === ui.target) : null
  return `<div class="cx reward">
    ${header(run, `${run.fight.commission.name}, purified`)}
    <section class="smelt" aria-label="Smelted">
      ${s?.silver ? `<span class="chip">${icon(silverIcon(), 22)}<b class="num">${s.silver}</b></span>` : ''}
      ${s?.lead ? `<span class="chip">${icon(leadIcon(), 22)}<b class="num">${s.lead}</b></span>` : ''}
      <span class="chip total">${icon(metal(0, 0, 8, { stroke: 'var(--gilt)', width: 1.6 }), 22)}<b class="num">${run.metals}</b>${s?.value ? `<span class="gain num">+${s.value}</span>` : ''}</span>
    </section>
    <section class="offers" aria-label="Runes on offer">${run.offer.map((_, i) => offerTile(i)).join('') || '<p class="fine">Nothing left on offer.</p>'}</section>
    ${rewardNote(run)}
    <section class="deck" aria-label="Your deck">${run.deck
      .map((c) => {
        const ok = sel && sel.kind !== 'card' ? fits(sel, c) : true
        const on = sel ? ui.target === c.id : ui.look === c.id
        return `<button class="ccard ${sel && ok ? 'fits' : ''} ${on ? 'is-on' : ''}" data-act="deck-card" data-id="${c.id}" ${ok ? '' : 'disabled'} aria-pressed="${on}" aria-label="${esc(c.name)}">${circuitSvg(c, { size: 110 })}<span class="cname">${esc(c.name)}</span></button>`
      })
      .join('')}</section>
    <div class="cx-actions">
      <button data-act="next">On to ${esc(COMMISSIONS[run.fightIndex + 1].name)}</button>
      <button class="primary go" data-act="add" ${sel && (target || sel.kind === 'card') && canTake ? '' : 'disabled'}>${sel?.kind === 'card' ? `Add to deck · ${price ? `${price} metal` : 'free'}` : sel && target ? `Add to ${esc(target.name)} · ${price ? `${price} metal` : 'free'}` : sel ? 'Pick a card' : 'Pick a rune'}</button>
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
      <p>${won ? `All ${COMMISSIONS.length} commissions purified, with ${run.quintessence} quintessence and ${run.metals} metal left.` : `${esc(run.fight.commission.name)} wore you down at ${run.fight.purified} of ${run.fight.commission.require} purified.`}</p>
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
    <div class="cx-actions">
      <button data-act="legend">Reading a circuit</button>
      <button class="primary go" data-act="restart">Begin</button>
    </div>
  </div>${popupView(null)}`
}

function draftOutputTitle(o: DraftOutput): string {
  switch (o.kind) {
    case 'purify':
      return 'Output: purify'
    case 'ground':
      return 'Output: a ground stage'
    case 'ward':
      return 'Output: Ward'
    case 'catalyst':
      return 'Output: catalyst'
    case 'draw':
      return 'Output: draw a card'
    case 'regain':
      return 'Output: spare an eighth'
    case 'quintessence':
      return 'Output: quintessence'
    case 'status':
      return `Output: ${statusDef(o.status).name}`
    case 'principle':
      return `Output: ${o.principle}`
  }
}

function draftOutputText(o: DraftOutput): string {
  if (o.kind === 'purify') return 'A square below the stage: it purifies 1 for each it collects. Gain runes in the shop multiply it.'
  if (o.kind === 'ground') return `A ground stage hanging from the card: it takes up to ${GROUND_DRAIN} of whatever is most plentiful and grounds it, purifying nothing. What the input takes from the pool is grounded too.`
  return `${cap(outputWords(o))}.`
}

function inputTitle(ch: Channel): string {
  return ch.element === 'any' ? `Input: ${ch.capacity} of any` : ch.element === 'quintessence' ? `Input: ${ch.capacity} quintessence` : ch.element === 'discard' ? 'Input: a discard' : ch.element === 'moon' ? 'Input: an eighth of the moon' : `Input: ${ch.capacity} ${ch.element}`
}

function inputText(ch: Channel): string {
  if (fromPool(ch.element)) return `It takes ${inputWords(ch)} from the pool: whatever it takes counts toward its outputs, and is gone from what flares.`
  if (ch.element === 'quintessence') return `It pays ${ch.capacity} of your quintessence (never your last) and collects ${ch.capacity}, whatever is in the pool.`
  if (ch.element === 'discard') return `It discards another card from your hand, your choice, and collects ${ch.capacity}. Cheap at a quarter moon, when you would discard anyway.`
  return `The card takes an eighth more of the moon, a quarter in all, and collects ${ch.capacity}.`
}

/** The drafted rune so far, without a main output until one is picked. */
function draftSoFar(input: Channel, output: DraftOutput | null, p: Principle): Card {
  return output ? draftCard(0, input, output, p) : { id: 0, name: 'Opus', channels: [input], outputs: [{ kind: 'principle', principle: p, gate: 1 }], purifies: false, gain: 0, time: 2, ground: 0 }
}

function draftView(run: Run): string {
  const d = run.draft!
  const step = d.input ? 'output' : 'input'
  const sel = ui.draft
  const tile = (i: number) => {
    const art = step === 'input' ? draftSvg({ input: d.inputs[i] }, 52) : draftSvg({ output: d.outputs[i] }, 52)
    const title = step === 'input' ? inputTitle(d.inputs[i]) : draftOutputTitle(d.outputs[i])
    return `<button class="offer ${sel === i ? 'is-on' : ''}" data-act="draft-opt" data-i="${i}" aria-pressed="${sel === i}" aria-label="${esc(title)}">${art}<span class="price">${esc(title.replace(/^(Input|Output): /, ''))}</span></button>`
  }
  const input = d.input ?? (sel !== null ? d.inputs[sel] : null)
  const output = d.input && sel !== null ? d.outputs[sel] : null
  const opus = input ? draftSoFar(input, output, d.principle) : null
  const note =
    sel === null
      ? noteView(
          step === 'input' ? 'Your twelfth rune' : 'Now its output',
          step === 'input'
            ? `Draft one more rune for your deck. First pick one of three inputs, what it collects; then one of three outputs. It also yields ${d.principle} once it collects 1 (the single arc).`
            : `It collects through ${esc(inputWords(d.input!))}. Pick one of three outputs.`,
        )
      : step === 'input'
        ? noteView(inputTitle(d.inputs[sel]), esc(inputText(d.inputs[sel])))
        : noteView(draftOutputTitle(d.outputs[sel]), esc(draftOutputText(d.outputs[sel])))
  return `<div class="cx reward draft">
    ${header(run, 'Draft')}
    <section class="offers" aria-label="${step === 'input' ? 'Inputs' : 'Outputs'} on offer">${[0, 1, 2].map(tile).join('')}</section>
    ${note}
    ${opus ? `<section class="opus" aria-label="Your twelfth rune">${circuitSvg(opus, { size: 150, noMain: !output })}<span class="cname">Opus</span></section>` : ''}
    <section class="deck" aria-label="Your deck">${run.deck.map((c) => `<div class="ccard">${circuitSvg(c, { size: 80 })}<span class="cname">${esc(c.name)}</span></div>`).join('')}</section>
    <div class="cx-actions one"><button class="primary go" data-act="draft-take" ${sel === null ? 'disabled' : ''}>${sel === null ? `Pick an ${step}` : step === 'input' ? 'Take this input' : 'Take this output · begin'}</button></div>
  </div>${popupView(run)}`
}

function render() {
  const run = ui.run
  root.innerHTML = !run ? startView() : run.stage === 'draft' ? draftView(run) : run.stage === 'fight' ? fightView(run) : run.stage === 'reward' ? rewardView(run) : endView(run)
  ui.fx = null
}

// ---------------------------------------------------------------------------
// Events

function readTuning() {
  const hand = (document.getElementById('c-hand') as HTMLSelectElement | null)?.value
  if (hand) ui.settings.hand = Number(hand)
  const stock = (document.getElementById('c-stock') as HTMLSelectElement | null)?.value
  if (stock) ui.settings.stock = Number(stock)
}

function apply(next: Run) {
  const before = ui.run!
  const flaresBefore = before.fight.flares.length
  ui.run = next
  ui.pick = null
  ui.discard = null
  ui.focus = null
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

root.addEventListener('click', (ev) => {
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
      case 'dial':
        ui.focus = ui.focus === 'dial' ? null : 'dial'
        break
      case 'materials':
        ui.focus = ui.focus === 'materials' ? null : 'materials'
        break
      case 'pick-card': {
        const id = Number(el.dataset.id)
        ui.focus = null
        const picked = ui.pick?.kind === 'card' && run ? run.fight.hand.find((x) => x.id === (ui.pick as { id: number }).id) : null
        // With a card that discards picked, tapping another card marks it to throw away.
        if (run && picked && picked.id !== id && needsTarget(run, picked)) {
          ui.discard = ui.discard === id ? null : id
          break
        }
        ui.pick = ui.pick?.kind === 'card' && ui.pick.id === id ? null : { kind: 'card', id }
        ui.discard = null
        const c = run?.fight.hand.find((x) => x.id === id)
        const src = c?.channels[0].element
        if (c && ui.pick) sound.tap(makeRune(4_000_000 + id, { body: 'triangle', motes: src && fromPool(src) && src !== 'any' ? [elementMote(src)] : [] }))
        break
      }
      case 'draft-opt': {
        const i = Number(el.dataset.i)
        ui.draft = ui.draft === i ? null : i
        break
      }
      case 'draft-take':
        if (run && ui.draft !== null) {
          ui.run = draftPick(run, ui.draft)
          ui.draft = null
          sound.tap(makeRune(3_000_000, { body: 'circle', motes: [elementMote('earth')] }))
          if (ui.run.stage === 'fight') setTimeout(() => sound.deal(ui.run!.fight.hand.length), 300)
        }
        break
      case 'pick-recipe': {
        const key = el.dataset.key as Recipe['key']
        ui.focus = null
        ui.discard = null
        ui.pick = ui.pick?.kind === 'recipe' && ui.pick.key === key ? null : { kind: 'recipe', key }
        break
      }
      case 'go':
        if (run && ui.pick) apply(ui.pick.kind === 'card' ? playCard(run, ui.pick.id, ui.discard ?? undefined) : craft(run, ui.pick.key))
        break
      case 'wait':
        if (run) apply(wait(run))
        break
      case 'offer': {
        const i = Number(el.dataset.i)
        ui.offer = ui.offer === i ? null : i
        ui.look = null
        const r = ui.offer !== null && run ? run.offer[ui.offer] : null
        const t = ui.target !== null && run ? run.deck.find((c) => c.id === ui.target) : null
        if (!r || !t || !fits(r, t)) ui.target = null
        break
      }
      case 'deck-card': {
        const id = Number(el.dataset.id)
        if (ui.offer !== null && run?.offer[ui.offer]?.kind !== 'card') ui.target = ui.target === id ? null : id
        else {
          ui.offer = null
          ui.look = ui.look === id ? null : id
        }
        break
      }
      case 'add':
        if (run && ui.offer !== null && run.offer[ui.offer]?.kind === 'card') {
          ui.run = takeRune(run, ui.offer)
          ui.look = ui.run.deck[ui.run.deck.length - 1].id
          ui.offer = ui.target = null
          sound.tap(makeRune(3_000_000, { body: 'circle', motes: [elementMote('earth')] }))
        } else if (run && ui.offer !== null && ui.target !== null) {
          ui.run = takeRune(run, ui.offer, ui.target)
          ui.look = ui.target
          ui.offer = ui.target = null
          sound.tap(makeRune(3_000_000, { body: 'circle', motes: [elementMote('earth')] }))
        }
        break
      case 'next':
        if (run) {
          ui.run = nextFight(run)
          ui.offer = ui.target = ui.look = null
          ui.pick = null
          ui.focus = null
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
