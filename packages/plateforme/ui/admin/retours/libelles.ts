// Les phrases françaises des retours (E08-S09, AC9, AC10) : états, types, messages des gestes.
// Constantes du paquet, jamais un texte du service ; lues par l'écran (Server) et par le formulaire de
// refus (client), d'où ce module plutôt qu'un des deux. Repris d'oto-frontend (`etats-du-suivi.tsx`
// l. 19-74) : un message constant choisi par le code, le refus dit comme un refus.
import type { FeedbackFilter, FeedbackState, FeedbackType } from "../../../schemas"
import type { MessagesDuGeste } from "../../api/messages"

export const ETATS: Record<FeedbackState, string> = {
  open: "Ouvert",
  acknowledged: "Pris en compte",
  resolved: "Résolu",
  declined: "Décliné",
}

/**
 * La teinte du badge d'un état (E05-S09 partie d2) : ce qui attend l'examen, ce qui est en cours, ce qui est
 * fait, ce qui est écarté ; elle double le libellé, elle ne le remplace jamais.
 */
export const TONS: Record<FeedbackState, "review" | "run" | "ok" | "idle"> = {
  open: "review",
  acknowledged: "run",
  resolved: "ok",
  declined: "idle",
}

export const TYPES: Record<FeedbackType, string> = { friction: "Friction", gap: "Manque", error: "Erreur" }

/** Les liens de filtre d'état, dans l'ordre d'AC9. */
export const FILTRES_D_ETAT: readonly { etat: FeedbackFilter; libelle: string }[] = [
  { etat: "to_handle", libelle: "À traiter" },
  { etat: "open", libelle: "Ouverts" },
  { etat: "acknowledged", libelle: "Pris en compte" },
  { etat: "resolved", libelle: "Résolus" },
  { etat: "declined", libelle: "Déclinés" },
  { etat: "all", libelle: "Tous" },
]

/** « 2 ouverts · 1 pris en compte · 0 résolu · 3 déclinés » : accordés au nombre (AC9). */
export function comptes(nombres: Record<FeedbackState, number>): string {
  const accorde = (nombre: number, singulier: string, pluriel: string) => `${nombre} ${nombre > 1 ? pluriel : singulier}`
  return [
    accorde(nombres.open, "ouvert", "ouverts"),
    accorde(nombres.acknowledged, "pris en compte", "pris en compte"),
    accorde(nombres.resolved, "résolu", "résolus"),
    accorde(nombres.declined, "décliné", "déclinés"),
  ].join(" · ")
}

export const AUCUN_RETOUR = "Aucun retour sur cette période. Cela ne veut pas dire que rien ne manque : c'est une mesure de ce qui remonte."
export const AUCUN_RETOUR_FILTRE = "Aucun retour ne correspond à ce filtre."

const AUTRE_ECHEC = "Le retour n'a pas pu être mis à jour. Réessayez dans un instant."

/**
 * Les messages d'un geste sur un retour (AC10), par code ; `not_member`, `unknown_org` et la session
 * expirée gardent ceux de `messageDErreur`, qui disent qu'un nouvel essai échouerait pareil.
 */
export const MESSAGES_DU_RETOUR: MessagesDuGeste = {
  not_found: "Ce retour n'existe plus. Rechargez la page.",
  invalid_arguments: "Un refus demande un motif d'au moins 3 caractères.",
  forbidden: "Seul un administrateur de l'organisation peut traiter les retours.",
  reseau: "La connexion au serveur a échoué. Rien n'a changé.",
  conflict: AUTRE_ECHEC,
  stale_revision: AUTRE_ECHEC,
  internal: AUTRE_ECHEC,
}

export const MOTIF_TROP_COURT = "Un refus demande un motif d'au moins 3 caractères."
export const MOTIF_TROP_LONG = "Le motif compte 2 000 caractères au plus."
