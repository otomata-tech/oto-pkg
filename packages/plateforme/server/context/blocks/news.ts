// Bloc « What's new » de `context` (E03-S08, AC2, AC3, AC6 ; H34, FR-CONC-04) : depuis la conversation
// précédente de la personne (son dernier `ctx`, sinon 14 jours), les versions publiées des nœuds qu'elle
// lit et les connecteurs activés, du plus récent au plus ancien, 10 lignes au plus (sans taille, E11-S03).
// Les nouveautés se calculent, elles n'ont pas de table (architecture § 4) : chaque source est une
// lecture, et E08-S07 ajoute la sienne (notes de version du paquet) à `NEWS_SOURCES`. Sans lui, une
// publication n'arrive pas à la conversation suivante (FR-CONC-04).
//
// Repris de la maquette (`mcp-test/src/proto/services/context.ts` l. 179-215) : versions depuis la
// borne, forme des lignes, « Nothing new. », dates `AAAA-MM-JJ`. Retiré : les nœuds lisibles lus par
// clé de service (→ jointure filtrée par l'organisation, niveaux en un lot).
import { SERVED_NEWS } from "../../../schemas"
import { ACCESS_LEVELS, nodeLevels } from "../../access"
import type { PlatformDb } from "../../db"
import { inTransaction, READ_PAGE_ROWS } from "../../errors"
import type { Identity } from "../../identity"
import { day } from "../../nodes/read-format"
import type { ContextBlock } from "../engine"

/** Une nouveauté : sa date (ISO) et sa ligne. */
export type NewsItem = { at: string; line: string }

/** Une source de nouveautés depuis `since` (ISO), lue pour la personne. */
type NewsSource = (db: PlatformDb, identity: Identity, since: string) => Promise<NewsItem[]>

/** Lignes au plus (H34). */
const NEWS_MAX = 10

/**
 * Les versions publiées depuis `since` des nœuds de l'organisation (jointure sur `nodes`, filtrée par
 * `org_id` dans la requête), les plus récentes d'abord, une page de `READ_PAGE_ROWS` ; Contextes et
 * tableaux compris. Le niveau de leurs nœuds est calculé en un lot, après la transaction, et un nœud de
 * niveau 0 est retiré avant la coupe à 10 lignes (HN-E01S07-8). `since` passe en texte, converti dans la
 * requête : une borne lue en base (le dernier `ctx`) garde ses microsecondes.
 */
async function versionsSince(db: PlatformDb, identity: Identity, since: string): Promise<NewsItem[]> {
  const rows = await inTransaction(
    db,
    "context: node_versions",
    (sql) => sql<{ node_id: string; revision: number; title: string; created_at: Date; path: string }[]>`
      select v.node_id, v.revision, v.title, v.created_at, n.path
        from platform.node_versions v
        join platform.nodes n on n.id = v.node_id
       where n.org_id = ${identity.org.id} and v.created_at > ${since}::text::timestamptz
       order by v.created_at desc
       limit ${READ_PAGE_ROWS}`,
  )
  const levels = await nodeLevels(db, identity, [...new Set(rows.map((row) => row.node_id))])
  // Une ligne par nœud, sa dernière version (E11-S16, AC-b1) : les lignes arrivent les plus récentes d'abord,
  // la première vue de chaque nœud est la sienne. Sans cela, un document réécrit cinq fois prend cinq des dix lignes.
  const seen = new Set<string>()
  // Un filtre de liste compare `nodeLevels` à 1 seulement (`security-patterns.md § Droits dans le service`).
  return rows
    .filter((row) => (levels.get(row.node_id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read)
    .filter((row) => !seen.has(row.node_id) && seen.add(row.node_id))
    .map((row) => versionItem(row, row.created_at.toISOString()))
}

/**
 * Une version publiée, datée (formats de `SERVED_NEWS`, que l'écran relit, E05-S13 AC-16) ; exportée pour le test de
 * parité de l'écran, sans base.
 */
export function versionItem(version: { path: string; revision: number; title: string }, at: string): NewsItem {
  const { item, revision, dateStart, dateEnd } = SERVED_NEWS
  return { at, line: `${item}${version.path}${revision}${version.revision}${dateStart}${day(at)}${dateEnd}${version.title}` }
}

/** Un connecteur activé, daté (formats de `SERVED_NEWS`) ; exporté pour le même test. */
export function activationItem(connector: string, at: string): NewsItem {
  return { at, line: `${SERVED_NEWS.connector}${connector}${SERVED_NEWS.activated}${day(at)}${SERVED_NEWS.connectorEnd}` }
}

/** Les connecteurs actifs de l'organisation activés ou réactivés depuis `since` (N2 : `updated_at`), 10 au plus. */
async function activationsSince(db: PlatformDb, identity: Identity, since: string): Promise<NewsItem[]> {
  const rows = await inTransaction(
    db,
    "context: connector_activations",
    (sql) => sql<{ connector: string; updated_at: Date }[]>`
      select connector, updated_at from platform.connector_activations
       where org_id = ${identity.org.id} and state = 'active' and updated_at > ${since}::text::timestamptz
       order by updated_at desc
       limit ${NEWS_MAX}`,
  )
  return rows.map((row) => activationItem(row.connector, row.updated_at.toISOString()))
}

/** Les sources des nouveautés, lues en parallèle ; E08-S07 y ajoute les notes de version du paquet. */
const NEWS_SOURCES: readonly NewsSource[] = [versionsSince, activationsSince]

/** Les nouveautés depuis `since` : toutes les sources, fusionnées, les plus récentes d'abord, 10 au plus. */
export async function newsItems(db: PlatformDb, identity: Identity, since: string): Promise<NewsItem[]> {
  const found = (await Promise.all(NEWS_SOURCES.map((source) => source(db, identity, since)))).flat()
  return found.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, NEWS_MAX)
}

/**
 * Le bloc (AC2, AC6) : titre daté de la borne, puis les lignes, ou « Nothing new. » (formats de `SERVED_NEWS`, que
 * l'écran relit, E05-S13 AC-16) ; servi entier (E11-S03, AC-b1). Rien de nouveau depuis une borne
 * du jour même (une conversation de la journée) : aucun bloc (fiche D99, M53), « since <aujourd'hui> :
 * Nothing new » ne disant rien au modèle ; une nouveauté de la journée reste servie (FR-CONC-04).
 */
export function newsBlock(items: readonly NewsItem[], since: string): ContextBlock | null {
  if (items.length === 0 && day(since) === day(new Date().toISOString())) return null
  const lines = items.length > 0 ? items.map((item) => item.line) : [SERVED_NEWS.nothing]
  return { name: "news", text: [`${SERVED_NEWS.title}${day(since)}`, ...lines].join("\n") }
}
