// Phrases du test de routage du pilote (E06-S01, AC2, AC4 ; H43 amendé, P37, NH7, NH11) : les deux
// formulations que porte le résumé de `ventes/qualifier_prospects`, son titre, les paraphrases, les
// négatives (hors sujet et demandes proches), les questions de données, les limites mesurées et les
// golden queries du pilote (`docs/mcp-golden-queries.md`, section du pilote). Jamais stockées dans le
// module de données ni en base (P37) : seul le résumé porte les formulations ; une paraphrase non
// servie est rapportée, jamais ajoutée au résumé ; une demande proche servie se corrige par le titre ou
// le résumé, jamais par le seuil. Repris de la maquette (`mcp-test/tests/integration/proto-routing.cases.ts`
// l. 1-96) : les paraphrases jamais stockées ; retiré : les déclencheuses et voisines lues dans les données.

export const PILOT_PROCEDURE_PATH = "ventes/qualifier_prospects"

export type PilotRoutingCase = {
  phrase: string
  kind: "formulation" | "title" | "paraphrase" | "negative" | "near" | "data" | "limit" | "golden"
  /**
   * `served` : étapes servies ; `first` : la procédure en premier candidat ; `never` : étapes jamais
   * servies ; `measured` : score imprimé, sans attente (NH7).
   */
  expect: "served" | "first" | "never" | "measured"
  /** Identifiant de la golden query (QP-D1…). */
  id?: string
}

const cases = (kind: PilotRoutingCase["kind"], expect: PilotRoutingCase["expect"], phrases: string[]): PilotRoutingCase[] =>
  phrases.map((phrase) => ({ phrase, kind, expect }))

/** Les deux formulations du résumé : chacune y figure mot pour mot, casse ignorée (AC2), et sert la procédure (AC4). */
export const PILOT_FORMULATIONS = cases("formulation", "served", ["complète les fiches des prospects", "qualifie les prospects"])

/** Le titre : le message du prompt `qualifier_prospects` (AC13, QP-D3). */
export const PILOT_TITLE: PilotRoutingCase = { phrase: "Qualifier les prospects", kind: "title", expect: "served" }

/** Paraphrases : taux mesuré et imprimé, sans seuil (NH7, NH11). */
export const PILOT_PARAPHRASES = cases("paraphrase", "measured", [
  "peux-tu qualifier les nouveaux prospects ?",
  "complète les fiches des prospects qui attendent",
  "cherche les contacts des prospects à traiter",
  "enrichis les fiches du suivi des prospects",
  "qualifie trois prospects de la file",
  "trouve les emails des prospects à qualifier",
  "traite les prospects en attente de qualification",
  "qualifie les leads à traiter",
  "complète les fiches prospects",
  "traite la file de prospection",
  "enrichis le suivi des prospects",
  "trouve les contacts des prospects à traiter",
  "prépare les fiches des nouveaux prospects",
])

/** Hors sujet : jamais servies. */
export const PILOT_NEGATIVES = cases("negative", "never", [
  "quelle heure est-il ?",
  "écris-moi un poème sur la mer",
  "traduis ce texte en anglais",
  "donne-moi une recette de crêpes",
  "combien font 17 fois 23 ?",
  "explique-moi la photosynthèse",
  "aide-moi à qualifier mon équipe de football pour la finale",
  "complète cette phrase : le chat est sur le",
])

/** Demandes proches, que la procédure ne fait pas : jamais servies (anciennes voisines, NH11). */
export const PILOT_NEAR = cases("near", "never", [
  "relance les prospects à traiter",
  "valide les fiches prospects à revoir",
  "ajoute un nouveau prospect au suivi",
  "combien de prospects reste-t-il à qualifier",
])

/** Questions de données : jamais servies ; elles se répondent par `table.rows` ou `table.aggregate` (H37). */
export const PILOT_DATA_QUESTIONS = cases("data", "never", [
  "combien de prospects avons-nous à Valbrune, et lesquels ?",
  "combien de prospects avons-nous à valbrune",
])

/** Limites mesurées : score imprimé, servies ou non, rapportées à E06-S02 (NH6 ; « prospects » : fiche D9, option A). */
export const PILOT_LIMITS = cases("limit", "measured", [
  "il reste combien de prospects à qualifier ?",
  "où en est la qualification de nos prospects ?",
  "où en est la qualification des prospects",
  "quels prospects attendent la revue ?",
  "prospects",
])

/** Golden queries du pilote, rejouées sans host (H122) avec l'attendu de l'AC4 ; QP-D3 est le titre, message du prompt. */
export const PILOT_GOLDEN_QUERIES: PilotRoutingCase[] = [
  { id: "QP-D1", phrase: "Qualifie les prospects à traiter.", kind: "golden", expect: "served" },
  { id: "QP-D2", phrase: "Qualifie 5 prospects de la file, s'il te plaît.", kind: "golden", expect: "first" },
  { id: "QP-D3", phrase: "Qualifier les prospects", kind: "golden", expect: "served" },
  { id: "QP-I1", phrase: "Il faudrait compléter les fiches des nouveaux prospects avant qu'on les appelle.", kind: "golden", expect: "first" },
  { id: "QP-I2", phrase: "Il reste combien de prospects à qualifier ?", kind: "golden", expect: "measured" },
  { id: "QP-I3", phrase: "Combien de fiches attendent la revue ?", kind: "golden", expect: "never" },
  { id: "QP-I4", phrase: "Où en est la qualification de nos prospects ?", kind: "golden", expect: "measured" },
  { id: "QP-I5", phrase: "Prospects.", kind: "golden", expect: "measured" },
  { id: "QP-V1", phrase: "Relance les prospects à traiter.", kind: "golden", expect: "never" },
  { id: "QP-N1", phrase: "Aide-moi à qualifier mon équipe de football pour la finale.", kind: "golden", expect: "never" },
  { id: "QP-N2", phrase: "Complète cette phrase : « Le chat est sur le… ».", kind: "golden", expect: "never" },
]

/** Toutes les phrases jouées par l'AC4. */
export const PILOT_ROUTING_CASES: PilotRoutingCase[] = [
  ...PILOT_FORMULATIONS,
  PILOT_TITLE,
  ...PILOT_PARAPHRASES,
  ...PILOT_NEGATIVES,
  ...PILOT_NEAR,
  ...PILOT_DATA_QUESTIONS,
  ...PILOT_LIMITS,
  ...PILOT_GOLDEN_QUERIES,
]
