import './ui/style.css'
import { GRADE_NAMES, poolKey, totalKg } from './sim/alchemy'
import { cloneTarget, constrained, inBand, shares, substanceName, within, type Range } from './sim/commission'
import { BODY_LIST, BODY_NAMES, DEFAULT_FORGE, GEMS, MOTE_OPTIONS, buildDeck, cloneForge, moteEffect, moteFromKey, moteKey, moteName, type Forge, type RuneSpec } from './sim/deck'
import { addRune, deckSpecs, editRune, findRune, removeRune, setComposition, setForge, setTarget } from './sim/sandbox'
import { DEFAULT_SETTINGS, cast, castsLeft, discardRunes, endTerm, invalidReason, newGame, payment, previewCast, previewEnd, sigilsPlayed, standardSetup, termsUsed, type CastOutcome, type CastPreview, type EndOutcome, type GameState, type Settings, type Setup, type TermOutcome } from './sim/game'
import { REACH_PER_POWER, WARD_PER_POWER, candidatePools, canJoin, openLinks, resolve, type Resolution } from './sim/sigil'
import { slumpTarget, tally } from './sim/table'
import type { Body, Elemental, Grade, JoinKind, Pool, Rune, Sigil } from './sim/types'
import type { TableEntry } from './sim/table'
import { AFFINITY_VAR, bodyIcon, moteColor, runeSvg, sigilSvg, vesselSvg } from './ui/draw'
import { AFFINITIES, SIDES, balance, metricsOf, type Measure } from './sim/metrics'
import { PRESETS, presetByKey } from './sim/presets'
import { DEFAULT_EQUATION, runepath, take, terms, type Equation } from './sim/equation'

// ---------------------------------------------------------------------------
// State

interface UI {
  game: GameState | null
  settings: Settings
  /** The forge and deck the next commission starts from. */
  setup: Setup
  /** The deck along a run the setup was last loaded from. */
  preset: string
  /** Which rune the sandbox is editing: an id, a new rune, or none. */
  editing: number | 'new' | null
  draft: RuneSpec
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
  /** Table metrics: what is on the table now, or everything played this commission. */
  scope: 'table' | 'played'
  /** The per-term record, shown as text when the clipboard refuses it. */
  csv: string
  copied: boolean
  /** The radial join menu: which hand rune it is open on, and where on screen. */
  radial: { id: number; x: number; y: number } | null
  /** Which pile sheet is open. */
  pile: 'draw' | 'discard' | null
}

const ui: UI = {
  game: null,
  setup: standardSetup(),
  preset: 'opening',
  editing: null,
  draft: { body: 'circle', motes: [{ kind: 'element', elemental: 'water' }] },
  settings: { ...DEFAULT_SETTINGS, equation: { ...DEFAULT_EQUATION } },
  seed: 0,
  anchorId: null,
  joins: [],
  mode: 'circumscribe',
  discarding: false,
  marked: new Set(),
  flash: '',
  open: new Set(['sandbox']),
  scope: 'table',
  csv: '',
  copied: false,
  radial: null,
  pile: null,
}

type JoinOption = { kind: JoinKind; label: string; gives: string }
const CLASSIC_JOINS: JoinOption[] = [
  { kind: 'circumscribe', label: 'Circumscribe', gives: 'Force · sets target' },
  { kind: 'side', label: 'Side link', gives: 'Reach' },
  { kind: 'entwine', label: 'Entwine', gives: 'Ward' },
  { kind: 'inscribe', label: 'Inscribe', gives: 'Fine · or condense' },
]
/** Under the equation: rings and inscriptions make the runepath, side links and tangents aim the reach. */
const EQUATION_JOINS: JoinOption[] = [
  { kind: 'circumscribe', label: 'Circumscribe', gives: 'Path · ×output' },
  { kind: 'inscribe', label: 'Inscribe', gives: 'Path · ÷output' },
  { kind: 'side', label: 'Side link', gives: 'Reach up' },
  { kind: 'tangent', label: 'Tangent', gives: 'Reach down' },
  { kind: 'entwine', label: 'Entwine', gives: 'Ward' },
]
const joinList = (equation: boolean) => (equation ? EQUATION_JOINS : CLASSIC_JOINS)
/** Whether the commission in progress (or the next one) uses the equation. */
const eqOn = () => !!(ui.game ? ui.game.settings.equation : ui.settings.equation)

/** The neutral take options Tuning offers: a share of the source pool, or flat kilos. */
const NEUTRAL_TAKES: { key: string; label: string; neutral: number; share: number }[] = [
  { key: 'share-0.2', label: '20% of the pool', neutral: 0, share: 0.2 },
  { key: 'share-0.25', label: '25% of the pool', neutral: 0, share: 0.25 },
  { key: 'share-0.15', label: '15% of the pool', neutral: 0, share: 0.15 },
  { key: 'share-0.1', label: '10% of the pool', neutral: 0, share: 0.1 },
  { key: 'flat-2', label: '2 kg flat', neutral: 2, share: 0 },
  { key: 'flat-1', label: '1 kg flat', neutral: 1, share: 0 },
]
const takeKey = (eq: Equation) => NEUTRAL_TAKES.find((t) => t.neutral === eq.neutral && t.share === eq.share)?.key ?? 'share-0.2'
const neutralWords = (eq: Equation) =>
  eq.share ? `${Math.round(eq.share * 100)}% of the pool it works${eq.neutral ? ` plus ${num(eq.neutral)} kg` : ''}` : `${num(eq.neutral)} kg`

const ELEMENT_NAME: Record<string, string> = { earth: 'Earth', water: 'Water', air: 'Air', fire: 'Fire', none: 'No element' }

// ---------------------------------------------------------------------------
// Helpers

const kg = (n: number) => `${n.toFixed(1)} kg`
const num = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The forge, deck and compositions a running commission would restart with. */
const captureSetup = (g: GameState): Setup => ({
  forge: cloneForge(g.forge),
  deck: deckSpecs(g),
  start: g.start.map((p) => ({ ...p })),
  target: cloneTarget(g.target),
})

function startGame(seed = Date.now() % 1_000_000) {
  if (ui.game) ui.setup = captureSetup(ui.game)
  ui.seed = seed
  const st = ui.setup
  ui.game = newGame({ ...ui.settings }, seed, { forge: cloneForge(st.forge), deck: st.deck, start: st.start.map((p) => ({ ...p })), target: cloneTarget(st.target) })
  ui.editing = null
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
  ui.radial = null
}

function runeById(id: number): Rune | undefined {
  return ui.game?.hand.find((r) => r.id === id)
}

function currentSigil(): Sigil | null {
  const anchor = ui.anchorId !== null ? runeById(ui.anchorId) : undefined
  if (!anchor) return null
  return {
    anchor,
    joins: ui.joins.map((j) => ({ kind: j.kind, rune: runeById(j.id)! })).filter((j) => j.rune),
  }
}

const linksWord = (n: number) => `${n} link${n === 1 ? '' : 's'}`

const ELEMENT_ORDER: Elemental[] = ['earth', 'water', 'air', 'fire']

