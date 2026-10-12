import type { Sigil } from './types'

// The table: every cast sigil stays on it, arranged around the amalgam. It is
// for show only. Table balance, and the strain a lopsided table once added,
// were dropped: their only decision was whether to play a useless rune for
// its balance, and the point is to play every rune.

/** A sigil that has been cast and now sits on the table. */
export interface TableEntry {
  id: number
  term: number
  sigil: Sigil
}
