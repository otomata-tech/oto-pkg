// Fonctions de l'ERP au catalogue (H108) : chaque route qui monte une porte du paquet les inscrit, un bundle chacune.
import "@/lib/fonctions-metier"
import { after } from "next/server"
import { handleMcpPost, makeVerifyToken, mcpMethodNotAllowed } from "@otomata_tech/oto_platform/mcp"

// MCP des utilisateurs (H06, E03-S01) : route statique, sans état (ADR-009). Le paquet vérifie le
// jeton, résout l'organisation par l'adresse appelée et journalise après la réponse (`after`).
// `/api` est public dans le middleware : cette route porte sa propre auth (401 sans jeton).
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Ne lit rien à la construction : la JWKS et l'émetteur se lisent au premier jeton (AC1).
const verifyToken = makeVerifyToken()

export function POST(request: Request): Promise<Response> {
  return handleMcpPost(request, { verifyToken, defer: (task) => after(task) })
}

export function GET(): Response {
  return mcpMethodNotAllowed()
}

export function DELETE(): Response {
  return mcpMethodNotAllowed()
}
