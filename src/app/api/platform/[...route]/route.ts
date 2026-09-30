// Fonctions de l'ERP au catalogue (H108) : chaque route qui monte une porte du paquet les inscrit, un bundle chacune.
import "@/lib/fonctions-metier"
import { after } from "next/server"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import { rawRequestHost } from "@otomata_tech/oto_platform/server"
import { getSessionAccessToken } from "@/lib/plateforme/session"

// API du paquet (H03, H06) : les écrans de `ui/` y envoient leurs mutations, même origine. L'hôte
// ne passe que le jeton de sa session (Supabase Auth, ou la session OIDC de l'hôte : E01-S11 b) et
// l'adresse ; `handlePlateforme` vérifie le jeton, l'origine et l'appartenance, et journalise après la
// réponse (`after`).
async function handle(request: Request): Promise<Response> {
  return handlePlateforme(request, {
    accessToken: await getSessionAccessToken(),
    host: rawRequestHost(request.headers),
    defer: (task) => after(task),
  })
}

export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