/** A share as a percent, with a decimal when it is small. */
const pctFine = (x: number) => (x < 0.1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`)

const rangeText = (r: Range) => {
  const f = (x: number) => `${+(x * 100).toFixed(1)}`
  if (r.min > 0 && r.max < 1) return `${f(r.min)}–${f(r.max)}%`
  if (r.min > 0) return `over ${f(r.min)}%`
  if (r.max < 1) return `under ${f(r.max)}%`
  return 'any'
}

/** The constrained shares, each marked in or out of its band. */
function shareLine(g: GameState, pools: Pool[]): string {
  const sh = shares(pools)
  const parts = ELEMENT_ORDER.filter((e) => constrained(g.target[e])).map(
    (e) => `<span class="${within(sh[e], g.target[e]) ? 'good' : 'warn'}">${e} <b class="num">${pctFine(sh[e])}</b></span>`,
  )
  return parts.join(', ') + (inBand(pools, g.target) ? ' (clay)' : '')
}

/** The abilities a rune's motes add beyond its element and links. */
function abilities(r: Rune): string[] {
  const out: string[] = []
  if (r.reachMult > 1) out.push(`Reach ×${r.reachMult}`)
  if (r.guard) out.push(`+${r.guard} Ward`)
  return out
}

function pips(n: number): string {
  return `<span class="pips" aria-hidden="true">${'<span class="pip"></span>'.repeat(n)}</span>`
}

function roleOf(id: number): string | null {
  if (id === ui.anchorId) return 'Anchor'
  const j = ui.joins.find((x) => x.id === id)
  return j ? [...EQUATION_JOINS, ...CLASSIC_JOINS].find((x) => x.kind === j.kind)!.label : null
}

// ---------------------------------------------------------------------------
// Views

function deckGroups(setup: Setup): string {
  const runes = buildDeck(setup.deck, setup.forge)
  return BODY_LIST.map((body) => {
    const all = runes.filter((r) => r.body === body)
    if (!all.length) return ''
    const spec = setup.forge.bodies[body]
    const distinct = all.filter((r, i) => all.findIndex((x) => JSON.stringify(x.motes) === JSON.stringify(r.motes)) === i)
    const effects = (r: Rune) => {
      const counts = new Map<string, number>()
      for (const m of r.motes) {
        const e = moteEffect(m, setup.forge.values)
        counts.set(e, (counts.get(e) ?? 0) + 1)
      }
      return [...counts].map(([e, n]) => (n > 1 && e === '+1 link' ? `+${n} links` : n > 1 ? `${e} ×${n}` : e)).join(' + ') || 'empty'
    }
    const motes = distinct.map(effects).join(' · ')
    return `<li class="deck-group">
      <span class="deck-group-runes">${distinct.slice(0, 4).map((r) => runeSvg(r, 40)).join('')}</span>
      <span class="deck-group-name"><b class="num">${all.length}</b> ${BODY_NAMES[body].toLowerCase()}${all.length === 1 ? '' : 's'} <span class="deck-group-spec num">· power ${spec.power} · ${linksWord(spec.links)} · ${spec.bowls} bowl${spec.bowls === 1 ? '' : 's'}</span></span>
      <span class="deck-group-line">${motes}</span>
    </li>`
  }).join('')
}

/** Decks from points along a run: the opening deck, one mid-run and one late. */
function presetView(): string {
  const cur = presetByKey(ui.preset)
  return `<div class="presets">
    <span class="label">Deck from a point in the run</span>
    <div class="seg" role="group" aria-label="Deck from a point in the run">${PRESETS.map(
      (p) => `<button data-act="preset" data-key="${p.key}" class="${p.key === ui.preset ? 'is-on' : ''}" aria-pressed="${p.key === ui.preset}">${p.name.replace(' deck', '')}</button>`,
    ).join('')}</div>
    ${cur ? `<p class="fine">${cur.note}${cur.key === 'late' ? ' Try an earth anchor ringed by air, then fire, then earth: the loop multiplies earth ×40.' : ''}</p>` : ''}
  </div>`
}

function startView(): string {
  return `
  <main class="start">
    <header class="start-head">
      <p class="eyebrow">A commission · prototype</p>
      <h1>Mud to Clay</h1>
      <p class="lede">Forty kilos of mud: mostly earth and water, with a little air and fire from its organics. Bring it to clay, 75–85% earth with air and fire each between 1% and 3%, before your quintessence runs out.</p>
    </header>

    <section class="panel">
      <h2>Your deck</h2>
      ${presetView()}
      <ul class="deck-groups">${deckGroups(ui.setup)}</ul>
      <p class="fine">Gems set the element: ${Object.entries(GEMS).map(([e, g]) => `${g.toLowerCase()} is ${e}`).join(', ')}. A link mote adds a link, a reach mote multiplies the sigil’s Reach, and a guard mote adds Ward. The deck is the same each time; the shuffle is not, though your opening hand always has a water and an earth. Once you begin, the Sandbox panel can change any of it.</p>
      <button class="primary wide" data-act="start">Begin the commission</button>
    </section>

    <section class="panel rules">
      <h2>How a term works</h2>
      <ol>
        <li><b>Mud shows its move.</b> A flare, a seep back to water, a hardening, or a slump that knocks a sigil off your table.</li>
        <li><b>Compose and cast sigils.</b> Tap a rune to make it the anchor: its element is what changes. Pick a join and tap more runes, up to the anchor’s links, then cast. Each sigil resolves at once. Cast as many as your hand allows.</li>
        <li><b>End the term.</b> Mud acts. The Ward from all of this term’s sigils absorbs its flare; whatever gets past costs quintessence. Unplayed runes stay in hand.</li>
      </ol>
      <h2>Reading a rune</h2>
      <p>The number is its power. The pips are its links: how many runes it can hold as the anchor. Its bowls hold motes, and the motes give it an element and any abilities.</p>
      <dl class="join-key">
        <div><dt>Anchor</dt><dd>${eqOn() ? 'Its element is what changes. Its power counts toward power, reach up and reach down alike.' : `Its element is what changes. Adds its power as Force, and power × ${REACH_PER_POWER} kg of Reach.`}</dd></div>
        ${joinList(eqOn()).map((j) => `<div><dt>${j.label}</dt><dd>${joinHelp(j.kind, eqOn())}</dd></div>`).join('')}
      </dl>
      ${
        eqOn()
          ? `<p><b>The equation.</b> With reach up equal to reach down, a sigil takes ${neutralWords(ui.settings.equation!)}${ui.settings.equation!.gate ? ', less if its power falls short of the pool’s resistance' : ''}. Side links aim for more and tangents for less, and power against resistance decides how far you get: kilos = neutral take × (reach up ÷ reach down)<sup>ln(1 + power ÷ resistance)</sup>. Resistance doubles for every quality the runepath flips. Switch to Reach × Force in Tuning.</p>`
          : `<p><b>Reach × Force.</b> Reach is how many kilos the sigil grabs; Force is how hard it pushes. Each change needs some Force (weak water to earth needs 5), and what converts is Reach × Force ÷ that need. They multiply, so give each new rune to whichever total is smaller.</p>`
      }
      <p class="fine">Cast sigils stay on the table. Keep it level, Earth against Air and Water against Fire, or the lopsidedness adds strain every term.</p>
    </section>
    ${tuningView()}
  </main>`
}

function joinHelp(kind: JoinKind, equation = false): string {
  if (equation) {
    const eq = ui.game?.settings.equation ?? ui.settings.equation ?? DEFAULT_EQUATION
    switch (kind) {
      case 'circumscribe':
        return `Rings the anchor: a step on the runepath. Adds its power, and multiplies the output by ${eq.ring} (plus boost motes).`
      case 'inscribe':
        return `Sits inside: a step on the runepath. Adds its power, and divides the output by ${eq.inscribe}. An inscribed seal of the anchor’s own element condenses.`
      case 'side':
        return 'Hangs beside the anchor: adds its power to reach up, for more kilos.'
      case 'tangent':
        return 'Touches the anchor at a point: adds its power to reach down, for fewer kilos.'
      case 'entwine':
        return 'Laces through the anchor. Adds its power as Ward against this term’s flare.'
    }
  }
  switch (kind) {
    case 'circumscribe':
      return 'Rings the anchor. Its element is where the change goes. Adds its power as Force.'
    case 'side':
      return `Hangs beside the anchor. Adds power × ${REACH_PER_POWER} kg of Reach.`
    case 'entwine':
      return 'Laces through the anchor. Adds its power as Ward against this term’s flare.'
    case 'inscribe':
      return 'Sits inside and adds its power as Force. Same element as the anchor: condenses a pool one grade. Any other: halves Reach, for small precise casts.'
    case 'tangent':
      return 'Touches the anchor at a point. Lowers reach in the equation model.'
  }
}

function tuningView(): string {
  const s = ui.settings
  const opt = (v: number, cur: number, label = String(v)) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
  const optS = (v: string, cur: string, label: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
  return `
  <details class="panel tuning" data-panel="tuning" ${ui.open.has('tuning') ? 'open' : ''}>
    <summary>Tuning</summary>
    <div class="tune-grid">
      <label>Rules <select id="tune-rules">${optS('equation', s.equation ? 'equation' : 'classic', 'Alchemical equation')}${optS('classic', s.equation ? 'equation' : 'classic', 'Reach × Force')}</select></label>
      ${
        s.equation
          ? `<label>Base resistance <select id="tune-eq-base">${[2.5, 5, 10, 20].map((v) => opt(v, s.equation!.base)).join('')}</select></label>
      <label>Step factor <select id="tune-eq-step">${[1.5, 2, 3].map((v) => opt(v, s.equation!.step, `×${v}`)).join('')}</select></label>
      <label>Neutral take <select id="tune-eq-take">${NEUTRAL_TAKES.map((t) => optS(t.key, takeKey(s.equation!), t.label)).join('')}</select></label>
      <label class="check"><input type="checkbox" id="tune-eq-gate" ${s.equation!.gate ? 'checked' : ''}> Power short of resistance shrinks the take</label>
      <label>Ring and inscribe <select id="tune-eq-ring">${[1.05, 1.1, 1.2, 1.5].map((v) => opt(v, s.equation!.ring, `×${v}`)).join('')}</select></label>`
          : ''
      }
      <label class="check"><input type="checkbox" id="tune-strain" ${s.strain ? 'checked' : ''}> Table imbalance adds strain</label>
      <label class="check"><input type="checkbox" id="tune-surplus" ${s.surplusForce ? 'checked' : ''}> Surplus Force multiplies Reach</label>
      <label>Flare size <select id="tune-flare">${opt(0.75, s.flareScale, '×0.75')}${opt(1, s.flareScale, '×1')}${opt(1.25, s.flareScale, '×1.25')}${opt(1.5, s.flareScale, '×1.5')}</select></label>
      <label>Quintessence <select id="tune-stock">${opt(60, s.stock)}${opt(100, s.stock)}${opt(140, s.stock)}</select></label>
      <label>Hand size <select id="tune-hand">${[4, 5, 6, 7, 8, 9, 10].map((v) => opt(v, s.handSize)).join('')}</select></label>
      <label>Sigils a term <select id="tune-casts">${opt(1, s.castsPerTerm)}${opt(2, s.castsPerTerm)}${opt(3, s.castsPerTerm)}${opt(0, s.castsPerTerm, 'Any number')}</select></label>
      <label>Discards <select id="tune-discards">${opt(1, s.discards)}${opt(2, s.discards)}${opt(3, s.discards)}</select></label>
    </div>
    <p class="fine">${s.equation ? 'The equation: kilos = neutral take × (reach up ÷ reach down)^ln(1 + power ÷ resistance), output × each ring ÷ each inscribe.' : 'Unticking surplus Force uses the design doc’s formula, where Force past the requirement does nothing.'} Changing the rules takes effect on restart. ${ui.game ? `Seed ${ui.seed}.` : ''}</p>
    ${ui.game ? `<div class="row"><button data-act="restart">Restart with these</button><button data-act="replay">Replay seed ${ui.seed}</button></div>` : ''}
  </details>`
}

function intentView(g: GameState, end: EndOutcome): string {
  const i = g.intent
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
      <span class="intent-strain">${end.strain ? `+${end.strain}` : '0'}</span>
      <span class="label">${g.settings.strain ? 'from the table' : 'off'}</span>
    </div>
    <p class="intent-term">${g.casts.length ? `${g.casts.length} sigil${g.casts.length === 1 ? '' : 's'} cast this term · Ward <b class="num">${num(g.termWard)}</b>` : 'No sigils cast this term yet'} · ending now ${end.paid > 0 ? `costs <b class="num warn">${num(end.paid)}</b>` : 'costs nothing'}</p>
  </section>`
}

