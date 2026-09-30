// @vitest-environment node
// L'image de partage d'une adresse (E11-S21) : le dessin (`ImageDePartage`), ses couleurs confrontées à `oto.css`,
// les métadonnées de partage, et les deux routes d'image de l'hôte, rendues en vrai PNG par `ImageResponse` (le moteur
// de Next, sous Node) : la couleur se lit dans les pixels, jamais dans un style.
import { headers } from "next/headers"
import { renderToStaticMarkup } from "react-dom/server"
import fs from "fs"
import path from "path"
import { inflateSync } from "zlib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OTO_THEMES, type ShareImageData } from "@otomata_tech/oto_platform/schemas"
import { shareImageData } from "@otomata_tech/oto_platform/server"
import { ImageDePartage, metadonneesDePartage, TAILLE_DE_PARTAGE } from "@otomata_tech/oto_platform/ui"
import ImageDeLOrganisation from "@/app/opengraph-image"
import { GET as imageDuLien } from "@/app/p/[jeton]/share-image/[[...chemin]]/route"
import { COULEURS_DE_L_IMAGE } from "../../../packages/plateforme/ui/public/image-de-partage"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

vi.mock("@otomata_tech/oto_platform/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@otomata_tech/oto_platform/server")>()),
  shareImageData: vi.fn(),
}))

const HOTE = "demo.oto.test"
const JETON = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"
const RESUME_LONG =
  "Les prix publics de l'année, par gamme et par volume, avec les remises accordées aux revendeurs agréés et les conditions de livraison franco à partir de cinq palettes commandées ensemble."

const FORET: ShareImageData = { org: { name: "Démo Forêt", theme: "foret", logo: null }, page: { title: "Tarifs 2026", summary: RESUME_LONG } }

const texte = (donnees: ShareImageData) => renderToStaticMarkup(<ImageDePartage donnees={donnees} />).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'")

afterEach(() => {
  vi.clearAllMocks()
})

/** Le pixel `(x, y)` d'un PNG 8 bits RGB ou RGBA non entrelacé, en `#rrggbb` : les cinq filtres de lignes défaits. */
function pixel(png: Buffer, x: number, y: number): string {
  let offset = 8
  let largeur = 0
  let canaux = 4
  const donnees: Buffer[] = []
  while (offset < png.length) {
    const longueur = png.readUInt32BE(offset)
    const type = png.toString("ascii", offset + 4, offset + 8)
    const corps = png.subarray(offset + 8, offset + 8 + longueur)
    if (type === "IHDR") {
      largeur = corps.readUInt32BE(0)
      canaux = corps[9] === 6 ? 4 : 3
    }
    if (type === "IDAT") donnees.push(corps)
    offset += longueur + 12
  }
  const brut = inflateSync(Buffer.concat(donnees))
  const pas = largeur * canaux
  let precedente = Buffer.alloc(pas)
  let ligne = Buffer.alloc(pas)
  for (let rang = 0; rang <= y; rang++) {
    const debut = rang * (pas + 1)
    const filtre = brut[debut]
    ligne = Buffer.alloc(pas)
    for (let i = 0; i < pas; i++) {
      const a = i >= canaux ? ligne[i - canaux] : 0
      const b = precedente[i]
      const c = i >= canaux ? precedente[i - canaux] : 0
      const p = a + b - c
      const predit = filtre === 1 ? a : filtre === 2 ? b : filtre === 3 ? Math.floor((a + b) / 2) : filtre === 4 ? (Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c) : 0
      ligne[i] = (brut[debut + 1 + i] + predit) & 0xff
    }
    precedente = ligne
  }
  return `#${[0, 1, 2].map((k) => ligne[x * canaux + k].toString(16).padStart(2, "0")).join("")}`
}

describe("ImageDePartage (AC-1)", () => {
  it("should draw the page title, its summary cut at a word, the organisation and its initial", () => {
    const lu = texte(FORET)

    expect(lu).toContain("Tarifs 2026")
    expect(lu).toContain("Démo Forêt")
    expect(lu).toContain(" D ")
    // Coupé au dernier mot entier avant 160 caractères, suivi de « … » ; la fin du résumé n'est pas dessinée.
    expect(lu).toContain("Les prix publics de l'année, par gamme et par volume")
    expect(lu).toMatch(/\p{L}…/u)
    expect(lu).not.toContain("palettes commandées ensemble")
  })

  it("should draw the organisation alone without a page, and « Oto » without an organisation", () => {
    expect(texte({ org: FORET.org, page: null }).split(/\s+/).filter(Boolean)).toEqual(["D", "Démo", "Forêt"])
    const oto = texte({ org: null, page: null })
    expect(oto).toContain("Oto")
    expect(oto).not.toContain("Démo")
  })

  it("should draw the logo read by the server instead of the initial", () => {
    const logo = "data:image/png;base64,iVBORw0KGgo="
    const html = renderToStaticMarkup(<ImageDePartage donnees={{ ...FORET, org: { name: "Démo Forêt", theme: "foret", logo } }} />)

    expect(html).toContain(`src="${logo}"`)
    expect(texte({ ...FORET, org: { name: "Démo Forêt", theme: "foret", logo } })).not.toContain(" D ")
  })
})

