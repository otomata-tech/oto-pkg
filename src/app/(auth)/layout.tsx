import type { Metadata } from "next"

// Le `noindex` des pages d'auth (seo-patterns.md § Règles SEO) est posé ici, pour tout le groupe. La
// mise en page n'y est plus : chaque page pose sa racine `.oto` et monte le gabarit
// `EcranDAuthentification` (E05-S07), comme `/auth/confirm` et `/no-organization`, hors du
// groupe.
export const metadata: Metadata = {
  robots: { index: false },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
