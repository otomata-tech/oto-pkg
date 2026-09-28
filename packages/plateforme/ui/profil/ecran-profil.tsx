// L'écran « Profil » (E05-S11, AC-3 ; HN-E05S11-30) : ouvert à tout membre, depuis le menu du compte (lot e).
// Le prénom, le nom, la langue dans laquelle l'assistant répond et la couleur de l'application de la
// personne (`FormulaireDuProfil`, îlot client), sur la fiche que lit la page de l'hôte (`readProfile`).
// Server Component ; les quatre états (`portage-ecrans.md § 4`) : pas d'état vide, une fiche vide est un
// formulaire vide. Sans lui, la personne n'a plus où écrire son nom : « Ma fiche » quitte le Contexte (AC-8).
//
// Porté d'oto-frontend (`routes/settings.profile.lazy.tsx`) : l'en-tête d'écran, les îlots du formulaire, le
// squelette aux dimensions du contenu. Retiré : l'îlot « Ce à quoi vous avez accès » (le rail le montre), la
// situation et les préférences de notification (non servies), l'avatar de l'en-tête.
import { UserCircle } from "@phosphor-icons/react/dist/ssr/UserCircle"
import type { ProfileSheet } from "../../schemas"
import type { Resultat } from "../api/resultat"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { Icon } from "../ds/react/icon"
import { Island, IslandBody } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { FormulaireDuProfil } from "./formulaire-du-profil"
import { PROFIL } from "./libelles"

export type EcranProfilProps = {
  /** `readProfile`, par `resultatDe`. */
  resultat: Resultat<ProfileSheet>
}

export function EcranProfil({ resultat }: EcranProfilProps) {
  return (
    <>
      <ScreenHeader title={PROFIL.titre} icon={<Icon as={UserCircle} size="sm" />} meta={PROFIL.description} />
      {resultat.error !== undefined ? <ErreurDeLecture message={resultat.error} /> : <FormulaireDuProfil fiche={resultat.data} />}
    </>
  )
}

/** Le chargement du profil, rendu par le `loading.tsx` de l'hôte : le titre et les deux îlots du formulaire. */
export function EcranProfilChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">{PROFIL.chargement}</span>
      <Skeleton shape="text" width="20%" />
      {["vous", "preferences"].map((ilot) => (
        <Island key={ilot} aria-hidden="true">
          <IslandBody className="flex flex-col gap-3">
            <Skeleton shape="text" width="30%" />
            <Skeleton shape="row" />
            <Skeleton shape="row" />
          </IslandBody>
        </Island>
      ))}
    </div>
  )
}
