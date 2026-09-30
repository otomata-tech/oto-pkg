import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PlateformeHome } from "@otomata_tech/oto_platform/ui"
import { getPlatformSession } from "@/lib/plateforme/session"

export const metadata: Metadata = {
  title: "Plateforme",
  robots: { index: false },
}

// La session est celle de l'hôte, Supabase ou OIDC (E01-S11 b, AC-b6).
export default async function PlateformePage() {
  const session = await getPlatformSession()
  if (!session) redirect("/login")

  return <PlateformeHome />
}
