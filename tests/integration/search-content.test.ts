// @vitest-environment node
// Recherche dans le contenu (E01-S06 : AC22 à AC25) : le jeu de données des AC est publié une fois par
// `publishBlocks`, puis cherché sous la session de Léa (Ventes), de Paul (Support), d'une personne hors de
// l'organisation et d'`anon`. Les rangs se vérifient par tranche et par ordre, jamais à la décimale.
// Reçoit, pour les mêmes personnes, le classement par la part des termes couverte (M06, de
// `search-content-couverture.test.ts`) et les composantes du routage (E01-S06 : AC27, AC28, de
// `route-candidates.test.ts`), chacun dans une organisation de référence à lui : leurs chemins
// recoupent ceux de ce jeu (M11b). Suite portable depuis E01-S10 f2 : données semées par la connexion
// d'administration, chaque personne par sa session (`fx.as`), sans PostgREST ni Supabase Auth ; le job
// `bare-postgres` la joue.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { BlockInput } from "../../packages/plateforme/schemas"
import type { Database } from "../../packages/plateforme/server/database"
import { withAnonSession, type Tx } from "../../packages/plateforme/server/sql"
import type { PublishOptions } from "../helpers/plateforme"
import { codeOf, createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg, type SqlUser } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 240_000

// Les attendus du routage réécrits par E01-S13 (AC-a2).
const routeReady = sqlConfigured
const routeSkipReason = SQL_SKIP_REASON

type Hit = Database["platform"]["Functions"]["search_content"]["Returns"][number]
type Candidate = Database["platform"]["Functions"]["route_candidates"]["Returns"][number]
type Who = "lea" | "paul" | "claire" | "marc" | "outsider"

const COLUMNS = ["ref", "entreprise", "contact", "email", "ville", "statut"]
const CONTRACT_COLUMNS = ["node_id", "path", "title", "summary", "kind", "match", "block_id", "block_type", "block_key", "column_name", "snippet", "rank"]

// ------------------------------------------------------------ Jeu de M06 (classement par couverture)
// Données de la forme d'Acme (maquette `scripts/lib/proto-data.mjs` du banc : procédures
// `ventes/relance_prospects`, `ventes/qualifier_prospects`, `ventes/point_pipeline`, tableau
// `ventes/suivi_prospects` et ses douze lignes ; résumés semés d'E03-S02, blocs comme la section Démo
// `procedure`), plus trois pages qui départagent les tranches.

const TABLE = "ventes/suivi_prospects"
const WORKER = "<ton prénom>"

const heading = (text: string): BlockInput => ({ type: "heading", text, data: { level: 1 } })
const paragraph = (text: string): BlockInput => ({ type: "paragraph", text })
const steps = (items: string[], start?: number): BlockInput => ({ type: "list", data: { items, ordered: true, ...(start ? { start } : {}) } })
const call = (fn: string, args: Record<string, unknown>): BlockInput => ({ type: "call", data: { function: fn, args } })

type Seeded = {
  path: string
  kind?: "page" | "procedure" | "table"
  title: string
  summary: string
  blocks?: BlockInput[]
  options?: PublishOptions
}

