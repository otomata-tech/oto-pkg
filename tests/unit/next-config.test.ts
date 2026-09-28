// @vitest-environment node
// En-têtes de sécurité de l'hôte (E02-S02, AC20) : `/oauth/consent` ne s'affiche jamais dans un cadre.
// Un site tiers ne peut pas faire cliquer « Autoriser » à l'insu de la personne (RFC 6749 § 10.13).
import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

describe("next.config.ts headers (AC20)", () => {
  it("should deny framing on every path, the consent page included", async () => {
    const regles = (await nextConfig.headers?.()) ?? []
    const toutes = regles.find((regle) => regle.source === "/(.*)")

    expect(toutes?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
    expect(new RegExp(`^${toutes?.source}$`).test("/oauth/consent")).toBe(true)
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
