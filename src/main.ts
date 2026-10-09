import './ui/style.css'
import { GRADE_NAMES, poolKey, totalKg } from './sim/alchemy'
import { CLAY_BAND, earthShare, substanceName } from './sim/commission'
import { DEFAULT_SETTINGS, cast, discardGlyphs, invalidReason, newGame, payment, previewTerm, type GameState, type Settings, type TermOutcome } from './sim/game'
import { APTITUDE, candidatePools } from './sim/rune'
import { slumpTarget, strain, tally } from './sim/table'
import type { Elemental, Glyph, JoinKind, Rune, ShapeClass } from './sim/types'
import { AFFINITY_VAR, glyphSvg, runeSvg, vesselSvg } from './ui/draw'

// ---------------------------------------------------------------------------
// State

interface UI {
  game: GameState | null
  deck: ShapeClass
  settings: Settings
  seed: number
  anchorId: number | null
  joins: { kind: JoinKind; id: number }[]
  mode: JoinKind
  poolKey?: string
  discarding: boolean
  marked: Set<number>
  flash: string
  /** Which collapsible panels are open, so re-rendering keeps them open. */
  open: Set<string>
}

const ui: UI = {
  game: null,
  deck: 'regular',
  settings: { ...DEFAULT_SETTINGS },
  seed: 0,
  anchorId: null,
  joins: [],
  mode: 'circumscribe',
  discarding: false,
  marked: new Set(),
  flash: '',
  open: new Set(),
}

const JOINS: { kind: JoinKind; label: string; gives: string }[] = [
  { kind: 'circumscribe', label: 'Circumscribe', gives: 'Force · sets target' },
  { kind: 'link', label: 'Link', gives: 'Reach' },
  { kind: 'entwine', label: 'Entwine', gives: 'Ward' },
  { kind: 'inscribe', label: 'Inscribe', gives: 'Fine · or condense' },
]

const DECKS: { shape: ShapeClass; name: string; line: string }[] = [
  { shape: 'regular', name: 'Regular', line: 'Many axes of symmetry. Entwines well: wards cheaply, progresses steadily.' },
  { shape: 'isosceles', name: 'Isosceles', line: 'One axis of symmetry. Links well: wide Reach, precise steps.' },
  { shape: 'scalene', name: 'Scalene', line: 'No symmetry. Circumscribes well: hits hard, bleeds quintessence.' },
]

const ELEMENT_NAME: Record<string, string> = { earth: 'Earth', water: 'Water', air: 'Air', fire: 'Fire', none: 'Neutral' }

// ---------------------------------------------------------------------------
// Helpers

const kg = (n: number) => `${n.toFixed(1)} kg`
const pct = (n: number) => `${Math.round(n * 100)}%`
const num = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function startGame(seed = Date.now() % 1_000_000) {
  ui.seed = seed
  ui.game = newGame(ui.deck, { ...ui.settings }, seed)
  resetComposer()
}

function resetComposer() {
  ui.anchorId = null
  ui.joins = []
  ui.mode = 'circumscribe'
  ui.poolKey = undefined
  ui.discarding = false
  ui.marked = new Set()
  ui.flash = ''
}

function glyphById(id: number): Glyph | undefined {
  return ui.game?.hand.find((g) => g.id === id)
}

function currentRune(): Rune | null {
  const anchor = ui.anchorId !== null ? glyphById(ui.anchorId) : undefined
  if (!anchor) return null
  return {
    anchor,
    joins: ui.joins.map((j) => ({ kind: j.kind, glyph: glyphById(j.id)! })).filter((j) => j.glyph),
  }
}

function roleOf(id: number): string | null {
  if (id === ui.anchorId) return 'Anchor'
  const j = ui.joins.find((x) => x.id === id)
  return j ? JOINS.find((x) => x.kind === j.kind)!.label : null
}

// ---------------------------------------------------------------------------
// Views

