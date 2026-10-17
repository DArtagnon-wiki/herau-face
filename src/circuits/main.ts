import '../ui/style.css'
import './circuits.css'
import { sound } from '../ui/sound'
import { runeSvg } from '../ui/draw'
import { elementMote, makeRune } from '../sim/deck'
import { cardSigil, cardSvg, dialSvg, elementVar, poolBars, principleSvg } from './draw'
import {
  COMMISSIONS,
  DEFAULT_SETTINGS,
  ELEMENTS,
  EXTRA_RUNE_PRICE,
  PHASE_NAMES,
  PRINCIPLES,
  RECIPES,
  canAfford,
  cardWords,
  costOf,
  craft,
  feedOf,
  fits,
  newRun,
  nextFight,
  phaseAt,
  playCard,
  poolTotal,
  resolveCard,
  runeWords,
  takeRune,
  upcoming,
  wait,
  type Card,
  type Recipe,
  type RewardRune,
  type Run,
  type Settings,
} from './engine'

// ---------------------------------------------------------------------------
// State

const ui = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  run: null as Run | null,
  /** The card picked in hand, to preview before playing. */
  selected: null as number | null,
  /** Between fights: the rune picked from the offer. */
  offer: null as number | null,
  /** What the last action did, said once. */
  flash: '',
  open: new Set<string>(),
}

const root = document.getElementById('app')!
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const eighths = (n: number) => (n % 2 === 0 ? (n === 2 ? 'a quarter' : n === 4 ? 'a half' : `${n / 2} quarters`) : n === 1 ? 'an eighth' : `${n} eighths`)

function start() {
  ui.run = newRun(Date.now(), ui.settings)
  ui.selected = null
  ui.offer = null
  ui.flash = ''
  sound.deal(ui.run.fight.hand.length)
}

// ---------------------------------------------------------------------------
// Views

const principlesLine = (p: Partial<Record<'salt' | 'sulfur' | 'mercury', number>>, zero = false) =>
  PRINCIPLES.filter((k) => zero || (p[k] ?? 0) > 0)
    .map((k) => `<span class="pr pr-${k}">${principleSvg(k, 15)}<span class="num">${p[k] ?? 0}</span></span>`)
    .join('')

function header(run: Run): string {
  const qPct = Math.max(0, Math.min(100, (run.quintessence / run.settings.stock) * 100))
  return `<header class="top">
    <div>
      <p class="eyebrow">Circuits · commission ${run.fightIndex + 1} of ${COMMISSIONS.length}</p>
      <h1 class="title">${esc(run.fight.commission.name)}</h1>
    </div>
    <div class="top-tools">
      <button class="jump sound-toggle" data-act="sound" aria-pressed="${sound.enabled}">${sound.enabled ? 'Sound' : 'Muted'}</button>
    </div>
    <div class="quint" aria-label="Quintessence ${run.quintessence} of ${run.settings.stock}">
      <span class="label">Quintessence</span>
      <span class="num quint-num">${run.quintessence}</span>
      <span class="quint-bar"><span style="width:${qPct}%"></span></span>
    </div>
  </header>`
}

function dialPanel(run: Run): string {
  const f = run.fight
  const next = upcoming(f, 4)
  const attack = next.find((x) => x.attack)
  const flare = poolTotal(f.pool)
  const items = next
    .map((x) => {
      const what = [x.attack ? `<b class="warn">${esc(f.commission.name)} flares the pool</b>` : '', x.buff ? 'it grows' : '', x.draw ? `you ${run.settings.draw === 'refill' ? `refill to ${run.settings.hand}` : `draw ${run.settings.hand}`}` : '', 'it feeds']
        .filter(Boolean)
        .join(', ')
      return `<li><span class="when num">${eighths(x.pos - f.dial)}</span> <span class="phase-name">${PHASE_NAMES[x.phase]}</span>: ${what}</li>`
    })
    .join('')
  return `<section class="panel dial-panel">
    <div class="dial-wrap">${dialSvg(f)}</div>
    <div class="dial-side">
      <p class="label">The pool</p>
      <div class="pool">${poolBars(f.pool, feedOf(f.commission, f.buffs))}</div>
      <p class="fine">Bars are instability waiting; the small numbers are what it feeds each quarter.</p>
      ${attack ? `<p class="threat">${flare ? `<b class="num">${flare}</b> would flare` : 'Nothing would flare'} at the ${PHASE_NAMES[attack.phase].toLowerCase()}, in ${eighths(attack.pos - f.dial)}${f.ward ? `; Ward ${f.ward} takes the first of it` : ''}.</p>` : ''}
      <ol class="coming">${items}</ol>
    </div>
  </section>`
}

