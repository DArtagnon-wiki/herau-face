import type { Sigil } from './types'

// The table: every cast sigil stays on it, arranged around the amalgam. By
// default it is for show only. Table balance, and the strain a lopsided table
// once added, were dropped: their only decision was whether to play a useless
// rune for its balance, and the point is to play every rune.
//
// Under table machines (Settings.machines), the table holds a few machines
// instead: a cast sigil keeps its runes and stays, fires again once a term,
// takes more runes from hand while it has open links, and can be taken apart,
// its runes going back to hand.

/** A sigil that has been cast and now sits on the table. */
export interface TableEntry {
  id: number
  term: number
  sigil: Sigil
  /** Under table machines: the term this machine last fired. */
  fired?: number
}
