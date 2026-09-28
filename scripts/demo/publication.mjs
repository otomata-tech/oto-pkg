/**
 * Publication des nœuds de la Démo (E01-S06), partagée par les sections `contenu`, `tableau` et
 * `procedure` : un nœud posé s'il manque, puis publié en blocs (ADR-011), par `open_draft` et
 * `publish_node` sur la connexion d'administration, sans claims (auteur nul, N3). Pas une section :
 * son nom ne suit pas le motif `NN-<nom>.mjs` que charge l'exécuteur.
 *
 * Idempotente : un nœud hors du pilote n'est publié qu'une fois (révision ≥ 1 : laissé) ; un document
 * du pilote (E06-S01, NH13) est republié seulement quand il diffère du module, aucune version de plus
 * sinon ; un nœud déplacé depuis est remis à son chemin (M63) ; `--reset` repart de zéro. Aucune valeur lue n'est imprimée (le libellé d'un nœud personnel ne
 * nomme pas le handle).
 *
 * `must`, `maybeOne` et `one` nomment l'opération d'une requête en échec, pour l'exécuteur et toutes
 * les sections (E01-S10 f1) : `platform` se lit par la connexion d'administration, et une lecture
 * garde le contrôle du nombre de lignes que faisaient `.maybeSingle()` et `.single()` de PostgREST.
 */
import { messageOf } from '../lib/env.mjs'

/**
 * Les champs du contexte d'E01-S05 que ces fonctions lisent.
 * @typedef {object} DemoContext
 * @property {import('postgres').Sql} sql  connexion d'administration (`PLATFORM_ADMIN_DATABASE_URL`)
 * @property {{ id: string } | null} org  posé par la section `identite`
 * @property {(line: string) => void} report
 */

/** @typedef {{ type: string, text?: string, data?: Record<string, unknown>, key?: string }} DemoBlock */

/**
 * Le résultat d'une requête ; en échec, l'opération nommée. Le message nomme l'opération ;
 * l'exécuteur y ajoute la section (contrat des sections).
 * @template T
 * @param {PromiseLike<T>} query
 * @param {string} operation
 * @returns {Promise<T>}
 */
export async function must(query, operation) {
  try {
    return await query
  } catch (error) {
    throw new Error(`${operation} : ${messageOf(error)}`)
  }
}

/**
 * La ligne d'une lecture qui en rend une au plus, ou null ; plusieurs lignes : l'opération en échec.
 * @template T
 * @param {PromiseLike<readonly T[]>} query
 * @param {string} operation
 * @returns {Promise<T | null>}
 */
export async function maybeOne(query, operation) {
  const rows = await must(query, operation)
  if (rows.length > 1) throw new Error(`${operation} : ${rows.length} lignes au lieu d'une au plus`)
  return rows[0] ?? null
}

/**
 * La ligne d'une lecture qui doit en rendre une ; aucune ou plusieurs : l'opération en échec.
 * @template T
 * @param {PromiseLike<readonly T[]>} query
 * @param {string} operation
 * @returns {Promise<T>}
 */
export async function one(query, operation) {
  const row = await maybeOne(query, operation)
  if (row === null) throw new Error(`${operation} : aucune ligne`)
  return row
}

/**
 * Le nœud d'un chemin, ou null.
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {string} path
 * @returns {Promise<{ id: string, revision: number } | null>}
 */
export async function findNode(ctx, path) {
  return maybeOne(
    ctx.sql`select id, revision from platform.nodes where org_id = ${ctx.org.id} and path = ${path}`,
    `lecture du nœud ${path}`,
  )
}

/**
 * Pose le nœud s'il manque, sous le nœud de chemin `parent` ; le laisse tel quel sinon. Un nœud de la
 * Démo déplacé depuis (son chemin est un ancien chemin, `node_aliases`) est remis à son chemin sous
 * `parent`, avec ses descendants (M63) : sans ce retour, l'insertion bute sur l'alias (`23505`) et la
 * section s'arrête. Ce que la Démo ne sème pas reste où il est. Le chemin quitté n'est pas imprimé : il
 * peut nommer un handle.
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {string} parent  chemin du parent
 * @param {{ path: string, kind: string, title: string, summary: string, meta?: Record<string, unknown> }} node
 * @returns {Promise<string>} l'id du nœud
 */
