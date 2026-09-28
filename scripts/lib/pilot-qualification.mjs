/**
 * Contenu du pilote V1, qualification de prospects (E06-S01, fiche D7 option A) : source unique du script
 * Démo (sections `identite`, `contenu`, `tableau`, `procedure`) et des tests (organisations jetables,
 * H120). Données fictives (ADR-010). Sans logique : des blocs au format d'E01-S06 (`{ type, text?, data?,
 * key? }`, forme de `blockInputSchema`) et, pour chaque document, les liens de ses `[[…]]` au format de
 * l'option `links` de `publishBlocks` (`{ block, path, key? }`, `block` = rang du bloc dans `blocks`, à
 * partir de 0).
 *
 * Ce que ça empêche : le texte de la procédure, les Contextes et les lignes en deux copies (script Démo,
 * tests), qui divergeraient.
 *
 * Reprend de la maquette (`mcp-test/scripts/lib/proto-data.mjs` l. 66-81, 231-255, 435-444, 468-502) les
 * entreprises, les villes fictives, la grille et la forme des étapes ; retire l'appel écrit
 * `acme_call {…}` (→ bloc `call`, H59), les déclencheuses et voisines stockées (P37), le vocabulaire et
 * les sujets (ADR-011 § 7), le travailleur « <ton prénom> » (→ `qualification`) et le retour à « à
 * traiter » (→ « à revoir », puis la revue humaine).
 */

/** @typedef {{ type: string, text?: string, data?: Record<string, unknown>, key?: string }} PilotBlock */
/** @typedef {{ block: number, path: string, key?: string }} PilotLink */
/**
 * Un document publié : `path` nul pour le Contexte de Perso, dont le chemin `private/<handle>/contexte`
 * dépend du compte ; `label` nomme le document dans le résumé du script Démo, sans valeur lue.
 * @typedef {{ path: string | null, label: string, title: string, summary: string, blocks: PilotBlock[], links: PilotLink[] }} PilotDocument
 */

const TABLE = 'ventes/suivi_prospects'
const GRILLE = 'conseil/grille_tarifaire'
const WORKER = 'qualification'
const STATES = ['à traiter', 'en cours', 'à revoir', 'qualifié', 'écarté']

const heading = (text, key) => ({ type: 'heading', text, data: { level: 1 }, key })
const paragraph = (text) => ({ type: 'paragraph', text })
const steps = (items, start) => ({ type: 'list', data: { items, ordered: true, ...(start ? { start } : {}) } })
const call = (fn, args) => ({ type: 'call', data: { function: fn, args } })

/** Domaines de travail de Démo (`orgs.settings.domains`, forme d'E03-S01), en anglais : la description de `context` les cite (H25). */
export const PILOT_DOMAINS = 'sales, prospect qualification, energy consulting'

/**
 * Contextes de Tout le monde, de Ventes et de Perso du compte E2E (P39), nés avec l'organisation, l'équipe
 * et le membre ; `support/contexte` reste celui d'E01-S06, hors du pilote.
 * @type {PilotDocument[]}
 */
export const PILOT_CONTEXTS = [
  {
    path: 'contexte',
    label: 'Contexte de Tout le monde',
    title: 'Contexte',
    summary: "Mission, lexique, règles et ton de Démo : ce que tout assistant doit savoir avant d'agir.",
    blocks: [
      heading('Mission', 'mission'),
      paragraph(
        "Démo accompagne des communes, des PME et des bailleurs dans leurs projets d'autoconsommation collective (ACC), de l'étude à la mise en service. Deux équipes au contact des clients : Ventes et Support. Organisation fictive de démonstration.",
      ),
      heading('Lexique', 'lexique'),
      paragraph(
        'ACC : autoconsommation collective. PMO : personne morale organisatrice. Prospect : ligne du tableau [[ventes/suivi_prospects]]. Montant estimé : montant hors taxes de la première prestation proposée, selon [[conseil/grille_tarifaire]].',
      ),
      heading('Règles', 'regles'),
      paragraph(
        "Aucun email ni message externe n'est envoyé sans l'accord explicite de la personne. Les montants sont en euros HT. On n'invente jamais un contact ni une adresse : une information introuvable se déclare comme telle.",
      ),
      heading('Ton', 'ton'),
      paragraph('Clair, concret, sans jargon. Avec les clients : vouvoiement. En interne : tutoiement.'),
    ],
    links: [
      { block: 3, path: TABLE },
      { block: 3, path: GRILLE },
    ],
  },
  {
    path: 'ventes/contexte',
    label: 'Contexte de ventes',
    title: 'Contexte',
    summary: "Règles et signature de l'équipe Ventes de Démo.",
    blocks: [
      heading('Règles', 'regles'),
      paragraph(
        "Ventes suit ses prospects dans [[ventes/suivi_prospects]]. Une fiche complétée par un assistant passe « à revoir » ; le responsable de Ventes la valide ou l'écarte dans l'écran du tableau. Aucun prospect n'est contacté avant la validation de sa fiche.",
      ),
      heading('Signature', 'signature'),
      paragraph("L'équipe Ventes de Démo"),
    ],
    links: [{ block: 1, path: TABLE }],
  },
  {
    path: null,
    label: "Contexte de l'espace personnel du compte E2E",
    title: 'Contexte',
    summary: 'Préférences du compte de démonstration.',
    blocks: [heading('Préférences', 'preferences'), paragraph('Réponses courtes, en français. Donne les chiffres avant les commentaires.')],
    links: [],
  },
]

