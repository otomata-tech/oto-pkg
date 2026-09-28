// « Marque de l'organisation » (E09-S01, AC6 à AC10, AC12) : thème, logo et nom affiché de
// l'organisation de l'adresse. Server Component : il choisit l'état (erreur, réservé, formulaire) ;
// seul le formulaire a un état client.
//
// Porté d'oto-frontend (`routes/settings.appearance.lazy.tsx`, `ThemePicker` de `product.jsx`), E05-S09
// partie d2. Repris : l'en-tête sous le fil des réglages, ses îlots « La couleur » (on choisit un thème nommé
// et vérifié, jamais une couleur) et le suivant, la phrase qui dit que le pied du rail choisit la même
// teinte, l'échec en `Alert`. Changé : la teinte est celle de l'organisation, réglée par l'administrateur, et
// part avec le logo et le nom affiché par « Enregistrer » (E09-S01). Retiré : mode clair / sombre (il suit le
// système, HN-E05S09a-3), teinte par navigateur, îlot de langue.
import { Palette } from "@phosphor-icons/react/dist/ssr/Palette"
import { Alert } from "../ds/react/primitives"
import { EnTeteDAdministration } from "../admin/en-tete"
import { Chargement } from "../admin/ilot"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import type { FilDeLEcran, LienDeLAdministration } from "../admin/types"
import { FormulaireDeMarque } from "./formulaire-de-marque"
import type { ResultatDeMarque } from "./types"

type EcranMarqueProps = {
  resultat: ResultatDeMarque
  /** La page revient d'un enregistrement (`?enregistre=1` de l'hôte). */
  enregistre: boolean
  /**
   * Le lien de l'hôte et l'adresse de l'écran : « Réessayer » d'une lecture en échec ; sans eux, le message seul.
   * Optionnels comme `fil` : `EcranMarque` est exporté par `./ui` avec `resultat` et `enregistre` seuls, et un
   * hôte qui le monte ainsi doit compiler encore (le paquet n'ajoute que, ADR-006).
   */
  Lien?: LienDeLAdministration
  ici?: string
  /** Le fil de l'en-tête : les adresses que l'hôte donne au rail et le droit de la personne ; sans lui, pas de fil. */
  fil?: FilDeLEcran
}

function Etat({ resultat, enregistre, Lien, ici }: Omit<EcranMarqueProps, "fil">) {
  if (resultat.error !== undefined) {
    return Lien && ici ? <ErreurDeLecture message={resultat.error} href={ici} Lien={Lien} /> : <Alert tone="fail" title={resultat.error} />
  }
  const { marque, nomOrganisation, peutModifier } = resultat.data
  if (!peutModifier) return <Alert tone="fail" title={`Réservé aux administrateurs de ${nomOrganisation}.`} />
  return <FormulaireDeMarque marque={marque} nomOrganisation={nomOrganisation} enregistre={enregistre} />
}

export function EcranMarque({ fil, ...etat }: EcranMarqueProps) {
  return (
    <>
      <EnTeteDAdministration
        courant="marque"
        fil={fil}
        titre="Marque de l'organisation"
        glyphe={Palette}
        meta="La couleur, le logo et le nom valent pour toute l'organisation."
      />
      <Etat {...etat} />
    </>
  )
}

/** L'état de chargement, rendu par le `loading.tsx` de l'hôte. */
export function EcranMarqueChargement() {
  return <Chargement texte="Chargement de la marque…" />
}
