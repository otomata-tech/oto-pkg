// Métadonnées RFC 9728 des ressources protégées (E02-S02, H20, ADR-004 § 3) : l'adresse que désigne
// le 401 d'E03-S01 (`resource_metadata`). Sans elles, ce 401 désigne une adresse vide et aucun host
// ne découvre le serveur d'autorisation de l'hôte (Supabase Auth, ou l'émetteur OIDC configuré,
// E01-S11) : la connexion OAuth ne démarre jamais.
//
// Repris du banc E03 (`mcp-test/src/auth-test/http.ts` l. 17-31 et 158-194) : chemins servis, 404
// pour une adresse sans organisation ou une autre ressource, CORS. Retiré : `https://` forcé
// (→ `getPublicOrigin`), le journal des lectures, `resource_documentation` vers les autorisations du
// banc (→ `/connect`, E02-S04).
// Repris du starter MCP du gabarit : `generateProtectedResourceMetadata`, CORS, `OPTIONS` ;
// retiré : l'adresse fixe de la ressource (→ origine de chaque requête) et ses scopes (→ ceux du banc). La troisième forme d'URL
// (`/api/mcp/.well-known/…`) n'est pas servie : aucun des trois hosts ne la lit (banc E03, preuve 5).
import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { createAnonPlatformDb } from "../server/db"
import { isPlatformError } from "../server/errors"
import { requestHost, resolveOrg, type IdentityOrg } from "../server/identity"
import { issuerConfig } from "../server/issuer"
import { MCP_ADMIN_RESOURCE_PATH, MCP_RESOURCE_PATH } from "../server/oauth"

const METADATA_ROOT = "/.well-known/oauth-protected-resource"
/** Scopes standard d'OpenID Connect, ceux de Supabase Auth comme d'un émetteur OIDC ; aucun n'ouvre de droit ici, l'appartenance fait tout (ADR-004). */
const SCOPES_SUPPORTED = ["openid", "email", "profile", "offline_access"]
const CORS = { "Access-Control-Allow-Origin": "*" }
const SERVICE_UNAVAILABLE = "Service unavailable. Retry in a moment."

/**
 * Forme d'URL lue → ressource décrite. La racine et la forme suffixée `/api/mcp` décrivent le MCP de
 * l'organisation de l'adresse ; `/api/mcp-admin` décrit le MCP admin, dont l'organisation est un
 * argument et pas l'adresse (H105) : il est servi sur toute adresse.
 */
const RESOURCE_OF_PATH = new Map([
  [METADATA_ROOT, MCP_RESOURCE_PATH],
  [`${METADATA_ROOT}${MCP_RESOURCE_PATH}`, MCP_RESOURCE_PATH],
  [`${METADATA_ROOT}${MCP_ADMIN_RESOURCE_PATH}`, MCP_ADMIN_RESOURCE_PATH],
])

type MetadataDeps = {
  /** Organisation servie à cet hôte normalisé, ou `null` ; lève sur une panne. */
  findOrg: (host: string) => Promise<{ id: string } | null>
}

/** `org_by_host`, seule fonction exécutable par `anon` (E02-S01) : aucune session ici. */
async function findOrgByHost(host: string): Promise<IdentityOrg | null> {
  try {
    return await resolveOrg(createAnonPlatformDb(), host)
  } catch (error) {
    if (isPlatformError(error) && error.code === "unknown_org") return null
    throw error
  }
}

function refusal(status: number, code: "not_found" | "unknown_org" | "internal", message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: CORS })
}

function metadata(issuer: string, origin: string, resourcePath: string): Response {
  const isAdmin = resourcePath === MCP_ADMIN_RESOURCE_PATH
  const body = generateProtectedResourceMetadata({
    authServerUrls: [issuer],
    resourceUrl: `${origin}${resourcePath}`,
    additionalMetadata: {
      scopes_supported: SCOPES_SUPPORTED,
      bearer_methods_supported: ["header"],
      // La page qui explique comment brancher son assistant (E02-S04) : celle de l'organisation.
      ...(isAdmin ? {} : { resource_documentation: `${origin}/connect` }),
    },
  })
  return Response.json(body, { headers: CORS })
}

/**
 * `GET /.well-known/oauth-protected-resource[/api/mcp | /api/mcp-admin]`. `resource` part de
 * l'origine appelée, lue comme `withMcpAuth` la lit pour le 401 (`getPublicOrigin` : en-têtes
 * `X-Forwarded-*`, `Forwarded`, sinon l'URL) ; l'organisation vient de l'hôte normalisé. Autre
 * chemin : 404 `not_found` ; adresse sans organisation : 404 `unknown_org` ; panne : 503 `internal`.
 */
export async function handleResourceMetadata(
  request: Request,
  deps: MetadataDeps = { findOrg: findOrgByHost },
): Promise<Response> {
  const path = new URL(request.url).pathname
  const resourcePath = RESOURCE_OF_PATH.get(path)
  if (!resourcePath) return refusal(404, "not_found", `No protected resource at ${path}.`)

  if (resourcePath === MCP_RESOURCE_PATH) {
    const host = requestHost(request.headers)
    if (!host) return refusal(404, "unknown_org", "No organisation is served at this address.")
    let org: { id: string } | null
    try {
      org = await deps.findOrg(host)
    } catch (error) {
      console.error("[platform] metadata: organisation unavailable", error)
      return refusal(503, "internal", SERVICE_UNAVAILABLE)
    }
    if (!org) return refusal(404, "unknown_org", `No organisation is served at ${host}.`)
  }

  // Lu à l'appel, jamais à l'import : `pnpm build` passe sans variable (E03-S01, AC1). Le serveur
  // d'autorisation est l'émetteur de l'hôte : Supabase Auth, ou `PLATFORM_OIDC_ISSUER` (E01-S11, AC-a9).
  let issuer: string
  try {
    issuer = issuerConfig().issuer
  } catch (error) {
    console.error(`[platform] metadata: ${error instanceof Error ? error.message : "issuer unavailable"}, no authorization server to announce`)
    return refusal(503, "internal", SERVICE_UNAVAILABLE)
  }
  return metadata(issuer, getPublicOrigin(request), resourcePath)
}

/** `OPTIONS` : préflight CORS des clients qui lisent les métadonnées depuis un navigateur. */
export const metadataOptions = metadataCorsOptionsRequestHandler()
