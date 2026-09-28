// @vitest-environment node
// L'hôte et l'origine d'une requête, sans base. La résolution de l'identité, qui lit la base, est prouvée
// sur une vraie base par `tests/integration/identity.test.ts` (E01-S10, partie e1a).
import { describe, expect, it } from "vitest"
import { normalizeHost, rawRequestHost, requestHost, requestOrigin } from "@otomata_tech/oto_platform/server"

describe("normalizeHost", () => {
  it("should lower-case the host and drop the port", () => {
    expect(normalizeHost("Demo.LocalHost:3000")).toBe("demo.localhost")
  })

  it("should drop a trailing dot", () => {
    expect(normalizeHost("acme.oto.cx.")).toBe("acme.oto.cx")
  })

  it("should return null for an empty value", () => {
    expect(normalizeHost("")).toBeNull()
    expect(normalizeHost("   ")).toBeNull()
    expect(normalizeHost(null)).toBeNull()
  })

  it("should return null for an IPv6 literal", () => {
    expect(normalizeHost("[::1]:3000")).toBeNull()
  })
})

describe("requestHost", () => {
  it("should take the first x-forwarded-host element", () => {
    const headers = new Headers({ "x-forwarded-host": "Acme.oto.cx, proxy.internal", host: "localhost:3000" })
    expect(requestHost(headers)).toBe("acme.oto.cx")
    expect(rawRequestHost(headers)).toBe("Acme.oto.cx")
  })

  it("should fall back on host", () => {
    expect(requestHost(new Headers({ host: "demo.localhost:3000" }))).toBe("demo.localhost")
  })

  it("should return null without host", () => {
    expect(requestHost(new Headers())).toBeNull()
  })
})

describe("requestOrigin", () => {
  it("should prefer x-forwarded-proto and keep the port of the raw host", () => {
    expect(requestOrigin(new Headers({ "x-forwarded-proto": "https" }), "acme.oto.cx", "http")).toBe("https://acme.oto.cx")
    expect(requestOrigin(new Headers(), "localhost:3000", "http")).toBe("http://localhost:3000")
  })

  // Un proxy peut transmettre ce que le client envoie : le lien d'un email d'invitation ne porte jamais
  // un autre protocole (E01-S11 a2-wire, `security-patterns.md § XSS Prevention`).
  it.each(["javascript", "data", "ftp", "https://evil.example.test/?"])("should ignore an x-forwarded-proto of %s for the protocol given", (forwarded) => {
    expect(requestOrigin(new Headers({ "x-forwarded-proto": forwarded }), "acme.oto.cx", "https")).toBe("https://acme.oto.cx")
  })
})
