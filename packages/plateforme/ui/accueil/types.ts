// Les formes de l'accueil (E05-S09, partie b), redéfinies ici : `ui/` ne lit pas `server/`, la page de
// l'hôte adapte les noms anglais des services et lit chaque donnée sous le jeton de la session.
import type { ActivityPage, UsefulProcedure } from "../../schemas"
import type { Resultat } from "../api/resultat"
import type { AdresseDeConnexion, DerniereConnexion } from "../connexion/types"

/** Ce que la page de l'hôte a lu pour l'accueil, une fois l'identité résolue. */
export type DonneesDeLAccueil = {
  /** Le nom de la personne, salué en tête ; `null` sans nom. */
  nom: string | null
  /** L'identifiant de la personne : ses activités se disent « Vous ». */
  moi: string
  /** Les activités que la personne voit, la plus récente d'abord (le journal par gestes, E05-S12, sur la période que la page choisit). */
  activites: Resultat<ActivityPage>
  /** Ce que le guide de « Brancher » fait copier, pour l'organisation de l'adresse (E11-S09, AC-11). */
  adresse: AdresseDeConnexion
  /** La dernière connexion de chaque assistant de la personne, la plus récente d'abord (E02-S04). */
  connexions: Resultat<DerniereConnexion[]>
  /** Les procédures utiles, dans l'ordre du bloc servi par `context` (E05-S12, AC-18). */
  procedures: Resultat<UsefulProcedure[]>
}
