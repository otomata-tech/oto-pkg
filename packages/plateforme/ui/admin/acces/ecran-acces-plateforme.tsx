// « Accès plateforme » du tableau de bord (E08-S03, AC9 ; fiche D2) : les accès de l'équipe plateforme à
// l'organisation, révocables, et les membres qu'elle a ajoutés, par `AccesPlateforme` d'E05-S03, le même
// panneau que l'onglet de `/teams`. Server Component. Sans lui, la page de l'hôte composait elle-même
// l'en-tête et l'îlot du design system, que `ui/` n'exporte pas.
//
// Absent d'oto-frontend, qui n'a pas de rôle plateforme : posé sur la grammaire de ses écrans de réglages
// (E05-S09 partie d2), l'en-tête et son fil, puis un îlot qui porte le panneau ; l'échec d'une lecture se dit
// en `Alert` avec « Réessayer », avant le panneau.
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck"
import type { PlatformAccessOverview } from "../../../schemas"
import type { Resultat } from "../../api/resultat"
import { Island, IslandBody } from "../../ds/react/island"
import { AccesPlateforme } from "../../equipes/acces-plateforme"
import { EnTeteDAdministration } from "../en-tete"
import { ErreurDeLecture } from "../../components/erreur-de-lecture"
import type { FilDeLEcran, LienDeLAdministration } from "../types"

export type EcranAccesPlateformeProps = {
  resultat: Resultat<PlatformAccessOverview>
  nomOrganisation: string
  Lien: LienDeLAdministration
  /** L'adresse de l'écran dans l'hôte : « Réessayer » d'une lecture en échec y ramène. */
  ici: string
  /** Le fil de l'en-tête : les adresses que l'hôte donne au rail et le droit de la personne ; sans lui, pas de fil. */
  fil?: FilDeLEcran
}

export function EcranAccesPlateforme({ resultat, nomOrganisation, Lien, ici, fil }: EcranAccesPlateformeProps) {
  return (
    <>
      <EnTeteDAdministration courant="acces" fil={fil} titre="Accès plateforme" glyphe={ShieldCheck} />
      {resultat.error !== undefined ? (
        <ErreurDeLecture message={resultat.error} href={ici} Lien={Lien} />
      ) : (
        <Island aria-label="Accès de l'équipe plateforme">
          <IslandBody>
            <AccesPlateforme resultat={resultat} nomOrganisation={nomOrganisation} Lien={Lien} ici={ici} />
          </IslandBody>
        </Island>
      )}
    </>
  )
}
