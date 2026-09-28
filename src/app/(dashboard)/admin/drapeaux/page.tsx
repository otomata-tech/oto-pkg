import { permanentRedirect } from "next/navigation"

// Les drapeaux quittent l'écran (E05-S11, AC-25, HN-E05S11-21) ; le service, `PATCH admin/flags` et `admin_org`
// les gardent. L'ancienne adresse mène à « Organisation » pour de bon (308). Aucun `loading.tsx` : sous un
// `<Suspense>`, la redirection partirait après l'envoi de la page, en 200.
export default function DrapeauxPage() {
  permanentRedirect("/admin/organisation")
}
