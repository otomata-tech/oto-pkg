// Écarts entre deux états d'un document, bloc par bloc (E03-S03, N12, N20, N24) : ce qui a changé
// depuis une révision (`read`, AC11), et les écritures minimales d'un brouillon (`write`). Fonctions
// pures. Sans lui, ni lecture depuis une révision, ni écriture minimale du brouillon.
import { longestIncreasing, type DocBlock } from "./document"

/** Égalité profonde de deux valeurs JSON, sans ordre des clés d'un objet. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]))
  }
  const left = Object.entries(a).filter(([, value]) => value !== undefined)
  const right = Object.entries(b).filter(([, value]) => value !== undefined)
  const other = new Map(right)
  return left.length === right.length && left.every(([key, value]) => other.has(key) && sameJson(value, other.get(key)))
}

/** Même type, même texte, mêmes données : l'écart de `read` (AC11) ne regarde que cela. */
export function sameContent(a: DocBlock, b: DocBlock): boolean {
  return a.type === b.type && (a.text ?? null) === (b.text ?? null) && sameJson(a.data, b.data)
}

/** Le contenu au sens de la révision d'un bloc (N20) : type, texte, données et clé. */
function sameRevisedContent(a: DocBlock, b: DocBlock): boolean {
  return sameContent(a, b) && (a.key ?? null) === (b.key ?? null)
}

/**
 * Deux états publiés au même contenu servi (E11-S03, AC-a4, H28) : mêmes blocs dans le même ordre, comparés
 * par type, texte, données et clé ; ni id, ni position, ni révision de bloc, ni provenance.
 */
export function samePublishedContent(before: readonly DocBlock[], after: readonly DocBlock[]): boolean {
  return before.length === after.length && before.every((block, index) => sameRevisedContent(block, after[index]))
}

export type BlockChange<B extends DocBlock> = { kind: "added" | "changed" | "moved"; block: B }

/**
 * Ce qui a changé de `before` à `after`, bloc par bloc, comparés par id (N24) : ajoutés, changés
 * (type, texte ou données), déplacés (inchangés mais hors de la plus longue suite de blocs gardant
 * leur ordre, règle déterministe), dans l'ordre de `after` ; les supprimés, dans l'ordre de `before`.
 */
export function diffBlocks<B extends DocBlock>(before: readonly B[], after: readonly B[]): { changes: BlockChange<B>[]; deleted: B[] } {
  const rankBefore = new Map(before.flatMap((block, rank) => (block.id ? [[block.id, rank] as const] : [])))
  const common = after.flatMap((block, index) => (block.id !== null && rankBefore.has(block.id) ? [index] : []))
  const ordered = longestIncreasing(common.map((index) => rankBefore.get(after[index].id ?? "") ?? 0))
  const inOrder = new Set([...ordered].map((rank) => common[rank]))
  const changes: BlockChange<B>[] = []
  after.forEach((block, index) => {
    const old = block.id === null ? undefined : before[rankBefore.get(block.id) ?? -1]
    if (!old) changes.push({ kind: "added", block })
    else if (!sameContent(old, block)) changes.push({ kind: "changed", block })
    else if (!inOrder.has(index)) changes.push({ kind: "moved", block })
  })
  const kept = new Set(after.flatMap((block) => (block.id ? [block.id] : [])))
  return { changes, deleted: before.filter((block) => block.id === null || !kept.has(block.id)) }
}

/** Une mise à jour d'un bloc du brouillon : garde sur la révision lue ; contenu changé ou position seule. */
export type DraftUpdate<B extends DocBlock> = { block: B; expected: number; content: boolean }

export type DraftWrites<B extends DocBlock> = { updates: DraftUpdate<B>[]; inserts: B[]; deletes: DocBlock[] }

/**
 * Les écritures minimales qui font passer le brouillon de `current` à `next` (N12, N20) : rien pour un
 * bloc inchangé ; un bloc au contenu changé (type, texte, données ou clé) prend la révision + 1 ; un
 * déplacement seul garde sa révision ; un bloc sans id est inséré ; un id absent de `next` est
 * supprimé. `next` rendu porte les révisions nouvelles (même ordre, mêmes champs).
 */
export function planDraftWrites<B extends DocBlock>(current: readonly DocBlock[], next: readonly B[]): DraftWrites<B> & { next: B[] } {
  const byId = new Map(current.flatMap((block) => (block.id ? [[block.id, block] as const] : [])))
  const updates: DraftUpdate<B>[] = []
  const inserts: B[] = []
  const planned = next.map((block) => {
    const old = block.id === null ? undefined : byId.get(block.id)
    if (!old) {
      inserts.push(block)
      return block
    }
    const content = !sameRevisedContent(old, block)
    if (!content && old.position === block.position) return block
    const written = content ? { ...block, revision: old.revision + 1 } : block
    updates.push({ block: written, expected: old.revision, content })
    return written
  })
  const kept = new Set(next.flatMap((block) => (block.id ? [block.id] : [])))
  const deletes = current.filter((block) => block.id !== null && !kept.has(block.id))
  return { updates, inserts, deletes, next: planned }
}