/**
 * Pages du pilote : la grille tarifaire (organisation, sous `conseil`) et les notes du salon (équipe
 * Ventes), source interne du scénario que `find` trouve au bloc près (NH5, NH14).
 * @type {PilotDocument[]}
 */
export const PILOT_PAGES = [
  {
    path: GRILLE,
    label: 'grille tarifaire',
    title: 'Grille tarifaire',
    summary: "Tarifs des études et de l'accompagnement de Démo, en euros HT.",
    blocks: [
      heading('Études', 'etudes'),
      paragraph(
        "Pré-étude, un seul site : 1 500 € HT. Étude complète, plusieurs sites ou projet commun, jusqu'à 10 participants : 6 500 € HT. Par participant supplémentaire : 250 € HT.",
      ),
      heading('Accompagnement', 'accompagnement'),
      paragraph("Montage de la personne morale organisatrice (PMO) : 3 000 € HT. Suivi annuel de l'opération : 1 200 € HT par an."),
    ],
    links: [],
  },
  {
    path: 'ventes/notes_salon_2026',
    label: 'notes du salon',
    title: 'Notes du salon Énergies locales 2026',
    summary: 'Contacts pris sur le stand de Démo au salon Énergies locales 2026, entreprise par entreprise (données fictives).',
    blocks: [
      heading('Boulangerie des Tilleuls (Valbrune)', 'tilleuls'),
      paragraph(
        "Marion Vasseur, gérante. Email laissé : marion.vasseur@tilleuls-valbrune.test. Un seul site ; toiture d'environ 120 m² ; demande une pré-étude.",
      ),
      heading('Camping Les Pins Bleus (Saint-Arlan)', 'pins_bleus'),
      paragraph("Hugo Ferrand, directeur. N'a pas laissé d'email ; rappeler l'accueil du camping. Un seul site, deux parkings à ombrager."),
      heading('Garage Moreau Frères (Brémontier)', 'moreau_freres'),
      paragraph('Luc Moreau, cogérant. Email : luc.moreau@moreau-freres.test. Deux ateliers, à Brémontier et à Haute-Lise : projet commun aux deux sites.'),
      heading('Maison de santé du Plateau (Valbrune)', 'plateau'),
      paragraph('Inès Barral, coordinatrice. Email : ines.barral@msp-plateau.test. Projet commun avec la mairie de Valbrune.'),
      heading('Brasserie de la Lise (Coudray-sur-Lise)', 'brasserie_lise'),
      paragraph('Tom Garnier, fondateur. Email : tom.garnier@brasserie-lise.test. Un seul site de production.'),
    ],
    links: [],
  },
]

/** @typedef {{ key: string, data: Record<string, string | number> }} PilotRow */

/**
 * Une ligne : `data` porte les colonnes renseignées, `ref` comprise ; une cellule vide est absente, jamais `null`.
 * @param {string} ref
 * @param {string} entreprise
 * @param {string} ville
 * @param {Record<string, string | number>} filled  les autres colonnes renseignées, `statut` en dernier
 * @returns {PilotRow}
 */
