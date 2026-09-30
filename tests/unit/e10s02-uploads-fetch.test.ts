// @vitest-environment node
// Le téléchargement d'une adresse fournie (E10-S02 lot f : AC-f12 à AC-f14 ; ADR-018 § 7), sans réseau : la résolution
// et la requête sont remplacées. Un cas par règle d'AC-f13 : schéma, port, adresse IP littérale, résolution doublée (un
// nom qui rend une adresse publique et une privée ; un nom qui change entre deux requêtes de la chaîne), redirections
// contrôlées et bornées à 3, délai, taille annoncée et lue. Chaque refus d'adresse part avant toute requête vers elle.
import type { LookupAddress } from "node:dns"
import { describe, expect, it } from "vitest"
import { UPLOAD_BYTES_MAX } from "../../packages/plateforme/schemas"
import { fetchSource, isPublicAddress, SOURCE_FAILURES, textSourceFailure, type Resolve, type SourceGet } from "../../packages/plateforme/server/uploads-fetch"

type Reply = { status?: number; location?: string; length?: number; type?: string; chunks?: Uint8Array[]; hang?: boolean }

/** Un faux réseau : chaque requête résout son hôte par le `lookup` de la connexion, puis rend la réponse de son adresse. */
function network(replies: Record<string, Reply>): { get: SourceGet; requested: string[]; read: () => number } {
  const requested: string[] = []
  let read = 0
  const get: SourceGet = (url, lookup, signal) =>
    new Promise((resolve, reject) => {
      lookup(url.hostname, { all: true }, (error) => {
        if (error) return reject(error)
        requested.push(url.href)
        const reply = replies[url.href] ?? { status: 404 }
        if (reply.hang) {
          signal.addEventListener("abort", () => reject(signal.reason))
          return
        }
        const chunks = reply.chunks ?? []
        async function* body() {
          for (const chunk of chunks) {
            read += chunk.byteLength
            yield chunk
          }
        }
        resolve({ status: reply.status ?? 200, location: reply.location ?? null, length: reply.length ?? null, type: reply.type ?? null, body: body(), discard: () => undefined })
      })
    })
  return { get, requested, read: () => read }
}

const PUBLIC: LookupAddress = { address: "93.184.216.34", family: 4 }

/** Un résolveur qui rend, pour chaque nom, la suite de ses réponses, une par résolution (la dernière ensuite). */
function dns(answers: Record<string, LookupAddress[][]>): Resolve {
  const seen = new Map<string, number>()
  return async (hostname) => {
    const rank = seen.get(hostname) ?? 0
    seen.set(hostname, rank + 1)
    const list = answers[hostname] ?? [[]]
    return list[Math.min(rank, list.length - 1)]
  }
}

const bytes = (text: string) => new TextEncoder().encode(text)