function startView(): string {
  const sample = (shape: ShapeClass) =>
    ([['water', 3], ['earth', 4], ['air', 5], ['fire', 6]] as const)
      .map(([affinity, sides], i) => glyphSvg({ id: 900 + i, affinity, sides, value: 0, shape }, 40))
      .join('')
  return `
  <main class="start">
    <header class="start-head">
      <p class="eyebrow">A commission · prototype</p>
      <h1>Mud to Clay</h1>
      <p class="lede">Twenty-four kilos of mud, half earth and half water. Bring it to clay, between 75 and 85 percent earth, before your quintessence runs out.</p>
    </header>

    <section class="panel">
      <h2>Choose a starting deck</h2>
      <div class="decks">
        ${DECKS.map(
          (d) => `
          <button class="deck ${ui.deck === d.shape ? 'is-on' : ''}" data-act="deck" data-deck="${d.shape}" aria-pressed="${ui.deck === d.shape}">
            <span class="deck-glyphs">${sample(d.shape)}</span>
            <span class="deck-name">${d.name}</span>
            <span class="deck-line">${d.line}</span>
          </button>`,
        ).join('')}
      </div>
      <button class="primary wide" data-act="start">Begin the commission</button>
    </section>

    <section class="panel rules">
      <h2>How a term works</h2>
      <ol>
        <li><b>Mud shows its move.</b> A flare, a seep back to water, a hardening, or a slump that knocks a rune off your table.</li>
        <li><b>Compose a rune.</b> Tap an element to make it the anchor: its element is what changes. Then pick a join and tap more elements.</li>
        <li><b>Cast.</b> The preview is exact. Then mud acts. Ward absorbs flares; whatever gets past costs quintessence.</li>
      </ol>
      <dl class="join-key">
        ${JOINS.map((j) => `<div><dt>${j.label}</dt><dd>${joinHelp(j.kind)}</dd></div>`).join('')}
      </dl>
      <p class="fine">Cast runes stay on the table. Keep it level, Earth against Air and Water against Fire, or the lopsidedness adds strain every term.</p>
    </section>
    ${tuningView()}
  </main>`
}

function joinHelp(kind: JoinKind): string {
  switch (kind) {
    case 'circumscribe':
      return 'Rings the anchor. Its element is where the change goes, and it adds Force. Force past what the change needs multiplies Reach.'
    case 'link':
      return 'Hangs beside the anchor. Adds Reach: how many kilos the rune works.'
    case 'entwine':
      return 'Laces through the anchor. Adds Ward against this term’s flare.'
    case 'inscribe':
      return 'Sits inside. Same element as the anchor: condenses a pool one grade. Any other: halves Reach for fine work.'
  }
}

function tuningView(): string {
  const s = ui.settings
  const opt = (v: number, cur: number, label = String(v)) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
  return `
  <details class="panel tuning" data-panel="tuning" ${ui.open.has('tuning') ? 'open' : ''}>
    <summary>Tuning</summary>
    <div class="tune-grid">
      <label class="check"><input type="checkbox" id="tune-strain" ${s.strain ? 'checked' : ''}> Table imbalance adds strain</label>
      <label class="check"><input type="checkbox" id="tune-surplus" ${s.surplusForce ? 'checked' : ''}> Surplus Force multiplies Reach</label>
      <label>Flare size <select id="tune-flare">${opt(0.75, s.flareScale, '×0.75')}${opt(1, s.flareScale, '×1')}${opt(1.25, s.flareScale, '×1.25')}${opt(1.5, s.flareScale, '×1.5')}</select></label>
      <label>Quintessence <select id="tune-stock">${opt(60, s.stock)}${opt(100, s.stock)}${opt(140, s.stock)}</select></label>
      <label>Hand size <select id="tune-hand">${opt(6, s.handSize)}${opt(7, s.handSize)}${opt(8, s.handSize)}</select></label>
      <label>Discards <select id="tune-discards">${opt(1, s.discards)}${opt(2, s.discards)}${opt(3, s.discards)}</select></label>
    </div>
    <p class="fine">Unticking surplus Force uses the design doc’s formula, where Force past the requirement does nothing. ${ui.game ? `Seed ${ui.seed}.` : ''}</p>
    ${ui.game ? `<div class="row"><button data-act="restart">Restart with these</button><button data-act="replay">Replay seed ${ui.seed}</button></div>` : ''}
  </details>`
}

