// Les blocs `reference` rendus pour l'écran de nœud et son éditeur (E07-S03, AC15 à AC17 ; H56, P18,
// HN-E07S03-12) : un `ReactNode` par `id` de bloc, calculé par la page serveur de l'hôte, jamais par un
// îlot. La vue d'un tableau (`VueDeTableau`), la carte d'un nœud cité (`CarteDeNoeud`), la phrase d'une
// cible introuvable, ou le lien par défaut d'E05-S02 (`ReferenceEnLien`) suivi de l'avis d'une vue
// illisible ; au-delà de dix références, l'avis « Trop de vues… » sur la onzième, rien pour les
// suivantes. Sans directive : exécuté sur le serveur. Sans lui, l'éditeur, un îlot client, ne pourrait
// montrer ni vue ni carte (composants serveur), et chaque hôte composerait vues, cartes et avis.
import type { ReactNode } from "react"
import { SCREEN_REFERENCES_MAX, type BlockView, type ScreenReference } from "../../schemas"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { ReferenceEnLien } from "../noeud/rendu-des-blocs"
import { CarteDeNoeud } from "./carte-de-noeud"
import { REFERENCES } from "./libelles"
import { VueDeTableau } from "./vue-de-tableau"

type Navigation = { Lien: LienDeLHote; hrefDuChemin: (chemin: string) => string }

type ReferencesRenduesProps = Navigation & {
  /** Les résolutions du service par `id` de bloc (`resolveReferencesForScreen`), ou l'échec de leur lecture. */
  resolutions: Resultat<Record<string, ScreenReference>>
  /** Les blocs affichés, dans l'ordre du document. */
  blocs: readonly BlockView[]
}

/** Le lien par défaut d'une référence, sans son ancre (l'écran la pose sur l'élément qui l'enveloppe), puis un avis. */
function LienEtAvis({ bloc, avis, Lien, hrefDuChemin }: Navigation & { bloc: BlockView; avis: string }) {
  return (
    <div className="space-y-1">
      <ReferenceEnLien bloc={{ ...bloc, ref: undefined }} Lien={Lien} hrefDuChemin={hrefDuChemin} />
      <p className="text-sm text-ink">{avis}</p>
    </div>
  )
}

function rendu(resolution: ScreenReference, bloc: BlockView, navigation: Navigation): ReactNode {
  if ("error" in resolution) {
    if (resolution.error === "not_found") {
      const phrase = resolution.kind === "view" ? REFERENCES.tableauIntrouvable(resolution.path) : REFERENCES.pageIntrouvable(resolution.path)
      return <p className="text-sm text-ink">{phrase}</p>
    }
    return <LienEtAvis bloc={bloc} avis={REFERENCES.vueIllisible(resolution.reason, resolution.detail)} {...navigation} />
  }
  return resolution.kind === "view" ? <VueDeTableau vue={resolution} {...navigation} /> : <CarteDeNoeud carte={resolution} {...navigation} />
}

/**
 * Le rendu en place de chaque bloc `reference` résolu (AC15, AC16), par `id` de bloc ; un bloc sans
 * entrée garde `ReferenceEnLien`. Une lecture en échec se dit sur la première référence, les autres en lien.
 */
export function referencesRendues({ resolutions, blocs, Lien, hrefDuChemin }: ReferencesRenduesProps): Record<string, ReactNode> {
  const navigation = { Lien, hrefDuChemin }
  const references = blocs.filter((bloc) => bloc.type === "reference")
  const rendus: Record<string, ReactNode> = {}
  for (const [rang, bloc] of references.entries()) {
    if (resolutions.error !== undefined) {
      if (rang === 0) rendus[bloc.id] = <LienEtAvis bloc={bloc} avis={REFERENCES.enEchec} {...navigation} />
      continue
    }
    const resolution = resolutions.data[bloc.id]
    if (rang === SCREEN_REFERENCES_MAX) rendus[bloc.id] = <LienEtAvis bloc={bloc} avis={REFERENCES.tropDeVues} {...navigation} />
    else if (rang < SCREEN_REFERENCES_MAX && resolution) rendus[bloc.id] = rendu(resolution, bloc, navigation)
  }
  return rendus
}
