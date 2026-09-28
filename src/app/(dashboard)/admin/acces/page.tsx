import { permanentRedirect } from "next/navigation"

// L'ancienne adresse des accès de l'équipe plateforme mène pour de bon (308) à « Équipes & accès » (E05-S11,
// AC-25) ; l'onglet « Accès plateforme » en est retiré (E05-S13, AC-5, fiche D127 c : la console Oto les gère).
// Aucun `loading.tsx` : sous un `<Suspense>`, la redirection partirait après l'envoi de la page, en 200.
export default function AccesPage() {
  permanentRedirect("/equipes")
}