function lastTermView(g: GameState): string {
  const t = g.history.at(-1)
  if (!t || g.phase !== 'compose' || g.casts.length) return ''
  return `<p class="last-term">${esc(describeEnd(t))}</p>`
}

function describeCast(c: CastOutcome): string {
  const r = c.resolution
  const change =
    r.mode === 'none'
      ? 'changed nothing'
      : `${kg(r.converted)} of ${GRADE_NAMES[r.source!.grade]} ${r.source!.elemental} became ${kg(r.produced)} of ${r.mode === 'condense' ? GRADE_NAMES[r.target!.grade] + ' ' : ''}${r.target!.elemental}`
  const ward = r.outputs.ward ? `, Ward ${num(r.outputs.ward)}` : ''
  return `${sigilSummary(c.sigil)}: ${change}${ward}.${c.finished ? ' Clay.' : ''}`
}

function describeEnd(t: TermOutcome): string {
  const incoming = t.flare + t.strain
  const fight = incoming > 0 ? ` ${t.flare ? `Flare ${t.flare}` : ''}${t.flare && t.strain ? ' + ' : ''}${t.strain ? `strain ${t.strain}` : ''}, Ward ${num(t.absorbed)}, paid ${num(t.paid)}.` : ''
  return `Term ${t.term}: ${t.casts.length} sigil${t.casts.length === 1 ? '' : 's'} cast. ${t.intentNote}${fight}`.replace(/\s+/g, ' ').trim()
}

/** The target's constrained elements, as compact status chips. */
function targetChips(g: GameState, pools = g.pools): string {
  const sh = shares(pools)
  return ELEMENT_ORDER.filter((e) => constrained(g.target[e]))
    .map((e) => {
      const r = g.target[e]
      const ok = within(sh[e], r)
      return `<span class="tchip ${ok ? 'ok' : ''}" style="--c:${AFFINITY_VAR[e]}"><span class="dot"></span>${ELEMENT_NAME[e]} <b class="num">${pctFine(sh[e])}</b> <span class="num band">${rangeText(r)}</span></span>`
    })
    .join('')
}

