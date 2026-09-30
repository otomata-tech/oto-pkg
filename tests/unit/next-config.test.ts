// @vitest-environment node
// En-têtes de sécurité de l'hôte (E02-S02, AC20) : `/oauth/consent` ne s'affiche jamais dans un cadre.
// Un site tiers ne peut pas faire cliquer « Autoriser » à l'insu de la personne (RFC 6749 § 10.13).
// E10-S02 (AC-c3, ADR-017 § 1) : les deux routes isolées d'un fichier HTML, chargées dans l'iframe de la visionneuse,
// sont seules exclues de `X-Frame-Options` et de la `Referrer-Policy` globale ; `nosniff` vaut partout. Les sources
// se lisent par le `path-to-regexp` de Next, celui qui les applique.
import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

// Le `path-to-regexp` que Next compile pour appliquer `headers()`, publié sans types : sa seule fonction lue ici.
// Chemin interne de Next, à suivre à chaque montée de version.
const { pathToRegexp }: { pathToRegexp: (source: string, keys: unknown[], options: object) => RegExp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp")

const FICHIER = "0c9e8d7f-6a5b-4c3d-8e2f-1a0b9c8d7e6f"
const JETON = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"

/** Les en-têtes que l'hôte pose sur un chemin : ceux de chaque règle dont la source le couvre. */
async function entetesDe(chemin: string): Promise<Record<string, string>> {
  const regles = (await nextConfig.headers?.()) ?? []
  const couvrantes = regles.filter((regle) => pathToRegexp(regle.source, [], {}).test(chemin))
  return Object.fromEntries(couvrantes.flatMap((regle) => regle.headers.map((entete) => [entete.key, entete.value])))
}

describe("next.config.ts headers (AC20)", () => {
  it("should deny framing on every path, the consent page included", async () => {
    for (const chemin of ["/oauth/consent", "/n/ventes", `/api/plateforme/files/${FICHIER}`, `/api/plateforme/files/${FICHIER}/markdown`, `/p/${JETON}`]) {
      expect(await entetesDe(chemin)).toEqual({
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      })
    }
  })

  it("should leave out X-Frame-Options and the global Referrer-Policy on the two isolated HTML routes only (E10-S02, AC-c3)", async () => {
    for (const chemin of [`/api/plateforme/files/${FICHIER}/html`, `/api/plateforme/public/${JETON}/files/${FICHIER}/html`]) {
      expect(await entetesDe(chemin)).toEqual({ "X-Content-Type-Options": "nosniff", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" })
    }
    expect(Object.keys(await entetesDe(`/api/plateforme/files/${FICHIER}/html/suite`))).toContain("X-Frame-Options")
  })
})

// Les redirections de l'hôte (`seo-patterns.md § Règles SEO`) : un favori d'une page retirée mène à
// celle qui la remplace, jamais à une 404.
describe("next.config redirects", () => {
  it("should send the invitation page removed by E05-S03 to /equipes, permanently", async () => {
    const redirections = (await nextConfig.redirects?.()) ?? []
    expect(redirections).toContainEqual({ source: "/plateforme/invitations", destination: "/equipes", permanent: true })
  })
})
