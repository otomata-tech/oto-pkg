// Jeu de phrases du test de routage sans host (E03-S02, AC6, H43 amendé, P37, N10) : copie de
// `mcp-test/tests/integration/proto-routing.cases.ts` l. 5-90 (paraphrases, négatives, requêtes
// ambiguës), plus ce que la maquette stockait par procédure (`proto-data.mjs` l. 179-425) : les deux
// formulations portées par chaque résumé, les autres anciennes déclencheuses versées aux paraphrases,
// les anciennes voisines versées aux négatives. Rien de ceci n'est semé en base : seul le résumé
// porte les formulations. Retiré : Delta (hors du jeu V1), `storedCases`, le synonyme « PdV ».

export type RoutingCase = {
  phrase: string
  /** Procédure attendue ; `null` : aucune étape ne doit être servie ; absent : tout sauf `forbid`. */
  expect?: string | null
  /** Procédure dont les étapes ne doivent jamais être servies pour cette phrase. */
  forbid?: string
  kind: "formulation" | "paraphrase" | "negative" | "ambiguous"
}

const RELANCE_DEVIS = "ventes/relance_devis"
const RELANCE_PROSPECTS = "ventes/relance_prospects"
const QUALIFIER = "ventes/qualifier_prospects"
const PIPELINE = "ventes/point_pipeline"
const TICKET = "support/reponse_ticket"
const ESCALADE = "support/escalade_incident"
const SYNTHESE = "support/synthese_hebdo"
const PREPARER = "conseil/preparer_rdv"
const COMPTE_RENDU = "conseil/compte_rendu_rdv"
const ETUDE = "conseil/etude_autoconso"

const cases = (kind: RoutingCase["kind"], expect: string, phrases: string[]): RoutingCase[] =>
  phrases.map((phrase) => ({ phrase, expect, kind }))

/** Les deux formulations de chaque résumé semé (« Se demande : … »). */
export const ACME_FORMULATIONS: RoutingCase[] = [
  ...cases("formulation", RELANCE_DEVIS, ["relance les devis en attente", "qui n'a pas répondu à nos devis"]),
  ...cases("formulation", RELANCE_PROSPECTS, ["relance les prospects", "relance les leads"]),
  ...cases("formulation", QUALIFIER, ["qualifie les prospects à traiter", "traite la file de prospection"]),
  ...cases("formulation", PIPELINE, ["fais le point sur le pipeline", "où en est le pipe commercial"]),
  ...cases("formulation", TICKET, ["réponds à ce client", "traite ce ticket"]),
  ...cases("formulation", ESCALADE, ["escalade cet incident", "remonte cette panne à l'astreinte"]),
  ...cases("formulation", SYNTHESE, ["fais la synthèse de la semaine du support", "bilan hebdo du support"]),
  ...cases("formulation", PREPARER, ["prépare mon rendez-vous avec le client", "brief avant ma réunion client"]),
  ...cases("formulation", COMPTE_RENDU, ["rédige le compte rendu du rendez-vous", "fais le CR de la réunion"]),
  ...cases("formulation", ETUDE, ["lance une étude d'autoconsommation", "démarre une étude ACC"]),
]