function poolsView(g: GameState, sigil: Sigil | null, selected?: string): string {
  const selectable = sigil ? new Set(candidatePools(sigil, g.pools).map(poolKey)) : new Set<string>()
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

function balanceView(g: GameState, preview: CastPreview | null): string {
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

function composerView(g: GameState, sigil: Sigil | null, preview: CastPreview | null): string {
  const anchor = sigil?.anchor
  const used = sigil?.joins.length ?? 0
  let stats = `<p class="hint">${ui.discarding ? 'Tap the runes to discard, then confirm.' : 'Tap a rune in your hand to make it the anchor. Then tap another to choose how it joins.'}</p>`
  if (sigil && preview && g.settings.equation) {
    stats = equationStats(g, sigil, preview)
  } else if (sigil && preview) {
    const r = preview.cast.resolution
    const o = r.outputs
    const route = o.route ? o.route.map((e) => ELEMENT_NAME[e]).join(' → ') : 'Neutral'
    const forceLine = r.mode === 'none' ? num(o.force) : `${num(o.force)} <span class="of">/ ${num(r.required)}</span>`
    const extras = [o.reachMult > 1 ? `Reach ×${o.reachMult} from motes` : '', o.guard ? `+${o.guard} Ward from motes` : ''].filter(Boolean)
    const change =
      (r.mode === 'none' ? `<p class="note">${esc(r.note)}</p>` : formulaView(r, g.settings.surplusForce)) +
      (extras.length ? `<p class="motes-note">${extras.join(' · ')}</p>` : '') +
      (r.mode === 'none' ? '' : tipView(g, sigil, r))
    const after = preview.cast.finished
      ? `<p class="after win">This cast makes clay and finishes the commission.</p>`
      : `<p class="after">After this cast: ${shareLine(g, preview.cast.pools)}</p>`
    const e = preview.end
    const cost = !e
      ? ''
      : e.flare + e.strain > 0
        ? `<p class="cost">End the term after it: ${e.flare ? `flare ${e.flare}` : ''}${e.flare && e.strain ? ' + ' : ''}${e.strain ? `strain ${e.strain}` : ''} − Ward ${num(e.absorbed)} → <b class="${e.paid > 0 ? 'warn' : 'good'}">${e.paid > 0 ? `pay ${num(e.paid)}` : 'nothing to pay'}</b></p>`
        : `<p class="cost">End the term after it: no instability.</p>`
    stats = `
      <p class="route">${route}</p>
      <div class="outputs">
        <div><span class="label">Reach</span><span class="num big">${kg(o.reach)}</span></div>
        <div><span class="label">Force</span><span class="num big">${forceLine}</span></div>
        <div><span class="label">Ward</span><span class="num big">${num(o.ward)}</span></div>
      </div>
      ${change}${after}${cost}`
  }
  const castList = g.casts.length
    ? `<ol class="cast-list">${g.casts.map((c) => `<li>${esc(describeCast(c))}</li>`).join('')}</ol>`
    : ''
  const left = castsLeft(g)
  return `
  <section class="composer panel">
    ${castList ? `<div class="this-term"><p class="label">This term${Number.isFinite(left) ? ` · ${left} sigil${left === 1 ? '' : 's'} left` : ''}</p>${castList}</div>` : ''}
    <div class="composer-top">
      <div class="rune-frame">${sigilSvg(sigil)}${anchor ? `<span class="capacity num">${used} of ${linksWord(anchor.links)} used</span>` : ''}</div>
      <div class="stats">${stats}</div>
    </div>
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
  </section>`
}

/** What a sigil under the equation will do: its runepath, the terms, and the arithmetic. */
function equationStats(g: GameState, sigil: Sigil, preview: CastPreview): string {
  const eq = g.settings.equation!
  const r = preview.cast.resolution
  const path = runepath(sigil)
  const a = sigil.anchor.affinity
  const route =
    a === 'none' ? 'No element' : path ? [ELEMENT_NAME[a], ...path.steps.map((s) => ELEMENT_NAME[s.to])].join(' → ') + (r.mode === 'condense' ? ' · condense' : ' · sealed') : `${ELEMENT_NAME[a]} → no seal yet`
  const t = path && r.source ? terms(sigil, r.source, eq, path) : null
  const extras = [r.outputs.reachMult > 1 ? `Reach up ×${r.outputs.reachMult} from motes` : '', r.outputs.guard ? `+${r.outputs.guard} Ward from motes` : ''].filter(Boolean)
  let change = r.mode === 'none' ? `<p class="note">${esc(r.mode === 'none' && !path && a !== 'none' ? 'Circumscribe or inscribe a rune to seal the equation: its element is the output.' : r.note)}</p>` : ''
  if (t && r.mode !== 'none') {
    const src = `${GRADE_NAMES[r.source!.grade]} ${r.source!.elemental}`
    const tgt = `${r.mode === 'condense' ? GRADE_NAMES[r.target!.grade] + ' ' : ''}${r.target!.elemental}`
    const tk = take(eq, t, r.source!.kg)
    const wanted = tk.wanted
    const neutralPart = eq.share ? `${Math.round(eq.share * 100)}% of ${kg(r.source!.kg)}${eq.neutral ? ` + ${num(eq.neutral)} kg` : ''}` : `${num(eq.neutral)} kg`
    change = `<p class="formula num">${neutralPart} <span class="op">×</span> ${tk.gate < 1 ? `${num(t.power)}<span class="op">÷</span>${num(t.resistance)} <span class="op">×</span> ` : ''}(${num(t.reachUp)} <span class="op">÷</span> ${num(t.reachDown)})<sup>${t.authority.toFixed(2)}</sup> <span class="op">=</span> <b>${kg(r.converted)}</b>${tk.gate < 1 ? ' <span class="warn">· power short</span>' : ''}</p>
      <p class="fine">Exponent ln(1 + ${num(t.power)} ÷ ${num(t.resistance)}): power against resistance. Resistance ${num(eq.base)} base × ${GRADE_NAMES[r.source!.grade]} × ${eq.step}<sup>${t.path.flips + (t.condense ? 1 : 0)}</sup> for the steps flipped.</p>
      <p class="change">${src} → <b class="num">${kg(r.produced)}</b> ${tgt} <span class="of">· output ×${t.multiplier.toFixed(2)}</span>${wanted > r.source!.kg + 1e-9 ? ' <span class="warn">· all there is</span>' : ''}</p>`
  }
  if (extras.length) change += `<p class="motes-note">${extras.join(' · ')}</p>`
  const after = preview.cast.finished
    ? `<p class="after win">This cast makes clay and finishes the commission.</p>`
    : `<p class="after">After this cast: ${shareLine(g, preview.cast.pools)}</p>`
  const e = preview.end
  const cost = !e
    ? ''
    : e.flare + e.strain > 0
      ? `<p class="cost">End the term after it: ${e.flare ? `flare ${e.flare}` : ''}${e.flare && e.strain ? ' + ' : ''}${e.strain ? `strain ${e.strain}` : ''} − Ward ${num(e.absorbed)} → <b class="${e.paid > 0 ? 'warn' : 'good'}">${e.paid > 0 ? `pay ${num(e.paid)}` : 'nothing to pay'}</b></p>`
      : `<p class="cost">End the term after it: no instability.</p>`
  return `
      <p class="route">${route}</p>
      <div class="outputs">
        <div><span class="label">Power</span><span class="num big">${t ? `${num(t.power)} <span class="of">/ ${num(t.resistance)}</span>` : '—'}</span></div>
        <div><span class="label">Reach</span><span class="num big">${t ? `↑${num(t.reachUp)} ↓${num(t.reachDown)}` : '—'}</span></div>
        <div><span class="label">Ward</span><span class="num big">${num(r.outputs.ward)}</span></div>
      </div>
      ${change}${after}${cost}`
}

/** What a rune would add to the sigil if joined this way. */
function joinHint(r: Rune, kind: JoinKind, sigil: Sigil): string {
  const same = r.affinity === sigil.anchor.affinity && r.affinity !== 'none'
  const eq = ui.game?.settings.equation
  if (eq) {
    const hint: Record<JoinKind, string> = {
      circumscribe: `+${r.power} power · ×${num(eq.ring + r.boost)}`,
      inscribe: same ? `+${r.power} power · condense` : `+${r.power} power · ÷${num(eq.inscribe + r.boost)}`,
      side: `+${r.power} reach up`,
      tangent: `+${r.power} reach down`,
      entwine: `+${num(r.power * WARD_PER_POWER)} Ward`,
    }
    return hint[kind]
  }
  const hint: Record<JoinKind, string> = {
    circumscribe: `+${r.power} Force · target`,
    side: `+${kg(r.power * REACH_PER_POWER)} Reach`,
    entwine: `+${num(r.power * WARD_PER_POWER)} Ward`,
    inscribe: same ? `+${r.power} Force · condense` : `+${r.power} Force · ½ Reach`,
    tangent: `+${r.power} reach down`,
  }
  return hint[kind]
}

/** The line under a card: its role in the sigil, whether it can still join, or its abilities. */
function cardHint(r: Rune): string {
  const own = abilities(r)
  const sigil = currentSigil()
  if (ui.discarding || !sigil) return own.join(', ') || BODY_NAMES[r.body]
  if (!canJoin(sigil, r)) return 'No open link'
  return 'Tap to join'
}

/** The radial menu of joins around the tapped rune. */
function radialView(g: GameState): string {
  const at = ui.radial
  const sigil = currentSigil()
  const rune = at && g.hand.find((h) => h.id === at.id)
  if (!at || !sigil || !rune) return ''
  const options = joinList(!!g.settings.equation)
  const radius = 86
  const halfW = radius + 60
  const halfH = radius + 30
  const x = Math.min(Math.max(at.x, halfW), Math.max(halfW, window.innerWidth - halfW))
  const y = Math.min(Math.max(at.y, halfH), Math.max(halfH, window.innerHeight - halfH))
  const name = `${rune.affinity === 'none' ? '' : ELEMENT_NAME[rune.affinity] + ' '}${BODY_NAMES[rune.body].toLowerCase()}`
  return `<div class="radial-backdrop" data-act="radial-close"></div>
  <div class="radial" role="menu" aria-label="Join the ${name}" style="left:${x}px;top:${y}px;--r:${radius}px">
    <button class="radial-center" data-act="radial-close" aria-label="Cancel" style="--c:${AFFINITY_VAR[rune.affinity]}">${runeSvg(rune, 40)}</button>
    ${options
      .map(
        (o, i) => `<button class="radial-opt" role="menuitem" data-act="radial-pick" data-kind="${o.kind}" style="--a:${-90 + (360 / options.length) * i}deg">
        <span class="mode-name">${o.label}</span>
        <span class="mode-gives">${joinHint(rune, o.kind, sigil)}</span>
      </button>`,
      )
      .join('')}
  </div>`
}

/** The draw and discard piles, opened from the buttons under the header. */
function pilesBar(g: GameState): string {
  return `<nav class="piles" aria-label="Piles">
    <button data-act="pile-open" data-pile="draw" aria-haspopup="dialog">Draw pile <b class="num">${g.draw.length}</b></button>
    <button data-act="pile-open" data-pile="discard" aria-haspopup="dialog">Discard <b class="num">${g.discard.length}</b></button>
  </nav>`
}

function pileSheet(g: GameState): string {
  if (!ui.pile) return ''
  const runes = (ui.pile === 'draw' ? g.draw : g.discard)
    .slice()
    .sort((a, b) => BODY_ORDER.indexOf(a.body) - BODY_ORDER.indexOf(b.body) || ORDER.indexOf(a.affinity) - ORDER.indexOf(b.affinity) || a.id - b.id)
  const counts = ORDER.map((e) => [e, runes.filter((h) => h.affinity === e).length] as const)
    .filter(([, n]) => n > 0)
    .map(([e, n]) => `<span style="color:${AFFINITY_VAR[e as keyof typeof AFFINITY_VAR]}">${n} ${e === 'none' ? 'without element' : e}</span>`)
    .join(' · ')
  const title = ui.pile === 'draw' ? 'Draw pile' : 'Discard pile'
  const note =
    ui.pile === 'draw'
      ? runes.length
        ? `Sorted, so the draw order stays hidden. ${counts}.`
        : 'Empty: the discard pile reshuffles into it at the next draw.'
      : runes.length
        ? `Played and discarded runes. They reshuffle into the draw pile when it runs out. ${counts}.`
        : 'Nothing discarded yet.'
  return `<div class="sheet-backdrop" data-act="pile-close"></div>
  <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-head"><h2 id="sheet-title">${title} <span class="num summary-note">${runes.length}</span></h2><button data-act="pile-close" aria-label="Close">Close</button></div>
    <p class="deck-left">${note}</p>
    <ul class="deck-list">
      ${runes
        .map(
          (h) => `<li class="deck-item" style="--c:${AFFINITY_VAR[h.affinity]}">
            ${runeSvg(h, 34)}
            <span class="deck-item-text">
              <span class="deck-item-name">${h.affinity === 'none' ? BODY_NAMES[h.body] : `${ELEMENT_NAME[h.affinity]} ${BODY_NAMES[h.body].toLowerCase()}`} · <span class="num">${h.power}</span> · ${linksWord(h.links)}</span>
              <span class="deck-item-motes">${h.motes.map((m) => `<span class="mote-chip"><span class="mote-dot" style="background:${moteColor(m)}"></span>${moteName(m)}${m.kind === 'element' ? '' : ': ' + moteEffect(m, g.forge.values)}</span>`).join('')}</span>
            </span>
          </li>`,
        )
        .join('')}
    </ul>
  </section>`
}

/** The Reach × Force arithmetic, spelled out. */
function formulaView(r: Resolution, surplus: boolean): string {
  const o = r.outputs
  const src = `${GRADE_NAMES[r.source!.grade]} ${r.source!.elemental}`
  const tgt = `${r.mode === 'condense' ? GRADE_NAMES[r.target!.grade] + ' ' : ''}${r.target!.elemental}`
  const capped = o.reach * r.efficiency > r.source!.kg + 1e-9
  const wasted = !surplus && o.force > r.required
  return `<p class="formula num">Reach ${kg(o.reach)} <span class="op">×</span> Force ${num(o.force)} <span class="op">÷</span> ${num(r.required)} needed <span class="op">=</span> <b>${kg(r.converted)}</b></p>
    <p class="change">${src} → <b class="num">${kg(r.produced)}</b> ${tgt}${r.efficiency < 1 ? ' <span class="warn">· Force short</span>' : ''}${capped ? ' <span class="warn">· all there is</span>' : ''}${wasted ? ' <span class="warn">· extra Force wasted</span>' : ''}</p>`
}

/**
 * Which join adds more right now. Reach and Force multiply, so the answer
 * depends on the sigil so far: compare the best side link and the best
 * circumscribe (one that keeps the same target) left in hand.
 */
function tipView(g: GameState, sigil: Sigil, r: Resolution): string {
  if (r.mode !== 'transmute' || openLinks(sigil) <= 0) return ''
  const target = r.outputs.route!.at(-1)
  const used = new Set([sigil.anchor.id, ...sigil.joins.map((j) => j.rune.id)])
  const gain = (kind: JoinKind, rune: Rune) =>
    resolve({ anchor: sigil.anchor, joins: [...sigil.joins, { kind, rune }] }, g.pools, ui.poolKey, g.settings).converted - r.converted
  let side: { rune: Rune; kg: number } | null = null
  let circ: { rune: Rune; kg: number } | null = null
  for (const h of g.hand) {
    if (used.has(h.id)) continue
    const l = gain('side', h)
    if (!side || l > side.kg) side = { rune: h, kg: l }
    if (h.affinity === target || h.affinity === 'none') {
      const c = gain('circumscribe', h)
      if (!circ || c > circ.kg) circ = { rune: h, kg: c }
    }
  }
  const name = (x: { rune: Rune }) => `the ${x.rune.affinity === 'none' ? '' : ELEMENT_NAME[x.rune.affinity].toLowerCase() + ' '}${BODY_NAMES[x.rune.body].toLowerCase()}`
  const parts = [
    side && side.kg > 0.005 ? `side-linking ${name(side)} adds <b class="num">${kg(side.kg)}</b>` : '',
    circ && circ.kg > 0.005 ? `circumscribing ${name(circ)} adds <b class="num">${kg(circ.kg)}</b>` : '',
  ].filter(Boolean)
  if (!parts.length) return ''
  return `<p class="tip">Next: ${parts.join('; ')}.</p>`
}

function handView(g: GameState): string {
  return `<section class="hand" aria-label="Hand">
    ${g.hand
      .map((h) => {
        const role = roleOf(h.id)
        const marked = ui.marked.has(h.id)
        const blocked = !role && !ui.discarding && ui.anchorId !== null && !canJoin(currentSigil()!, h)
        return `<button class="card ${role ? 'in-rune' : ''} ${marked ? 'marked' : ''} ${blocked ? 'blocked' : ''}" data-act="card" data-id="${h.id}" style="--c:${AFFINITY_VAR[h.affinity]}" aria-label="${ELEMENT_NAME[h.affinity]} ${BODY_NAMES[h.body].toLowerCase()}, power ${h.power}, ${linksWord(h.links)}${role ? ', ' + role : ''}">
          <span class="card-value num">${h.power}</span>
          ${pips(h.links)}
          ${runeSvg(h, 56)}
          <span class="card-name">${ELEMENT_NAME[h.affinity]}</span>
          <span class="card-sides">${role ?? cardHint(h)}</span>
        </button>`
      })
      .join('')}
  </section>`
}

function actionsView(g: GameState, sigil: Sigil | null, preview: CastPreview | null, end: EndOutcome): string {
  if (ui.discarding) {
    return `<div class="actions">
      <button data-act="discard-cancel">Cancel</button>
      <button class="primary" data-act="discard-confirm" ${ui.marked.size ? '' : 'disabled'}>Discard ${ui.marked.size || ''} and redraw</button>
    </div>`
  }
  const invalid = sigil ? invalidReason(g, sigil) : 'Choose an anchor.'
  const castLabel = preview?.cast.finished ? 'Cast · finish' : 'Cast'
  return `<div class="actions four">
    <button data-act="clear" ${sigil ? '' : 'disabled'}>Clear</button>
    <button data-act="discard-mode" ${g.discardsLeft > 0 && !sigil ? '' : 'disabled'}>Discard <span class="num">(${g.discardsLeft})</span></button>
    <button class="primary" data-act="cast" ${invalid ? 'disabled' : ''}>${castLabel}</button>
    <button class="end-term" data-act="end-term" ${g.phase === 'compose' ? '' : 'disabled'}>End term<span class="sub num">${end.paid > 0 ? `pay ${num(end.paid)}` : 'no cost'}</span></button>
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
      <p>${won ? 'The clay is set and paid for.' : `Your quintessence ran out at ${shareLine(g, g.pools)}.`}</p>
      <dl class="end-stats">
        <div><dt>Terms</dt><dd class="num">${termsUsed(g)}</dd></div>
        <div><dt>Spent</dt><dd class="num">${num(g.spent)}</dd></div>
        <div><dt>Payment</dt><dd class="num">${won ? payment(g) : '—'}</dd></div>
      </dl>
      <div class="row">
        <button data-act="replay">Replay this draw</button>
        <button data-act="restart">New draw</button>
        <button data-act="menu">Rules</button>
      </div>
    </div>
  </div>`
}

const ORDER = ['water', 'earth', 'air', 'fire', 'none']
const BODY_ORDER: Body[] = ['circle', 'crescent', 'triangle']

// ---------------------------------------------------------------------------
// Table metrics

const MEASURES: { key: Measure; label: string }[] = [
  { key: 'runes', label: 'Runes' },
  { key: 'motes', label: 'Gems' },
  { key: 'sides', label: 'Sides' },
]
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function metricsView(g: GameState): string {
  const sigils = ui.scope === 'table' ? g.table.map((e) => e.sigil) : sigilsPlayed(g)
  const m = metricsOf(sigils)
  const cell = (n: number) => `<td class="num ${n ? '' : 'zero'}">${n}</td>`
  const rows = AFFINITIES.map((a) => {
    const name = a === 'none' ? 'No element' : ELEMENT_NAME[a]
    const gems = a === 'none' ? '<td class="zero">–</td>' : cell(m.motes[a])
    return `<tr><th scope="row" style="color:${AFFINITY_VAR[a]}">${name}</th>${cell(m.runesBy[a])}${gems}${BODY_LIST.map((b) => cell(m.grid[a][b])).join('')}${cell(m.sidesBy[a])}</tr>`
  }).join('')
  const gemsTotal = Object.values(m.motes).reduce((x, y) => x + y, 0)
  const totals = `<tr class="total"><th scope="row">Total</th>${cell(m.runes)}${cell(gemsTotal)}${BODY_LIST.map((b) => cell(m.bodies[b])).join('')}${cell(m.sides)}</tr>`
  const bal = MEASURES.map((x) => ({ ...x, b: balance(m, x.key) }))
  return `<details class="panel metrics" data-panel="metrics" ${ui.open.has('metrics') ? 'open' : ''}>
    <summary>Table metrics <span class="summary-note num">· ${m.sigils} sigil${m.sigils === 1 ? '' : 's'}, ${m.runes} rune${m.runes === 1 ? '' : 's'}</span></summary>
    <div class="seg two" role="group" aria-label="Count">
      <button data-act="scope" data-scope="table" class="${ui.scope === 'table' ? 'is-on' : ''}" aria-pressed="${ui.scope === 'table'}">On the table</button>
      <button data-act="scope" data-scope="played" class="${ui.scope === 'played' ? 'is-on' : ''}" aria-pressed="${ui.scope === 'played'}">Played this commission</button>
    </div>
    <div class="table-wrap">
      <table class="mtable">
        <thead><tr><th></th><th scope="col">Runes</th><th scope="col">Gems</th>${BODY_LIST.map((b) => `<th scope="col" title="${BODY_NAMES[b]}s">${bodyIcon(b)}<span class="sr">${BODY_NAMES[b]}s</span></th>`).join('')}<th scope="col">Sides</th></tr></thead>
        <tbody>${rows}${totals}</tbody>
      </table>
    </div>
    <div class="table-wrap">
      <table class="mtable balance-table">
        <thead><tr><th></th>${bal.map((x) => `<th scope="col">${x.label}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><th scope="row">Earth − Air</th>${bal.map((x) => `<td class="num">${signed(x.b.earthAir)}</td>`).join('')}</tr>
          <tr><th scope="row">Water − Fire</th>${bal.map((x) => `<td class="num">${signed(x.b.waterFire)}</td>`).join('')}</tr>
          <tr class="total"><th scope="row">Imbalance</th>${bal.map((x) => `<td class="num">${x.b.total}</td>`).join('')}</tr>
        </tbody>
      </table>
    </div>
    <p class="fine">Sides count circle 1, crescent ${SIDES.crescent}, triangle ${SIDES.triangle}. Gems counts every gem a rune holds; runes count by the first. Strain uses runes: every 2 points of imbalance past 2 add 1 a term.</p>
    <div class="row"><button data-act="copy-csv" ${g.history.length || g.casts.length ? '' : 'disabled'}>${ui.copied ? 'Copied' : 'Copy the per-term record'}</button></div>
    ${ui.csv ? `<textarea class="csv" id="csv-out" readonly rows="6" aria-label="Per-term record as CSV">${esc(ui.csv)}</textarea><p class="fine">Copying was blocked here, so the record is above: select it and copy.</p>` : ''}
  </details>`
}

function sigilSummary(sg: Sigil): string {
  const name = (r: Rune) => `${r.affinity === 'none' ? '' : ELEMENT_NAME[r.affinity] + ' '}${BODY_NAMES[r.body].toLowerCase()}`
  const join: Record<JoinKind, string> = { circumscribe: 'circ', side: 'side', entwine: 'entwine', inscribe: 'insc', tangent: 'tangent' }
  return [name(sg.anchor), ...sg.joins.map((j) => `${join[j.kind]} ${name(j.rune)}`)].join(' + ')
}

/** One row per term: what was cast, what it cost, and every balance measure after it. */
function recordCsv(g: GameState): string {
  const els = ['water', 'earth', 'air', 'fire'] as const
  const head = [
    'term', 'sigils', 'casts', ...els.map((e) => `share_${e}`), 'flare', 'strain', 'ward', 'paid',
    ...els.map((e) => `table_runes_${e}`), ...els.map((e) => `table_gems_${e}`), ...[...els, 'none'].map((e) => `table_sides_${e}`),
    'table_circles', 'table_crescents', 'table_triangles', 'table_imb_runes', 'table_imb_gems', 'table_imb_sides',
    ...els.map((e) => `played_gems_${e}`), 'played_circles', 'played_crescents', 'played_triangles', 'played_sides', 'played_imb_gems', 'played_imb_sides',
  ]
  const terms: { term: number; casts: CastOutcome[]; pools: Pool[]; table: TableEntry[]; end?: TermOutcome }[] = g.history.map((t) => ({ term: t.term, casts: t.casts, pools: t.pools, table: t.table, end: t }))
  if (g.casts.length) terms.push({ term: g.term, casts: g.casts, pools: g.pools, table: g.table })
  const played: Sigil[] = []
  const rows = terms.map((t) => {
    played.push(...t.casts.map((c) => c.sigil))
    const tm = metricsOf(t.table.map((e) => e.sigil))
    const pm = metricsOf(played)
    const sh = shares(t.pools)
    return [
      t.term, `"${t.casts.map((c) => sigilSummary(c.sigil)).join(' | ')}"`, t.casts.length, ...els.map((e) => sh[e].toFixed(4)),
      t.end?.flare ?? '', t.end?.strain ?? '', t.end ? num(t.end.ward) : num(g.termWard), t.end ? num(t.end.paid) : '',
      ...els.map((e) => tm.runesBy[e]), ...els.map((e) => tm.motes[e]), ...[...els, 'none' as const].map((e) => tm.sidesBy[e]),
      tm.bodies.circle, tm.bodies.crescent, tm.bodies.triangle, balance(tm, 'runes').total, balance(tm, 'motes').total, balance(tm, 'sides').total,
      ...els.map((e) => pm.motes[e]), pm.bodies.circle, pm.bodies.crescent, pm.bodies.triangle, pm.sides, balance(pm, 'motes').total, balance(pm, 'sides').total,
    ].join(',')
  })
  return [head.join(','), ...rows].join('\n')
}

// ---------------------------------------------------------------------------
// Sandbox

const BOUNDS: Record<string, [number, number, number]> = {
  power: [1, 15, 1],
  links: [0, 4, 1],
  bowls: [0, 6, 1],
  reach: [1, 3, 0.25],
  guard: [0, 12, 1],
  boost: [0, 1, 0.05],
}

function stepper(target: string, value: number, field: string, label: string): string {
  const [lo, hi] = BOUNDS[field]
  return `<span class="stepper" role="group" aria-label="${label}">
    <button data-act="sb-step" data-target="${target}" data-delta="-1" ${value <= lo ? 'disabled' : ''} aria-label="Less ${label}">−</button>
    <b class="num">${num(value)}</b>
    <button data-act="sb-step" data-target="${target}" data-delta="1" ${value >= hi ? 'disabled' : ''} aria-label="More ${label}">+</button>
  </span>`
}

function moteSelect(bowl: number, current?: string): string {
  return `<label class="bowl-pick"><span class="label">Bowl ${bowl + 1}</span>
    <select id="sb-bowl-${bowl}" data-sb-bowl="${bowl}">
      <option value="" ${!current ? 'selected' : ''}>Empty</option>
      ${MOTE_OPTIONS.map((o) => `<option value="${o.key}" ${o.key === current ? 'selected' : ''}>${moteName(o.mote)} · ${moteEffect(o.mote, ui.game!.forge.values)}</option>`).join('')}
    </select>
  </label>`
}

function editorView(g: GameState): string {
  if (ui.editing === null) return `<p class="hint">Pick a rune above to change its body and motes, or make a new one.</p>`
  const found = ui.editing === 'new' ? undefined : findRune(g, ui.editing)
  if (ui.editing !== 'new' && !found) return ''
  const spec: RuneSpec = found ? { body: found.rune.body, motes: found.rune.motes } : ui.draft
  const preview = found ? found.rune : buildDeck([spec], g.forge)[0]
  const bowls = g.forge.bodies[spec.body].bowls
  const own = abilities(preview)
  return `<div class="editor">
    <div class="editor-head">
      ${runeSvg(preview, 64)}
      <div>
        <p class="editor-title">${ui.editing === 'new' ? 'New rune' : `${preview.affinity === 'none' ? 'Elementless' : ELEMENT_NAME[preview.affinity]} ${BODY_NAMES[preview.body].toLowerCase()}`}</p>
        <p class="editor-line num">Power ${preview.power} · ${linksWord(preview.links)}${own.length ? ' · ' + own.join(' · ') : ''}</p>
        <p class="editor-line">${found ? `In your ${found.at === 'draw' ? 'draw pile' : found.at}. Changes apply now.` : 'Not in the deck yet.'}</p>
      </div>
    </div>
    <div class="seg" role="group" aria-label="Body">
      ${BODY_LIST.map((b) => `<button data-act="sb-body" data-body="${b}" class="${spec.body === b ? 'is-on' : ''}" aria-pressed="${spec.body === b}">${BODY_NAMES[b]}</button>`).join('')}
    </div>
    <div class="bowls">${bowls ? Array.from({ length: bowls }, (_, i) => moteSelect(i, spec.motes[i] ? moteKey(spec.motes[i]) : undefined)).join('') : '<p class="hint">This body has no bowls.</p>'}</div>
    <div class="row">
      ${ui.editing === 'new' ? `<button class="primary" data-act="sb-add">Add to hand</button>` : `<button data-act="sb-copy">Add a copy to hand</button><button data-act="sb-remove">Remove from deck</button>`}
    </div>
  </div>`
}

const GRADES: Grade[] = [0, 1, 2, 3]

function commissionEditor(g: GameState): string {
  const row = (e: Elemental) => {
    const pools = g.start.filter((p) => p.elemental === e)
    const kgSum = pools.reduce((n, p) => n + p.kg, 0)
    const grade = pools[0]?.grade ?? 0
    const r = g.target[e]
    const pctVal = (x: number) => +(x * 100).toFixed(2)
    return `<tr>
      <th scope="row" style="color:${AFFINITY_VAR[e]}">${ELEMENT_NAME[e]}</th>
      <td><input type="number" inputmode="decimal" id="sb-kg-${e}" data-comp="kg" data-el="${e}" min="0" step="0.5" value="${+kgSum.toFixed(2)}" aria-label="${e} kg"></td>
      <td><select id="sb-grade-${e}" data-comp="grade" data-el="${e}" aria-label="${e} grade">${GRADES.map((gr) => `<option value="${gr}" ${gr === grade ? 'selected' : ''}>${GRADE_NAMES[gr]}</option>`).join('')}</select></td>
      <td class="range-cell"><input type="number" inputmode="decimal" id="sb-min-${e}" data-comp="min" data-el="${e}" min="0" max="100" step="0.5" value="${pctVal(r.min)}" aria-label="${e} target minimum %"><span>–</span><input type="number" inputmode="decimal" id="sb-max-${e}" data-comp="max" data-el="${e}" min="0" max="100" step="0.5" value="${pctVal(r.max)}" aria-label="${e} target maximum %"></td>
    </tr>`
  }
  const total = g.start.reduce((n, p) => n + p.kg, 0)
  return `<div class="sb-section">
    <h3>Commission</h3>
    <div class="table-wrap">
      <table class="mtable comp-table">
        <thead><tr><th></th><th scope="col">Mud, kg</th><th scope="col">Grade</th><th scope="col">Target, %</th></tr></thead>
        <tbody>${ELEMENT_ORDER.map(row).join('')}</tbody>
      </table>
    </div>
    <p class="fine">The mud starts at <span class="num">${kg(total)}</span>. Changing it resets the amalgam to the new mix; the term, table and quintessence stay. A target of 0–100 accepts any share, and bounds are strict. <button class="link-btn" data-act="sb-reset-commission">Reset mud and clay</button></p>
  </div>`
}

/** Read the composition and target fields and apply whichever changed. */
function applyCommissionEdit(field: string) {
  const g = ui.game!
  const val = (id: string) => Number((document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? 0)
  if (field === 'kg' || field === 'grade') {
    const pools: Pool[] = ELEMENT_ORDER.map((e) => ({ elemental: e, grade: Math.min(3, Math.max(0, val(`sb-grade-${e}`))) as Grade, kg: Math.max(0, val(`sb-kg-${e}`)) }))
    ui.game = setComposition(g, pools)
  } else {
    const t = cloneTarget(g.target)
    for (const e of ELEMENT_ORDER) {
      const min = Math.min(100, Math.max(0, val(`sb-min-${e}`))) / 100
      const max = Math.min(100, Math.max(0, val(`sb-max-${e}`))) / 100
      t[e] = { min: Math.min(min, max), max: Math.max(min, max) }
    }
    ui.game = setTarget(g, t)
  }
}

function sandboxView(g: GameState): string {
  const f = g.forge
  const where = (at: 'hand' | 'draw' | 'discard', title: string) => {
    const rs = g[at]
    if (!rs.length) return ''
    return `<div class="picker-group"><span class="label">${title}</span><div class="picker">${rs
      .map((r) => `<button class="pick ${ui.editing === r.id ? 'is-on' : ''}" data-act="sb-pick" data-id="${r.id}" aria-pressed="${ui.editing === r.id}" aria-label="Edit ${ELEMENT_NAME[r.affinity]} ${BODY_NAMES[r.body].toLowerCase()}">${runeSvg(r, 34)}</button>`)
      .join('')}</div></div>`
  }
  return `<details class="panel sandbox" id="sandbox" data-panel="sandbox" ${ui.open.has('sandbox') ? 'open' : ''}>
    <summary>Sandbox</summary>
    ${commissionEditor(g)}
    <div class="sb-section">
      <h3>Shapes</h3>
      <div class="shape-table" role="table">
        <div class="shape-row head" role="row"><span></span><span class="label">Power</span><span class="label">Links</span><span class="label">Bowls</span></div>
        ${BODY_LIST.map(
          (b) => `<div class="shape-row" role="row">
            <span class="shape-name">${runeSvg(buildDeck([{ body: b, motes: [] }], f)[0], 30)}${BODY_NAMES[b]}</span>
            ${stepper(`${b}.power`, f.bodies[b].power, 'power', `${b} power`)}
            ${stepper(`${b}.links`, f.bodies[b].links, 'links', `${b} links`)}
            ${stepper(`${b}.bowls`, f.bodies[b].bowls, 'bowls', `${b} bowls`)}
          </div>`,
        ).join('')}
      </div>
      <div class="mote-values">
        <span class="mv"><span class="mote-dot" style="background:var(--opal)"></span>Reach mote ×${stepper('values.reach', f.values.reach, 'reach', 'reach mote multiplier')}</span>
        <span class="mv"><span class="mote-dot" style="background:var(--opal)"></span>Guard mote +${stepper('values.guard', f.values.guard, 'guard', 'guard mote Ward')} Ward</span>
        <span class="mv"><span class="mote-dot" style="background:var(--opal)"></span>Boost mote +${stepper('values.boost', f.values.boost, 'boost', 'boost mote multiplier')} multiplier</span>
      </div>
      <p class="fine">Shrinking a body’s bowls drops the motes that no longer fit. <button class="link-btn" data-act="sb-reset-forge">Reset shapes and motes</button></p>
    </div>
    <div class="sb-section">
      <h3>Runes</h3>
      <div class="picker-group"><div class="picker"><button class="pick new ${ui.editing === 'new' ? 'is-on' : ''}" data-act="sb-new" aria-pressed="${ui.editing === 'new'}">+ New</button></div></div>
      ${where('hand', 'In hand')}${where('draw', 'Draw pile')}${where('discard', 'Discard')}
      ${editorView(g)}
      <p class="fine">New runes join the deck. Restarting keeps every change here. <button class="link-btn" data-act="sb-standard">Restart with the standard deck</button></p>
    </div>
    <div class="sb-section">
      <h3>Decks along a run</h3>
      ${presetView()}
    </div>
  </details>`
}

/** Apply a body/mote edit to whichever rune the sandbox is editing. */
function editSpec(fn: (spec: RuneSpec) => RuneSpec) {
  const g = ui.game!
  if (ui.editing === 'new') {
    ui.draft = fn({ body: ui.draft.body, motes: ui.draft.motes.slice() })
    return
  }
  if (typeof ui.editing !== 'number') return
  const found = findRune(g, ui.editing)
  if (!found) return
  ui.game = editRune(g, ui.editing, fn({ body: found.rune.body, motes: found.rune.motes.slice() }))
}

function setBowl(i: number, key: string) {
  const mote = moteFromKey(key)
  editSpec((spec) => {
    const motes = spec.motes.slice()
    if (!mote) motes.splice(i, 1)
    else if (i < motes.length) motes[i] = mote
    else motes.push(mote)
    return { ...spec, motes }
  })
}

function stepForge(target: string, delta: number) {
  const g = ui.game!
  const forge: Forge = cloneForge(g.forge)
  const [group, field] = target.split('.')
  const [lo, hi, step] = BOUNDS[field]
  const clamp = (v: number) => Math.min(hi, Math.max(lo, Math.round((v + delta * step) * 100) / 100))
  if (group === 'values') forge.values[field as 'reach' | 'guard' | 'boost'] = clamp(forge.values[field as 'reach' | 'guard' | 'boost'])
  else forge.bodies[group as Body][field as 'power' | 'links' | 'bowls'] = clamp(forge.bodies[group as Body][field as 'power' | 'links' | 'bowls'])
  ui.game = setForge(g, forge)
  if (forge.bodies[ui.draft.body].bowls < ui.draft.motes.length) ui.draft = { ...ui.draft, motes: ui.draft.motes.slice(0, forge.bodies[ui.draft.body].bowls) }
}

function historyView(g: GameState): string {
  if (!g.history.length) return ''
  return `<details class="panel history" data-panel="history" ${ui.open.has('history') ? 'open' : ''}>
    <summary>Term history</summary>
    <ol reversed>${g.history
      .slice()
      .reverse()
      .map((t) => `<li><span class="h-end">${esc(describeEnd(t))}</span>${t.casts.length ? `<ul>${t.casts.map((c) => `<li>${esc(describeCast(c))}</li>`).join('')}</ul>` : ''}</li>`)
      .join('')}</ol>
  </details>`
}

function gameView(g: GameState): string {
  const sigil = currentSigil()
  const preview = sigil && g.phase === 'compose' && !ui.discarding && !invalidReason(g, sigil) ? previewCast(g, sigil, ui.poolKey) : null
  const end = previewEnd(g)
  const selected = preview?.cast.resolution.source ? poolKey(preview.cast.resolution.source) : undefined
  const threatened = g.intent.kind === 'slump' ? (preview?.end ? preview.end.removed?.id : slumpTarget(g.table)?.id) : undefined
  const share = shares(g.pools).earth
  const name = substanceName(g.pools, g.target)
  const qPct = Math.max(0, Math.min(100, (g.quintessence / g.settings.stock) * 100))
  return `
  <main class="game">
    <header class="top">
      <div>
        <p class="eyebrow">Commission</p>
        <h1 class="title">Mud <span class="arrow">→</span> Clay</h1>
      </div>
      <a class="jump" href="#sandbox" data-act="to-sandbox">Sandbox</a>
      <div class="quint" aria-label="Quintessence ${num(g.quintessence)} of ${g.settings.stock}">
        <span class="label">Quintessence</span>
        <span class="num quint-num">${num(g.quintessence)}</span>
        <span class="quint-bar"><span style="width:${qPct}%"></span></span>
      </div>
    </header>

    ${pilesBar(g)}
    ${intentView(g, end)}

    <section class="vessel panel">
      ${vesselSvg(g.pools, g.table, share, { previewShare: preview ? shares(preview.cast.pools).earth : undefined, selectedKey: selected, threatenedId: threatened, previewSigil: sigil, band: constrained(g.target.earth) ? g.target.earth : undefined })}
      <div class="vessel-read">
        <p class="substance ${name === 'Clay' ? 'is-clay' : ''}">${name}</p>
        <p class="read-line"><span class="num">${kg(totalKg(g.pools))}</span> · target ${ELEMENT_ORDER.filter((e) => constrained(g.target[e])).map((e) => `${e} ${rangeText(g.target[e])}`).join(', ')}</p>
        <div class="tchips">${targetChips(g)}</div>
      </div>
      ${poolsView(g, sigil, selected)}
      ${balanceView(g, preview)}
    </section>

    ${lastTermView(g)}
    ${composerView(g, sigil, preview)}
    ${handView(g)}
    ${actionsView(g, sigil, preview, end)}
    ${sandboxView(g)}
    ${historyView(g)}
    ${metricsView(g)}
    ${tuningView()}
    ${endView(g)}
    ${radialView(g)}
    ${pileSheet(g)}
  </main>`
}

// ---------------------------------------------------------------------------
// Rendering and events

const root = document.getElementById('app')!

function render() {
  root.innerHTML = ui.game ? gameView(ui.game) : startView()
}

function tapCard(id: number, rect?: DOMRect) {
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
  const rune = g.hand.find((h) => h.id === id)!
  if (ui.anchorId === null) {
    ui.anchorId = id
    ui.poolKey = undefined
    return
  }
  const sigil = currentSigil()!
  if (!canJoin(sigil, rune)) {
    const a = sigil.anchor
    ui.flash = `This ${BODY_NAMES[a.body].toLowerCase()} anchor has ${linksWord(a.links)}, and ${a.links === 1 ? 'it is' : 'they are'} used. Anchor a rune with more links to hold more.`
    return
  }
  ui.radial = { id: rune.id, x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2 }
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
  s.castsPerTerm = n('tune-casts', s.castsPerTerm)
  const rules = val('tune-rules')
  if (rules) {
    if (rules.value === 'classic') s.equation = null
    else {
      const prev = s.equation ?? DEFAULT_EQUATION
      const ring = n('tune-eq-ring', prev.ring)
      const chosen = NEUTRAL_TAKES.find((t) => t.key === (val('tune-eq-take')?.value ?? takeKey(prev))) ?? NEUTRAL_TAKES[0]
      const gateEl = val('tune-eq-gate') as HTMLInputElement | null
      s.equation = { ...prev, base: n('tune-eq-base', prev.base), step: n('tune-eq-step', prev.step), neutral: chosen.neutral, share: chosen.share, gate: gateEl ? gateEl.checked : prev.gate, ring, inscribe: ring }
    }
  }
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
  const el = e.target as HTMLElement
  if (el.closest('.tuning')) readTuning()
  const comp = (el as HTMLInputElement).dataset?.comp
  if (comp && ui.game) {
    applyCommissionEdit(comp)
    render()
    return
  }
  const bowl = (el as HTMLSelectElement).dataset?.sbBowl
  if (bowl !== undefined && ui.game) {
    setBowl(Number(bowl), (el as HTMLSelectElement).value)
    render()
  }
})

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!el || (el as HTMLButtonElement).disabled) return
  const act = el.dataset.act
  const g = ui.game
  switch (act) {
    case 'start':
      readTuning()
      startGame()
      window.scrollTo({ top: 0 })
      break
    case 'card':
      tapCard(Number(el.dataset.id), el.getBoundingClientRect())
      break
    case 'radial-pick':
      if (ui.radial) ui.joins.push({ kind: el.dataset.kind as JoinKind, id: ui.radial.id })
      ui.radial = null
      break
    case 'radial-close':
      ui.radial = null
      break
    case 'pile-open':
      ui.pile = el.dataset.pile as 'draw' | 'discard'
      break
    case 'pile-close':
      ui.pile = null
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
      if (g) ui.game = discardRunes(g, [...ui.marked])
      resetComposer()
      break
    case 'cast': {
      const sigil = currentSigil()
      if (g && sigil && !invalidReason(g, sigil)) {
        ui.game = cast(g, sigil, ui.poolKey)
        resetComposer()
      }
      break
    }
    case 'end-term':
      if (g) {
        ui.game = endTerm(g)
        resetComposer()
      }
      break
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
    case 'scope':
      ui.scope = el.dataset.scope as 'table' | 'played'
      break
    case 'copy-csv': {
      if (!g) break
      const csv = recordCsv(g)
      ui.csv = ''
      try {
        navigator.clipboard
          .writeText(csv)
          .then(() => {
            ui.copied = true
            render()
            setTimeout(() => {
              ui.copied = false
              render()
            }, 1600)
          })
          .catch(() => {
            ui.csv = csv
            render()
            ;(document.getElementById('csv-out') as HTMLTextAreaElement | null)?.select()
          })
      } catch {
        ui.csv = csv
      }
      break
    }
    case 'to-sandbox':
      e.preventDefault()
      ui.open.add('sandbox')
      render()
      document.getElementById('sandbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    case 'sb-step':
      if (g) stepForge(el.dataset.target!, Number(el.dataset.delta))
      break
    case 'sb-reset-commission':
      if (g) {
        const std = standardSetup()
        ui.game = setTarget(setComposition(g, std.start), std.target)
      }
      break
    case 'sb-reset-forge':
      if (g) ui.game = setForge(g, cloneForge(DEFAULT_FORGE))
      break
    case 'sb-new':
      ui.editing = ui.editing === 'new' ? null : 'new'
      break
    case 'sb-pick': {
      const id = Number(el.dataset.id)
      ui.editing = ui.editing === id ? null : id
      break
    }
    case 'sb-body':
      editSpec((spec) => ({ body: el.dataset.body as Body, motes: spec.motes }))
      break
    case 'sb-add':
      if (g) ui.game = addRune(g, { body: ui.draft.body, motes: ui.draft.motes.slice(0, g.forge.bodies[ui.draft.body].bowls) })
      break
    case 'sb-copy':
      if (g && typeof ui.editing === 'number') {
        const found = findRune(g, ui.editing)
        if (found) ui.game = addRune(g, { body: found.rune.body, motes: found.rune.motes.slice() })
      }
      break
    case 'sb-remove':
      if (g && typeof ui.editing === 'number') {
        if (ui.anchorId === ui.editing || ui.joins.some((j) => j.id === ui.editing)) resetComposer()
        ui.game = removeRune(g, ui.editing)
        ui.editing = null
      }
      break
    case 'preset': {
      const p = presetByKey(el.dataset.key!)
      if (!p) break
      readTuning()
      ui.preset = p.key
      ui.settings.handSize = p.handSize
      ui.setup = p.setup()
      if (g) {
        ui.game = null
        startGame()
        window.scrollTo({ top: 0 })
      }
      break
    }
    case 'sb-standard':
      readTuning()
      ui.game = null
      ui.setup = standardSetup()
      ui.preset = 'opening'
      startGame()
      window.scrollTo({ top: 0 })
      break
    case 'menu':
      if (g) ui.setup = captureSetup(g)
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

// The radial menu and pile sheet close on Escape; the radial also closes on scroll, since it is placed on screen.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || (!ui.radial && !ui.pile)) return
  ui.radial = null
  ui.pile = null
  render()
})
window.addEventListener(
  'scroll',
  () => {
    if (!ui.radial) return
    ui.radial = null
    render()
  },
  { passive: true },
)
