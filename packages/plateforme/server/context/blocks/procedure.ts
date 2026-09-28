// Bloc « procédure reconnue » de `context` (E03-S02, AC7, AC9) : les blocs publiés de la procédure que
// le routage sert, rendus par `renderBlocks` (M05) un niveau de titre plus bas que dans `read` (N19),
// sous la consigne de les suivre. Trop long pour le budget, il cède la place à son `fallback`, un
// pointeur vers `read` (N2), jamais coupé au milieu. Sans lui, les étapes reconnues ne sont pas servies.
//
// Repris de la maquette (`mcp-test/src/proto/services/context.ts` l. 91-100) : en-tête, révision,
// consigne. Retiré : les sections markdown du nœud (→ blocs publiés, ADR-011).
import { orderBlocks, renderBlocks } from "../../../schemas"
import type { PlatformDb } from "../../db"
import { inTransaction, READ_PAGE_ROWS } from "../../errors"
import type { Identity } from "../../identity"
import type { DocBlock } from "../../nodes/document"
import { contextReference, referenceLines, resolveReferences } from "../../nodes/references"
import { BLOCK_SQL_COLUMNS, docBlock } from "../../nodes/store"
import type { Candidate } from "../../routing"
import type { ContextBlock } from "../engine"

/**
 * L'accord porte sur ce qui dépasse la procédure demandée (fiche D99, M53) : ses propres étapes (réserver,
 * écrire, rendre) se suivent sans question, un envoi demande toujours l'accord.
 */
const APPROVAL = "the user's explicit approval before anything that sends, or that changes data beyond the steps of the procedure the user asked for"
const FOLLOW = `Follow these steps now. Ask ${APPROVAL}.`

/** Comment recopier un bloc `call` servi en appel (E03-S06, AC7, règle 8, N12). */
const callLine = (prefix: string) =>
  `A \`\`\`call block holds <function> <arguments JSON>: run it with ${prefix}_call {"function": "<function>", "arguments": <arguments JSON>}, replacing each "<…>" value with the real one.`

/** Une ligne de `blocks` telle que `docBlock` la lit. */
type BlockRow = Parameters<typeof docBlock>[0]

/**
 * Le bloc de la procédure servie, qui a passé le filtre de niveau de `rankCandidates` : sa révision,
 * son titre et ses seuls blocs publiés (`state` posé dans la requête : un brouillon ouvert n'est
 * jamais lu), lus dans une transaction sans ordre, puis rangés (`orderBlocks`), une page de
 * `READ_PAGE_ROWS` au plus. Rend aussi la révision, pour `served` ; `null` quand le nœud a disparu
 * depuis le routage (N30).
 */
export async function procedureBlock(
  db: PlatformDb,
  served: Candidate,
  identity: Identity,
): Promise<{ block: ContextBlock; revision: number } | null> {
  const [[node], blocks] = await inTransaction(db, "procedureBlock: nodes and blocks", (sql) =>
    Promise.all([
      sql<{ revision: number; title: string }[]>`select revision, title from platform.nodes where id = ${served.nodeId}`,
      sql<BlockRow[]>`
        select ${sql(BLOCK_SQL_COLUMNS)} from platform.blocks
         where node_id = ${served.nodeId} and state = 'published'
         limit ${READ_PAGE_ROWS}`,
    ]),
  )
  if (!node) return null
  const { prefix } = identity.org
  const header = `## Procedure ${served.path} (v${node.revision}): ${node.title}`
  const fallback = `${header}\nIts steps do not fit in this context: read them with ${prefix}_read {"path": "${served.path}"} before acting, and ask ${APPROVAL}.`
  // Une page pleine peut en cacher d'autres : une procédure n'est jamais servie en partie (AC9), seul son pointeur (N32).
  const complete = blocks.length < READ_PAGE_ROWS
  const steps = complete ? await servedSteps(db, identity, blocks.map(docBlock)) : ""
  const text = complete ? [header, FOLLOW, callLine(prefix), ...(steps ? ["", steps] : [])].join("\n") : fallback
  return { block: { name: "procedure", text, fallback }, revision: node.revision }
}

/**
 * Les étapes rendues (N19), un bloc `reference` servi par sa ligne résolue pour la personne (E03-S07),
 * comme dans un Contexte (E03-S08) ; aucune lecture quand la procédure n'en a pas.
 */
async function servedSteps(db: PlatformDb, identity: Identity, blocks: DocBlock[]): Promise<string> {
  const ordered = orderBlocks(blocks)
  const lines = referenceLines(await resolveReferences(db, identity, ordered, []))
  return renderBlocks(ordered, { headingBase: 3, reference: contextReference(lines) })
}
