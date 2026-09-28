// Les dates des écrans du paquet (E05-S03, HN-E05S03-5) : `fr-FR`, fuseau `Europe/Paris` fixe en V1,
// pas de fuseau par personne. Le formateur est construit une fois, au chargement du module.
const DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" })
// Le journal (E05-S05) date ses conversations à la minute et ses appels à la seconde : deux appels
// d'une même minute s'y distinguent.
const DATE_ET_HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
const HEURE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" })
const SECONDES = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function instant(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** « 24 septembre 2026 » ; `undefined` pour une date absente ou illisible. */
export function dateLisible(iso: string | null | undefined): string | undefined {
  const date = instant(iso)
  return date && DATE.format(date)
}

/** « 23 septembre 2026 à 16:02 » : le début d'une conversation (E05-S05, AC3). */
export function dateEtHeureLisibles(iso: string | null | undefined): string | undefined {
  const date = instant(iso)
  return date && DATE_ET_HEURE.format(date)
}

/** « 16:03:40 » : l'heure d'un appel (E05-S05, AC7). */
export function heureLisible(iso: string | null | undefined): string | undefined {
  const date = instant(iso)
  return date && HEURE.format(date)
}

// L'écran d'un tableau (E07-S03) : l'échéance d'un bail à la minute, le jour d'un résumé de revue.
const HEURE_COURTE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
const DATE_COURTE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" })

/** « 14:05 » : la fin d'un bail (E07-S03, AC2). */
export function heureCourte(iso: string | null | undefined): string | undefined {
  const date = instant(iso)
  return date && HEURE_COURTE.format(date)
}

/** « 24/09/2026 » : le jour d'une revue (E07-S03, AC14). */
export function dateCourte(iso: string | null | undefined): string | undefined {
  const date = instant(iso)
  return date && DATE_COURTE.format(date)
}

/** « 412 ms », « 1,2 s » : la durée d'un appel (E05-S05, AC7) ; `undefined` sans durée. */
export function dureeLisible(millisecondes: number | null | undefined): string | undefined {
  if (millisecondes === null || millisecondes === undefined) return undefined
  return millisecondes < 1000 ? `${millisecondes} ms` : `${SECONDES.format(millisecondes / 1000)} s`
}

// `numeric: "auto"` : « hier », « avant-hier », « le mois dernier » plutôt que « il y a 1 jour ».
const RELATIF = new Intl.RelativeTimeFormat("fr", { numeric: "auto" })

/**
 * Paliers du plus fin au plus grossier (E05-S02) : mois et années en moyennes, 30,44 et 365,25 jours ;
 * `Intl` met en forme un nombre et une unité, il ne compte pas de calendrier.
 */
const PALIERS: readonly { duree: number; unite: Intl.RelativeTimeFormatUnit }[] = [
  { duree: 60_000, unite: "minute" },
  { duree: 3_600_000, unite: "hour" },
  { duree: 86_400_000, unite: "day" },
  { duree: 2_629_800_000, unite: "month" },
  { duree: 31_557_600_000, unite: "year" },
]

/**
 * « il y a 3 jours », « hier », « à l'instant » : le temps écoulé depuis `iso`, calculé au rendu
 * (`maintenant` figé par les tests) ; `undefined` sur une date absente ou illisible. Sous la minute,
 * « à l'instant » (`datetime-patterns.md § Dates`) : `Intl` dirait « maintenant » ou « il y a
 * 5 secondes ». `Math.trunc` : on dit ce qui est écoulé, « hier » ne devient pas « avant-hier » à
 * 36 heures. Porté d'oto-frontend (`meta-modifiee.tsx`, `quandRelatif`) ; retiré : le palier des
 * secondes.
 */
export function ilYA(iso: string | null | undefined, maintenant: number = Date.now()): string | undefined {
  if (!iso) return undefined
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) return undefined
  const ecart = instant - maintenant
  if (Math.abs(ecart) < PALIERS[0].duree) return "à l'instant"
  const palier = [...PALIERS].reverse().find(({ duree }) => Math.abs(ecart) >= duree) ?? PALIERS[0]
  return RELATIF.format(Math.trunc(ecart / palier.duree), palier.unite)
}