describe("addresses a source_url never reaches (AC-f13)", () => {
  it.each([
    ["93.184.216.34", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.1.1", false],
    ["100.100.100.200", false],
    ["169.254.169.254", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["::", false],
    ["fe80::1", false],
    ["fd00:ec2::254", false],
    ["::ffff:127.0.0.1", false],
    ["64:ff9b::7f00:1", false],
    ["2002:7f00:1::", false],
    // IPv4 compatible (::/96) et NAT64 local (64:ff9b:1::/48), refusés entiers ; leurs voisines hors des plages passent.
    ["::7f00:1", false],
    ["::a9fe:a9fe", false],
    ["64:ff9b:1::a9fe:a9fe", false],
    ["64:ff9b:1:ffff::1", false],
    ["::1:0:0:1", true],
    ["64:ff9b:2::1", true],
    ["not-an-address", false],
  ])("should say %s is public: %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected)
  })
})

describe("download of a source_url (AC-f12, AC-f13)", () => {
  it("should refuse a scheme other than https and a port other than 443, before any request", async () => {
    const net = network({})
    const resolve = dns({ "files.example.org": [[PUBLIC]] })
    expect([
      await fetchSource("http://files.example.org/r.md", { resolve, get: net.get }),
      await fetchSource("https://files.example.org:8443/r.md", { resolve, get: net.get }),
      await fetchSource("not an address", { resolve, get: net.get }),
    ]).toEqual([{ failure: SOURCE_FAILURES.scheme }, { failure: SOURCE_FAILURES.port }, { failure: SOURCE_FAILURES.unreadable }])
    expect(net.requested).toEqual([])
  })

  it("should refuse a private, loopback, link-local or metadata address written in the URL, before any request", async () => {
    const net = network({})
    const urls = ["https://127.0.0.1/r.md", "https://[::1]/r.md", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/r.md", "https://[fd00:ec2::254]/", "https://[::ffff:127.0.0.1]/"]
    const outcomes = await Promise.all(urls.map((url) => fetchSource(url, { resolve: dns({}), get: net.get })))
    expect(outcomes).toEqual(urls.map(() => ({ failure: SOURCE_FAILURES.address })))
    expect(net.requested).toEqual([])
  })

  it("should refuse a name that resolves to a public and a private address, the connection never made", async () => {
    const net = network({ "https://double.example.org/r.md": { chunks: [bytes("# R")] } })
    const resolve = dns({ "double.example.org": [[PUBLIC, { address: "10.0.0.1", family: 4 }]] })
    expect(await fetchSource("https://double.example.org/r.md", { resolve, get: net.get })).toEqual({ failure: SOURCE_FAILURES.address })
    expect(net.requested).toEqual([])
  })

  it("should resolve again at each redirect: a name that turns private on the second request is refused there", async () => {
    const net = network({
      "https://rebind.example.org/a": { status: 302, location: "/b" },
      "https://rebind.example.org/b": { chunks: [bytes("secret")] },
    })
    const resolve = dns({ "rebind.example.org": [[PUBLIC], [{ address: "127.0.0.1", family: 4 }]] })
    expect(await fetchSource("https://rebind.example.org/a", { resolve, get: net.get })).toEqual({ failure: SOURCE_FAILURES.address })
    expect(net.requested).toEqual(["https://rebind.example.org/a"])
  })

  it("should check each redirect like the first address, and follow 3 redirects at most", async () => {
    const resolve = dns({ "files.example.org": [[PUBLIC]] })
    const chain = (hops: number, last: Reply): Record<string, Reply> =>
      Object.fromEntries([...Array.from({ length: hops }, (_, rank) => [`https://files.example.org/${rank}`, { status: 301, location: `/${rank + 1}` }]), [`https://files.example.org/${hops}`, last]])
    const toHttp = network({ "https://files.example.org/0": { status: 307, location: "http://files.example.org/1" } })
    const three = network(chain(3, { chunks: [bytes("ok")] }))
    const four = network(chain(4, { chunks: [bytes("ok")] }))
    expect({
      toHttp: await fetchSource("https://files.example.org/0", { resolve, get: toHttp.get }),
      three: await fetchSource("https://files.example.org/0", { resolve, get: three.get }),
      four: await fetchSource("https://files.example.org/0", { resolve, get: four.get }),
    }).toEqual({ toHttp: { failure: SOURCE_FAILURES.scheme }, three: { bytes: bytes("ok"), type: null }, four: { failure: SOURCE_FAILURES.redirects } })
    expect(four.requested).toHaveLength(4)
  })

  it("should stop at the time limit, refuse more than 1 MB announced or read, and name another status", async () => {
    const resolve = dns({ "files.example.org": [[PUBLIC]] })
    const big = new Uint8Array(UPLOAD_BYTES_MAX / 4)
    const net = network({
      "https://files.example.org/slow": { hang: true },
      "https://files.example.org/announced": { length: UPLOAD_BYTES_MAX + 1, chunks: [big] },
      "https://files.example.org/streamed": { chunks: [big, big, big, big, big, big] },
      "https://files.example.org/gone": { status: 404 },
      "https://files.example.org/r.md": { type: "text/markdown; charset=utf-8", chunks: [bytes("# Rapport\n"), bytes("Texte.")] },
    })
    const download = (path: string) => fetchSource(`https://files.example.org/${path}`, { resolve, get: net.get, timeoutMs: 50 })
    expect({
      slow: await download("slow"),
      announced: await download("announced"),
      streamed: await download("streamed"),
      gone: await download("gone"),
      served: await download("r.md"),
    }).toEqual({
      slow: { failure: SOURCE_FAILURES.timeout },
      announced: { failure: SOURCE_FAILURES.tooLarge },
      streamed: { failure: SOURCE_FAILURES.tooLarge },
      gone: { failure: "source_url answered 404" },
      served: { bytes: bytes("# Rapport\nTexte."), type: "text/markdown; charset=utf-8" },
    })
    // Refusée à sa taille annoncée, la réponse n'est pas lue ; lue, elle s'arrête au morceau qui passe 1 Mo.
    expect(net.read()).toBe(5 * big.byteLength + bytes("# Rapport\nTexte.").byteLength)
  })
})

describe("the type a markdown file or a CSV is downloaded under (FB-0014, HN-E10S02-118)", () => {
  it.each([
    ["text/markdown; charset=utf-8", null],
    ["text/plain", null],
    ["TEXT/CSV", null],
    ["application/octet-stream", null],
    [null, null],
    ["text/html; charset=UTF-8", "source_url serves text/html, not a text file: a markdown file or a CSV is read from text/markdown, text/plain or text/csv"],
    ["application/json", "source_url serves application/json, not a text file: a markdown file or a CSV is read from text/markdown, text/plain or text/csv"],
  ])("should read %s as: %s", (type, failure) => {
    expect(textSourceFailure(type)).toBe(failure)
  })
})
