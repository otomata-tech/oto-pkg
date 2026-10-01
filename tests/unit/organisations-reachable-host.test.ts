import { describe, expect, it } from "vitest"
import { reachableHost } from "../../packages/plateforme/server/organisations"

// L'adresse d'une organisation où mène la bascule du rail : celle que la personne peut joindre depuis l'adresse de sa
// requête. Une organisation servie à une adresse de développement et à une adresse publique ne doit pas envoyer une
// personne venue du public vers `*.localhost`, première par ordre alphabétique.

const HOSTS = ["demo.localhost", "demo.oto.test", "localhost", "oto-two.host.test"]

describe("reachableHost", () => {
  it("should prefer the address under the same parent domain as the request, port and case aside", () => {
    expect(reachableHost(HOSTS, "acme.oto.test")).toBe("demo.oto.test")
    expect(reachableHost(HOSTS, "OTO.test:3000")).toBe("demo.oto.test")
    expect(reachableHost(HOSTS, "acme.localhost:3000")).toBe("demo.localhost")
  })

  it("should put a development address last when nothing is close to the request, or without a request address", () => {
    expect(reachableHost(HOSTS, "elsewhere.example")).toBe("demo.oto.test")
    expect(reachableHost(HOSTS, null)).toBe("demo.oto.test")
    expect(reachableHost(["localhost", "demo.localhost"], "elsewhere.example")).toBe("demo.localhost")
  })

  it("should give nothing for an organisation without an address", () => {
    expect(reachableHost([], "acme.oto.test")).toBeNull()
  })
})
