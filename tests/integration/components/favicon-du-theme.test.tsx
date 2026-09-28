// La favicon au thème de l'organisation (M28) : couleurs lues sur la racine `.oto` (critère 1), dessin
// repris au changement de teinte ou de mode (2), rien de remplacé sans jeton (3) ; montage par le
// layout racine et icône statique de repli (4).
//
// Porté d'oto-frontend (`tests/integration/coque/favicon.test.tsx`), adapté : les jetons viennent d'une
// feuille qui reprend la forme du contrat d'`oto.css` (valeurs littérales de Cobalt et de Forêt : jsdom
// ne résout pas `var()`) ; la teinte change par `data-oto-theme` sur la racine, la nuit par la classe
// `.dark` de `<html>` (next-themes) ; la page porte déjà le `<link>` de l'icône statique, comme celle que
// rend Next. Retirés, hors critère : le test de la géométrie de la marque (tracé recopié de `.oto-marque`,
// `oto.css` § 4) et le cas sans lien en place (l'hôte rend toujours `icon.svg` : la branche qui crée le
// lien n'est pas exercée).
import { Children, isValidElement, type ReactNode } from "react"
import fs from "fs"
import path from "path"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FaviconDuTheme } from "@otomata_tech/oto_platform/ui"
import RootLayout from "@/app/layout"

// `next/font/google` n'existe qu'à la compilation de Next : le layout racine n'est lu ici que pour ce
// qu'il monte.
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter" }) }))

// Le primaire du gabarit de l'hôte sur `<html>`, puis deux teintes du jeu Oto, la nuit en dernier comme
// dans `oto.css`. Sans `data-oto-theme`, la racine n'a que le primaire hérité de l'hôte, sans encre : la
// feuille du paquet n'y est pas appliquée (jsdom ne fait pas hériter les propriétés personnalisées, la
// règle `.oto` écrit cet héritage).
const FEUILLE = `
:root { --primary: oklch(0.42 0.2 285) }
.oto { --primary: oklch(0.42 0.2 285) }
.oto[data-oto-theme="cobalt"] { --primary: #1a5fbf; --on-primary: #ffffff }
.oto[data-oto-theme="foret"] { --primary: #1f6b4a; --on-primary: #ffffff }
.dark .oto[data-oto-theme="cobalt"] { --primary: #71a9f5; --on-primary: #141210 }
`

const ICONE_STATIQUE = "/icon.svg"

const lien = () => document.querySelector<HTMLLinkElement>('link[rel="icon"]')

/** Le SVG de l'icône, décodé : les assertions portent sur son balisage. */
const svg = () => decodeURIComponent((lien()?.getAttribute("href") ?? "").replace("data:image/svg+xml,", ""))

/** L'icône statique que Next rend dans le `<head>` (`src/app/icon.svg`). */
function poserLIconeStatique(): void {
  const statique = document.createElement("link")
  statique.rel = "icon"
  statique.href = ICONE_STATIQUE
  document.head.append(statique)
}

/** La racine `.oto` d'une page (`CoquilleOto`), à la teinte donnée. */
function poserLaRacine(teinte?: string): HTMLElement {
  const racine = document.createElement("div")
  racine.className = "oto"
  if (teinte) racine.dataset.otoTheme = teinte
  document.body.append(racine)
  return racine
}

const feuille = document.createElement("style")
feuille.textContent = FEUILLE

beforeEach(() => {
  document.head.append(feuille)
  poserLIconeStatique()
})

afterEach(() => {
  cleanup()
  // `<head>` et `<html>` survivent au démontage de Testing Library.
  feuille.remove()
  document.querySelectorAll('link[rel="icon"], .oto').forEach((element) => element.remove())
  document.documentElement.classList.remove("dark")
})

describe("FaviconDuTheme", () => {
  it("should paint the square in the primary of the page's .oto root, not of a theme swatch inside it, and the mark in its ink", () => {
    // Une pastille de thème dans la racine, `.oto` imbriquée comme celles du formulaire de marque
    // (`/admin/marque`) : lue à la place de la racine, elle peindrait l'onglet en Forêt.
    const pastille = document.createElement("span")
    pastille.className = "oto"
    pastille.dataset.otoTheme = "foret"
    poserLaRacine("cobalt").append(pastille)

    render(<FaviconDuTheme />)

    expect(svg()).toMatch(/<rect [^>]*fill="#1a5fbf"/)
    expect(svg()).toMatch(/<circle [^>]*stroke="#ffffff"/)
    expect(lien()).toHaveAttribute("type", "image/svg+xml")
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
  })

  it("should draw again when the theme of the root changes", async () => {
    const racine = poserLaRacine("cobalt")
    render(<FaviconDuTheme />)

    racine.dataset.otoTheme = "foret"

    await waitFor(() => {
      expect(svg()).toMatch(/<rect [^>]*fill="#1f6b4a"/)
    })
  })

  it("should draw again when the host switches to night", async () => {
    poserLaRacine("cobalt")
    render(<FaviconDuTheme />)

    document.documentElement.classList.add("dark")

    await waitFor(() => {
      expect(svg()).toMatch(/<rect [^>]*fill="#71a9f5"/)
    })
    expect(svg()).toMatch(/<circle [^>]*stroke="#141210"/)
  })

  it.each([
    // Une racine sans teinte : le primaire hérité de l'hôte, sans encre.
    { jeton: "--on-primary", poser: () => poserLaRacine() },
    // Un hôte sans la feuille du paquet, qui déclare l'encre seule : un `fill` vide peindrait en noir.
    {
      jeton: "--primary",
      poser: () => {
        feuille.remove()
        poserLaRacine().style.setProperty("--on-primary", "#ffffff")
      },
    },
  ])("should leave the static icon in place when the $jeton token of the root is empty", ({ poser }) => {
    poser()

    render(<FaviconDuTheme />)

    expect(lien()).toHaveAttribute("href", ICONE_STATIQUE)
  })

  it("should paint a root and an icon link that arrive after it is mounted", async () => {
    render(<FaviconDuTheme />)
    expect(lien()).toHaveAttribute("href", ICONE_STATIQUE)

    // Une navigation vers une page qui pose sa racine.
    poserLaRacine("cobalt")
    await waitFor(() => {
      expect(svg()).toMatch(/<rect [^>]*fill="#1a5fbf"/)
    })
    const dessin = lien()?.getAttribute("href")

    // Next ajoute son lien, à l'icône statique, après l'hydratation ; le premier reste (mesuré sur `/login`).
    poserLIconeStatique()
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('link[rel="icon"]'), (l) => l.getAttribute("href"))).toEqual([dessin, dessin])
    })
  })
})

/** Combien de fois un composant figure dans l'arbre que rend un composant serveur. */
function montages(noeud: ReactNode, composant: unknown): number {
  return Children.toArray(noeud).reduce<number>((total, enfant) => {
    if (!isValidElement<{ children?: ReactNode }>(enfant)) return total
    return total + (enfant.type === composant ? 1 : 0) + montages(enfant.props.children, composant)
  }, 0)
}

describe("host favicon (src/app)", () => {
  it("should mount the favicon once, in the root layout above every page", () => {
    expect(montages(RootLayout({ children: null }), FaviconDuTheme)).toBe(1)
  })

  it("should serve a static SVG icon by Next's file convention, against the favicon.ico 404", () => {
    const icone = fs.readFileSync(path.resolve(__dirname, "../../../src/app/icon.svg"), "utf8")

    expect(icone).toMatch(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  })
})