const PROCEDURES: Seeded[] = [
  {
    path: "ventes/relance_prospects",
    kind: "procedure",
    title: "Relancer les prospects à traiter",
    summary:
      "Prend les prospects « à traiter » de la file, prépare un email de relance pour chacun, puis les marque « relancé ». Se demande : « relance les prospects », « relance les leads ».",
    blocks: [
      heading("Quand l'utiliser"),
      paragraph("Quand la personne veut recontacter les prospects du tableau de suivi qui attendent."),
      heading("Étapes"),
      steps(["Annonce en une phrase ce que tu vas faire.", "Réserve jusqu'à 5 prospects :"]),
      call("table.claim", { table: TABLE, worker: WORKER, limit: 5 }),
      steps(["Pour chacun, prépare un brouillon :"], 3),
      call("mail.create_draft", { to: "<email>", subject: "Suite à notre échange", body: "<texte>" }),
      steps(["Montre les brouillons et demande l'accord avant tout envoi.", "Après envoi, marque chaque ligne et libère-la :"], 4),
      call("table.release", { table: TABLE, key: "<id>", worker: WORKER, state: "relancé" }),
      heading("Règles"),
      paragraph("Une ligne réservée par un autre travailleur ne se touche pas."),
    ],
  },
  {
    path: "ventes/qualifier_prospects",
    kind: "procedure",
    title: "Qualifier les prospects à traiter",
    summary:
      "Complète les fiches des prospects à traiter (contact, montant estimé, notes) sans les contacter. Se demande : « qualifie les prospects à traiter », « traite la file de prospection ».",
    blocks: [
      heading("Quand l'utiliser"),
      paragraph("Quand des fiches de prospects sont incomplètes et qu'il faut les compléter avant toute relance."),
      heading("Étapes"),
      steps(["Annonce en une phrase ce que tu vas faire.", "Lis le contrat du tableau :"]),
      call("table.schema", { table: TABLE }),
      steps(["Réserve des lignes :"], 3),
      call("table.claim", { table: TABLE, worker: WORKER, limit: 3 }),
      steps(["Complète chaque ligne ; un champ cherché sans résultat se déclare avec verified_empty et la raison :"], 4),
      call("table.write", { table: TABLE, rows: [{ key: "<id>", set: { notes: "<notes>" } }] }),
      steps(["Libère chaque ligne, remise dans la file « à traiter » :"], 5),
      call("table.release", { table: TABLE, key: "<id>", worker: WORKER, state: "à traiter" }),
      heading("Règles"),
      paragraph("Ne jamais inventer un contact. Ne jamais écrire null."),
    ],
  },
  {
    path: "ventes/point_pipeline",
    kind: "procedure",
    title: "Faire le point sur le pipeline",
    summary:
      "Compte les prospects par statut, liste les devis en attente et poste la synthèse sur Slack après accord. Se demande : « fais le point sur le pipeline », « où en est le pipe commercial ».",
    blocks: [
      heading("Quand l'utiliser"),
      paragraph("Quand la personne veut une vue d'ensemble de l'activité commerciale."),
      heading("Étapes"),
      steps(["Annonce en une phrase ce que tu vas faire.", "Compte les prospects par statut :"]),
      call("table.aggregate", { table: TABLE, group_by: "statut" }),
      steps(["Liste les devis envoyés :"], 3),
      call("sellsy.list_estimates", { status: "sent" }),
      steps(["Rédige une synthèse de cinq lignes et montre-la.", "Après accord, poste-la :"], 4),
      call("slack.post_message", { channel: "#ventes", text: "<synthèse>" }),
      heading("Règles"),
      paragraph("Montants en euros HT."),
    ],
  },
]

const M06_COLUMNS = [
  { name: "ref", type: "text" },
  { name: "entreprise", type: "text" },
  { name: "contact", type: "text" },
  { name: "email", type: "email" },
  { name: "ville", type: "text" },
  { name: "statut", type: "enum" },
  { name: "dernier_contact", type: "date" },
  { name: "montant_estime", type: "number" },
  { name: "notes", type: "text" },
]

// Les douze prospects de la maquette (`PROSPECTS`) : référence, entreprise, contact, ville, statut,
// dernier contact, montant estimé. Trois sont à Valbrune : P-001, P-003, P-009.
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

/** L'email d'un prospect, calculé comme la maquette : prénom et ville sans accents, `.test`. */
function prospectEmail(contact: string, ville: string): string {
  const plain = (value: string) => value.toLowerCase().normalize("NFD")
  return `${plain(contact.split(" ")[0]).replace(/[^a-z-]/g, "")}@${plain(ville).replace(/[^a-z]/g, "")}.test`
}

// Pages qui départagent les tranches : une page trouvée par son résumé et un bloc (les deux termes),
// une page trouvée seulement dans ses blocs (les deux termes, dans deux blocs), et deux titres qu'une
// faute de frappe trouve par trigrammes, dont un seul porte l'autre terme dans un bloc.
const PAGES: Seeded[] = [
  {
    path: "ventes/tournee",
    title: "Tournée de la semaine",
    summary: "Les prospects à visiter cette semaine, par ville.",
    blocks: [paragraph("Mardi : Valbrune, puis Saint-Arlan.")],
  },
  {
    path: "ventes/notes_terrain",
    title: "Notes de terrain",
    summary: "Comptes rendus des visites de la semaine.",
    blocks: [paragraph("Trois prospects rencontrés au salon de l'énergie."), paragraph("Visite à Valbrune mardi matin : deux toitures à étudier.")],
  },
  { path: "ventes/grille_a", title: "Grille tarifaire des études", summary: "Les prix des études, en euros HT." },
  {
    path: "ventes/grille_b",
    title: "Grille tarifaire",
    summary: "Les prix de l'accompagnement, en euros HT.",
    blocks: [paragraph("Graphie fréquente dans les demandes : tarifaier.")],
  },
]

const BANDS: Record<string, [number, number]> = { title: [2, 3], summary: [1, 2], block: [0, 1] }

/** Les chemins dans l'ordre de leur première ligne : l'ordre des nœuds que `find` sert (E03-S02, N11). */
function nodeOrder(hits: Hit[]): string[] {
  return [...new Set(hits.map((hit) => hit.path))]
}

// ------------------------------------------------------------ Composantes du routage (AC27, AC28)
const CANDIDATE_COLUMNS = ["node_id", "path", "title", "summary", "kind", "owner_team_id", "s_summary", "s_title", "lexical", "query_lexemes", "s_phrase", "lexical_title"]