function intentView(g: GameState, preview: TermOutcome | null): string {
  const i = g.intent
  const strainNow = preview ? preview.strain : strain(g.table, g.settings.strain)
  const tone = i.kind === 'flare' ? 'fire' : i.kind === 'seep' ? 'water' : i.kind === 'harden' ? 'glass' : 'gilt'
  return `
  <section class="intent tone-${tone}" aria-live="polite">
    <div class="intent-main">
      <p class="eyebrow">Mud’s move · term ${g.term}</p>
      <p class="intent-title">${esc(i.title)}</p>
      <p class="intent-detail">${esc(i.detail)}</p>
    </div>
    <div class="intent-side">
      <span class="label">Strain</span>
      <span class="intent-strain">${strainNow ? `+${strainNow}` : '0'}</span>
      <span class="label">${g.settings.strain ? 'from the table' : 'off'}</span>
    </div>
  </section>`
}

function lastTermView(g: GameState): string {
  const t = g.history.at(-1)
  if (!t || g.phase !== 'compose') return ''
  return `<p class="last-term">${esc(describeTerm(t))}</p>`
}

function describeTerm(t: TermOutcome): string {
  const r = t.resolution
  const change =
    r.mode === 'none'
      ? 'The rune changed nothing.'
      : `${kg(r.converted)} of ${GRADE_NAMES[r.source!.grade]} ${r.source!.elemental} became ${kg(r.produced)} of ${r.mode === 'condense' ? GRADE_NAMES[r.target!.grade] + ' ' : ''}${r.target!.elemental}.`
  if (t.finished) return `Term ${t.term}: ${change} Clay.`
  const incoming = t.flare + t.strain
  const fight = incoming > 0 ? ` ${t.flare ? `Flare ${t.flare}` : ''}${t.flare && t.strain ? ' + ' : ''}${t.strain ? `strain ${t.strain}` : ''}, Ward ${num(t.absorbed)}, paid ${num(t.paid)}.` : ''
  return `Term ${t.term}: ${change}${t.intentNote ? ' ' + t.intentNote : ''}${fight}`
}

function poolsView(g: GameState, rune: Rune | null, selected?: string): string {
  const selectable = rune ? new Set(candidatePools(rune, g.pools).map(poolKey)) : new Set<string>()
  return `<div class="pools" role="group" aria-label="Pools">
    ${g.pools
      .map((p) => {
        const key = poolKey(p)
        const can = selectable.has(key)
        const on = key === selected
        return `<button class="pool ${on ? 'is-on' : ''}" ${can ? `data-act="pool" data-key="${key}"` : 'disabled'} aria-pressed="${on}" style="--c:${AFFINITY_VAR[p.elemental]}">
          <span class="dot"></span><span>${GRADE_NAMES[p.grade]} ${p.elemental}</span><span class="num">${kg(p.kg)}</span>
        </button>`
      })
      .join('')}
  </div>`
}

function balanceView(g: GameState, preview: TermOutcome | null): string {
  const t = tally(preview ? preview.table : g.table)
  const bar = (a: Elemental, b: Elemental) => {
    const total = Math.max(1, t[a] + t[b])
    return `<div class="scale">
      <span class="scale-end" style="--c:${AFFINITY_VAR[a]}">${ELEMENT_NAME[a]} <b class="num">${t[a]}</b></span>
      <span class="scale-track"><span style="width:${(t[a] / total) * 100}%; background:${AFFINITY_VAR[a]}"></span><span style="width:${(t[b] / total) * 100}%; background:${AFFINITY_VAR[b]}"></span></span>
      <span class="scale-end right" style="--c:${AFFINITY_VAR[b]}"><b class="num">${t[b]}</b> ${ELEMENT_NAME[b]}</span>
    </div>`
  }
  return `<div class="balance">
    <p class="label">Table balance${preview ? ' after this cast' : ''}</p>
    ${bar('earth', 'air')}
    ${bar('water', 'fire')}
  </div>`
}

