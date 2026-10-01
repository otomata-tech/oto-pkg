// Les messages d'erreur des écrans, en français : l'API sert des codes et des messages anglais,
// `ui/` traduit (H04). Une seule table, lue par tous les écrans ; jamais le texte du serveur.
import { phraseDeLimite } from "../limites/limite-atteinte"
import type { ErreurPlateforme } from "./client"

const PAR_RAISON = new Map<string, string>([
  ["forbidden/not_allowed", "Inviter est réservé aux administrateurs et aux responsables d'équipe."],
  ["forbidden/admin_role_reserved", "Seul un administrateur peut inviter un administrateur."],
  ["forbidden/team_required", "Choisissez une équipe que vous dirigez."],
  ["forbidden/email_required", "L'inscription demande une adresse email vérifiée."],
  ["conflict/already_member", "Cette personne fait déjà partie de l'organisation."],
  ["conflict/already_invited", "Une invitation attend déjà cette adresse. Révoquez-la pour en envoyer une autre."],
  ["conflict/email_rate_limited", "Un email vient de partir vers cette adresse. Réessayez dans une minute."],
  ["conflict/last_admin", "C'est le dernier administrateur de l'organisation : nommez-en un autre avant."],
  ["conflict/name_taken", "Une équipe de l'organisation porte déjà ce nom."],
  ["conflict/path_taken", "Une page porte déjà ce nom : choisissez-en un autre pour l'équipe."],
  ["conflict/slug_taken", "Une autre équipe de l'organisation utilise déjà le chemin de ce nom : choisissez-en un autre."],
  ["conflict/team_owns_objects", "L'équipe possède encore des nœuds ou des comptes : transférez-les ou supprimez-les avant."],
  ["invalid_arguments/reserved_slug", "Ce nom est réservé : choisissez-en un autre."],
])

const PAR_CODE = new Map<string, string>([
  ["forbidden", "Vous n'avez pas le droit de faire cela."],
  ["conflict", "L'action entre en conflit avec l'état actuel. Rechargez la page."],
  ["invalid_arguments", "Certaines valeurs sont invalides."],
  ["not_found", "Élément introuvable."],
  // La porte le rend à tout geste d'une personne retirée pendant que l'écran était ouvert (E05-S03, AC9).
  ["not_member", "Vous ne faites plus partie de cette organisation."],
  // Et à tout geste sur une adresse qui ne sert plus d'organisation : supprimée, ou adresse détachée.
  ["unknown_org", "Cette adresse ne sert plus d'organisation. Rechargez la page."],
])

/**
 * Les phrases propres à un geste, par raison ou par code : elles nomment ce que la table ne connaît
 * pas (l'organisation, la personne) et l'emportent sur elle. `{objets}` y est remplacé par ce que le
 * refus dit bloquer (AC14).
 */
export type MessagesDuGeste = Readonly<Record<string, string>>

/** « ventes/devis, ventes/suivi et 3 autres (nœuds) » : une liste d'un refus, 20 noms au plus. */
function liste(noms: unknown, total: unknown, singulier: string, pluriel: string): string | null {
  if (!Array.isArray(noms)) return null
  const lus = noms.filter((nom): nom is string => typeof nom === "string")
  if (lus.length === 0) return null
  const nombre = typeof total === "number" && total > lus.length ? total : lus.length
  const reste = nombre - lus.length
  const suite = reste > 0 ? ` et ${reste} ${reste > 1 ? "autres" : "autre"}` : ""
  return `${lus.join(", ")}${suite} (${nombre > 1 ? pluriel : singulier})`
}

/** Ce qu'un refus dit bloquer : ses nœuds (`details.nodes`), puis ses comptes (`details.accounts`). */
function ceQuiBloque(details: ErreurPlateforme["details"]): string {
  const parties = [
    liste(details?.nodes, details?.nodesTotal, "nœud", "nœuds"),
    liste(details?.accounts, details?.accountsTotal, "compte", "comptes"),
  ].filter((partie) => partie !== null)
  return parties.length > 0 ? parties.join(" ; ") : "des nœuds ou des comptes"
}

function phrasePropre(erreur: ErreurPlateforme, propres: MessagesDuGeste | undefined): string | undefined {
  if (!propres) return undefined
  if (erreur.raison && Object.hasOwn(propres, erreur.raison)) return propres[erreur.raison]
  return Object.hasOwn(propres, erreur.code) ? propres[erreur.code] : undefined
}

export function messageDErreur(erreur: ErreurPlateforme, propres?: MessagesDuGeste): string {
  // Un geste peut dire ce que l'échec du réseau laisse en l'état (E08-S09, AC10 : « Rien n'a changé. »).
  if (erreur.code === "reseau") return phrasePropre(erreur, propres) ?? "La connexion au serveur a échoué. Réessayez."
  // Sans session, l'API répond 401 avec le code `forbidden` (N9) : le statut porte la différence.
  if (erreur.statut === 401) return "Votre session a expiré. Reconnectez-vous."
  // Une capacité de l'organisation atteinte (E12-S02) : sa limite et son plafond, lus dans le refus.
  const limite = erreur.code === "forbidden" && erreur.raison === "limit" ? phraseDeLimite(erreur.details?.limit, erreur.details?.max) : null
  const texte =
    limite ??
    phrasePropre(erreur, propres) ??
    PAR_RAISON.get(`${erreur.code}/${erreur.raison ?? ""}`) ??
    PAR_CODE.get(erreur.code) ??
    "Une erreur est survenue. Réessayez."
  return texte.replaceAll("{objets}", ceQuiBloque(erreur.details))
}