describe.skipIf(!sqlConfigured || privatePending)(
  privateFolderSuite(sqlConfigured ? "search_content" : `search_content (${SQL_SKIP_REASON})`, privatePending),
  { timeout: NETWORK_TIMEOUT },
  () => {
    let fx: SqlFixtures
    let o: SqlReferenceOrg
    let outsider: SqlUser

    const as = (who: Who) => fx.as(who === "outsider" ? outsider : o.people[who])

    /** `search_content` dans la transaction donnée ; un argument omis prend son défaut. */
    const searchIn = (sql: Tx, org: string, query: string, options: { kinds?: string[]; limit?: number } = {}) =>
      sql<Hit[]>`
        select * from platform.search_content(p_org => ${org}, p_query => ${query}
          ${options.kinds ? sql`, p_kinds => ${options.kinds}::text[]` : sql``}
          ${options.limit === undefined ? sql`` : sql`, p_limit => ${options.limit}`})`

    async function search(who: Who, query: string, options: { kinds?: string[]; limit?: number; org?: string } = {}): Promise<Hit[]> {
      return [...(await as(who).tx((sql) => searchIn(sql, options.org ?? o.org.id, query, options)))]
    }

    const at = (hit: Hit) => [hit.path, hit.match, hit.block_type, hit.block_key]

    type PublishedNode = {
      kind?: "page" | "procedure" | "table"
      title: string
      summary: string
      blocks?: Parameters<SqlFixtures["publishBlocks"]>[1]
      options?: Parameters<SqlFixtures["publishBlocks"]>[2]
    }

    /** Un nœud de l'organisation `orgId` sous `parentId`, publié avec ses blocs. */
    async function published(parentId: string, path: string, node: PublishedNode, orgId = o.org.id) {
      const id = await fx.createNode(orgId, { parentId, path, kind: node.kind, title: node.title, summary: node.summary })
      await fx.publishBlocks(id, node.blocks ?? [], node.options)
      return id
    }

    beforeAll(async () => {
      fx = createSqlFixtures()
      o = await fx.buildReferenceOrg()
      outsider = await fx.createUser({ fullName: "Pierre Dehors" })

      const v = o.nodes.ventes
      // La racine publiée, avec le terme cherché : elle n'est jamais rendue.
      await fx.publishBlocks(o.nodes.root, [{ type: "paragraph", text: "Le zorglub du guide." }])
      const conseil = await fx.createNode(o.org.id, { parentId: o.nodes.root, path: "conseil", title: "Conseil", summary: "Offres et tarifs du conseil en énergie." })
      await published(conseil, "conseil/grille_tarifaire", {
        title: "Grille tarifaire",
        summary: "Tarifs des études et de l'accompagnement, en euros HT.",
        blocks: [
          { type: "heading", text: "Études", data: { level: 1 }, key: "etudes" },
          { type: "paragraph", text: "Pré-étude : 1 500 € HT. Étude complète jusqu'à 10 participants : 6 500 € HT. Par participant supplémentaire : 250 € HT." },
          { type: "heading", text: "Accompagnement", data: { level: 1 }, key: "accompagnement" },
          { type: "paragraph", text: "Montage de la personne morale organisatrice : 3 000 € HT. Suivi annuel : 1 200 € HT par an." },
        ],
      })
      await published(v, "ventes/a_titre", { title: "Le zorglub", summary: "Une page de test." })
      await published(v, "ventes/b_resume", { title: "Une page", summary: "Le zorglub est dans le résumé." })
      await published(v, "ventes/c_bloc", {
        title: "Autre page",
        summary: "Rien ici.",
        blocks: [
          { type: "paragraph", text: "Le zorglub est ici dans un bloc." },
          { type: "checklist", data: { items: [{ text: "Vérifier le zorglub", checked: false }] } },
          { type: "callout", text: "Attention au zorglub." },
        ],
      })
      // E10-S04 (AC-a4) : un mot d'une cellule, d'un résumé de repli, de son corps, d'un sous-élément.
      await published(v, "ventes/e_riche", {
        title: "Formes riches",
        summary: "Rien ici.",
        blocks: [
          { type: "simple_table", data: { columns: ["Nom"], rows: [["ornithorynque"]] } },
          { type: "toggle", text: "Le pangolin du corps.", data: { summary: "Le tamanoir" } },
          { type: "list", data: { items: [{ text: "a", children: { items: [{ text: "b", children: { items: ["okapi"] } }] } }] } },
          { type: "divider", data: {} },
        ],
      })
      await published(v, "ventes/d_quatre", {
        title: "Quatre blocs",
        summary: "Rien ici.",
        blocks: ["Un", "Deux", "Trois", "Quatre"].map((word) => ({ type: "paragraph" as const, text: `${word} quokka.` })),
      })
      // 18 pages de trois blocs : 54 correspondances, plus que la borne haute de `p_limit` (50). Posées en
      // deux insertions par la connexion d'administration, nœuds publiés puis blocs publiés, comme les 201
      // pages du routage plus bas (M11b) : `publishBlocks` page par page coûtait quatre requêtes par page.
      const yetiNodes = Array.from({ length: 18 }, (_, rank) => ({
        org_id: o.org.id,
        parent_id: v,
        path: `ventes/yeti_${rank + 1}`,
        title: `Page ${rank + 1}`,
        summary: "Rien ici.",
        status: "published",
        revision: 1,
      }))
      const yetis = await fx.admin<{ id: string; path: string }[]>`insert into platform.nodes ${fx.admin(yetiNodes)} returning id, path`
      const yetiBlocks = yetis.flatMap(({ id, path }) =>
        ["Premier", "Deuxième", "Troisième"].map((word, rank) => ({
          org_id: o.org.id,
          node_id: id,
          state: "published",
          position: 1024 * (rank + 1),
          type: "paragraph",
          text: `${word} yeti ${path.slice("ventes/yeti_".length)}.`,
        })),
      )
      await fx.admin`insert into platform.blocks ${fx.admin(yetiBlocks)}`
      const relance = await published(v, "ventes/relance", {
        kind: "procedure",
        title: "Relancer un devis",
        summary: "Relance les devis en attente depuis 7 jours.",
        blocks: [{ type: "call", data: { function: "mail.create_draft", args: { to: "<email>" } } }],
      })
      await published(v, "ventes/qualifier_prospects", {
        kind: "procedure",
        title: "Qualifier les prospects à traiter",
        summary: "Qualifie les prospects à traiter.",
        blocks: [
          { type: "call", data: { function: "table.schema", args: { table: "ventes/suivi_prospects" } } },
          { type: "call", data: { function: "table.claim", args: { table: "ventes/suivi_prospects", worker: "<ton prénom>", limit: 3 } } },
        ],
      })
      const suivi = await published(v, "ventes/suivi_prospects", {
        kind: "table",
        title: "Suivi des prospects",
        summary: "Les prospects de l'équipe Ventes.",
        options: { meta: { columns: COLUMNS.map((name) => ({ name, type: "text" })), key: "ref" } },
      })
      await fx.addRows(suivi, [
        { key: "P-001", data: { ref: "P-001", entreprise: "Boulangerie des Tilleuls", contact: "Marion Vasseur", email: "marion@valbrune.test", ville: "Valbrune", statut: "à traiter" } },
        { key: "P-002", data: { ref: "P-002", entreprise: "Camping Les Pins Bleus", contact: "Hugo Ferrand", email: "hugo@saintarlan.test", ville: "Saint-Arlan", statut: "à traiter" } },
        { key: "P-003", data: { ref: "P-003", entreprise: "Mairie de Valbrune", contact: "Sophie Lacaze", email: "sophie@valbrune.test", ville: "Valbrune", statut: "à revoir" } },
      ])
      await published(o.nodes.support, "support/escalade", {
        kind: "procedure",
        title: "Escalader un incident",
        summary: "Escalade un incident de Valbrune au niveau 2.",
        blocks: [{ type: "paragraph", text: "Pour Valbrune, appeler le niveau 2." }],
      })
      // Deux brouillons qui portent « zanzibar » : un nœud jamais publié, un nœud publié.
      const brouillon = await fx.createNode(o.org.id, { parentId: v, path: "ventes/brouillon", kind: "procedure", title: "Brouillon", summary: "Jamais publié." })
      for (const node of [brouillon, relance]) {
        await fx.admin`select * from platform.open_draft(${node})`
        await fx.admin`
          insert into platform.blocks (org_id, node_id, state, position, type, text) values (${o.org.id}, ${node}, 'draft', 9000, 'paragraph', 'Le zanzibar en brouillon.')`
      }
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await fx?.cleanup()
    }, SETUP_TIMEOUT)

    describe("form and rank (AC22)", () => {
      // Les bornes de chaque tranche sont prouvées sur toutes les lignes par le test des tranches du jeu
      // de M06 ; l'extrait, réuni ici (M11b).
      it("should rank the title, then the summary, then the blocks, with the twelve columns of the contract, the terms framed with ** in a snippet of 300 characters at most", async () => {
        const hits = await search("lea", "zorglub")
        expect(hits.map(at)).toEqual([
          ["ventes/a_titre", "title", null, null],
          ["ventes/b_resume", "summary", null, null],
          ["ventes/c_bloc", "block", "paragraph", null],
          ["ventes/c_bloc", "block", "checklist", null],
          ["ventes/c_bloc", "block", "callout", null],
        ])
        for (const hit of hits) expect(Object.keys(hit).sort()).toEqual([...CONTRACT_COLUMNS].sort())
        for (const hit of hits.slice(2)) expect(hit.block_id).toMatch(/^[0-9a-f-]{36}$/)
        expect(hits.slice(0, 2).map((hit) => [hit.block_id, hit.block_type])).toEqual([[null, null], [null, null]])
        expect(hits[1].snippet).toBe("Le **zorglub** est dans le résumé.")
        for (const hit of hits) {
          expect(hit.snippet.length).toBeLessThanOrEqual(300)
          expect(hit.snippet).toContain("**zorglub**")
        }
      })

      it("should return three blocks of a node at most", async () => {
        const hits = await search("lea", "quokka")
        expect(hits.map(at)).toEqual(Array.from({ length: 3 }, () => ["ventes/d_quatre", "block", "paragraph", null]))
      })

      it("should bound p_limit to 1..50, 20 by default", async () => {
        expect(await search("lea", "yeti", { limit: 0 })).toHaveLength(1)
        expect(await search("lea", "yeti", { limit: 999 })).toHaveLength(50)
        expect(await search("lea", "yeti")).toHaveLength(20)
      })
    })

    describe("table rows (AC23)", () => {
      it("should find the rows, the first declared column holding the term, and the cell as snippet", async () => {
        const hits = await search("lea", "Valbrune")
        expect(hits.map((hit) => [hit.path, hit.block_type, hit.block_key, hit.column_name])).toEqual([
          ["ventes/suivi_prospects", "row", "P-003", "entreprise"],
          ["ventes/suivi_prospects", "row", "P-001", "email"],
        ])
        expect(hits[0].snippet).toBe("entreprise: Mairie de **Valbrune**")
      })

      // Deux termes de deux colonnes : la référence et le contact seuls, mêmes colonnes cherchées, sont
      // retirés (M11b).
      it("should find P-001 alone for valbrune tilleuls, in column entreprise", async () => {
        const hits = await search("lea", "valbrune tilleuls")
        expect(hits.map((hit) => [hit.block_key, hit.column_name])).toEqual([["P-001", "entreprise"]])
      })
    })

    describe("drafts, rights, kinds, errors (AC24)", () => {
      it("should never find a draft, of a node never published or of a published one", async () => {
        expect(await search("lea", "zanzibar")).toEqual([])
      })

      // M58 (E11-S04, AC-a8) : un nœud à la corbeille ne prend plus de place sous la coupe ; la fonction
      // d'avant le rendait en tête, par son titre, et le service le retirait après.
      it("should leave a node in the trash out before the cut, by its title, its summary and its blocks, a living node taking its place", async () => {
        const trashed = await published(o.nodes.ventes, "ventes/axolotl_corbeille", {
          title: "Axolotl",
          summary: "L'axolotl de la corbeille.",
          blocks: [{ type: "paragraph", text: "Un axolotl dans un bloc." }],
        })
        await published(o.nodes.ventes, "ventes/axolotl_vivant", { title: "Page vivante", summary: "Un axolotl dans le résumé." })
        await fx.admin`update platform.nodes set deleted_at = now() where id = ${trashed}`
        expect((await search("lea", "axolotl", { limit: 1 })).map(at)).toEqual([["ventes/axolotl_vivant", "summary", null, null]])
        expect((await search("lea", "axolotl")).map(at)).toEqual([["ventes/axolotl_vivant", "summary", null, null]])
      })

      it("should keep Support from Léa and give it to Paul, summary then block", async () => {
        expect((await search("lea", "Valbrune")).filter((hit) => hit.path.startsWith("support/"))).toEqual([])
        expect((await search("paul", "Valbrune")).map(at)).toEqual([
          ["support/escalade", "summary", null, null],
          ["support/escalade", "block", "paragraph", null],
        ])
      })

      // Le filtre de niveau est prouvé par le cas de Support ci-dessus : celui de Marc, sans équipe, sur
      // Ventes, est retiré (M11b).
      it("should never find the root", async () => {
        expect((await search("lea", "zorglub guide")).filter((hit) => hit.path === "guide")).toEqual([])
      })

      it("should filter by kind", async () => {
        const tables = await search("lea", "valbrune", { kinds: ["table"] })
        expect(new Set(tables.map((hit) => hit.path))).toEqual(new Set(["ventes/suivi_prospects"]))
        expect((await search("lea", "devis", { kinds: ["procedure"] })).map((hit) => hit.path)).toEqual(["ventes/relance"])
      })

      it("should refuse a signed-in person outside the organisation, and anon (42501)", async () => {
        expect(await codeOf(search("outsider", "zorglub"))).toBe("42501")
        expect(await codeOf(withAnonSession((sql) => searchIn(sql, o.org.id, "zorglub")))).toBe("42501")
      })

      it("should return no row, without error, for a query without a searchable term: empty, punctuation, stop words", async () => {
        for (const query of ["", "?! ...", "les", "de la"]) expect(await search("lea", query), JSON.stringify(query)).toEqual([])
      })
    })

    describe("language (AC25)", () => {
      // Casse, accents et trait d'union d'un coup : « pré-étude » et « pre etude » sont retirés (M11b).
      it("should find the Pré-étude block for PRÉ-ÉTUDE (accents, case, hyphen)", async () => {
        const hits = await search("lea", "PRÉ-ÉTUDE")
        expect(hits.map(at)).toEqual([["conseil/grille_tarifaire", "block", "paragraph", null]])
        expect(hits[0].snippet).toContain("**Pré**-**étude**")
      })

      it("should find the title Relancer un devis for relance les devis (stems, les ignored)", async () => {
        expect((await search("lea", "relance les devis"))[0]).toMatchObject({ path: "ventes/relance", match: "title" })
      })

      it("should read the last word as a prefix", async () => {
        const titles = (await search("lea", "prosp")).filter((hit) => hit.match === "title").map((hit) => hit.title)
        expect(titles).toEqual(expect.arrayContaining(["Qualifier les prospects à traiter", "Suivi des prospects"]))
      })

      it("should fall back to any term when no node holds them all", async () => {
        expect((await search("lea", "valbrune licorne")).map((hit) => hit.block_key)).toEqual(["P-003", "P-001"])
      })

      it("should forgive the typo of grille tarifaier by trigrams, ranked in [2, 2.5]", async () => {
        const [hit] = await search("lea", "grille tarifaier")
        expect(hit).toMatchObject({ path: "conseil/grille_tarifaire", match: "title" })
        expect(hit.rank).toBeGreaterThanOrEqual(2)
        expect(hit.rank).toBeLessThanOrEqual(2.5)
      })

      it("should find a call block by its function", async () => {
        expect((await search("lea", "table.claim")).map(at)).toEqual([["ventes/qualifier_prospects", "block", "call", null]])
      })

      it("should find a word of a table cell, a toggle summary, a toggle body and a sub-item (E10-S04, AC-a4)", async () => {
        const found = await Promise.all(["ornithorynque", "tamanoir", "pangolin", "okapi"].map(async (word) => (await search("lea", word)).map(at)))
        expect(found).toEqual([
          [["ventes/e_riche", "block", "simple_table", null]],
          [["ventes/e_riche", "block", "toggle", null]],
          [["ventes/e_riche", "block", "toggle", null]],
          [["ventes/e_riche", "block", "list", null]],
        ])
      })
    })

    // Repris de `search-content-couverture.test.ts` (M11b) : le jeu de M06, publié une fois dans une
    // organisation de référence à lui (mêmes personnes), cherché sous la session de Léa (Ventes).
    describe("ranking by covered terms (M06, PRD FR-TASK-06)", () => {
      let m06: SqlReferenceOrg

      const coverage = (query: string) => search("lea", query, { org: m06.org.id, limit: 50 })

      beforeAll(async () => {
        m06 = await fx.buildReferenceOrg(o.people)
        const place = (node: Seeded) => published(m06.nodes.ventes, node.path, node, m06.org.id)
        for (const node of [...PROCEDURES, ...PAGES]) await place(node)
        const table = await place({
          path: TABLE,
          kind: "table",
          title: "Suivi des prospects",
          summary: "Les prospects de l'équipe Ventes, avec leur statut, et la file de travail des prospects à traiter.",
          options: { meta: { columns: M06_COLUMNS, key: "ref", closed: false } },
        })
        await fx.addRows(
          table,
          PROSPECTS.map(([ref, entreprise, contact, ville, statut, dernier_contact, montant_estime]) => ({
            key: ref,
            data: { ref, entreprise, contact, email: prospectEmail(contact, ville), ville, statut, dernier_contact, montant_estime },
          })),
        )
      }, SETUP_TIMEOUT)

      it("should rank first the table whose title and rows hold both terms, with its snippet and the column found (PRD FR-TASK-06)", async () => {
        const hits = await coverage("prospects à Valbrune")
        const nodes = nodeOrder(hits)
        expect(nodes[0]).toBe(TABLE)
        expect(new Set(nodes.slice(1, 3))).toEqual(new Set(["ventes/qualifier_prospects", "ventes/relance_prospects"]))
        expect(hits[0]).toMatchObject({ path: TABLE, match: "title", snippet: "Suivi des **prospects**" })
        const procedureTitles = hits.filter((hit) => hit.match === "title" && hit.path !== TABLE)
        for (const title of procedureTitles) expect(hits[0].rank).toBeGreaterThan(title.rank)
        const rows = hits.filter((hit) => hit.path === TABLE && hit.block_type === "row")
        expect(rows.map((hit) => [hit.block_key, hit.column_name]).sort()).toEqual([
          ["P-001", "email"],
          ["P-003", "entreprise"],
          ["P-009", "email"],
        ])
        expect(rows.find((hit) => hit.block_key === "P-003")?.snippet).toBe("entreprise: Mairie de **Valbrune**")
      })

      it("should keep a node found only in its blocks under the nodes found by their title, though it covers more terms", async () => {
        const hits = await coverage("prospects à Valbrune")
        const notes = hits.filter((hit) => hit.path === "ventes/notes_terrain")
        expect(notes.map((hit) => hit.match)).toEqual(["block", "block"])
        const lastTitle = hits.map((hit) => hit.match).lastIndexOf("title")
        expect(hits.findIndex((hit) => hit.path === "ventes/notes_terrain")).toBeGreaterThan(lastTitle)
        expect(hits.filter((hit) => hit.match === "title").map((hit) => hit.path)).toContain("ventes/relance_prospects")
      })

      it("should rank first, within the summary band and the block band, the nodes that cover both terms", async () => {
        const hits = await coverage("prospects à Valbrune")
        expect(hits.filter((hit) => hit.match === "summary").map((hit) => hit.path)).toEqual(["ventes/tournee", "ventes/point_pipeline"])
        const both = new Set([TABLE, "ventes/tournee", "ventes/notes_terrain"])
        const blocks = hits.filter((hit) => hit.match === "block")
        const firstPartial = blocks.findIndex((hit) => !both.has(hit.path))
        expect(firstPartial).toBeGreaterThan(0)
        expect(blocks.slice(firstPartial).filter((hit) => both.has(hit.path))).toEqual([])
        expect(new Set(blocks.slice(firstPartial).map((hit) => hit.path))).toEqual(
          new Set(["ventes/relance_prospects", "ventes/qualifier_prospects", "ventes/point_pipeline"]),
        )
      })

      it("should count the terms held by the blocks of a node found by the trigrams of its title", async () => {
        // Aucun nœud ne porte « grille » et « tarifaier » : le passage ET ne trouve que les deux titres,
        // par trigrammes, avec la même ressemblance ; `grille_b` porte « tarifaier » dans un bloc.
        const hits = await coverage("grille tarifaier")
        expect(hits.map((hit) => [hit.path, hit.match])).toEqual([
          ["ventes/grille_b", "title"],
          ["ventes/grille_a", "title"],
        ])
        expect(hits[0].rank).toBeGreaterThan(hits[1].rank)
      })

      // « prospects à Valbrune » touche les trois tranches : « grille tarifaier » et « prosp », qui en
      // touchent moins, sont retirés (M11b).
      it("should return for prospects à Valbrune ranks within their band, in the order served", async () => {
        const hits = await coverage("prospects à Valbrune")
        expect(hits.length).toBeGreaterThan(0)
        hits.forEach((hit, index) => {
          const [low, high] = BANDS[hit.match]
          expect(hit.rank).toBeGreaterThanOrEqual(low)
          if (hit.match === "title") expect(hit.rank).toBeLessThanOrEqual(high)
          else expect(hit.rank).toBeLessThan(high)
          if (index > 0) expect(hit.rank).toBeLessThanOrEqual(hits[index - 1].rank)
        })
      })
    })

    // Repris de `route-candidates.test.ts` (M11b) : titre et résumé des nœuds publiés de l'organisation,
    // sans vocabulaire (ADR-011 § 7), dans une organisation de référence à elle (mêmes personnes).
    // Depuis E01-S13 (AC-a2), la fonction (`security definer`) présélectionne par index les nœuds qui
    // portent un lexème de la demande ou lui ressemblent, et ne rend que ceux que la personne lit, avant
    // la coupe ; le service de routage garde son filtre (`nodeLevels`, `server/routing.ts`).
    describe.skipIf(!routeReady)(routeReady ? "route_candidates (AC27, AC28)" : `route_candidates (AC27, AC28) (${routeSkipReason})`, () => {
      let r: SqlReferenceOrg

      async function route(who: Who, query: string, options: { kind?: string; limit?: number; org?: string } = {}): Promise<Candidate[]> {
        const rows = await as(who).tx(
          (sql) => sql<Candidate[]>`
            select * from platform.route_candidates(p_org => ${options.org ?? r.org.id}, p_query => ${query}
              ${options.kind ? sql`, p_kind => ${options.kind}` : sql``}
              ${options.limit === undefined ? sql`` : sql`, p_limit => ${options.limit}`})`,
        )
        return [...rows]
      }

      // Les nœuds du routage sont publiés sans bloc, par la même aide que le jeu de la recherche.
      beforeAll(async () => {
        r = await fx.buildReferenceOrg(o.people)
        await fx.publishBlocks(r.nodes.root, [])
        await published(
          r.nodes.ventes,
          "ventes/relance",
          { kind: "procedure", title: "Relancer un devis", summary: "Relance les devis en attente depuis 7 jours, après accord de la personne." },
          r.org.id,
        )
        await published(
          r.nodes.ventes,
          "ventes/prospects",
          { kind: "procedure", title: "Relancer les prospects", summary: "Relance par email les prospects à traiter. Se demande aussi : recontacte les leads." },
          r.org.id,
        )
        await published(
          r.nodes.support,
          "support/escalade",
          { kind: "procedure", title: "Escalader un incident", summary: "Escalade les incidents en attente au niveau 2." },
          r.org.id,
        )
        const conseil = await fx.createNode(r.org.id, { parentId: r.nodes.root, path: "conseil", title: "Conseil" })
        await published(conseil, "conseil/tarifs", { kind: "page", title: "Tarifs", summary: "Les tarifs des devis et des études." }, r.org.id)
        await fx.createNode(r.org.id, { parentId: r.nodes.ventes, path: "ventes/brouillon", kind: "procedure", title: "Relancer en brouillon", summary: "Relance les devis en attente." })
      }, SETUP_TIMEOUT)

      describe("candidates of the organisation (AC27 ; E01-S13 AC-a2)", () => {
        // Les quatre nœuds publiés portent un lexème de la demande ; chacun ne reçoit que ceux qu'il lit.
        it("should give each person the published nodes she reads among those the request finds: neither the root nor a draft", async () => {
          const paths = async (who: Who) => (await route(who, "relance les devis en attente")).map((candidate) => candidate.path).sort()
          expect({ marc: await paths("marc"), claire: await paths("claire") }).toEqual({
            marc: ["conseil/tarifs"],
            claire: ["conseil/tarifs", "ventes/prospects", "ventes/relance"],
          })
          for (const candidate of await route("claire", "relance les devis en attente")) expect(Object.keys(candidate).sort()).toEqual([...CANDIDATE_COLUMNS].sort())
        })

        it("should never give the root, published, read by every member and holding the request, whatever the kind", async () => {
          // La racine (`guide`, « Guide ») est publiée plus haut : seule sa garde l'écarte d'une demande sans genre.
          const root = await fx.admin`select path, title, status from platform.nodes where id = ${r.nodes.root}`
          expect(root).toEqual([{ path: "guide", title: "Guide", status: "published" }])
          expect((await route("claire", "guide")).map((candidate) => candidate.path)).not.toContain("guide")
        })

        it("should give the effective owner team, and no team for an organisation node", async () => {
          const owners = Object.fromEntries((await route("paul", "incident tarifs")).map((candidate) => [candidate.path, candidate.owner_team_id]))
          expect(owners).toEqual({ "support/escalade": r.teams.support, "conseil/tarifs": null })
        })

        // La borne haute est prouvée à l'exact par le cas suivant : son assertion `≤ 200` est retirée (M11b).
        it("should filter by kind, bound p_limit to 1 at least, and cut a very long query without error", async () => {
          // `conseil/tarifs`, page, porte « tarifs » : seul le genre l'écarte.
          expect((await route("claire", "relance tarifs", { kind: "procedure" })).map((candidate) => candidate.path).sort()).toEqual([
            "ventes/prospects",
            "ventes/relance",
          ])
          expect(await route("claire", "relance", { limit: 0 })).toHaveLength(1)
          const long = await route("claire", `${"relance ".repeat(1250)}`)
          expect(long.length).toBeGreaterThan(0)
        })

        describe("with more candidates than the upper bound", () => {
          let many: string

          // Une organisation à elle, dont Paul est membre : 201 pages d'organisation publiées, posées d'un
          // coup par la connexion d'administration (la racine, `private` et `contexte` ne sont pas candidats).
          beforeAll(async () => {
            many = (await fx.createOrg()).id
            const tree = await fx.createTree(many)
            await fx.addMember(many, o.people.paul.id)
            const pages = Array.from({ length: 201 }, (_, index) => ({
              org_id: many,
              parent_id: tree.root,
              path: `page_${index}`,
              title: `Page ${index}`,
              summary: "Une page publiée.",
              status: "published",
              revision: 1,
            }))
            await fx.admin`insert into platform.nodes ${fx.admin(pages)}`
          }, SETUP_TIMEOUT)

          it("should return 50 candidates by default and 200 at most", async () => {
            expect(await route("paul", "page", { org: many })).toHaveLength(50)
            expect(await route("paul", "page", { org: many, limit: 999 })).toHaveLength(200)
          })
        })
      })

      describe("score components, without vocabulary (AC28)", () => {
        // Une seconde tournure écrite dans le résumé (« recontacte les leads ») redisait ce cas : retirée (M11b).
        it("should score 1 on the summary that holds the request word for word, and rank it first", async () => {
          const [first] = await route("claire", "relance les devis en attente")
          expect(first.path).toBe("ventes/relance")
          expect(first.s_summary).toBeCloseTo(1, 5)
        })

        it("should score 1 on a title said in full", async () => {
          const prospects = (await route("claire", "relancer les prospects")).find((candidate) => candidate.path === "ventes/prospects")
          expect(prospects?.s_title).toBeCloseTo(1, 5)
        })

        // Depuis E01-S13, un nœud sans lexème commun ni ressemblance n'est plus rendu : « PdV » est compté
        // à côté d'un mot que le nœud porte.
        it("should count the lexemes of the request only, adding no synonym", async () => {
          const prospects = (await route("claire", "PdV prospects")).find((candidate) => candidate.path === "ventes/prospects")
          expect(prospects).toMatchObject({ query_lexemes: 2, lexical: 0.5 })
        })
      })
    })
  },
)
