// Données de test d'Acme Énergies (E03-S02, N8, N9, N10) : copie de `PROTO_ORGS[0]` de la maquette
// (`mcp-test/scripts/lib/proto-data.mjs` l. 83-504), données fictives (ADR-010), ramenée à P37 (un
// résumé qui porte deux formulations, ni phrases déclencheuses ni voisines), à P39 (guide, règles
// d'équipe et ton des profils versés aux Contextes) et à l'ADR-011 (blocs). Étapes en listes
// numérotées, chaque `acme_call {…}` réécrit en bloc `call` après l'étape qui l'annonce, numérotation
// reprise par `start` (forme de la procédure Démo d'E01-S06) ; un appel d'outil reste en code en ligne.
// Chaque bloc passe `blockInputSchema` (vérifié en tête du test de routage). Retiré : `triggers`,
// `neighbors`, `meta.suggested`, `vocabulary` et `topics` (ADR-011 § 7), `rules` et ton des profils
// (→ Contextes), sections markdown (→ blocs), clé `id` du tableau (→ `ref`, en-tête H91).
import type { BlockInput } from "../../../packages/plateforme/schemas"
import type { Json } from "../../../packages/plateforme/server/database"
import type { Candidate } from "../../../packages/plateforme/server/routing"
import type { SeedNode } from "../../helpers/plateforme"
import { nodeId, ORG, referenceTables, type RuleSpec } from "../../helpers/reference-org"
import type { Row, Tables } from "../../helpers/simulated-db"

export type AcmeTeam = "ventes" | "support" | "conseil"
export type AcmePerson = "jb" | "claire" | "paul" | "lea"

/** Un nœud d'Acme ; `team` : l'équipe qui le porte, `null` pour un nœud d'organisation ou personnel. */
export type AcmeNode = Omit<SeedNode, "ownerTeamId" | "blocks"> & { team: AcmeTeam | null; blocks: BlockInput[] }

export const ACME_TEAMS: Record<AcmeTeam, { name: string; lead: AcmePerson }> = {
  ventes: { name: "Ventes", lead: "claire" },
  support: { name: "Support", lead: "paul" },
  conseil: { name: "Conseil", lead: "jb" },
}

type AcmePersonData = {
  name: string
  role: "admin" | "member"
  defaultTeam: AcmeTeam
  teams: AcmeTeam[]
  /** Ton et préférences de la maquette, versés au Contexte de Perso (P39). */
  tone: string
  preferences: string
}

/** jb : administrateur, équipe par défaut Conseil, membre de Ventes et Support ; profil `{ name, handle, language }`. */
export const ACME_PEOPLE: Record<AcmePerson, AcmePersonData> = {
  jb: {
    name: "Jean-Baptiste",
    role: "admin",
    defaultTeam: "conseil",
    teams: ["conseil", "ventes", "support"],
    tone: "Tutoiement, phrases courtes. Termine chaque réponse finale par la signature « — ton assistant Acme ».",
    preferences: "Réponses en liste, montants en euros HT.",
  },
  claire: { name: "Claire Morel", role: "member", defaultTeam: "ventes", teams: ["ventes"], tone: "Vouvoiement, précis.", preferences: "Tableaux pour les chiffres." },
  paul: { name: "Paul Girard", role: "member", defaultTeam: "support", teams: ["support"], tone: "Tutoiement.", preferences: "Aller droit au but." },
  lea: { name: "Léa Roux", role: "member", defaultTeam: "ventes", teams: ["ventes"], tone: "Tutoiement.", preferences: "" },
}

export function acmeProfile(person: AcmePerson): Json {
  return { name: ACME_PEOPLE[person].name, handle: person, language: "fr" }
}

const heading = (text: string): BlockInput => ({ type: "heading", text, data: { level: 1 } })
const paragraph = (text: string): BlockInput => ({ type: "paragraph", text })
const call = (fn: string, args: Record<string, unknown>): BlockInput => ({ type: "call", data: { function: fn, args } })

/** Une étape : son texte, et le bloc `call` qu'elle annonce. */
type Step = string | { text: string; call: BlockInput }