export async function ensureNode(ctx, parent, node) {
  const found = await findNode(ctx, node.path)
  if (found) {
    ctx.report(`nœud ${node.path} : présent`)
    return found.id
  }
  const parentNode = await findNode(ctx, parent)
  if (!parentNode) throw new Error(`nœud ${parent} absent (posé par la section arbre)`)
  const { sql } = ctx
  const moved = await maybeOne(
    sql`select node_id from platform.node_aliases where org_id = ${ctx.org.id} and old_path = ${node.path}`,
    `lecture de l'ancien chemin ${node.path}`,
  )
  if (moved) {
    // La cascade des chemins et les alias du chemin quitté sont les déclencheurs de la base, comme pour
    // un déplacement à l'écran.
    await one(
      sql`update platform.nodes set parent_id = ${parentNode.id}, path = ${node.path}
           where org_id = ${ctx.org.id} and id = ${moved.node_id} returning id`,
      `retour du nœud ${node.path} à son chemin`,
    )
    ctx.report(`nœud ${node.path} : déplacé depuis, remis à son chemin`)
    return moved.node_id
  }
  const created = await one(
    sql`insert into platform.nodes ${sql({ org_id: ctx.org.id, parent_id: parentNode.id, ...node })} returning id`,
    `création du nœud ${node.path}`,
  )
  ctx.report(`nœud ${node.path} : créé`)
  return created.id
}

/**
 * Blocs d'un document, dans l'ordre : positions 1 024 × rang, provenance d'import.
 * @param {DemoBlock[]} blocks
 * @param {string} at  date du semis
 */
export function documentBlocks(blocks, at) {
  return blocks.map((block, index) => ({
    type: block.type,
    text: block.text ?? null,
    data: block.data ?? {},
    key: block.key ?? null,
    position: 1024 * (index + 1),
    provenance: { origin: 'import', at },
  }))
}

/**
 * Les liens d'une page publiée (E01-S06 § Contrat, règle « Liens ») tirés de ses blocs `reference`
 * écrits : `[{ block_id, path }]`, que `publish_node` écrit dans `links` (E07-S03).
 * @param {{ id: string, type: string, data: { path?: string } }[]} written
 */
function referenceLinks(written) {
  return written.filter((block) => block.type === 'reference' && block.data?.path).map((block) => ({ block_id: block.id, path: block.data.path }))
}

/**
 * Les liens d'un document du pilote en `p_links` (E06-S01, NH12) : ceux que déclare le module, `block`
 * étant le rang du bloc dans le document, lu sur les blocs écrits rangés par position.
 * @param {{ block: number, path: string, key?: string }[]} links
 * @returns {(written: { id: string }[]) => { block_id: string, path: string, key?: string }[]}
 */
function moduleLinks(links) {
  return (written) => links.map(({ block, path, key }) => ({ block_id: written[block].id, path, ...(key === undefined ? {} : { key }) }))
}

/**
 * Publie le brouillon du nœud : brouillon ouvert, vidé, rempli de `blocks`, en-tête en attente
 * (`header`), puis `publish_node` avec les liens que `links` tire des blocs écrits, rangés par
 * position. Rend la révision publiée.
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {{ label: string, nodeId: string, blocks: ReturnType<typeof documentBlocks>, header?: Record<string, unknown>, links: (written: { id: string, type: string, data: { path?: string } }[]) => unknown[] }} publication
 * @returns {Promise<number>}
 */
async function publishDraft(ctx, { label, nodeId, blocks, header, links }) {
  const { sql } = ctx
  const [draft] = await must(sql`select base_revision from platform.open_draft(${nodeId})`, `ouverture du brouillon de ${label}`)
  await must(sql`delete from platform.blocks where node_id = ${nodeId} and state = 'draft'`, `brouillon de ${label} vidé`)
  let written = []
  if (blocks.length > 0) {
    // Mêmes colonnes pour toutes les lignes (`documentBlocks`) : aucune ne perd le défaut d'une autre.
    const rows = blocks.map((block) => ({ ...block, org_id: ctx.org.id, node_id: nodeId, state: 'draft' }))
    const inserted = await must(sql`insert into platform.blocks ${sql(rows)} returning id, type, data, position`, `blocs de ${label}`)
    written = inserted.sort((a, b) => a.position - b.position)
  }
  if (header) await must(sql`update platform.node_drafts set ${sql(header)} where node_id = ${nodeId}`, `en-tête de ${label}`)
  // Arguments nommés, comme l'appel RPC : seule la surcharge sans `p_draft_stamp` les accepte tous.
  const published = await one(
    sql`select platform.publish_node(p_node => ${nodeId}, p_base_revision => ${draft.base_revision}, p_links => ${links(written)}) as revision`,
    `publication de ${label}`,
  )
  return published.revision
}

