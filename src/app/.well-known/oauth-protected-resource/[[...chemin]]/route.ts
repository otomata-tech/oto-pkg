import { handleResourceMetadata, metadataOptions } from "@otomata_tech/oto_platform/mcp"

// Métadonnées RFC 9728 (E02-S02) : racine, formes suffixées `/api/mcp` et `/api/mcp-admin`. Le
// paquet lit l'adresse appelée et son organisation ; `/.well-known` est public dans le middleware.
// Par requête : l'organisation et l'origine changent d'une adresse à l'autre.
export const dynamic = "force-dynamic"

export function GET(request: Request): Promise<Response> {
  return handleResourceMetadata(request)
}

export const OPTIONS = metadataOptions
