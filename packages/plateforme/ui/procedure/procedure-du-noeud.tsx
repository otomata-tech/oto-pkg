// Obsolète (M59, fiche D104) : à l'écran, une procédure est une page comme les autres, tant que la partie
// connecteurs n'est pas là. Le contrôle du brouillon et « Tester une phrase » (E05-S04, AC6, AC8) sont
// partis ; le composant ne rend plus rien. Il reste exporté, ses props inchangées, parce qu'un hôte le monte
// dans l'emplacement `complement` de l'écran de nœud (le paquet n'ajoute que, ADR-006) : un hôte peut le
// retirer, et cesser de calculer `checkProcedure` et `previewContext` pour lui. Côté assistants rien ne
// change : `context` sert la procédure, et la publication la contrôle (`server/procedures-check.ts`).
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import type { RefusLu } from "./refus-de-publication"

/**
 * Ce que `previewContext` rend pour une phrase (E03-S08 ; P19). La forme servie (`ContextPreview`) vit
 * dans `server/`, que `ui/` n'importe pas ; tsc la confronte à celle-ci sur la page de l'hôte.
 */
type DonneesDUnePhrase = {
  text: string
  served: { path: string; revision: number; score: number } | null
  candidates: readonly { path: string; title: string; kind: string; score: number }[]
}

type ProcedureDuNoeudProps = {
  chemin: string
  phrase?: string
  controle?: Resultat<readonly RefusLu[]>
  blocs?: readonly { id: string; ref: string }[]
  apercu?: Resultat<DonneesDUnePhrase>
  Lien: LienDeLHote
  hrefDuChemin: (chemin: string) => string
}

/** @deprecated M59 : ne rend plus rien ; l'écran d'une procédure est celui d'une page. */
export function ProcedureDuNoeud(props: ProcedureDuNoeudProps): null {
  // Les props restent lues par le type seul : l'hôte qui le monte compile sans changement.
  void props
  return null
}
