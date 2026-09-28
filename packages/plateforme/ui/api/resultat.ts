// L'adaptateur des pages de l'hôte vers la prop `resultat` des écrans (portage § 4, E05-S03) : une
// lecture de service devient `{ data }` ou `{ error }`, le texte venant de la table de
// `messageDErreur`. Il ne lit pas `server/` (frontière ESLint) : le code et la raison se lisent sur
// l'objet d'erreur ; toute autre panne reçoit le message générique de la même table.
import type { ErreurPlateforme } from "./client"
import { messageDErreur, type MessagesDuGeste } from "./messages"

/** Même forme que le retour des actions (`ActionResult`) : des données, ou un message à montrer. */
export type Resultat<T> = { data: T; error?: never } | { data?: never; error: string }

function erreurLisible(erreur: unknown): ErreurPlateforme | null {
  if (typeof erreur !== "object" || erreur === null || !("code" in erreur) || typeof erreur.code !== "string") return null
  const details = "details" in erreur && typeof erreur.details === "object" && erreur.details !== null ? erreur.details : undefined
  const raison = details && "reason" in details && typeof details.reason === "string" ? details.reason : undefined
  return { code: erreur.code, raison, statut: 0 }
}

/**
 * `propres` : les phrases d'un écran pour les refus de ses lectures, qui l'emportent sur la table
 * commune (`too_large` d'un tableau, E07-S03) ; comme pour un geste (`messageDErreur`).
 */
export async function resultatDe<T>(promesse: Promise<T>, propres?: MessagesDuGeste): Promise<Resultat<T>> {
  try {
    return { data: await promesse }
  } catch (erreur) {
    const lisible = erreurLisible(erreur)
    // La page de l'hôte est un Server Component : l'erreur technique part au log du serveur, jamais
    // à l'écran.
    console.error("[plateforme] resultatDe", lisible?.code ?? erreur)
    return { error: messageDErreur(lisible ?? { code: "internal", statut: 0 }, propres) }
  }
}