function composerView(g: GameState, rune: Rune | null, preview: TermOutcome | null): string {
  const anchor = rune?.anchor
  const used = rune?.joins.length ?? 0
  let stats = `<p class="hint">${ui.discarding ? 'Tap the elements to discard, then confirm.' : 'Tap an element in your hand to make it the anchor.'}</p>`
  if (rune && preview) {
    const r = preview.resolution
    const o = r.outputs
    const route = o.route ? o.route.map((e) => ELEMENT_NAME[e]).join(' → ') : 'Neutral'
    const forceLine = r.mode === 'none' ? num(o.force) : `${num(o.force)} <span class="of">/ ${num(r.required)}</span>`
    const change =
      r.mode === 'none'
        ? `<p class="note">${esc(r.note)}</p>`
        : `<p class="change"><span class="num">${kg(r.converted)}</span> ${GRADE_NAMES[r.source!.grade]} ${r.source!.elemental} → <span class="num">${kg(r.produced)}</span> ${r.mode === 'condense' ? GRADE_NAMES[r.target!.grade] + ' ' : ''}${r.target!.elemental}${r.efficiency < 1 ? ` <span class="warn">· Force short, ${pct(r.efficiency)}</span>` : r.efficiency > 1.001 ? ` <span class="good">· Force ×${r.efficiency.toFixed(2)}</span>` : ''}</p>`
    const after = preview.finished
      ? `<p class="after win">${pct(preview.share)} earth: clay. This cast finishes the commission.</p>`
      : `<p class="after">After mud acts: <b>${pct(preview.share)}</b> earth, ${esc(preview.substance)}${preview.share > CLAY_BAND[1] ? ' <span class="warn">(past clay)</span>' : ''}</p>`
    const incoming = preview.flare + preview.strain
    const cost = preview.finished
      ? ''
      : incoming > 0
        ? `<p class="cost">${preview.flare ? `Flare ${preview.flare}` : ''}${preview.flare && preview.strain ? ' + ' : ''}${preview.strain ? `strain ${preview.strain}` : ''} − Ward ${num(preview.absorbed)} → <b class="${preview.paid > 0 ? 'warn' : 'good'}">${preview.paid > 0 ? `pay ${num(preview.paid)}` : 'nothing to pay'}</b></p>`
        : `<p class="cost">No instability this term.</p>`
    stats = `
      <p class="route">${route}</p>
      <div class="outputs">
        <div><span class="label">Reach</span><span class="num big">${kg(o.reach)}</span></div>
        <div><span class="label">Force</span><span class="num big">${forceLine}</span></div>
        <div><span class="label">Ward</span><span class="num big">${num(o.ward)}</span></div>
      </div>
      ${change}${after}${cost}`
  }
  const apt = APTITUDE[g.deckClass]
  return `
  <section class="composer panel">
    <div class="composer-top">
      <div class="rune-frame">${runeSvg(rune)}${anchor ? `<span class="capacity num">${used} / ${anchor.sides} joins</span>` : ''}</div>
      <div class="stats">${stats}</div>
    </div>
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    <div class="modes" role="group" aria-label="Join">
      ${JOINS.map(
        (j) => `<button class="mode ${ui.mode === j.kind ? 'is-on' : ''}" data-act="mode" data-kind="${j.kind}" aria-pressed="${ui.mode === j.kind}" ${!anchor || ui.discarding ? 'disabled' : ''}>
          <span class="mode-name">${j.label}${apt === j.kind ? ' <span class="apt" title="Your deck is apt for this join">★</span>' : ''}</span>
          <span class="mode-gives">${j.gives}</span>
        </button>`,
      ).join('')}
    </div>
  </section>`
}

function handView(g: GameState): string {
  return `<section class="hand" aria-label="Hand">
    ${g.hand
      .map((h) => {
        const role = roleOf(h.id)
        const marked = ui.marked.has(h.id)
        return `<button class="card ${role ? 'in-rune' : ''} ${marked ? 'marked' : ''}" data-act="card" data-id="${h.id}" style="--c:${AFFINITY_VAR[h.affinity]}" aria-label="${ELEMENT_NAME[h.affinity]} ${h.sides}-sided, value ${h.value}${role ? ', ' + role : ''}">
          <span class="card-value num">${h.value}</span>
          ${glyphSvg(h, 52)}
          <span class="card-name">${ELEMENT_NAME[h.affinity]}</span>
          <span class="card-sides">${role ?? `${h.sides} joins`}</span>
        </button>`
      })
      .join('')}
  </section>`
}

