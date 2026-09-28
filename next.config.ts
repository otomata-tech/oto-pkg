import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Configuration minimale — personnaliser par projet
  // Le paquet est consommé en source TypeScript depuis le workspace : Next doit le transpiler.
  transpilePackages: ["@otomata_tech/oto_platform"],
  // Le « Segment Explorer » des outils de développement (Next 15.5, actif par défaut) : quand une
  // compilation croise un chargement, le client hydrate ses enveloppes avec une branche de moins que le
  // serveur, et tout `useId` de la page change (« attributes didn't match » : contrôle visuel d'E05-S02,
  // un thème sur deux). Développement seulement : la production ne rend pas ces enveloppes.
  experimental: { devtoolSegmentExplorer: false },
  // Une page retirée garde son adresse par une redirection permanente, jamais une 404 sur un favori
  // (`seo-patterns.md § Règles SEO`) : la page d'invitation d'E02-S01 est devenue l'onglet « Membres »
  // de `/equipes` (E05-S03).
  async redirects() {
    return [{ source: "/plateforme/invitations", destination: "/equipes", permanent: true }]
  },
  // ADR à rouvrir le jour où une vue s'intègre en cadre chez un client (E09).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
