import './ui/style.css'
import { GRADE_NAMES, poolKey, totalKg } from './sim/alchemy'
import { CLAY_BAND, earthShare, substanceName } from './sim/commission'
import { BODY_LIST, BODY_NAMES, DEFAULT_FORGE, GEMS, MOTE_OPTIONS, buildDeck, cloneForge, moteEffect, moteFromKey, moteKey, moteName, type Forge, type RuneSpec } from './sim/deck'
import { addRune, deckSpecs, editRune, findRune, removeRune, setForge } from './sim/sandbox'
import { DEFAULT_SETTINGS, cast, discardRunes, invalidReason, newGame, payment, previewTerm, standardSetup, type GameState, type Settings, type Setup, type TermOutcome } from './sim/game'
import { REACH_PER_POWER, WARD_PER_POWER, candidatePools, canJoin, openLinks, resolve, type Resolution } from './sim/sigil'
import { slumpTarget, strain, tally } from './sim/table'
import type { Body, Elemental, JoinKind, Rune, Sigil } from './sim/types'
import { AFFINITY_VAR, bodyIcon, moteColor, runeSvg, sigilSvg, vesselSvg } from './ui/draw'
import { AFFINITIES, SIDES, balance, metricsOf, type Measure } from './sim/metrics'

// ---------------------------------------------------------------------------
// State

interface UI {
  game: GameState | null
  settings: Settings
  /** The forge and deck the next commission starts from. */
  setup: Setup
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
}

const ui: UI = {
  game: null,
  setup: standardSetup(),
  editing: null,
  draft: { body: 'circle', motes: [{ kind: 'element', elemental: 'water' }] },
  settings: { ...DEFAULT_SETTINGS },
  seed: 0,
  anchorId: null,
  joins: [],
  mode: 'circumscribe',
  discarding: false,
  marked: new Set(),
  flash: '',
  open: new Set(['sandbox', 'metrics']),
  scope: 'table',
  csv: '',
  copied: false,
}

const JOINS: { kind: JoinKind; label: string; gives: string }[] = [
  { kind: 'circumscribe', label: 'Circumscribe', gives: 'Force · sets target' },
  { kind: 'side', label: 'Side link', gives: 'Reach' },
  { kind: 'entwine', label: 'Entwine', gives: 'Ward' },
  { kind: 'inscribe', label: 'Inscribe', gives: 'Fine · or condense' },
]

const ELEMENT_NAME: Record<string, string> = { earth: 'Earth', water: 'Water', air: 'Air', fire: 'Fire', none: 'No element' }

// ---------------------------------------------------------------------------
// Helpers

const kg = (n: number) => `${n.toFixed(1)} kg`
const pct = (n: number) => `${Math.round(n * 100)}%`
const num = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function startGame(seed = Date.now() % 1_000_000) {
  if (ui.game) ui.setup = { forge: cloneForge(ui.game.forge), deck: deckSpecs(ui.game) }
  ui.seed = seed
  ui.game = newGame({ ...ui.settings }, seed, { forge: cloneForge(ui.setup.forge), deck: ui.setup.deck })
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
  return j ? JOINS.find((x) => x.kind === j.kind)!.label : null
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
    const motes = distinct.map((r) => r.motes.map((m) => moteEffect(m, setup.forge.values)).join(' + ') || 'empty').join(' · ')
    return `<li class="deck-group">
      <span class="deck-group-runes">${distinct.slice(0, 4).map((r) => runeSvg(r, 40)).join('')}</span>
      <span class="deck-group-name"><b class="num">${all.length}</b> ${BODY_NAMES[body].toLowerCase()}${all.length === 1 ? '' : 's'} <span class="deck-group-spec num">· power ${spec.power} · ${linksWord(spec.links)} · ${spec.bowls} bowl${spec.bowls === 1 ? '' : 's'}</span></span>
      <span class="deck-group-line">${motes}</span>
    </li>`
  }).join('')
}