const row = (ref, entreprise, ville, filled) => ({ key: ref, data: { ref, entreprise, ville, ...filled } })

/**
 * Le tableau `ventes/suivi_prospects` (équipe Ventes) : en-tête (`nodes.meta`, H91), lignes initiales
 * (blocs `row`, clé `ref`), et la provenance `agent` des cellules complétées des lignes « à revoir »
 * (celle que la section `tableau` d'E07-S03 donne à `statut`) ; toute autre cellule a une provenance
 * d'import (E01-S06, « Contenu semé »).
 * @type {{
 *   path: string, title: string, summary: string,
 *   header: {
 *     columns: { name: string, type: string, required?: boolean, max_length?: number, options?: string[] }[],
 *     key: string,
 *     lifecycle: { column: string, states: string[], working: string, review: { state: string, approve: string, reject: string } },
 *     closed: boolean,
 *   },
 *   rows: PilotRow[],
 *   completed: { columns: string[], comment: string },
 * }}
 */
export const PILOT_TABLE = {
  path: TABLE,
  title: 'Suivi des prospects',
  summary: "Les prospects de l'équipe Ventes : coordonnées, montant estimé et statut ; la file des prospects à qualifier et leur revue.",
  header: {
    columns: [
      { name: 'ref', type: 'text', required: true, max_length: 10 },
      { name: 'entreprise', type: 'text', required: true, max_length: 120 },
      { name: 'ville', type: 'text', required: true, max_length: 80 },
      { name: 'contact', type: 'text', max_length: 120 },
      { name: 'email', type: 'email' },
      { name: 'montant_estime', type: 'number' },
      { name: 'statut', type: 'enum', required: true, options: STATES },
    ],
    key: 'ref',
    lifecycle: {
      column: 'statut',
      states: STATES,
      working: 'en cours',
      review: { state: 'à revoir', approve: 'qualifié', reject: 'écarté' },
    },
    closed: true,
  },
  rows: [
    row('P-001', 'Boulangerie des Tilleuls', 'Valbrune', { statut: 'à traiter' }),
    row('P-002', 'Camping Les Pins Bleus', 'Saint-Arlan', { statut: 'à traiter' }),
    row('P-003', 'Mairie de Valbrune', 'Valbrune', {
      contact: 'Sophie Lacaze, secrétaire générale',
      email: 's.lacaze@mairie-valbrune.test',
      montant_estime: 6500,
      statut: 'à revoir',
    }),
    row('P-004', 'Garage Moreau Frères', 'Brémontier', { statut: 'à traiter' }),
    row('P-005', 'Ferme du Grand Coudray', 'Coudray-sur-Lise', { statut: 'à traiter' }),
    row('P-006', 'Clinique vétérinaire des Saules', 'Saint-Arlan', {
      contact: 'Paul-Henri Rives, vétérinaire associé',
      email: 'ph.rives@clinique-saules.test',
      montant_estime: 1500,
      statut: 'à revoir',
    }),
    row('P-007', 'Collège des Trois-Chênes', 'Brémontier', { statut: 'à traiter' }),
    row('P-008', 'Scierie Vallet', 'Haute-Lise', { contact: 'Denis Vallet, gérant', statut: 'à traiter' }),
    row('P-009', 'Maison de santé du Plateau', 'Valbrune', {
      contact: 'Inès Barral, coordinatrice',
      email: 'ines.barral@msp-plateau.test',
      montant_estime: 6500,
      statut: 'à revoir',
    }),
    row('P-010', 'Brasserie de la Lise', 'Coudray-sur-Lise', { statut: 'à traiter' }),
  ],
  completed: { columns: ['contact', 'email', 'montant_estime', 'statut'], comment: 'Fiche complétée pour la démonstration.' },
}

/**
 * La procédure `ventes/qualifier_prospects` (équipe Ventes) : une page de genre `procedure`, sans
 * en-tête (P37) ; son résumé porte ses deux formulations (la phrase d'ouverture et le texte entre
 * guillemets), son titre et son résumé ne portent ni « à traiter » ni « à » (NH6). Les blocs `call`
 * sont dans « Étapes », rangs 1 à 4, étapes 2, 3, 5 et 6 (E01-S06 § 3).
 * @type {PilotDocument}
 */