function workbench(run: Run): string {
  const f = run.fight
  const recipes = RECIPES.map((r) => {
    const can = canAfford(f, r)
    return `<button class="recipe" data-act="craft" data-key="${r.key}" ${can ? '' : 'disabled'}>
      <span class="r-name">${r.name}</span>
      <span class="r-cost">${principlesLine(r.cost)} <span class="r-time">· ${eighths(r.time)}</span></span>
      <span class="r-effect">${esc(r.effect)}</span>
    </button>`
  }).join('')
  const helpers = [f.homunculi ? `Homunculus ×${f.homunculi}: purifies ${2 * f.homunculi} a quarter` : '', f.ward ? `Ward ${f.ward}` : ''].filter(Boolean)
  return `<section class="panel bench">
    <div class="bench-head"><p class="label">Principles</p><div class="principles">${principlesLine(f.principles, true)}</div></div>
    ${helpers.length ? `<p class="helpers">${helpers.join(' · ')}</p>` : ''}
    <div class="recipes">${recipes}</div>
  </section>`
}

function cardView(run: Run, c: Card, opts: { act: string; on?: boolean; live?: boolean; disabled?: boolean }): string {
  const r = opts.live ? resolveCard(c, run.fight.pool) : null
  const main = c.channels[0]?.element
  const color = main && main !== 'any' ? elementVar(main) : 'var(--gilt)'
  const now = r
    ? r.purification
      ? `<span class="cnow">Now: purifies <b class="num">${r.purification}</b> ${principlesLine(r.principles)}</span>`
      : `<span class="cnow idle">Now: nothing to take</span>`
    : ''
  return `<button class="ccard ${opts.on ? 'is-on' : ''} ${r && !r.purification ? 'idle' : ''}" data-act="${opts.act}" data-id="${c.id}" style="--c:${color}" ${opts.disabled ? 'disabled' : ''} aria-pressed="${!!opts.on}">
    <span class="ccost num" title="Time on the dial">${eighths(costOf(c))}</span>
    ${cardSvg(c, 84)}
    <span class="cname">${esc(c.name)}</span>
    <span class="cwords">${esc(cardWords(c))}</span>
    ${now}
  </button>`
}

/** What an action would do, from the engine itself. */
function previewOf(run: Run, after: Run): string {
  const f0 = run.fight
  const f1 = after.fight
  const same = after.fightIndex === run.fightIndex && after.stage !== 'reward' && after.stage !== 'won'
  if (!same && after.stage !== 'lost') return `<p class="after win">This finishes ${esc(f0.commission.name)}.</p>`
  const flares = f1.flares.slice(f0.flares.length)
  const paid = run.quintessence - after.quintessence
  const lines = [
    `Purified <b class="num">${f0.purified} → ${f1.purified}</b> of ${f0.commission.require}.`,
    `The dial moves ${eighths(f1.dial - f0.dial)}${phaseAt(f1.dial) ? `, to the ${PHASE_NAMES[phaseAt(f1.dial)!].toLowerCase()}` : ', between phases'}.`,
    flares.length ? `<span class="warn">${esc(f0.commission.name)} flares ${flares.join(' and ')}${paid ? `: you pay ${paid}` : ', all caught by Ward'}.</span>` : '',
    `Pool after: ${ELEMENTS.filter((e) => f1.pool[e]).map((e) => `${f1.pool[e]} ${e}`).join(', ') || 'empty'}.`,
    after.stage === 'lost' ? '<b class="warn">Your quintessence runs out.</b>' : '',
  ]
  return lines.filter(Boolean).map((l) => `<p>${l}</p>`).join('')
}

function handView(run: Run): string {
  const f = run.fight
  const sel = f.hand.find((c) => c.id === ui.selected)
  const preview = sel ? `<div class="preview panel"><p class="label">${esc(sel.name)}</p>${previewOf(run, playCard(run, sel.id))}</div>` : ''
  return `${preview}<section class="chand" aria-label="Hand">${f.hand.map((c) => cardView(run, c, { act: 'card', on: c.id === ui.selected, live: true })).join('') || '<p class="fine">No cards in hand. Wait for the next new or full moon.</p>'}</section>`
}