function startView(): string {
  return `
  <main class="start">
    <header class="start-head">
      <p class="eyebrow">A commission · prototype</p>
      <h1>Mud to Clay</h1>
      <p class="lede">Thirty-six kilos of mud, half earth and half water. Bring it to clay, between 75 and 85 percent earth, before your quintessence runs out.</p>
    </header>

    <section class="panel">
      <h2>Your deck</h2>
      <ul class="deck-groups">${deckGroups(ui.setup)}</ul>
      <p class="fine">Gems set the element: ${Object.entries(GEMS).map(([e, g]) => `${g.toLowerCase()} is ${e}`).join(', ')}. A link mote adds a link, a reach mote multiplies the sigil’s Reach, and a guard mote adds Ward. The deck is the same each time; the shuffle is not, though your opening hand always has a water and an earth. Once you begin, the Sandbox panel can change any of it.</p>
      <button class="primary wide" data-act="start">Begin the commission</button>
    </section>

    <section class="panel rules">
      <h2>How a term works</h2>
      <ol>
        <li><b>Mud shows its move.</b> A flare, a seep back to water, a hardening, or a slump that knocks a sigil off your table.</li>
        <li><b>Compose a sigil.</b> Tap a rune to make it the anchor: its element is what changes. Then pick a join and tap more runes, up to the anchor’s links.</li>
        <li><b>Cast.</b> The preview is exact. Then mud acts. Ward absorbs flares; whatever gets past costs quintessence.</li>
      </ol>
      <h2>Reading a rune</h2>
      <p>The number is its power. The pips are its links: how many runes it can hold as the anchor. Its bowls hold motes, and the motes give it an element and any abilities.</p>
      <dl class="join-key">
        <div><dt>Anchor</dt><dd>Its element is what changes. Adds its power as Force, and power × ${REACH_PER_POWER} kg of Reach.</dd></div>
        ${JOINS.map((j) => `<div><dt>${j.label}</dt><dd>${joinHelp(j.kind)}</dd></div>`).join('')}
      </dl>
      <p><b>Reach × Force.</b> Reach is how many kilos the sigil grabs; Force is how hard it pushes. Each change needs some Force (weak water to earth needs 5), and what converts is Reach × Force ÷ that need. They multiply, so give each new rune to whichever total is smaller.</p>
      <p class="fine">Cast sigils stay on the table. Keep it level, Earth against Air and Water against Fire, or the lopsidedness adds strain every term.</p>
    </section>
    ${tuningView()}
  </main>`
}

