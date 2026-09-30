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
  // ADR à rouvrir le jour où une vue s'intègre en cadre chez un client (E09).
  // E10-S02 (AC-c3, ADR-017 § 1) : la route isolée d'un fichier HTML, `/api/platform/files/<id>/html` et
  // `/api/platform/public/<jeton>/files/<id>/html`, se charge dans l'iframe de la visionneuse et pose elle-même sa
  // politique (`frame-ancestors 'self'`, `Referrer-Policy: no-referrer`) : ni `X-Frame-Options` ni la
  // `Referrer-Policy` globale ne s'y appliquent. Toute autre adresse les garde.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/((?!api/platform/(?:public/[^/]+/)?files/[^/]+/html/?$).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]
  },
}

export default nextConfig
