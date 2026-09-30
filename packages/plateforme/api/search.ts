// Ressource `search` de l'API du paquet (E05-S09, AC-a7) : `GET /api/platform/search?q=` sert à la
// palette du rail (⌘K) les nœuds que la personne lit, trouvés dans leur titre, leur résumé ou leur
// contenu publié, par le service de l'outil `find` (même recherche, architecture § 5 : « MCP,
// écrans »). Adaptateur mince : la recherche et le filtre de niveau sont dans `server/find.ts` ; sans
// catalogue passé, aucune fonction n'est cherchée. Sans elle, la palette ne cherche que les titres
// que le rail montre.
import { isRecord } from "../schemas/tables"
import { recentQuerySchema, searchQuerySchema, type SearchMatch } from "../schemas/search"
import { recentDocuments } from "../server/context/blocks/recent"
import { invalidInput } from "../server/errors"
import { find } from "../server/find"
import type { ResourceRoutes, Route } from "./handler"

/** Le premier extrait d'un nœud trouvé, là où la requête est (titre, résumé ou bloc). */
function extrait(places: unknown): string | null {
  const premier = Array.isArray(places) ? places[0] : undefined
  return isRecord(premier) && typeof premier.snippet === "string" && premier.snippet !== "" ? premier.snippet : null
}

/** Les nœuds trouvés, lus champ par champ dans les données de `find`. */
function correspondances(data: Record<string, unknown> | undefined): SearchMatch[] {
  const lus = Array.isArray(data?.matches) ? data.matches : []
  return lus.flatMap((match) =>
    isRecord(match) && typeof match.path === "string" && typeof match.kind === "string" && typeof match.title === "string"
      ? [{ path: match.path, kind: match.kind, title: match.title, snippet: extrait(match.places) }]
      : [],
  )
}

const searchRoute: Route = {
  params: 0,
  async handle({ db, identity, request }) {
    const parsed = searchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) throw invalidInput(parsed.error)
    const output = await find(db, identity, { query: parsed.data.q }, { functions: [], activeConnectors: new Set<string>() })
    return { status: 200, data: { matches: correspondances(output.data), more: typeof output.data?.more_nodes === "number" ? output.data.more_nodes : 0 } }
  },
}

/**
 * `GET /api/platform/search/recent` (E11-S15, AC-b4) : ce que la liste de « @ » montre avant toute frappe, les contenus
 * récents de la personne, lus par le service du bloc « Recent content » de `context` (`recentDocuments`, qui ne garde que
 * ce qu'elle lit), à la forme d'un nœud trouvé, sans extrait. `exclude` : la page qu'on édite, qui ne se cite pas
 * elle-même (19 récents au plus alors).
 */
const recentRoute: Route = {
  params: 1,
  fixed: { 0: "recent" },
  async handle({ db, identity, request }) {
    const parsed = recentQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) throw invalidInput(parsed.error)
    const documents = await recentDocuments(db, identity)
    const matches: SearchMatch[] = documents.flatMap(({ path, kind, title }) => (path === parsed.data.exclude ? [] : [{ path, kind, title, snippet: null }]))
    return { status: 200, data: { matches } }
  },
}

export const searchRoutes: ResourceRoutes = { GET: [searchRoute, recentRoute] }