/** Étapes numérotées, coupées après chaque étape qui annonce un appel, reprises par `start`. */
function stepBlocks(steps: Step[]): BlockInput[] {
  const blocks: BlockInput[] = []
  let pending: string[] = []
  let start = 1
  const flush = () => {
    if (pending.length === 0) return
    blocks.push({ type: "list", data: { items: pending, ordered: true, ...(start > 1 ? { start } : {}) } })
    start += pending.length
    pending = []
  }
  for (const step of steps) {
    pending.push(typeof step === "string" ? step : step.text)
    if (typeof step === "string") continue
    flush()
    blocks.push(step.call)
  }
  flush()
  return blocks
}

const ANNOUNCE = "Annonce en une phrase ce que tu vas faire."
const TABLE = "ventes/suivi_prospects"
const WORKER = "<ton prénom>"

/** L'envoi en deux temps de la maquette (`SEND_TWO_STEPS`) : une étape, puis le bloc `call`. */
const sendDraft = (before: string): Step => ({
  text: `${before} Un premier appel sans confirm rend un récapitulatif ; après l'accord explicite de la personne, refais le même appel avec confirm: true à la racine :`,
  call: call("mail.send_draft", { id: "<id du brouillon>" }),
})

function procedure(
  path: string,
  team: AcmeTeam,
  header: { title: string; summary: string },
  body: { when: string; steps: Step[]; rules: string },
): AcmeNode {
  return {
    path,
    kind: "procedure",
    team,
    ...header,
    blocks: [
      heading("Quand l'utiliser"),
      paragraph(body.when),
      heading("Étapes"),
      ...stepBlocks(body.steps),
      heading("Règles"),
      paragraph(body.rules),
    ],
  }
}