/**
 * Publie le nœud une fois (révision 0) : les cibles de ses blocs `reference` en `p_links` (E07-S03 ;
 * aucune pour un nœud qui n'en a pas, jamais publié donc sans lien). Un nœud déjà publié est laissé.
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {{ label: string, nodeId: string, blocks: ReturnType<typeof documentBlocks>, header?: Record<string, unknown> }} publication
 * @returns {Promise<boolean>} vrai si le nœud vient d'être publié
 */
export async function publishOnce(ctx, { label, nodeId, blocks, header }) {
  const node = await one(ctx.sql`select revision from platform.nodes where id = ${nodeId}`, `lecture de ${label}`)
  if (node.revision >= 1) {
    ctx.report(`${label} : déjà publié`)
    return false
  }
  const revision = await publishDraft(ctx, { label, nodeId, blocks, header, links: referenceLinks })
  ctx.report(`${label} : publié (révision ${revision})`)
  return true
}

/** Une valeur JSON aux clés d'objet rangées : `jsonb` range les clés à sa façon, l'ordre écrit ne compte pas. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

/**
 * Deux valeurs JSON égales, les clés d'un objet dans n'importe quel ordre.
 * @param {unknown} a
 * @param {unknown} b
 */
export function sameJson(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

/** Ce que l'on compare d'un bloc de document (NH13) : type, texte, données et clé. */
const compared = (block) => ({ type: block.type, text: block.text ?? null, data: block.data ?? {}, key: block.key ?? null })

/**
 * Un document du pilote tel que le module le décrit : titre, résumé, blocs, liens (`{ block, path, key? }`) ;
 * `meta`, l'en-tête d'un tableau.
 * @typedef {{ title: string, summary: string, blocks: DemoBlock[], links: { block: number, path: string, key?: string }[], meta?: Record<string, unknown> }} PilotDocument
 */

/**
 * Le nœud publié est-il le document du module : titre, résumé, en-tête d'un tableau, puis ses blocs
 * publiés dans l'ordre (hors lignes d'un tableau) ?
 * @param {DemoContext} ctx
 * @param {{ id: string, title: string, summary: string, meta: unknown }} node
 * @param {PilotDocument} document
 * @param {string} label
 */
async function conforms(ctx, node, document, label) {
  if (node.title !== document.title || node.summary !== document.summary) return false
  if (document.meta !== undefined && !sameJson(node.meta, document.meta)) return false
  const blocks = await must(
    ctx.sql`select type, text, data, key from platform.blocks
             where node_id = ${node.id} and state = 'published' and type <> 'row'
             order by position, id`,
    `lecture des blocs de ${label}`,
  )
  return sameJson(blocks.map(compared), document.blocks.map(compared))
}

/**
 * Publie un document du pilote quand il diffère du module (E06-S01, AC14, NH13) : ses blocs dans
 * l'ordre, son titre, son résumé et l'en-tête d'un tableau ; ses liens, ceux du module, en `p_links`.
 * Un nœud jamais publié (un Contexte né par déclencheur, en révision 0) l'est toujours. Un document
 * conforme n'est pas republié : aucune ligne `node_versions` de plus, `rules_version` inchangé (H28).
 * @param {DemoContext & { org: { id: string } }} ctx
 * @param {{ label: string, nodeId: string, document: PilotDocument, at: string }} publication  `at` : date du semis
 * @returns {Promise<boolean>} vrai si le document vient d'être publié
 */
export async function publishWhenChanged(ctx, { label, nodeId, document, at }) {
  const node = await one(ctx.sql`select id, revision, title, summary, meta from platform.nodes where id = ${nodeId}`, `lecture de ${label}`)
  if (node.revision >= 1 && (await conforms(ctx, node, document, label))) {
    ctx.report(`${label} : conforme au module`)
    return false
  }
  const header = { title: document.title, summary: document.summary, ...(document.meta === undefined ? {} : { meta: document.meta }) }
  const revision = await publishDraft(ctx, { label, nodeId, blocks: documentBlocks(document.blocks, at), header, links: moduleLinks(document.links) })
  ctx.report(`${label} : publié (révision ${revision})`)
  return true
}
