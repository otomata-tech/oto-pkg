// L'image de partage d'une adresse (E11-S21) : l'aperçu qu'une messagerie (Slack, WhatsApp, LinkedIn, mail) montre
// d'un lien de l'hôte, 1200 × 630, claire, aux couleurs et au nom de l'organisation ; pour un lien public, le titre et
// le résumé du contenu. Un arbre JSX que l'hôte passe à `new ImageResponse(…)` de `next/og` (HN-E11S21-6) : le moteur
// (Satori) ne lit ni classe ni variable CSS, d'où des styles en ligne et des couleurs en valeurs, tirées d'`oto.css`
// par la table ci-dessous (confrontée au fichier par son test) et mélangées par les formules du contrat `.oto`
// (`--ink`, `--mute`, `--title`). Aucune mention d'Oto quand l'organisation est connue, comme la page publique.
// Aussi : les métadonnées de partage que les pages de l'hôte posent (`metadonneesDePartage`).
// Point d'entrée `@otomata_tech/oto_platform/share` : un fichier de convention de métadonnées (`opengraph-image`) est
// chargé par le segment racine, et un import du barrel `ui/` y tirerait tous ses modules `"use client"` dans le JS de
// toutes les pages ; ce module n'importe donc que des types et `schemas/`, jamais un module de `ui/`.
import type { Metadata } from "next"
import type { ShareImageData, Theme } from "../../schemas"
import { webUrl } from "../../schemas/oauth"

/** La taille d'une image Open Graph : `size` d'une convention `opengraph-image`, et les options d'`ImageResponse`. */
export const TAILLE_DE_PARTAGE = { width: 1200, height: 630 } as const

/** Le nom montré sans organisation. */
const OTO = "Oto"

/** Les bornes d'un texte de l'image et de `og:description`, en caractères (HN-E11S21-7). */
const BORNES = { nom: 60, titre: 90, resume: 160, description: 200 } as const

/**
 * `--primary`, `--primary-on` et `--base` de chaque bloc `.oto[data-oto-theme]` d'`ui/styles/oto.css`, recopiés à
 * l'identique (le moteur d'image ne lit pas le CSS) ; `tests/integration/components/image-de-partage.test.tsx` les
 * confronte au fichier.
 */
export const COULEURS_DE_L_IMAGE: Record<Theme, { primary: string; primaryOn: string; base: string }> = {
  manuscrit: { primary: "#f0b41e", primaryOn: "#141210", base: "#fefcf5" },
  ardoise: { primary: "#101011", primaryOn: "#ffffff", base: "#ffffff" },
  grenat: { primary: "#b3261e", primaryOn: "#ffffff", base: "#fdfbfb" },
  brique: { primary: "#b4482b", primaryOn: "#ffffff", base: "#fcfaf9" },
  foret: { primary: "#1f6b4a", primaryOn: "#ffffff", base: "#fbfcfb" },
  lagune: { primary: "#0f6f78", primaryOn: "#ffffff", base: "#fafcfc" },
  cobalt: { primary: "#1a5fbf", primaryOn: "#ffffff", base: "#fbfbfc" },
  violet: { primary: "#6a45c4", primaryOn: "#ffffff", base: "#fbfafd" },
}

/** L'encre du contrat `.oto` (`#0d0c0a`), que `--ink` et `--mute` mélangent au fond. */
const NOIR = "#0d0c0a"

const canaux = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

/** `color-mix(in srgb, a part, b)` : canal par canal, comme le navigateur. */
function melange(a: string, part: number, b: string): string {
  const [x, y] = [canaux(a), canaux(b)]
  return `#${x.map((c, i) => Math.round(c * part + y[i] * (1 - part)).toString(16).padStart(2, "0")).join("")}`
}

/** Les couleurs de l'image d'un thème, aux formules du contrat `.oto` (section 1 d'`oto.css`). */
function couleursDe(theme: Theme) {
  const { primary, primaryOn, base } = COULEURS_DE_L_IMAGE[theme]
  const encre = melange(base, 0.1, NOIR)
  return { fond: base, primaire: primary, surPrimaire: primaryOn, encre, discret: melange(base, 0.34, NOIR), titre: melange(primary, 0.35, encre) }
}

type Couleurs = ReturnType<typeof couleursDe>

/**
 * Un texte sur une ligne, coupé au dernier mot entier avant `max` caractères, suivi de « … » ; par points de code, pour
 * ne jamais couper un caractère en deux. Parcours linéaire.
 */
function couper(texte: string, max: number): string {
  const lettres = Array.from(texte.replace(/\s+/g, " ").trim())
  if (lettres.length <= max) return lettres.join("")
  let fin = max - 1
  const espace = lettres.lastIndexOf(" ", fin)
  if (espace > max / 2) fin = espace
  while (fin > 0 && " ,;:.-–—".includes(lettres[fin - 1])) fin--
  return `${lettres.slice(0, fin).join("")}…`
}

/** La marque d'Oto, au tracé de `.oto-marque` (cercle ouvert, trait 28), autour de son origine. */
function MarqueOto({ couleur, cote, opacite = 1 }: { couleur: string; cote: number; opacite?: number }) {
  return (
    <svg width={cote} height={cote} viewBox="-60 -60 120 120" style={{ opacity: opacite }}>
      <circle r="44" fill="none" stroke={couleur} strokeWidth="28" strokeLinecap="round" strokeDasharray="230 46" transform="rotate(-8)" />
    </svg>
  )
}