function actionsView(g: GameState, rune: Rune | null, preview: TermOutcome | null): string {
  if (ui.discarding) {
    return `<div class="actions">
      <button data-act="discard-cancel">Cancel</button>
      <button class="primary" data-act="discard-confirm" ${ui.marked.size ? '' : 'disabled'}>Discard ${ui.marked.size || ''} and redraw</button>
    </div>`
  }
  const invalid = rune ? invalidReason(g, rune) : 'Choose an anchor.'
  const castLabel = !preview ? 'Cast' : preview.finished ? 'Cast · finish' : preview.paid > 0 ? `Cast · pay ${num(preview.paid)}` : 'Cast'
  return `<div class="actions">
    <button data-act="clear" ${rune ? '' : 'disabled'}>Clear</button>
    <button data-act="discard-mode" ${g.discardsLeft > 0 && !rune ? '' : 'disabled'}>Discard <span class="num">(${g.discardsLeft})</span></button>
    <button class="primary" data-act="cast" ${invalid ? 'disabled' : ''}>${castLabel}</button>
  </div>`
}

function endView(g: GameState): string {
  if (g.phase === 'compose') return ''
  const won = g.phase === 'won'
  return `
  <div class="end" role="dialog" aria-modal="true" aria-labelledby="end-title">
    <div class="end-card">
      <p class="eyebrow">${won ? 'Commission complete' : 'Commission failed'}</p>
      <h2 id="end-title">${won ? `${kg(totalKg(g.pools))} of clay` : 'The work came apart'}</h2>
      <p>${won ? 'The clay is set and paid for.' : `Your quintessence ran out at ${pct(earthShare(g.pools))} earth.`}</p>
      <dl class="end-stats">
        <div><dt>Terms</dt><dd class="num">${g.history.length}</dd></div>
        <div><dt>Spent</dt><dd class="num">${num(g.spent)}</dd></div>
        <div><dt>Payment</dt><dd class="num">${won ? payment(g) : '—'}</dd></div>
      </dl>
      <div class="row">
        <button data-act="replay">Replay this draw</button>
        <button data-act="restart">New draw</button>
        <button data-act="menu">Change deck</button>
      </div>
    </div>
  </div>`
}

function historyView(g: GameState): string {
  if (!g.history.length) return ''
  return `<details class="panel history" data-panel="history" ${ui.open.has('history') ? 'open' : ''}>
    <summary>Term history</summary>
    <ol reversed>${g.history.slice().reverse().map((t) => `<li>${esc(describeTerm(t))}</li>`).join('')}</ol>
  </details>`
}

function gameView(g: GameState): string {
  const rune = currentRune()
  const preview = rune && g.phase === 'compose' && !ui.discarding ? previewTerm(g, rune, ui.poolKey) : null
  const selected = preview?.resolution.source ? poolKey(preview.resolution.source) : undefined
  const threatened = g.intent.kind === 'slump' ? (preview ? preview.removed?.id : slumpTarget(g.table)?.id) : undefined
  const share = earthShare(g.pools)
  const qPct = Math.max(0, Math.min(100, (g.quintessence / g.settings.stock) * 100))
  return `
  <main class="game">
    <header class="top">
      <div>
        <p class="eyebrow">Commission</p>
        <h1 class="title">Mud <span class="arrow">→</span> Clay</h1>
      </div>
      <div class="quint" aria-label="Quintessence ${num(g.quintessence)} of ${g.settings.stock}">
        <span class="label">Quintessence</span>
        <span class="num quint-num">${num(g.quintessence)}</span>
        <span class="quint-bar"><span style="width:${qPct}%"></span></span>
      </div>
    </header>

    ${intentView(g, preview)}

    <section class="vessel panel">
      ${vesselSvg(g.pools, g.table, share, { previewShare: preview?.share, selectedKey: selected, threatenedId: threatened, previewRune: rune })}
      <div class="vessel-read">
        <p class="substance ${substanceName(g.pools) === 'Clay' ? 'is-clay' : ''}">${substanceName(g.pools)}</p>
        <p class="read-line"><span class="num">${pct(share)}</span> earth · target <span class="num">75–85%</span> · <span class="num">${kg(totalKg(g.pools))}</span></p>
      </div>
      ${poolsView(g, rune, selected)}
      ${balanceView(g, preview)}
    </section>

    ${lastTermView(g)}
    ${composerView(g, rune, preview)}
    ${handView(g)}
    ${actionsView(g, rune, preview)}
    ${historyView(g)}
    ${tuningView()}
    ${endView(g)}
  </main>`
}