/** Paraphrases de la maquette, puis les autres anciennes déclencheuses, que ni titre ni résumé ne portent. */
export const ACME_PARAPHRASES: RoutingCase[] = [
  ...cases("paraphrase", RELANCE_DEVIS, [
    "peux-tu relancer les devis qui sont en attente ?",
    "relance les clients qui n'ont pas répondu à leur devis",
    "fais une relance des devis envoyés sans retour",
    "il faut relancer nos devis en souffrance",
    "relancer les devis sans réponse",
    "devis en souffrance",
    "fais les relances de devis",
  ]),
  ...cases("paraphrase", RELANCE_PROSPECTS, [
    "relance les prospects de la liste",
    "recontacte les leads à traiter",
    "envoie une relance aux prospects qui attendent",
    "recontacte les prospects à traiter",
    "fais les relances de la liste de prospection",
  ]),
  ...cases("paraphrase", QUALIFIER, [
    "qualifie les prospects de la file",
    "complète les fiches des prospects à traiter",
    "enrichis les fiches du suivi des prospects",
    "complète les fiches prospects",
    "enrichis le suivi des prospects",
  ]),
  ...cases("paraphrase", PIPELINE, [
    "fais-moi le point sur le pipeline commercial",
    "où en est le pipe ?",
    "combien de prospects avons-nous par statut ?",
    "résume le suivi des prospects",
    "combien de prospects par statut",
  ]),
  ...cases("paraphrase", TICKET, [
    "aide-moi à répondre à ce client",
    "prépare la réponse à ce ticket support",
    "que dois-je répondre à ce client ?",
    "que répondre à ce client",
    "prépare une réponse au ticket",
    "rédige la réponse support",
  ]),
  ...cases("paraphrase", ESCALADE, [
    "escalade cette panne à l'astreinte",
    "signale cet incident critique à l'équipe technique",
    "il y a une coupure sur plusieurs sites, préviens l'astreinte",
    "signale un incident critique",
    "préviens l'équipe technique d'une panne",
  ]),
  ...cases("paraphrase", SYNTHESE, [
    "fais le bilan de la semaine du support",
    "résume les tickets support de cette semaine",
    "poste la synthèse hebdo du support sur Slack",
    "résume les tickets de la semaine",
    "poste le récap support sur Slack",
  ]),
  ...cases("paraphrase", PREPARER, [
    "prépare mon rdv de demain avec ce client",
    "fais-moi un brief avant ma réunion client",
    "prépare le rendez-vous avec la mairie",
    "prépare le rdv de demain",
    "qu'est-ce que je dois savoir avant de voir ce client",
  ]),
  ...cases("paraphrase", COMPTE_RENDU, [
    "rédige le CR de la réunion d'hier",
    "écris le compte rendu du rendez-vous client",
    "fais le compte-rendu de notre réunion",
    "écris le compte rendu client",
    "note ce qui s'est dit au rendez-vous",
  ]),
  ...cases("paraphrase", ETUDE, [
    "lance une étude ACC pour ce site",
    "démarre une étude d'autoconsommation collective",
    "étudie le potentiel d'autoconso pour la mairie",
    "étudie le potentiel d'autoconsommation collective",
    "fais une pré-étude solaire pour ce site",
  ]),
]

/** Une ancienne voisine : interdite à la procédure qui la déclarait, attendue sur celle qu'elle formule. */
const near = (phrase: string, forbid: string, expect?: string): RoutingCase => ({
  phrase,
  forbid,
  kind: "negative",
  ...(expect ? { expect } : {}),
})

/** Hors procédure (aucune étape servie), puis les anciennes voisines (N10). */
export const ACME_NEGATIVES: RoutingCase[] = [
  ...[
    "quelle heure est-il ?",
    "écris-moi un poème sur la mer",
    "traduis ce texte en anglais",
    "quel temps fera-t-il demain ?",
    "combien font 17 fois 23 ?",
    "donne-moi une recette de crêpes",
    "qui a gagné le match hier soir ?",
    "explique-moi la photosynthèse",
  ].map((phrase): RoutingCase => ({ phrase, expect: null, kind: "negative" })),
  near("relance les prospects", RELANCE_DEVIS, RELANCE_PROSPECTS),
  near("combien de devis avons-nous envoyés ce mois-ci", RELANCE_DEVIS),
  near("crée un nouveau devis", RELANCE_DEVIS),
  near("relance les devis en attente", RELANCE_PROSPECTS, RELANCE_DEVIS),
  near("qualifie les prospects à traiter", RELANCE_PROSPECTS, QUALIFIER),
  near("relance les prospects", QUALIFIER, RELANCE_PROSPECTS),
  near("fais le point sur le pipeline", QUALIFIER, PIPELINE),
  near("qualifie les prospects à traiter", PIPELINE, QUALIFIER),
  near("relance les devis en attente", PIPELINE, RELANCE_DEVIS),
  near("escalade cet incident", TICKET, ESCALADE),
  near("fais la synthèse de la semaine du support", TICKET, SYNTHESE),
  near("réponds à ce client", ESCALADE, TICKET),
  near("traite ce ticket", ESCALADE, TICKET),
  near("fais le point sur le pipeline", SYNTHESE, PIPELINE),
  near("réponds à ce client", SYNTHESE, TICKET),
  near("rédige le compte rendu du rendez-vous", PREPARER, COMPTE_RENDU),
  near("lance une étude d'autoconsommation", PREPARER, ETUDE),
  near("prépare mon rendez-vous avec le client", COMPTE_RENDU, PREPARER),
  near("envoie un email au client", COMPTE_RENDU),
  near("prépare mon rendez-vous avec le client", ETUDE, PREPARER),
  near("quels sont nos tarifs d'étude", ETUDE),
]

/** Requêtes d'un ou deux mots qui touchent plusieurs procédures : mesurées, sans attente (fiche D9, option A). */
export const ACME_AMBIGUOUS: RoutingCase[] = ["relance", "prospects", "devis", "le client", "une étude", "réunion"].map(
  (phrase): RoutingCase => ({ phrase, kind: "ambiguous" }),
)