describe("colours of the share image (AC-2)", () => {
  it("should hold --primary, --primary-on and --base of each of the eight themes of oto.css", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../../packages/plateforme/ui/styles/oto.css"), "utf8")
    const jeton = (bloc: string, nom: string) => new RegExp(`--${nom}:\\s*(#[0-9a-f]{6})`).exec(bloc)?.[1]
    const lues = Object.fromEntries(
      OTO_THEMES.map((theme) => {
        const bloc = css.split(`.oto[data-oto-theme="${theme}"] {`)[1]?.split("}")[0] ?? ""
        return [theme, { primary: jeton(bloc, "primary"), primaryOn: jeton(bloc, "primary-on"), base: jeton(bloc, "base") }]
      }),
    )

    expect(COULEURS_DE_L_IMAGE).toEqual(lues)
  })
})

describe("share metadata (AC-6, AC-7)", () => {
  it("should give any address the organisation alone, on the request origin, as a large card", () => {
    expect(metadonneesDePartage({ organisation: "Démo", origine: `https://${HOTE}` })).toEqual({
      metadataBase: new URL(`https://${HOTE}`),
      openGraph: { type: "website", siteName: "Démo", title: "Démo", description: "Les pages, procédures et tableaux de Démo.", url: "/" },
      twitter: { card: "summary_large_image" },
    })
    // Sans organisation ni origine lisible : « Oto », sans `metadataBase`.
    expect(metadonneesDePartage({ organisation: null, origine: "javascript:alert(1)" })).toEqual({
      openGraph: { type: "website", siteName: "Oto", title: "Oto", url: "/" },
      twitter: { card: "summary_large_image" },
    })
  })

  it("should give a public link its title, its cut summary, its address and its image with size and text", () => {
    const page = { titre: "Tarifs 2026", resume: "", adresse: `/p/${JETON}`, image: `/p/${JETON}/share-image?v=3` }

    expect(metadonneesDePartage({ organisation: "Démo", page })).toEqual({
      openGraph: {
        type: "article",
        siteName: "Démo",
        title: "Tarifs 2026",
        description: "Partagé par Démo.",
        url: `/p/${JETON}`,
        images: [{ url: `/p/${JETON}/share-image?v=3`, width: 1200, height: 630, alt: "Tarifs 2026 — Démo" }],
      },
      twitter: { card: "summary_large_image" },
    })
    const coupe = metadonneesDePartage({ organisation: "Démo", page: { ...page, resume: RESUME_LONG.repeat(2) } }).openGraph?.description
    expect(coupe).toMatch(/…$/)
    expect(Array.from(coupe ?? "").length).toBeLessThanOrEqual(200)
  })
})

describe("share image routes of the host (AC-5, AC-10)", () => {
  it("should draw the organisation of the address alone at /opengraph-image, a PNG in its colour", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ host: HOTE }))
    vi.mocked(shareImageData).mockResolvedValue({ org: FORET.org, page: null })

    const reponse = await ImageDeLOrganisation()

    // L'adresse seule : aucun lien, donc aucune page lue (HN-E11S21-2).
    expect(vi.mocked(shareImageData).mock.calls).toEqual([[HOTE]])
    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("content-type")).toBe("image/png")
    expect(reponse.headers.get("cache-control")).toBe("public, max-age=3600")
    const png = Buffer.from(await reponse.arrayBuffer())
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([TAILLE_DE_PARTAGE.width, TAILLE_DE_PARTAGE.height])
    // Le filet à gauche est à la couleur du thème ; le fond est celui du thème.
    expect(pixel(png, 4, 20)).toBe(COULEURS_DE_L_IMAGE.foret.primary)
    expect(pixel(png, 600, 20)).toBe(COULEURS_DE_L_IMAGE.foret.base)
  })

  it("should draw a public link by its token and path, without a shared cache", async () => {
    vi.mocked(shareImageData).mockResolvedValue({ org: { name: "Démo", theme: "violet", logo: null }, page: { title: "Remises", summary: "Les remises de l'année." } })

    const reponse = await imageDuLien(new Request(`https://${HOTE}/p/${JETON}/share-image/ventes/tarifs/remises?v=4`, { headers: { host: HOTE } }), {
      params: Promise.resolve({ jeton: JETON, chemin: ["ventes", "tarifs", "remises"] }),
    })

    expect(vi.mocked(shareImageData).mock.calls).toEqual([[HOTE, { token: JETON, path: "ventes/tarifs/remises" }]])
    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("content-type")).toBe("image/png")
    expect(reponse.headers.get("cache-control")).toBe("private, max-age=300")
    expect(pixel(Buffer.from(await reponse.arrayBuffer()), 4, 600)).toBe(COULEURS_DE_L_IMAGE.violet.primary)
  })
})
