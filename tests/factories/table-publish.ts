// `write` d'un tableau sur la base simulée (E07-S04, § Tests attendus : « gestionnaires `open_draft` et
// `publish_node` donnés par le test ») : `publish_node` comme la base l'exécute (E01-S06, M02,
// `20260924140000_platform_gardes.sql`) — un tableau garde ses lignes (aucun bloc copié ni effacé),
// reçoit l'en-tête du brouillon (`nodes.meta` ← `node_drafts.meta`), avance sa révision, prend un
// instantané sans lignes (`blocks` = `[]`) et perd son brouillon. `contentRpc` (`reference-org.ts`)
// simule les documents seuls : sur un tableau, il retirerait les lignes et ignorerait `meta`. Les
// effets de `publish_node` en base sont prouvés par E01-S06, jamais retestés ici.
import { writeNode, type WriteOrigin } from "../../packages/plateforme/server/nodes/write"
import { CONTENT_AT, contentDefaults, contentRpc, identityOf, referenceRpc, type Person } from "../helpers/reference-org"
import { liveTables, simulatedDb, type RpcHandler, type SimulatedCall, type SimulatedDbOptions, type Tables } from "../helpers/simulated-db"

/** `referenceRpc` et `contentRpc`, dont `publish_node` publie un tableau comme la base. */
export function tableRpc(): Record<string, RpcHandler> {
  const content = contentRpc()
  return {
    ...referenceRpc(),
    ...content,
    publish_node: (args, tables) => {
      const node = tables.nodes.find((row) => row.id === args.p_node)
      if (node?.kind !== "table") return content.publish_node(args, tables)
      const draft = tables.node_drafts.find((row) => row.node_id === node.id)
      if (!draft) return null
      Object.assign(node, {
        title: draft.title ?? node.title,
        summary: draft.summary ?? node.summary,
        meta: draft.meta ?? node.meta,
        status: "published",
        revision: Number(node.revision) + 1,
      })
      const { title, summary, kind, meta, revision } = node
      tables.node_versions.push({ node_id: node.id, revision, title, summary, kind, meta, blocks: [], author: null, created_at: CONTENT_AT })
      tables.node_drafts = tables.node_drafts.filter((row) => row.node_id !== node.id)
      return revision
    },
  }
}

/** Une base simulée sur une copie de `tables`, où un tableau se publie comme en base. */
export function tableDb(tables: Tables, options: Partial<SimulatedDbOptions> = {}) {
  return simulatedDb({ tables, rpc: tableRpc(), defaults: contentDefaults, ...options })
}

const AGENT: WriteOrigin = { kind: "agent", ctx: "7K3Q-M2XA" }

/** `write` de `person` : son résultat ou son refus, l'espion des requêtes et les tables laissées. */
export async function writeAs(person: Person, input: Record<string, unknown>, tables: Tables, options: Partial<SimulatedDbOptions> = {}) {
  const simulated = tableDb(tables, options)
  const outcome = await writeNode(simulated.db, identityOf(person), input, AGENT).then(
    (result) => ({ result, error: null }),
    (error: unknown) => ({ result: null, error }),
  )
  return { ...outcome, calls: simulated.calls, tables: liveTables(simulated) }
}

/** Écritures parties vers la base : insertions, mises à jour, suppressions, `open_draft`, `publish_node`. */
export function writesOf(calls: readonly SimulatedCall[]): SimulatedCall[] {
  return calls.filter((call) => (call.kind === "table" && call.op !== "select") || (call.kind === "rpc" && ["open_draft", "publish_node"].includes(call.name)))
}

/** Les appels de `publish_node`. */
export function publishCalls(calls: readonly SimulatedCall[]): SimulatedCall[] {
  return calls.filter((call) => call.kind === "rpc" && call.name === "publish_node")
}
