import { permanentRedirect } from "next/navigation"

// La marque se règle dans « Organisation » (E05-S11, AC-22, AC-25) : l'ancienne adresse y mène pour de bon
// (308), un favori compris. Aucun `loading.tsx` : sous un `<Suspense>`, la redirection partirait après
// l'envoi de la page, en 200.
export default function MarquePage() {
  permanentRedirect("/admin/organisation")
}