function actionsView(run: Run): string {
  const sel = run.fight.hand.find((c) => c.id === ui.selected)
  return `<div class="actions cactions">
    <button data-act="wait">Wait a quarter</button>
    <button class="primary" data-act="play" ${sel ? '' : 'disabled'}>${sel ? `Play ${esc(sel.name)}` : 'Pick a card'}</button>
  </div>`
}

function logView(run: Run): string {
  return `<details class="panel clog" data-panel="log" ${ui.open.has('log') ? 'open' : ''}>
    <summary>What happened</summary>
    <ol>${run.fight.log.slice(0, 14).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
  </details>`
}

function rulesView(): string {
  return `<details class="panel crules" data-panel="rules" ${ui.open.has('rules') ? 'open' : ''}>
    <summary>How it works</summary>
    <p>A card is a small circuit. The commission feeds instability into the pool at every quarter moon. A card's input channels take what they can of their element, up to their capacity; it purifies that much, times its gain, and leaves a principle behind: earth salt, fire sulfur, water and air mercury.</p>
    <p>There are no turns. Each card costs time on the moon dial, a quarter for a plain one and an eighth more for each gain stage. At each new and full moon you ${ui.settings.draw === 'refill' ? `refill your hand to ${ui.settings.hand}` : `draw ${ui.settings.hand}`}. When the commission attacks (a red star on the dial), whatever is left in the pool flares and costs quintessence, less any Ward.</p>
    <p>Principles brew recipes, which also take time. When a commission is done, what is left smelts into metal: silver from two mercury and a salt, lead from any two. Between commissions you add a rune to a card: a new input, a gain stage, a distilling stage, a ground, or a bigger core. The first is free; more cost ${EXTRA_RUNE_PRICE} metal.</p>
    <p class="fine">Cards are drawn as sigils on a provisional schema: the anchor is the core and its first input; further inputs hang outside; gain stages ring it; distilling stages sit inside; grounds are entwined.</p>
  </details>`
}