/** Les dix procédures ; le résumé est celui de la maquette suivi de deux anciennes déclencheuses (N10). */
export const ACME_PROCEDURES: AcmeNode[] = [
  procedure(
    "ventes/relance_devis",
    "ventes",
    {
      title: "Relancer les devis en attente",
      summary:
        "Relance par email les devis envoyés sans réponse depuis 7 jours ou plus, après accord de la personne. Se demande : « relance les devis en attente », « qui n'a pas répondu à nos devis ».",
    },
    {
      when: "Quand des devis envoyés n'ont pas de réponse depuis au moins 7 jours.",
      steps: [
        ANNOUNCE,
        { text: "Liste les devis en attente :", call: call("sellsy.list_estimates", { status: "sent", older_than_days: 7 }) },
        {
          text: "Pour chaque devis, prépare un brouillon avec le modèle de ventes/modele_relance :",
          call: call("mail.create_draft", { to: "<email du contact>", subject: "Votre devis <numéro>", body: "<modèle rempli>" }),
        },
        "Montre la liste des brouillons à la personne et demande son accord avant tout envoi.",
        sendDraft("Seulement après son accord, envoie chaque brouillon."),
      ],
      rules: "Jamais d'envoi sans accord. Un devis refusé ou accepté ne se relance pas.",
    },
  ),
  procedure(
    "ventes/relance_prospects",
    "ventes",
    {
      title: "Relancer les prospects à traiter",
      summary:
        "Prend les prospects « à traiter » de la file, prépare un email de relance pour chacun, puis les marque « relancé ». Se demande : « relance les prospects », « relance les leads ».",
    },
    {
      when: "Quand la personne veut recontacter les prospects du tableau de suivi qui attendent.",
      steps: [
        ANNOUNCE,
        { text: "Réserve jusqu'à 5 prospects :", call: call("table.claim", { table: TABLE, worker: WORKER, limit: 5 }) },
        {
          text: "Pour chacun, prépare un brouillon :",
          call: call("mail.create_draft", { to: "<email>", subject: "Suite à notre échange", body: "<texte>" }),
        },
        "Montre les brouillons et demande l'accord avant tout envoi.",
        {
          text: "Après envoi, marque chaque ligne et libère-la :",
          call: call("table.release", { table: TABLE, key: "<ref>", worker: WORKER, state: "relancé" }),
        },
      ],
      rules: "Une ligne réservée par un autre travailleur ne se touche pas.",
    },
  ),
  procedure(
    "ventes/qualifier_prospects",
    "ventes",
    {
      title: "Qualifier les prospects à traiter",
      summary:
        "Complète les fiches des prospects à traiter (contact, montant estimé, notes) sans les contacter. Se demande : « qualifie les prospects à traiter », « traite la file de prospection ».",
    },
    {
      when: "Quand des fiches de prospects sont incomplètes et qu'il faut les compléter avant toute relance.",
      steps: [
        ANNOUNCE,
        { text: "Lis le contrat du tableau :", call: call("table.schema", { table: TABLE }) },
        { text: "Réserve des lignes :", call: call("table.claim", { table: TABLE, worker: WORKER, limit: 3 }) },
        {
          text: "Complète chaque ligne ; un champ cherché sans résultat se déclare avec verified_empty et la raison :",
          call: call("table.write", { table: TABLE, rows: [{ key: "<ref>", set: { notes: "<notes>" } }] }),
        },
        {
          text: "Libère chaque ligne, remise dans la file « à traiter » (l'état « en cours » n'existe que sous réservation) :",
          call: call("table.release", { table: TABLE, key: "<ref>", worker: WORKER, state: "à traiter" }),
        },
      ],
      rules: "Ne jamais inventer un contact. Ne jamais écrire null.",
    },
  ),
  procedure(
    "ventes/point_pipeline",
    "ventes",
    {
      title: "Faire le point sur le pipeline",
      summary:
        "Compte les prospects par statut, liste les devis en attente et poste la synthèse sur Slack après accord. Se demande : « fais le point sur le pipeline », « où en est le pipe commercial ».",
    },
    {
      when: "Quand la personne veut une vue d'ensemble de l'activité commerciale.",
      steps: [
        ANNOUNCE,
        { text: "Compte les prospects par statut :", call: call("table.aggregate", { table: TABLE, group_by: "statut" }) },
        { text: "Liste les devis envoyés :", call: call("sellsy.list_estimates", { status: "sent" }) },
        "Rédige une synthèse de cinq lignes et montre-la.",
        { text: "Après accord, poste-la :", call: call("slack.post_message", { channel: "#ventes", text: "<synthèse>" }) },
      ],
      rules: "Montants en euros HT.",
    },
  ),
  procedure(
    "support/reponse_ticket",
    "support",
    {
      title: "Répondre à un ticket client",
      summary:
        "Prépare une réponse à un client à partir de la FAQ support, en brouillon, envoyée seulement après accord. Se demande : « réponds à ce client », « traite ce ticket ».",
    },
    {
      when: "Quand un client pose une question ou signale un problème qui ne touche que lui.",
      steps: [
        ANNOUNCE,
        'Lis la FAQ : `acme_read {"path": "support/faq"}`.',
        {
          text: "Prépare le brouillon de réponse :",
          call: call("mail.create_draft", { to: "<email du client>", subject: "Re: <objet>", body: "<réponse>" }),
        },
        sendDraft("Montre le brouillon et demande l'accord avant envoi."),
      ],
      rules: "Vouvoiement avec les clients. Si le problème touche plusieurs sites, c'est un incident : procédure support/escalade_incident.",
    },
  ),
  procedure(
    "support/escalade_incident",
    "support",
    {
      title: "Escalader un incident",
      summary:
        "Signale une panne qui touche plusieurs sites à l'astreinte technique sur Slack, avec les faits connus. Se demande : « escalade cet incident », « remonte cette panne à l'astreinte ».",
    },
    {
      when: "Quand une panne ou une coupure touche plusieurs sites, ou qu'un client signale un danger.",
      steps: [
        ANNOUNCE,
        "Rassemble les faits : sites touchés, heure de début, symptômes.",
        { text: "Après accord, préviens l'astreinte :", call: call("slack.post_message", { channel: "#astreinte", text: "<faits>" }) },
      ],
      rules: "Ne jamais promettre un délai de rétablissement.",
    },
  ),
  procedure(
    "support/synthese_hebdo",
    "support",
    {
      title: "Synthèse hebdomadaire du support",
      summary:
        "Résume les tickets de la semaine en cinq lignes et poste la synthèse sur Slack après accord. Se demande : « fais la synthèse de la semaine du support », « bilan hebdo du support ».",
    },
    {
      when: "Le vendredi, ou quand la personne demande le bilan de la semaine du support.",
      steps: [
        ANNOUNCE,
        "Rédige la synthèse : volume, sujets récurrents, incidents, délai moyen.",
        { text: "Après accord, poste-la :", call: call("slack.post_message", { channel: "#support", text: "<synthèse>" }) },
      ],
      rules: "Aucun nom de client dans la synthèse.",
    },
  ),
  procedure(
    "conseil/preparer_rdv",
    "conseil",
    {
      title: "Préparer un rendez-vous client",
      summary:
        "Rassemble devis, historique et points d'attention avant un rendez-vous, en une fiche d'une page. Se demande : « prépare mon rendez-vous avec le client », « brief avant ma réunion client ».",
    },
    {
      when: "Avant un rendez-vous avec un client ou un prospect.",
      steps: [
        ANNOUNCE,
        { text: "Retrouve ses devis :", call: call("sellsy.list_estimates", {}) },
        { text: "Lis le détail du devis concerné :", call: call("sellsy.get_estimate", { id: "<numéro>" }) },
        "Rédige une fiche d'une page : contexte, chiffres, trois questions à poser.",
      ],
      rules: "Lecture seule : rien n'est envoyé.",
    },
  ),
  procedure(
    "conseil/compte_rendu_rdv",
    "conseil",
    {
      title: "Rédiger le compte rendu d'un rendez-vous",
      summary:
        "Écrit le compte rendu d'un rendez-vous dans une page du dossier client, puis propose l'email de suivi. Se demande : « rédige le compte rendu du rendez-vous », « fais le CR de la réunion ».",
    },
    {
      when: "Après un rendez-vous, quand la personne dicte ou résume ce qui s'est dit.",
      steps: [
        ANNOUNCE,
        'Crée la page du compte rendu en brouillon : `acme_write {"path": "conseil/cr_<client>_<date>", "kind": "page", "title": "CR <client>", "summary": "<une ligne>", "ops": [{"op": "add_section", "section": "Décisions", "text": "<décisions>"}]}`.',
        "Relis-la avec la personne, puis publie avec publish: true.",
        {
          text: "Propose l'email de suivi en brouillon :",
          call: call("mail.create_draft", { to: "<email>", subject: "Compte rendu de notre rendez-vous", body: "<résumé>" }),
        },
      ],
      rules: "Un compte rendu ne contient que ce qui a été dit.",
    },
  ),
  procedure(
    "conseil/etude_autoconso",
    "conseil",
    {
      title: "Lancer une étude d'autoconsommation",
      summary:
        "Démarre une étude d'autoconsommation collective en suivant la méthode d'étude, étape par étape. Se demande : « lance une étude d'autoconsommation », « démarre une étude ACC ».",
    },
    {
      when: "Quand un client veut connaître le potentiel d'une opération d'autoconsommation collective.",
      steps: [
        ANNOUNCE,
        'Lis le plan de la méthode : `acme_read {"path": "conseil/methode_etude", "outline": true}`.',
        'Lis la section utile, par exemple : `acme_read {"path": "conseil/methode_etude", "section": "Collecte des données"}`.',
        "Liste avec la personne les données à demander au client.",
      ],
      rules: "Aucun taux promis avant l'étude.",
    },
  ),
]

