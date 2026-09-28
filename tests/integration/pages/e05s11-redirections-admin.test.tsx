// Les écrans d'administration retirés (E05-S11, AC-25) : `/admin/marque` et `/admin/drapeaux` mènent à
// « Organisation », `/admin/acces` à « Équipes & accès » (E05-S13, AC-5 : l'onglet des accès retiré), par une redirection
// permanente (308) : le vrai `permanentRedirect` de Next, dont l'erreur porte l'adresse et le statut que le
// serveur renvoie. La campagne (`tests/e2e/admin-config.spec.ts`) lit le 308 sur le serveur.
import { describe, expect, it } from "vitest"
import AccesPage from "@/app/(dashboard)/admin/acces/page"
import DrapeauxPage from "@/app/(dashboard)/admin/drapeaux/page"
import MarquePage from "@/app/(dashboard)/admin/marque/page"

/** L'adresse et le statut d'une redirection de Next, lus dans son `digest` (`NEXT_REDIRECT;<type>;<adresse>;<statut>;`). */
function redirection(page: () => unknown): { adresse: string; statut: string } {
  try {
    page()
  } catch (erreur) {
    // Ce qu'un `catch` reçoit est `unknown` : la redirection de Next y porte un `digest`, lu sans en supposer la présence.
    const digest = String((erreur as { digest?: unknown }).digest ?? "")
    const [code, , adresse, statut] = digest.split(";")
    if (code === "NEXT_REDIRECT") return { adresse, statut }
    throw erreur
  }
  throw new Error("the page rendered instead of redirecting")
}

describe("removed administration pages (E05-S11, AC-25)", () => {
  it.each([
    ["/admin/marque", "/admin/organisation", MarquePage],
    ["/admin/drapeaux", "/admin/organisation", DrapeauxPage],
    // E05-S13 (AC-5) : l'onglet « Accès plateforme » retiré, l'ancienne adresse mène à « Équipes & accès ».
    ["/admin/acces", "/equipes", AccesPage],
  ])("should redirect %s permanently (308) to %s", (_ancienne, adresse, page) => {
    expect(redirection(page)).toEqual({ adresse, statut: "308" })
  })
})
