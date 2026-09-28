"use client"

// La favicon au thème de l'organisation (M28) : un carré au `--primary` de la racine `.oto`, la marque
// d'Oto dessus en `--on-primary`, redessiné quand la teinte, le mode ou la racine change. L'hôte la
// monte une fois, dans son layout racine ; elle ne rend rien.
//
// Repris d'oto-frontend (`components/coque/favicon-du-theme.tsx`) : le carré et la marque à
// l'identique ; les jetons lus dans le style calculé, jamais choisis (une table de couleurs mentirait
// au premier thème retouché) ; l'encre `--on-primary`, pas un blanc (presque noire sur le safran de
// Manuscrit) ; un jeton vide ne remplace rien ; le `<link rel="icon">` en place repris, créé s'il manque.
// Changé : les jetons se lisent sur la racine `.oto` de la page (`CoquilleOto`), pas sur `<html>`, qui
// porte le primaire du gabarit de l'hôte ; l'écoute couvre le document, où la racine et les liens
// changent avec la page ; chaque lien d'icône est repeint. Retiré : l'écoute de `prefers-color-scheme` et
// de `data-theme` (la nuit suit la classe `.dark` de l'hôte, ADR-008 § 3).

import { useEffect } from "react"

/** Le côté du carré, en unités du `viewBox` : le navigateur met l'icône à l'échelle, 16 px comme 180. */
const COTE = 64

/** 22 % du côté : le rayon d'un îlot (8 px) ferait d'un carré de 16 px un cercle raté. */
const RAYON = 14

/**
 * La marque, dessinée autour de son origine (cercle de rayon 44, trait de 28 : un disque de rayon 58),
 * tient 40 unités à cette échelle : douze de marge de chaque côté.
 */
const ECHELLE = 0.345

const CENTRE = COTE / 2

/** Ce qui change les jetons : la classe `.dark` d'un ancêtre (le mode), `data-oto-theme` (la teinte). */
const ATTRIBUTS = ["class", "data-oto-theme"]

export function FaviconDuTheme() {
  useEffect(() => {
    const dessiner = (): void => {
      // La première racine du document est la coquille de la page : elle précède les pastilles de
      // thème qu'elle contient (`/admin/marque`).
      const racine = document.querySelector(".oto")
      if (racine === null) return
      const style = getComputedStyle(racine)
      const fond = style.getPropertyValue("--primary").trim()
      const encre = style.getPropertyValue("--on-primary").trim()
      // Aucune couleur de secours : ce serait la table en dur que la lecture évite.
      if (fond === "" || encre === "") return
      poser(carre(fond, encre))
    }

    dessiner()

    // Le document entier : une racine arrive avec la page (navigation, rendu en continu), et l'hôte
    // ajoute son `<link>`, à l'icône statique, après l'hydratation.
    const observateur = new MutationObserver(dessiner)
    observateur.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ATTRIBUTS,
    })
    return () => {
      observateur.disconnect()
    }
  }, [])

  return null
}

/**
 * Le carré et la marque, au tracé de `.oto-marque` (`ui/styles/oto.css`). Les deux couleurs viennent du
 * CSS du paquet, jamais d'une saisie, et une image SVG ne lance aucun script : rien à échapper.
 */
function carre(fond: string, encre: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(COTE)} ${String(COTE)}">` +
    `<rect width="${String(COTE)}" height="${String(COTE)}" rx="${String(RAYON)}" fill="${fond}"/>` +
    `<g transform="translate(${String(CENTRE)} ${String(CENTRE)}) scale(${String(ECHELLE)})">` +
    `<circle r="44" fill="none" stroke="${encre}" stroke-width="28" stroke-linecap="round"` +
    ` stroke-dasharray="230 46" transform="rotate(-8)"/>` +
    `</g></svg>`
  )
}

/**
 * Écrit l'icône dans chaque `<link rel="icon">` en place, un lien créé s'il n'y en a aucun. Chacun, pas
 * le premier seul : Next ajoute le sien, à l'icône statique, après l'hydratation (mesuré sur `/login`),
 * et un navigateur choisit à sa façon entre deux icônes.
 */
function poser(svg: string): void {
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  const liens = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'))
  if (liens.length === 0) {
    const lien = document.createElement("link")
    lien.rel = "icon"
    document.head.append(lien)
    liens.push(lien)
  }
  for (const lien of liens) {
    // Chaque rendu de la page réveille l'écoute : un `href` déjà posé ne se réécrit pas.
    if (lien.getAttribute("href") === href) continue
    lien.type = "image/svg+xml"
    lien.href = href
  }
}