/** Une page : chaque section de la maquette en titre suivi d'un paragraphe. */
function page(path: string, team: AcmeTeam | null, header: { title: string; summary: string }, sections: [string, string][]): AcmeNode {
  return { path, kind: "page", team, ...header, blocks: sections.flatMap(([title, text]) => [heading(title), paragraph(text)]) }
}

/** Les douze sections de la méthode, réduites à leur phrase d'introduction. */
const STUDY_SECTIONS: [string, string][] = [
  ["Objet de l'étude", "Définir le périmètre d'une étude d'autoconsommation collective : bâtiments producteurs, consommateurs du périmètre, contraintes du réseau de distribution."],
  ["Collecte des données", "Rassembler les courbes de charge au pas de 30 minutes, les factures des douze derniers mois et les plans de toiture de chaque site."],
  ["Visite technique", "Vérifier sur place l'orientation, les ombrages, l'état de la charpente et l'accès au tableau général basse tension."],
  ["Gisement solaire", "Estimer la production mensuelle par pan de toiture à partir de l'irradiation locale, de l'inclinaison et des pertes système."],
  ["Dimensionnement", "Choisir la puissance crête qui maximise le taux d'autoconsommation sans dépasser le seuil de rentabilité fixé avec le client."],
  ["Clé de répartition", "Comparer la clé statique, la clé dynamique par défaut et une clé dynamique personnalisée selon les profils de consommation."],
  ["Taux d'autoconsommation", "Calculer la part de la production consommée dans le périmètre, heure par heure, sur une année type."],
  ["Taux d'autoproduction", "Calculer la part de la consommation couverte par la production locale, par participant et pour l'ensemble de l'opération."],
  ["Modèle économique", "Établir le prix de vente de l'énergie locale, les frais de la personne morale organisatrice et le temps de retour."],
  ["Montage juridique", "Rédiger les statuts de la personne morale organisatrice et la convention avec le gestionnaire de réseau."],
  ["Risques", "Lister les risques techniques, contractuels et financiers, avec pour chacun une mesure de réduction et un responsable."],
  ["Restitution", "Présenter au client la synthèse, les trois scénarios chiffrés et la recommandation, puis déposer le rapport dans son dossier."],
]