function tuningView(): string {
  const s = ui.settings
  const opt = (v: string, cur: string, label: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
  const drawKey = `${s.draw}-${s.hand}`
  return `<details class="panel tuning" data-panel="tuning" ${ui.open.has('tuning') ? 'open' : ''}>
    <summary>Tuning</summary>
    <div class="tune-grid">
      <label>At new and full moons <select id="c-draw">${opt('refill-4', drawKey, 'Refill to 4')}${opt('draw-4', drawKey, 'Draw 4')}${opt('draw-2', drawKey, 'Draw 2')}${opt('refill-5', drawKey, 'Refill to 5')}</select></label>
      <label>Quintessence <select id="c-stock">${[40, 60, 80].map((v) => opt(String(v), String(s.stock), String(v))).join('')}</select></label>
    </div>
    <p class="fine">Simulated, refilling to 4 wins the three-commission run about 80% of the time; drawing 4 without a cap makes it easy, drawing 2 makes it harsh. Changes take effect on restart.</p>
    <div class="row"><button data-act="restart">Restart with these</button></div>
  </details>`
}

function rewardRuneSvg(r: RewardRune): string {
  const body = r.kind === 'expand' ? 'square' : 'circle'
  const motes = r.kind === 'channel' && r.element !== 'any' ? [elementMote(r.element)] : []
  return runeSvg(makeRune(2_000_000 + Math.floor(Math.random() * 1e6), { body, motes }), 40)
}

function rewardView(run: Run): string {
  const s = run.smelted
  const sel = ui.offer !== null ? run.offer[ui.offer] : null
  const price = run.tookFree ? EXTRA_RUNE_PRICE : 0
  const canTake = price <= run.metals
  return `<main class="circuits reward">
    ${header(run)}
    <section class="panel">
      <p class="label">${esc(run.fight.commission.name)} is purified</p>
      <p>${s && s.value ? `What was left smelts into ${[s.silver ? plural(s.silver, 'silver ingot') : '', s.lead ? plural(s.lead, 'lead ingot') : ''].filter(Boolean).join(' and ')}: <b class="num">+${s.value}</b> metal.` : 'Nothing was left to smelt.'} You hold <b class="num">${run.metals}</b> metal.</p>
      <p class="fine">It cost ${run.fight.paid} quintessence over ${(run.fight.dial / 8).toFixed(1)} moons.</p>
    </section>
    <section class="panel">
      <p class="label">${run.tookFree ? `Another rune costs ${EXTRA_RUNE_PRICE} metal` : 'Take a rune, free'}</p>
      <div class="offers">${
        run.offer
          .map((r, i) => `<button class="offer ${ui.offer === i ? 'is-on' : ''}" data-act="offer" data-i="${i}" ${canTake ? '' : 'disabled'} aria-pressed="${ui.offer === i}">${rewardRuneSvg(r)}<span>${esc(runeWords(r))}</span></button>`)
          .join('') || '<p class="fine">Nothing left on offer.</p>'
      }</div>
      ${sel ? `<p class="hint">Now pick the card to add it to.</p>` : ''}
    </section>
    <section class="chand deck" aria-label="Deck">${run.deck.map((c) => cardView(run, c, { act: 'add', disabled: !sel || !fits(sel, c) })).join('')}</section>
    <div class="actions cactions one"><button class="primary" data-act="next">On to ${esc(COMMISSIONS[run.fightIndex + 1].name)}</button></div>
  </main>`
}

function endView(run: Run): string {
  const won = run.stage === 'won'
  return `<main class="circuits end">
    ${header(run)}
    <section class="panel">
      <p class="label">${won ? 'The run is done' : 'Out of quintessence'}</p>
      <p>${won ? `All three commissions purified, with ${run.quintessence} quintessence and ${run.metals} metal left.` : `${esc(run.fight.commission.name)} wore you down at ${run.fight.purified} of ${run.fight.commission.require} purified.`}</p>
      <div class="row"><button class="primary" data-act="restart">Start again</button></div>
    </section>
    ${tuningView()}
  </main>`
}

function startView(): string {
  return `<main class="circuits start">
    <div class="start-head">
      <p class="eyebrow">A new direction · prototype</p>
      <h1>Alchemical Circuits</h1>
      <p class="lede">Every card is a small circuit. Catch the instability a commission feeds into the pool, purify it, and keep what it leaves behind. There are no turns: every card costs time on the moon.</p>
    </div>
    ${rulesView()}
    ${tuningView()}
    <button class="primary wide" data-act="restart">Begin: three commissions</button>
  </main>`
}

function fightView(run: Run): string {
  return `<main class="circuits">
    ${header(run)}
    ${dialPanel(run)}
    ${workbench(run)}
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    ${handView(run)}
    ${actionsView(run)}
    ${logView(run)}
    ${rulesView()}
    ${tuningView()}
  </main>`
}

function render() {
  const run = ui.run
  root.innerHTML = !run ? startView() : run.stage === 'fight' ? fightView(run) : run.stage === 'reward' ? rewardView(run) : endView(run)
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

/** Apply an action and sound what it did. */
function act(next: Run) {
  const before = ui.run!
  const flaresBefore = before.fight.flares.length
  ui.run = next
  ui.selected = null
  if (next.fightIndex === before.fightIndex && next.fight.flares.length > flaresBefore) {
    const flares = next.fight.flares.slice(flaresBefore)
    const paid = before.quintessence - next.quintessence
    sound.turn(flares, flares.reduce((a, b) => a + b, 0) - paid, paid)
  }
  const drawn = next.fightIndex === before.fightIndex ? next.fight.hand.filter((c) => !before.fight.hand.some((h) => h.id === c.id)).length : 0
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
        window.scrollTo({ top: 0 })
        break
      case 'sound':
        sound.setEnabled(!sound.enabled)
        break
      case 'card': {
        const id = Number(el.dataset.id)
        ui.selected = ui.selected === id ? null : id
        const c = run?.fight.hand.find((x) => x.id === id)
        if (c && ui.selected !== null) sound.tap(cardSigil(c).anchor)
        break
      }
      case 'play':
        if (run && ui.selected !== null) act(playCard(run, ui.selected))
        break
      case 'wait':
        if (run) act(wait(run))
        break
      case 'craft':
        if (run) act(craft(run, el.dataset.key as Recipe['key']))
        break
      case 'offer':
        ui.offer = ui.offer === Number(el.dataset.i) ? null : Number(el.dataset.i)
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
          sound.deal(ui.run.fight.hand.length)
          window.scrollTo({ top: 0 })
        }
        break
    }
  } catch (e) {
    ui.flash = (e as Error).message
  }
  render()
})

root.addEventListener('toggle', (ev) => {
  const d = ev.target as HTMLDetailsElement
  const key = d.dataset?.panel
  if (!key) return
  if (d.open) ui.open.add(key)
  else ui.open.delete(key)
}, true)

render()
