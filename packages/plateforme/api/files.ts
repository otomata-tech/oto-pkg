// Ressource `files` de l'API du paquet (E10-S02 lot a, ADR-016 § 4, § 5) : `GET files` (l'état du stockage,
// AC-a7), `POST files` (la demande d'envoi, AC-a3), `POST files/<id>/complete` (la confirmation, AC-a4) et
// `GET files/<id>` (la lecture par redirection 302 vers une URL présignée de 60 s, AC-a5 ; sur `?check`, la
// disponibilité en JSON, sans redirection, AC-b8). Adaptateur mince : droits, limites et stockage sont décidés dans
// `server/files/service.ts`. Les lectures n'écrivent aucune ligne de journal ; la demande et la confirmation portent
// le chemin du nœud. Sans elle, l'écran n'a pas de porte pour déposer ni lire un fichier.
import { fileRequestSchema } from "../schemas"
import { completeFileUpload, fileAvailability, fileReadUrl, fileStorageState, requestFileUpload } from "../server/files/service"
import { fileMarkdown } from "../server/files/view"
import type { ResourceRoutes } from "./handler"

export const filesRoutes: ResourceRoutes = {
  GET: [
    {
      params: 0,
      async handle() {
        return { status: 200, data: fileStorageState() }
      },
    },
    {
      params: 1,
      async handle({ db, identity, params, request }) {
        const query = new URL(request.url).searchParams
        // La carte d'un fichier demande s'il est servi : une réponse JSON, jamais la redirection (HN-E10S02-43).
        if (query.has("check")) return { status: 200, data: await fileAvailability(db, identity, params[0]) }
        const url = await fileReadUrl(db, identity, params[0], Object.fromEntries(query))
        return { status: 302, data: null, redirect: url }
      },
    },
    // E10-S02 (lot c, AC-c2) : les blocs d'un `.md`, lus en mode tolérant. `files/<id>/html` n'arrive pas ici : la route
    // isolée est servie avant la table (`files-html.ts`).
    {
      params: 2,
      fixed: { 1: "markdown" },
      async handle({ db, identity, params }) {
        return { status: 200, data: await fileMarkdown(db, identity, params[0]) }
      },
    },
  ],
  POST: [
    {
      params: 0,
      // Refus : le nœud demandé, s'il est bien formé ; envoi demandé : son chemin courant, rendu par le service (H07).
      target: ({ body }) => {
        const parsed = fileRequestSchema.safeParse(body)
        return parsed.success ? parsed.data.node : null
      },
      async handle({ db, identity, body }) {
        const { data, target, teamId } = await requestFileUpload(db, identity, body)
        return { status: 201, data, journal: { target, teamId } }
      },
    },
    {
      params: 2,
      fixed: { 1: "complete" },
      // L'identifiant est dans l'adresse ; le corps, du JSON comme tout `POST` de la porte (`{}`), n'est pas lu.
      async handle({ db, identity, params }) {
        const { data, target, teamId } = await completeFileUpload(db, identity, params[0])
        return { status: 200, data, journal: { target, teamId } }
      },
    },
  ],
}
