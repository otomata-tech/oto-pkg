// Les liens d'un nœud pour « Contenus liés » (E05-S10, AC-b6) : ses liens sortants relus pour la personne
// et ses liens entrants lisibles, avec leurs totaux, les champs de `read` (`linkHeader`, E03-S07) sans le
// reste de sa lecture. Une cible à la corbeille, comme une cible invisible, est « sans cible » : l'écran la
// rend en texte. Sans lui, la page d'un nœud appelle `readNode` pour ces seuls champs (HN-E05S10b-6).
import { nodePathBodySchema, type NodeLinksView } from "../../schemas"
import type { PlatformDb } from "../db"
import { inTransaction, invalidInput } from "../errors"
import type { Identity } from "../identity"
import { linkHeader } from "./link-lines"
import { findNode, unknownNode } from "./lookup"

/**
 * `nodeLinks(db, identity, { path })` : le nœud lu par `findNode` (inconnu ou invisible : `not_found`),
 * puis ses liens, filtrés comme ceux de `read` (niveaux en un lot, 20 par sens, les totaux comptés après
 * le filtre).
 */
export async function nodeLinks(db: PlatformDb, identity: Identity, input: unknown): Promise<NodeLinksView> {
  const parsed = nodePathBodySchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const { path } = parsed.data
  // Le nœud, son niveau et ses liens dans une transaction (E05-S10, partie c).
  return inTransaction(db, "nodes: links", async () => {
    const found = await findNode(db, identity, path)
    if (!found) throw unknownNode(path, identity.org.prefix)
    const { data } = await linkHeader(db, identity, found.node)
    // `linkHeader` rend exactement ces quatre champs, construits par `linkView` et `incomingLinks`.
    return data as NodeLinksView
  })
}