export const ACME_PAGES: AcmeNode[] = [
  page(
    "conseil/methode_etude",
    "conseil",
    {
      title: "Méthode d'étude d'autoconsommation collective",
      summary: "La méthode d'Acme pour une étude d'autoconsommation collective, en douze étapes, de la collecte à la restitution.",
    },
    STUDY_SECTIONS,
  ),
  page("conseil/grille_tarifaire_2026", "conseil", { title: "Grille tarifaire 2026", summary: "Tarifs 2026 des études et de l'accompagnement, en euros HT." }, [
    ["Études", "Pré-étude : 1 500 € HT. Étude complète jusqu'à 10 participants : 6 500 € HT. Par participant supplémentaire : 250 € HT."],
    ["Accompagnement", "Montage de la PMO : 3 000 € HT. Suivi annuel de l'opération : 1 200 € HT par an."],
  ]),
  page(
    "support/faq",
    "support",
    { title: "FAQ support", summary: "Réponses types aux questions fréquentes des participants aux opérations d'autoconsommation." },
    [
      ["Facture", "La part locale apparaît sur une ligne distincte de la facture du fournisseur, avec le prix fixé par la PMO."],
      ["Coupure", "Une coupure du réseau coupe aussi la production locale : c'est une sécurité. Si elle touche plusieurs sites, escalader."],
      ["Changement de fournisseur", "Le participant garde sa part locale s'il change de fournisseur ; prévenir la PMO sous 30 jours."],
    ],
  ),
  page(
    "ventes/modele_relance",
    "ventes",
    { title: "Modèle d'email de relance", summary: "Le modèle d'email de relance d'un devis, à personnaliser avec le numéro et le prénom du contact." },
    [
      ["Objet", "Votre devis <numéro> — une question ?"],
      [
        "Corps",
        "Bonjour <prénom>,\n\nJe reviens vers vous au sujet du devis <numéro> envoyé le <date>. Avez-vous pu le parcourir ? Je peux vous l'expliquer en quinze minutes, quand vous voulez.\n\nBien cordialement,",
      ],
    ],
  ),
]

const PROSPECT_STATES = ["à traiter", "en cours", "relancé", "gagné", "perdu"]

/** Les douze prospects de la maquette (l. 70-81) : réf, entreprise, contact, ville, statut, dernier contact, montant. */
const PROSPECTS: [string, string, string, string, string, string, number][] = [
  ["P-001", "Boulangerie des Tilleuls", "Marion Vasseur", "Valbrune", "à traiter", "2026-08-28", 12000],
  ["P-002", "Camping Les Pins Bleus", "Hugo Ferrand", "Saint-Arlan", "à traiter", "2026-09-02", 48000],
  ["P-003", "Mairie de Valbrune", "Sophie Lacaze", "Valbrune", "en cours", "2026-09-10", 95000],
  ["P-004", "Garage Moreau Frères", "Luc Moreau", "Brémontier", "relancé", "2026-09-05", 18000],
  ["P-005", "Ferme du Grand Coudray", "Anne Delorme", "Coudray-sur-Lise", "à traiter", "2026-08-20", 30000],
  ["P-006", "Clinique vétérinaire des Saules", "Paul-Henri Rives", "Saint-Arlan", "gagné", "2026-07-15", 22000],
  ["P-007", "Collège Jean-Rostand de Brémontier", "Claire Benoît", "Brémontier", "à traiter", "2026-09-12", 60000],
  ["P-008", "Scierie Vallet", "Denis Vallet", "Haute-Lise", "perdu", "2026-06-30", 40000],
  ["P-009", "Maison de santé du Plateau", "Inès Barral", "Valbrune", "en cours", "2026-09-15", 35000],
  ["P-010", "Brasserie de la Lise", "Tom Garnier", "Coudray-sur-Lise", "à traiter", "2026-09-01", 15000],
  ["P-011", "Salle des sports de Haute-Lise", "Julie Marchal", "Haute-Lise", "relancé", "2026-08-25", 52000],
  ["P-012", "Supérette du Marché", "Karim Haddad", "Saint-Arlan", "à traiter", "2026-09-18", 9000],
]

