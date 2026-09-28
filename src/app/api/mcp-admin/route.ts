// Fonctions de l'ERP au catalogue (H108) : chaque route qui monte une porte du paquet les inscrit, un bundle chacune.
import "@/lib/fonctions-metier"
import { after } from "next/server"
import { handleAdminMcp, makeVerifyToken, mcpMethodNotAllowed } from "@otomata_tech/oto_platform/mcp"

// MCP admin de l'équipe plateforme (H105, E08-S02) : route statique, sans état (ADR-009). Le paquet
// vérifie le jeton, exige l'équipe plateforme (401 sinon, sans rien annoncer) et journalise à part
// après la réponse (`after`). `/api` est public dans le middleware : cette route porte sa propre auth.
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Ne lit rien à la construction : la JWKS et l'émetteur se lisent au premier jeton.
const verifyToken = makeVerifyToken()

export function POST(request: Request): Promise<Response> {
  return handleAdminMcp(request, { verifyToken, defer: (task) => after(task) })
}

export function GET(): Response {
  return mcpMethodNotAllowed()
}

export function DELETE(): Response {
  return mcpMethodNotAllowed()
}