// ---------------------------------------------------------------------------
// Rendering and events

const root = document.getElementById('app')!

function render() {
  root.innerHTML = ui.game ? gameView(ui.game) : startView()
}

function tapCard(id: number) {
  const g = ui.game!
  ui.flash = ''
  if (ui.discarding) {
    if (ui.marked.has(id)) ui.marked.delete(id)
    else ui.marked.add(id)
    return
  }
  if (id === ui.anchorId) {
    resetComposer()
    return
  }
  const placed = ui.joins.findIndex((j) => j.id === id)
  if (placed >= 0) {
    ui.joins.splice(placed, 1)
    return
  }
  const glyph = g.hand.find((h) => h.id === id)!
  if (ui.anchorId === null) {
    ui.anchorId = id
    ui.poolKey = undefined
    return
  }
  const anchor = glyphById(ui.anchorId)!
  if (ui.joins.length >= anchor.sides) {
    ui.flash = `This anchor has ${anchor.sides} sides, so it holds ${anchor.sides} joins.`
    return
  }
  ui.joins.push({ kind: ui.mode, id: glyph.id })
}

function readTuning() {
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)
  const s = ui.settings
  const strainEl = val('tune-strain') as HTMLInputElement | null
  const surplusEl = val('tune-surplus') as HTMLInputElement | null
  if (strainEl) s.strain = strainEl.checked
  if (surplusEl) s.surplusForce = surplusEl.checked
  const n = (id: string, fallback: number) => {
    const el = val(id)
    return el ? Number(el.value) : fallback
  }
  s.flareScale = n('tune-flare', s.flareScale)
  s.stock = n('tune-stock', s.stock)
  s.handSize = n('tune-hand', s.handSize)
  s.discards = n('tune-discards', s.discards)
}

root.addEventListener(
  'toggle',
  (e) => {
    const d = e.target as HTMLDetailsElement
    const name = d.dataset?.panel
    if (!name) return
    if (d.open) ui.open.add(name)
    else ui.open.delete(name)
  },
  true,
)

root.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).closest('.tuning')) readTuning()
})

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!el || (el as HTMLButtonElement).disabled) return
  const act = el.dataset.act
  const g = ui.game
  switch (act) {
    case 'deck':
      ui.deck = el.dataset.deck as ShapeClass
      break
    case 'start':
      readTuning()
      startGame()
      window.scrollTo({ top: 0 })
      break
    case 'card':
      tapCard(Number(el.dataset.id))
      break
    case 'mode':
      ui.mode = el.dataset.kind as JoinKind
      break
    case 'pool':
      ui.poolKey = el.dataset.key
      break
    case 'clear':
      resetComposer()
      break
    case 'discard-mode':
      resetComposer()
      ui.discarding = true
      break
    case 'discard-cancel':
      ui.discarding = false
      ui.marked = new Set()
      break
    case 'discard-confirm':
      if (g) ui.game = discardGlyphs(g, [...ui.marked])
      resetComposer()
      break
    case 'cast': {
      const rune = currentRune()
      if (g && rune && !invalidReason(g, rune)) {
        ui.game = cast(g, rune, ui.poolKey)
        resetComposer()
      }
      break
    }
    case 'restart':
      readTuning()
      startGame()
      window.scrollTo({ top: 0 })
      break
    case 'replay':
      readTuning()
      startGame(ui.seed)
      window.scrollTo({ top: 0 })
      break
    case 'menu':
      ui.game = null
      resetComposer()
      window.scrollTo({ top: 0 })
      break
    default:
      return
  }
  render()
})

render()