/** Le logo de l'organisation, sinon son initiale sur sa couleur ; sans organisation, la marque d'Oto. */
function Logo({ org, couleurs, cote }: { org: ShareImageData["org"]; couleurs: Couleurs; cote: number }) {
  const rayon = Math.round(cote * 0.22)
  if (org?.logo) {
    // eslint-disable-next-line @next/next/no-img-element -- dessiné par le moteur d'image, jamais servi au navigateur
    return <img src={org.logo} alt="" width={cote} height={cote} style={{ width: cote, height: cote, objectFit: "contain", borderRadius: rayon }} />
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: cote, height: cote, borderRadius: rayon, backgroundColor: couleurs.primaire, color: couleurs.surPrimaire, fontSize: Math.round(cote / 2) }}>
      {org ? Array.from(org.name.trim())[0]?.toLocaleUpperCase("fr") : <MarqueOto couleur={couleurs.surPrimaire} cote={Math.round(cote * 0.62)} />}
    </div>
  )
}

/**
 * L'image de partage : fond clair du thème, filet et anneau à sa couleur ; avec une page, le logo et le nom en tête,
 * le titre (teinté comme `--title`) et le résumé en bas ; sans page, le logo et le nom en grand. Sans organisation,
 * « Oto » au thème Manuscrit.
 */
export function ImageDePartage({ donnees }: { donnees: ShareImageData }) {
  const { org, page } = donnees
  const couleurs = couleursDe(org?.theme ?? "manuscrit")
  const nom = couper(org?.name ?? OTO, BORNES.nom)
  const titre = page ? couper(page.title, BORNES.titre) : ""
  const resume = page ? couper(page.summary, BORNES.resume) : ""
  return (
    <div style={{ display: "flex", position: "relative", width: TAILLE_DE_PARTAGE.width, height: TAILLE_DE_PARTAGE.height, overflow: "hidden", backgroundColor: couleurs.fond, color: couleurs.encre }}>
      <div style={{ display: "flex", position: "absolute", right: -130, bottom: -170 }}>
        <MarqueOto couleur={couleurs.primaire} cote={560} opacite={0.14} />
      </div>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 18, height: TAILLE_DE_PARTAGE.height, backgroundColor: couleurs.primaire }} />
      {page ? (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "64px 96px 72px 104px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Logo org={org} couleurs={couleurs} cote={64} />
            <div style={{ display: "flex", marginLeft: 24, fontSize: 34, color: couleurs.encre }}>{nom}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 960 }}>
            <div style={{ display: "flex", fontSize: titre.length > 60 ? 58 : 70, lineHeight: 1.12, letterSpacing: -1, color: couleurs.titre }}>{titre}</div>
            {resume ? <div style={{ display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.4, color: couleurs.discret }}>{resume}</div> : null}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", padding: "0 104px" }}>
          <Logo org={org} couleurs={couleurs} cote={128} />
          <div style={{ display: "flex", marginTop: 44, maxWidth: 960, fontSize: 84, lineHeight: 1.1, letterSpacing: -1, color: couleurs.titre }}>{nom}</div>
        </div>
      )}
    </div>
  )
}

/** Ce qu'une page publique donne à ses métadonnées : son contenu, son adresse et celle de son image. */
type PageDePartage ={ titre: string; resume: string; adresse: string; image: string }

/**
 * Les métadonnées de partage (`og:*`, `twitter:card`) : sans `page`, celles de l'organisation, que le layout racine
 * pose pour toute adresse (l'image vient de sa convention `opengraph-image`) ; avec `page`, celles d'un lien public,
 * image comprise. Les adresses sont relatives : `origine`, l'origine de la requête passée par `webUrl`
 * (`security-patterns.md § XSS Prevention`), devient le `metadataBase` qui les rend absolues.
 */
export function metadonneesDePartage({ organisation, origine, page }: { organisation: string | null; origine?: string | null; page?: PageDePartage }): Pick<Metadata, "metadataBase" | "openGraph" | "twitter"> {
  const nom = organisation ?? OTO
  const twitter = { card: "summary_large_image" } as const
  const base = webUrl(origine)
  const metadataBase = base ? { metadataBase: new URL(base) } : {}
  if (!page) {
    const description = organisation ? { description: `Les pages, procédures et tableaux de ${organisation}.` } : {}
    return { ...metadataBase, openGraph: { type: "website", siteName: nom, title: nom, ...description, url: "/" }, twitter }
  }
  const resume = couper(page.resume, BORNES.description)
  const description = resume || (organisation ? `Partagé par ${organisation}.` : undefined)
  // `og:image:alt` : ce que l'image écrit, le titre et l'organisation.
  const alt = `${page.titre} — ${nom}`
  return {
    ...metadataBase,
    openGraph: {
      type: "article",
      siteName: nom,
      title: page.titre,
      ...(description ? { description } : {}),
      url: page.adresse,
      images: [{ url: page.image, ...TAILLE_DE_PARTAGE, alt }],
    },
    twitter,
  }
}
