// Prompts MCP des procédures (P37, `mcp-patterns.md § 2.3`) : un prompt par procédure publiée que
// la personne peut lire, dans l'ordre des chemins, 20 au plus. Claude Code en fait des commandes
// `/mcp__<serveur>__<prompt>` qui déroulent la procédure ; claude.ai les liste par leur titre dans
// le menu « + » et attache le message en fichier TXT (banc E04, mesure 2). Le titre et la première
// ligne doivent donc se suffire : titre = titre de la procédure, description = son résumé, message =
// son titre, que le routage reconnaît (H40). Sans ce module, la capacité `prompts` reste vide.
//
// Repris de la maquette (`mcp-test/src/proto/services/prompts.ts` l. 12-34) : nom = dernier segment
// du chemin, description = résumé, prompt inconnu en erreur. Ajouté : noms uniques, borne de 20.
// Retiré : `meta.suggested` et la première déclencheuse (→ toutes les procédures publiées lisibles,
// message = titre, P37), `canRead` de la maquette (→ `nodeLevels` d'`access.ts`, E01-S07),
// `McpError` levée par le service (→ `PlatformError`, H04 : la porte la traduit).
import { ACCESS_LEVELS, nodeLevels } from "./access"
import type { PlatformDb } from "./db"
import { inTransaction, PlatformError } from "./errors"
import type { Identity } from "./identity"

/** Claude Code préfixe `mcp__<serveur>__` ; 64 caractères ASCII au plus (`mcp-patterns.md § 3`). */
export const PROMPT_NAME_MAX = 64

/** Borne de P37 : sans elle, le menu « + » de claude.ai listerait des dizaines de procédures. */
const PROMPTS_MAX = 20

/** Un prompt tel que le sert la porte MCP (E02-S04 en lira le titre) ; ni chemin ni nœud tant qu'aucun lecteur ne les demande (N16). */
export type ProcedurePrompt = {
  name: string
  title: string
  /** Le résumé de la procédure. */
  description: string
}

/**
 * Noms des prompts, dans l'ordre de `paths` (N3) : le dernier segment du chemin, sinon, quand ce
 * segment se répète dans la liste, le chemin entier avec `_` à la place de `/` ; 64 caractères au
 * plus. Un nom encore pris (chemins coupés au même endroit, chemin entier égal au dernier segment
 * d'un autre) reçoit `_2`, `_3`… dans l'ordre des chemins (N7) : deux prompts de même nom
 * rendraient le second inatteignable.
 */
export function promptNames(paths: readonly string[]): string[] {
  const cut = (name: string) => name.slice(0, PROMPT_NAME_MAX)
  const last = paths.map((path) => cut(path.slice(path.lastIndexOf("/") + 1)))
  const repeated = new Set(last.filter((name, index) => last.indexOf(name) !== index))
  const taken = new Set<string>()
  return paths.map((path, index) => {
    const wanted = repeated.has(last[index]) ? cut(path.replaceAll("/", "_")) : last[index]
    let name = wanted
    for (let n = 2; taken.has(name); n += 1) name = `${wanted.slice(0, PROMPT_NAME_MAX - String(n).length - 1)}_${n}`
    taken.add(name)
    return name
  })
}

/**
 * Les procédures publiées de l'organisation que la personne lit (niveau 1 au moins, H66, décidé ici
 * par `nodeLevels`), triées par chemin, 20 au plus : la borne s'applique après le filtre, sur
 * l'ensemble des procédures publiées lu en une fois (HN-E01S07-8) ; les noms sont calculés sur cette
 * liste. Lue aussi par la page `/connect` (E02-S04), qui en garde les cinq premières.
 */
export async function listPrompts(db: PlatformDb, identity: Identity): Promise<ProcedurePrompt[]> {
  const nodes = await inTransaction(db, "listPrompts: nodes", (sql) => sql<{ id: string; path: string; title: string; summary: string }[]>`
    select n.id, n.path, n.title, n.summary from platform.nodes n
     where n.org_id = ${identity.org.id} and n.kind = 'procedure' and n.status = 'published'
     order by n.path`)
  const levels = await nodeLevels(db, identity, nodes.map((node) => node.id))
  const readable = nodes.filter((node) => (levels.get(node.id) ?? ACCESS_LEVELS.none) >= ACCESS_LEVELS.read).slice(0, PROMPTS_MAX)
  const names = promptNames(readable.map((node) => node.path))
  return readable.map((node, index) => ({ name: names[index], title: node.title, description: node.summary }))
}

/** Refus d'un nom inconnu, invisible ou hors des 20 listés (N4, N5 : invisible = inexistant, H68). */
export function unknownPromptMessage(name: string): string {
  return `Unknown prompt ${name}.`
}

/** Un prompt listé : sa description (le résumé) et son message (le titre de la procédure, P37). */
export async function getPrompt(db: PlatformDb, identity: Identity, name: string): Promise<{ description: string; text: string }> {
  const prompt = (await listPrompts(db, identity)).find((candidate) => candidate.name === name)
  if (!prompt) throw new PlatformError("not_found", unknownPromptMessage(name))
  return { description: prompt.description, text: prompt.title }
}
