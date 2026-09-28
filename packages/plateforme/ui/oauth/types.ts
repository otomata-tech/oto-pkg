// Formes de l'écran de consentement OAuth (E02-S02). Redéfinies ici : ui/ n'importe pas server/
// (ADR-008 § 4) ; `consentRequest` (`server/oauth.ts`) rend la même forme, que l'hôte passe telle quelle.
import type { DecisionError } from "../../schemas/oauth"
import type { MarqueDOrganisation } from "../marque/types"

/**
 * L'organisation visée, lue par la ressource de la demande (H16) ; `administration` : le MCP admin.
 * `marque` : celle de l'organisation connue (E09-S02), publique sur `/login` de son adresse.
 */
export type OrganisationDeLaDemande =
  | { etat: "connue"; nom: string; membre: boolean; marque: MarqueDOrganisation }
  | { etat: "inconnue"; hote: string }
  | { etat: "administration" }
  | { etat: "indeterminee" }

export type DemandeDeConsentement = {
  authorizationId: string
  /** `site` et `logo` : adresses `http:` ou `https:` vérifiées par le serveur, sinon `null` ; l'écran les revérifie. */
  client: { nom: string; site: string | null; logo: string | null }
  /** Email du compte connecté. */
  compte: string
  adresseDeRetour: string
  /** Un accès par scope, dans l'ordre reçu ; `libelle` est la ligne à afficher. Vide : aucun scope demandé. */
  acces: { scope: string; libelle: string }[]
  organisation: OrganisationDeLaDemande
}

/** Échec de la décision précédente, que l'hôte lit dans son adresse (`?erreur=`) : `decisionErrorSchema`. */
export type ErreurDeDecision = DecisionError
