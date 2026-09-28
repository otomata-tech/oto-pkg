// Ressource `search` de l'API du paquet (E05-S09, AC-a7) : `GET /api/plateforme/search?q=` sert à la
// palette du rail (⌘K) les nœuds que la personne lit, trouvés dans leur titre, leur résumé ou leur
// contenu publié, par le service de l'outil `find` (même recherche, architecture § 5 : « MCP,
// écrans »). Adaptateur mince : la recherche et le filtre de niveau sont dans `server/find.ts` ; sans
// catalogue passé, aucune fonction n'est cherchée. Sans elle, la palette ne cherche que les titres
// que le rail montre.
import { isRecord } from "../schemas/tables"
import { searchQuerySchema, type SearchMatch } from "../schemas/search"
import { invalidInput } from "../server/errors"
import { find } from "../server/find"
import type { ResourceRoutes } from "./handler"

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

export const searchRoutes: ResourceRoutes = {
  GET: {
    params: 0,
    async handle({ db, identity, request }) {
      const parsed = searchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
      if (!parsed.success) throw invalidInput(parsed.error)
      const output = await find(db, identity, { query: parsed.data.q }, { functions: [], activeConnectors: new Set<string>() })
      return { status: 200, data: { matches: correspondances(output.data), more: typeof output.data?.more_nodes === "number" ? output.data.more_nodes : 0 } }
    },
  },
}
