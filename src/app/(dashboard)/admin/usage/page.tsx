import { notFound } from "next/navigation"

// « Usage des assistants » (E08-S09), caché pour l'instant (E05-S13, AC-8, HN-E05S13-6, fiche D128) : la page rend
// `notFound()` à tous, sans rien lire, et le layout ne donne plus son adresse au rail (menu, palette, fil). L'écran
// (`EcranUsage`) et le service (`usageSummary`) du paquet restent tels quels ; la page d'E08-S09 se reprend de
// l'historique (`git show 829dcfb:"src/app/(dashboard)/admin/usage/page.tsx"`) quand l'écran reviendra (V1.1).
export default function UsagePage(): never {
  notFound()
}