export const PILOT_PROCEDURE = {
  path: 'ventes/qualifier_prospects',
  label: 'procédure qualifier les prospects',
  title: 'Qualifier les prospects',
  summary:
    'Complète les fiches des prospects (contact, email, montant estimé) avec preuves, puis les rend pour la revue humaine, sans les contacter. On la demande par « qualifie les prospects ».',
  blocks: [
    heading("Quand l'utiliser", 'quand'),
    paragraph(
      "Quand des prospects du tableau [[ventes/suivi_prospects]] sont « à traiter » et que leur fiche doit être complétée (contact, email, montant estimé) avant tout contact commercial. Cette procédure ne contacte personne. Une question sur l'état des prospects (combien, lesquels, où en est la qualification) se répond par `table.rows` ou `table.aggregate`, sans lancer cette procédure.",
    ),
    heading('Étapes', 'etapes'),
    steps([
      'Annonce en une phrase ce que tu vas faire et combien de prospects tu vas qualifier : 3 par défaut, 5 au plus si la personne le demande.',
      'Lis le contrat du tableau (colonnes, types, états) :',
    ]),
    call('table.schema', { table: TABLE }),
    steps(
      [
        "Réserve les prospects à traiter ; ils passent « en cours » à ton nom pour 30 minutes. Si la personne a demandé un autre nombre, change limit (5 au plus). Si aucune ligne n'est réservée, dis-le et arrête-toi.",
      ],
      3,
    ),
    call('table.claim', { table: TABLE, worker: WORKER, limit: 3, lease_minutes: 30 }),
    steps(
      [
        "Pour chaque prospect réservé, cherche le contact décideur (nom et fonction), son email professionnel et le nombre de sites concernés : d'abord dans la plateforme (find avec le nom de l'entreprise, puis read des pages trouvées), ensuite, si ton outil le permet, sur le site officiel de l'entreprise ou dans un registre public ; jamais sur un réseau social personnel. Estime le montant avec [[conseil/grille_tarifaire]] : un seul site, une pré-étude ; plusieurs sites ou un projet commun, une étude complète.",
        "Écris ce que tu as trouvé, en un seul appel pour tous les prospects réservés, chacun par sa ref. Chaque valeur porte sa preuve : link (adresse de la source) ou comment (page lue). Un champ cherché sans résultat va dans verified_empty avec l'endroit où tu as cherché : ne l'omets pas et n'écris jamais null.",
      ],
      4,
    ),
    call('table.write', {
      table: TABLE,
      rows: [
        {
          key: '<ref du prospect>',
          set: {
            contact: { value: '<nom et fonction>', comment: '<page ou source lue>' },
            email: { value: '<email professionnel>', link: '<adresse de la source>' },
            montant_estime: { value: 1500, comment: '<règle de la grille appliquée>' },
          },
          verified_empty: [{ column: '<colonne cherchée sans résultat>', reason: '<où tu as cherché>' }],
        },
      ],
    }),
    steps(["Rends chaque prospect pour la revue humaine : il passe « à revoir ». Ne pose jamais « qualifié » ni « écarté » : c'est la revue qui décide."], 6),
    call('table.release', { table: TABLE, key: '<ref du prospect>', worker: WORKER, state: 'à revoir' }),
    steps(
      [
        "Résume en une ligne par prospect ce que tu as trouvé, ce qui manque et le montant estimé. Rappelle que le responsable de l'équipe Ventes valide chaque fiche dans l'écran du tableau ventes/suivi_prospects (file « à revoir »).",
      ],
      7,
    ),
    heading('Règles', 'regles'),
    {
      type: 'list',
      data: {
        items: [
          "Ne contacte aucun prospect : cette procédure complète les fiches, rien d'autre.",
          "N'invente jamais un contact ni un email : sans preuve, verified_empty avec la raison.",
          'Ne crée aucune ligne : le tableau est fermé ; travaille seulement sur les lignes que tu as réservées, avec leur ref exacte.',
          '« en cours » ne se pose que par table.claim ; « qualifié » et « écarté » se décident dans la revue humaine, jamais par toi.',
          "Si un appel est refusé, lis la raison, corrige l'appel et recommence ; ne contourne jamais un refus.",
        ],
      },
    },
  ],
  links: [
    { block: 1, path: TABLE },
    { block: 7, path: GRILLE },
  ],
}