/** L'email de la maquette : prénom et ville sans accent ni signe, domaine `.test`. */
function prospectEmail(contact: string, ville: string): string {
  const local = contact.toLowerCase().split(" ")[0].normalize("NFD").replace(/[^a-z-]/g, "")
  return `${local}@${ville.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.test`
}

/** Le tableau des prospects : en-tête H91, clé `ref` ; ses lignes portent toutes les colonnes renseignées. */
export const ACME_TABLE: AcmeNode = {
  path: TABLE,
  kind: "table",
  team: "ventes",
  title: "Suivi des prospects",
  summary: "Les prospects de l'équipe Ventes, avec leur statut, et la file de travail des prospects à traiter.",
  blocks: [],
  meta: {
    columns: [
      { name: "ref", type: "text", required: true },
      { name: "entreprise", type: "text" },
      { name: "contact", type: "text" },
      { name: "email", type: "email" },
      { name: "ville", type: "text" },
      { name: "statut", type: "enum", options: PROSPECT_STATES },
      { name: "dernier_contact", type: "date" },
      { name: "montant_estime", type: "number" },
      { name: "notes", type: "text" },
    ],
    key: "ref",
    closed: false,
  },
  rows: PROSPECTS.map(([ref, entreprise, contact, ville, statut, dernier_contact, montant_estime]) => ({
    key: ref,
    data: { ref, entreprise, contact, email: prospectEmail(contact, ville), ville, statut, dernier_contact, montant_estime },
  })),
}

/** Contexte d'une équipe : ses règles de la maquette (P39). */
function teamContext(team: AcmeTeam, rules: string): AcmeNode {
  const summary = `Règles de l'équipe ${ACME_TEAMS[team].name}, lues par les assistants de ses membres.`
  return { path: `${team}/contexte`, kind: "context", team, title: "Contexte", summary, blocks: [heading("Règles"), paragraph(rules)] }
}

/** Contexte de Perso : ton et, s'il y en a, préférences du profil de la maquette (P39). */
function personalContext(person: AcmePerson): AcmeNode {
  const { name, tone, preferences } = ACME_PEOPLE[person]
  const blocks = [heading("Ton"), paragraph(tone), ...(preferences ? [heading("Préférences"), paragraph(preferences)] : [])]
  const summary = `Ton et préférences de ${name}, lus par ses seuls assistants.`
  return { path: `private/${person}/contexte`, kind: "context", team: null, title: "Contexte", summary, blocks }
}

/** Les Contextes : le guide de la maquette pour Tout le monde, les règles d'équipe, le ton de chacun. */
export const ACME_CONTEXTS: AcmeNode[] = [
  {
    path: "contexte",
    kind: "context",
    team: null,
    title: "Contexte",
    summary: "Mission, lexique, règles et ton d'Acme Énergies, lus par les assistants de tous les membres.",
    blocks: [
      heading("Mission"),
      paragraph(
        "Acme Énergies conçoit et exploite des opérations d'autoconsommation collective pour des communes, des PME et des bailleurs, de l'étude à la mise en service. 150 personnes, trois équipes au contact des clients : Ventes, Support, Conseil.",
      ),
      heading("Lexique"),
      paragraph(
        "ACC : autoconsommation collective. PMO : personne morale organisatrice. Devis : proposition commerciale émise dans Sellsy, numérotée DEV-AAAA-NNN. Prospect : ligne du tableau ventes/suivi_prospects.",
      ),
      heading("Règles"),
      paragraph(
        "Aucun email ni message externe n'est envoyé sans l'accord explicite de la personne. Les montants sont en euros HT. On ne promet jamais un taux d'autoconsommation avant l'étude.",
      ),
      heading("Ton"),
      paragraph("Clair, concret, sans jargon inutile. Avec les clients : vouvoiement. En interne : tutoiement."),
    ],
  },
  teamContext("ventes", "Aucun email envoyé sans validation de la personne. Montants toujours en euros HT."),
  teamContext("support", "Répondre sous 24 h ouvrées. Toute panne qui touche plus d'un site est un incident."),
  teamContext("conseil", "Chaque étude cite ses sources et ses hypothèses. Référente facturation : Claire."),
  ...(["jb", "claire", "paul", "lea"] as const).map(personalContext),
]