function joinHelp(kind: JoinKind): string {
  switch (kind) {
    case 'circumscribe':
      return 'Rings the anchor. Its element is where the change goes. Adds its power as Force.'
    case 'side':
      return `Hangs beside the anchor. Adds power × ${REACH_PER_POWER} kg of Reach.`
    case 'entwine':
      return 'Laces through the anchor. Adds its power as Ward against this term’s flare.'
    case 'inscribe':
      return 'Sits inside and adds its power as Force. Same element as the anchor: condenses a pool one grade. Any other: halves Reach, for small precise casts.'
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
      ? 'The sigil changed nothing.'
      : `${kg(r.converted)} of ${GRADE_NAMES[r.source!.grade]} ${r.source!.elemental} became ${kg(r.produced)} of ${r.mode === 'condense' ? GRADE_NAMES[r.target!.grade] + ' ' : ''}${r.target!.elemental}.`
  if (t.finished) return `Term ${t.term}: ${change} Clay.`
  const incoming = t.flare + t.strain
  const fight = incoming > 0 ? ` ${t.flare ? `Flare ${t.flare}` : ''}${t.flare && t.strain ? ' + ' : ''}${t.strain ? `strain ${t.strain}` : ''}, Ward ${num(t.absorbed)}, paid ${num(t.paid)}.` : ''
  return `Term ${t.term}: ${change}${t.intentNote ? ' ' + t.intentNote : ''}${fight}`
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

function composerView(g: GameState, sigil: Sigil | null, preview: TermOutcome | null): string {
  const anchor = sigil?.anchor
  const used = sigil?.joins.length ?? 0
  let stats = `<p class="hint">${ui.discarding ? 'Tap the runes to discard, then confirm.' : 'Tap a rune in your hand to make it the anchor.'}</p>`
  if (sigil && preview) {
    const r = preview.resolution
    const o = r.outputs
    const route = o.route ? o.route.map((e) => ELEMENT_NAME[e]).join(' → ') : 'Neutral'
    const forceLine = r.mode === 'none' ? num(o.force) : `${num(o.force)} <span class="of">/ ${num(r.required)}</span>`
    const extras = [o.reachMult > 1 ? `Reach ×${o.reachMult} from motes` : '', o.guard ? `+${o.guard} Ward from motes` : ''].filter(Boolean)
    const change =
      (r.mode === 'none' ? `<p class="note">${esc(r.note)}</p>` : formulaView(r, g.settings.surplusForce)) +
      (extras.length ? `<p class="motes-note">${extras.join(' · ')}</p>` : '') +
      (r.mode === 'none' ? '' : tipView(g, sigil, r))
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
  return `
  <section class="composer panel">
    <div class="composer-top">
      <div class="rune-frame">${sigilSvg(sigil)}${anchor ? `<span class="capacity num">${used} of ${linksWord(anchor.links)} used</span>` : ''}</div>
      <div class="stats">${stats}</div>
    </div>
    ${ui.flash ? `<p class="flash">${esc(ui.flash)}</p>` : ''}
    <div class="modes" role="group" aria-label="Join">
      ${JOINS.map(
        (j) => `<button class="mode ${ui.mode === j.kind ? 'is-on' : ''}" data-act="mode" data-kind="${j.kind}" aria-pressed="${ui.mode === j.kind}" ${!anchor || ui.discarding ? 'disabled' : ''}>
          <span class="mode-name">${j.label}</span>
          <span class="mode-gives">${j.gives}</span>
        </button>`,
      ).join('')}
    </div>
  </section>`
}

/** What a rune would add to the sigil under the selected join; otherwise its abilities. */
function cardHint(r: Rune): string {
  const own = abilities(r)
  const sigil = currentSigil()
  if (ui.discarding || !sigil) return own.join(', ') || BODY_NAMES[r.body]
  if (!canJoin(sigil, r)) return 'No open link'
  let add: string
  switch (ui.mode) {
    case 'circumscribe':
      add = `+${r.power} Force`
      break
    case 'side':
      add = `+${kg(r.power * REACH_PER_POWER)}`
      break
    case 'entwine':
      add = `+${num(r.power * WARD_PER_POWER)} Ward`
      break
    case 'inscribe':
      add = r.affinity === sigil.anchor.affinity && r.affinity !== 'none' ? `+${r.power} Force · condense` : `+${r.power} Force · ½ Reach`
  }
  return [add, ...own].join(', ')
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

function actionsView(g: GameState, sigil: Sigil | null, preview: TermOutcome | null): string {
  if (ui.discarding) {
    return `<div class="actions">
      <button data-act="discard-cancel">Cancel</button>
      <button class="primary" data-act="discard-confirm" ${ui.marked.size ? '' : 'disabled'}>Discard ${ui.marked.size || ''} and redraw</button>
    </div>`
  }
  const invalid = sigil ? invalidReason(g, sigil) : 'Choose an anchor.'
  const castLabel = !preview ? 'Cast' : preview.finished ? 'Cast · finish' : preview.paid > 0 ? `Cast · pay ${num(preview.paid)}` : 'Cast'
  return `<div class="actions">
    <button data-act="clear" ${sigil ? '' : 'disabled'}>Clear</button>
    <button data-act="discard-mode" ${g.discardsLeft > 0 && !sigil ? '' : 'disabled'}>Discard <span class="num">(${g.discardsLeft})</span></button>
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
        <button data-act="menu">Rules</button>
      </div>
    </div>
  </div>`
}

const ORDER = ['water', 'earth', 'air', 'fire', 'none']
const BODY_ORDER: Body[] = ['circle', 'crescent', 'triangle']

function deckView(g: GameState): string {
  const where = new Map<number, 'hand' | 'draw' | 'discard'>()
  g.hand.forEach((h) => where.set(h.id, 'hand'))
  g.draw.forEach((h) => where.set(h.id, 'draw'))
  g.discard.forEach((h) => where.set(h.id, 'discard'))
  const all = [...g.hand, ...g.draw, ...g.discard].sort(
    (a, b) => BODY_ORDER.indexOf(a.body) - BODY_ORDER.indexOf(b.body) || ORDER.indexOf(a.affinity) - ORDER.indexOf(b.affinity) || a.id - b.id,
  )
  const left = ORDER.map((e) => [e, g.draw.filter((h) => h.affinity === e).length] as const)
    .filter(([, n]) => n > 0)
    .map(([e, n]) => `<span style="color:${AFFINITY_VAR[e as keyof typeof AFFINITY_VAR]}">${n} ${e === 'none' ? 'without element' : e}</span>`)
    .join(' · ')
  const label = { hand: 'Hand', draw: 'Draw', discard: 'Discard' }
  return `<details class="panel deck-panel" data-panel="deck" ${ui.open.has('deck') ? 'open' : ''}>
    <summary>Deck <span class="summary-note num">· draw ${g.draw.length} · discard ${g.discard.length}</span></summary>
    <p class="deck-left">${g.draw.length ? `Still to draw: ${left}` : 'The draw pile is empty; the discard reshuffles next.'}</p>
    <ul class="deck-list">
      ${all
        .map((h) => {
          const at = where.get(h.id)!
          return `<li class="deck-item at-${at}" style="--c:${AFFINITY_VAR[h.affinity]}">
            ${runeSvg(h, 34)}
            <span class="deck-item-text">
              <span class="deck-item-name">${h.affinity === 'none' ? '' : ELEMENT_NAME[h.affinity] + ' '}${BODY_NAMES[h.body].toLowerCase()} · <span class="num">${h.power}</span> · ${linksWord(h.links)}</span>
              <span class="deck-item-motes">${h.motes.map((m) => `<span class="mote-chip"><span class="mote-dot" style="background:${moteColor(m)}"></span>${moteName(m)}${m.kind === 'element' ? '' : ': ' + moteEffect(m, g.forge.values)}</span>`).join('')}</span>
            </span>
            <span class="deck-item-at">${label[at]}</span>
          </li>`
        })
        .join('')}
    </ul>
  </details>`
}

// ---------------------------------------------------------------------------
// Table metrics

const MEASURES: { key: Measure; label: string }[] = [
  { key: 'runes', label: 'Runes' },
  { key: 'motes', label: 'Gems' },
  { key: 'sides', label: 'Sides' },
]
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function metricsView(g: GameState): string {
  const sigils = ui.scope === 'table' ? g.table.map((e) => e.sigil) : g.history.map((t) => t.sigil)
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
    <div class="row"><button data-act="copy-csv" ${g.history.length ? '' : 'disabled'}>${ui.copied ? 'Copied' : 'Copy the per-term record'}</button></div>
    ${ui.csv ? `<textarea class="csv" id="csv-out" readonly rows="6" aria-label="Per-term record as CSV">${esc(ui.csv)}</textarea><p class="fine">Copying was blocked here, so the record is above: select it and copy.</p>` : ''}
  </details>`
}

function sigilSummary(sg: Sigil): string {
  const name = (r: Rune) => `${r.affinity === 'none' ? '' : ELEMENT_NAME[r.affinity] + ' '}${BODY_NAMES[r.body].toLowerCase()}`
  const join: Record<JoinKind, string> = { circumscribe: 'circ', side: 'side', entwine: 'entwine', inscribe: 'insc' }
  return [name(sg.anchor), ...sg.joins.map((j) => `${join[j.kind]} ${name(j.rune)}`)].join(' + ')
}

/** One row per term: what was cast, what it cost, and every balance measure after it. */
function recordCsv(g: GameState): string {
  const els = ['water', 'earth', 'air', 'fire'] as const
  const head = [
    'term', 'sigil', 'earth_share', 'flare', 'strain', 'ward', 'paid',
    ...els.map((e) => `table_runes_${e}`), ...els.map((e) => `table_gems_${e}`), ...[...els, 'none'].map((e) => `table_sides_${e}`),
    'table_circles', 'table_crescents', 'table_triangles', 'table_imb_runes', 'table_imb_gems', 'table_imb_sides',
    ...els.map((e) => `played_gems_${e}`), 'played_circles', 'played_crescents', 'played_triangles', 'played_sides', 'played_imb_gems', 'played_imb_sides',
  ]
  const rows = g.history.map((t, i) => {
    const tm = metricsOf(t.table.map((e) => e.sigil))
    const pm = metricsOf(g.history.slice(0, i + 1).map((x) => x.sigil))
    return [
      t.term, `"${sigilSummary(t.sigil)}"`, t.share.toFixed(3), t.flare, t.strain, num(t.ward), num(t.paid),
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
  bowls: [0, 4, 1],
  reach: [1, 3, 0.25],
  guard: [0, 12, 1],
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
  if (group === 'values') forge.values[field as 'reach' | 'guard'] = clamp(forge.values[field as 'reach' | 'guard'])
  else forge.bodies[group as Body][field as 'power' | 'links' | 'bowls'] = clamp(forge.bodies[group as Body][field as 'power' | 'links' | 'bowls'])
  ui.game = setForge(g, forge)
  if (forge.bodies[ui.draft.body].bowls < ui.draft.motes.length) ui.draft = { ...ui.draft, motes: ui.draft.motes.slice(0, forge.bodies[ui.draft.body].bowls) }
}

function historyView(g: GameState): string {
  if (!g.history.length) return ''
  return `<details class="panel history" data-panel="history" ${ui.open.has('history') ? 'open' : ''}>
    <summary>Term history</summary>
    <ol reversed>${g.history.slice().reverse().map((t) => `<li>${esc(describeTerm(t))}</li>`).join('')}</ol>
  </details>`
}

function gameView(g: GameState): string {
  const sigil = currentSigil()
  const preview = sigil && g.phase === 'compose' && !ui.discarding ? previewTerm(g, sigil, ui.poolKey) : null
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
      <a class="jump" href="#sandbox" data-act="to-sandbox">Sandbox</a>
      <div class="quint" aria-label="Quintessence ${num(g.quintessence)} of ${g.settings.stock}">
        <span class="label">Quintessence</span>
        <span class="num quint-num">${num(g.quintessence)}</span>
        <span class="quint-bar"><span style="width:${qPct}%"></span></span>
      </div>
    </header>

    ${intentView(g, preview)}

    <section class="vessel panel">
      ${vesselSvg(g.pools, g.table, share, { previewShare: preview?.share, selectedKey: selected, threatenedId: threatened, previewSigil: sigil })}
      <div class="vessel-read">
        <p class="substance ${substanceName(g.pools) === 'Clay' ? 'is-clay' : ''}">${substanceName(g.pools)}</p>
        <p class="read-line"><span class="num">${pct(share)}</span> earth · target <span class="num">75–85%</span> · <span class="num">${kg(totalKg(g.pools))}</span></p>
      </div>
      ${poolsView(g, sigil, selected)}
      ${balanceView(g, preview)}
    </section>

    ${metricsView(g)}

    ${lastTermView(g)}
    ${composerView(g, sigil, preview)}
    ${handView(g)}
    ${actionsView(g, sigil, preview)}
    ${sandboxView(g)}
    ${deckView(g)}
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
  ui.joins.push({ kind: ui.mode, id: rune.id })
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
  const el = e.target as HTMLElement
  if (el.closest('.tuning')) readTuning()
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
    case 'sb-standard':
      readTuning()
      ui.game = null
      ui.setup = standardSetup()
      startGame()
      window.scrollTo({ top: 0 })
      break
    case 'menu':
      if (g) ui.setup = { forge: cloneForge(g.forge), deck: deckSpecs(g) }
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