export const ACME_NODES: AcmeNode[] = [...ACME_PROCEDURES, ...ACME_PAGES, ACME_TABLE, ...ACME_CONTEXTS]

export function acmeNode(path: string): AcmeNode {
  const found = ACME_NODES.find((node) => node.path === path)
  if (!found) throw new Error(`no Acme node at ${path}`)
  return found
}

/** Les nœuds à semer par `seedNodes` (E03-S02, N20), l'équipe nommée par son id. */
export function seedNodesOf(nodes: readonly AcmeNode[], teamIds: Record<AcmeTeam, string>): SeedNode[] {
  return nodes.map(({ team, ...node }) => ({ ...node, ...(team ? { ownerTeamId: teamIds[team] } : {}) }))
}

/**
 * Une ligne que `search_content` rendrait pour un nœud d'Acme de la base simulée (forme du « Contrat »
 * d'E01-S06 § 4) : par défaut, une correspondance de titre ; `fields` en fait un résumé ou un bloc.
 */
export function acmeSearchRow(path: string, fields: Partial<Row> = {}): Row {
  const { title, summary, kind } = acmeNode(path)
  const found = { match: "title", block_id: null, block_type: null, block_key: null, column_name: null, snippet: title, rank: 2.5 }
  return { node_id: nodeId(path), path, title, summary, kind, ...found, ...fields }
}

/** Id de bloc lisible : ses 8 premiers caractères hexadécimaux font sa référence courte (`blockRef`). */
export function simulatedBlockId(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`
}

/** Un candidat du routage donné sans `rankCandidates` (décision, bloc code, bloc procédure) ; son nœud est `nodeId(path)`. */
export function candidate(path: string, score: number): Candidate {
  return { nodeId: nodeId(path), path, title: path, summary: "", kind: "procedure", ownerTeamId: null, score }
}

/** Le catalogue de `find` sans fonction ni connecteur actif : seuls les nœuds répondent. */
export const NO_CATALOG = { functions: [], activeConnectors: new Set<string>() }

/**
 * Acme dans la base simulée (tests sans base de `rankCandidates`, `context` et `find`) : les tables de
 * l'organisation O de `reference-org.ts` (personnes, équipes Ventes et Support, `rules`), plus les
 * nœuds d'Acme hors Perso, publiés en révision 1, au même id que `nodeId(path)`, propriétaire hérité
 * (sous `ventes`, `support` ; `conseil`, que O n'a pas, est une page d'organisation), et leurs blocs
 * publiés, lignes du tableau comprises. Un nœud déjà dans O (Contextes, `support/faq`) garde sa ligne,
 * complétée de son genre, de son titre et de son résumé.
 */
export function acmeTables(rules: RuleSpec[] = []): Tables {
  const tables = referenceTables(rules)
  const nodes = tables.nodes ?? []
  const publish = (node: Pick<AcmeNode, "path" | "kind" | "title" | "summary">): Row => {
    const fields = { kind: node.kind, title: node.title, summary: node.summary, status: "published", revision: 1 }
    const known = nodes.find((row) => row.path === node.path && row.org_id === ORG.id)
    if (known) return Object.assign(known, fields)
    const row: Row = { id: nodeId(node.path), org_id: ORG.id, path: node.path, owner_kind: null, owner_team_id: null, owner_user_id: null, ...fields }
    nodes.push(row)
    return row
  }
  Object.assign(publish({ path: "conseil", kind: "page", title: "Conseil", summary: "Études et accompagnement." }), { owner_kind: "org" })
  const blocks: Row[] = []
  for (const node of ACME_NODES.filter((candidate) => !candidate.path.startsWith("private/"))) {
    publish(node)
    const common = { org_id: ORG.id, node_id: nodeId(node.path), state: "published" }
    node.blocks.forEach((block, index) => {
      blocks.push({ id: simulatedBlockId(blocks.length + 1), ...common, position: 1024 * (index + 1), text: null, key: null, data: {}, ...block })
    })
    for (const row of node.rows ?? []) {
      blocks.push({ id: simulatedBlockId(blocks.length + 1), ...common, position: null, type: "row", text: null, key: row.key, data: row.data })
    }
  }
  return { ...tables, nodes, blocks }
}
