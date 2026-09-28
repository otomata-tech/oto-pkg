// Les réglages de la grille dans l'adresse de l'hôte (E07-S03, AC4 à AC7 ; H95, H96, HN-E07S03-4) :
// fonctions pures. `reglagesDepuisLAdresse` lit `q`, `tri`, `f` et `n` contre l'en-tête du tableau
// (un réglage illisible est écarté, et l'écran le dit), traduit les clauses dans la grammaire de H95,
// et reconnaît les champs d'un formulaire « Filtrer », que la page réécrit en `f` ; `adresseDesReglages`
// écrit des réglages dans l'adresse. Sans lui, la page et la grille liraient chacune l'adresse, et un
// nom de colonne venu de l'URL irait brut au service (`api-patterns.md § Search & Filter`).
//
// Porté d'oto-frontend (`src/schemas/table.ts` : `columnFilter`, `setColumnFilter`) : le filtre d'une
// colonne tenu dans l'URL, ceux des autres gardés. Retiré : le seul « contient » (ici par type, H95),
// le tri libre et la clé méta `_updated_at` (ici une colonne déclarée, H96).
import { GRID_PAGE_ROWS, GRID_ROWS_MAX, GRID_SEARCH_MAX, MAX_FILTER_CLAUSES, tableScreenParamsSchema, type TableColumn, type TableHeader } from "../../schemas"
import { isValidDate } from "../../schemas/tables"

/** Les opérations d'une clause de l'adresse (HN-E07S03-4). */
export type Operation = "contient" | "egal" | "min" | "max" | "vide" | "rempli"

/** Une clause de filtre telle que l'adresse la porte : `f=<colonne>:<opération>:<valeur>`. */
export type Clause = { colonne: string; operation: Operation; valeur: string }

export type Tri = { colonne: string; sens: "asc" | "desc" }

/** Les réglages d'une grille, lus contre l'en-tête : ce que l'adresse porte, et ce qu'elle réécrit. */
export type Reglages = { q: string | null; tri: Tri | null; clauses: Clause[]; n: number }

/** Un filtre dans la grammaire de H95 (E07-S01) : `{ colonne: { opérateur: valeur } }`. */
export type FiltreDeLaGrille = Record<string, Record<string, string | number | boolean>>

export type ReglagesLus = Reglages & {
  /** Les clauses dans la grammaire de H95 ; `undefined` sans clause. */
  filtre: FiltreDeLaGrille | undefined
  /** Un réglage illisible a été écarté (AC4, AC6) : l'écran le dit. */
  ignores: boolean
  /** Les champs d'un formulaire « Filtrer » sont à réécrire en `f` : la page redirige vers l'adresse des réglages. */
  aReecrire: boolean
}

/** Les paramètres de l'adresse, comme la page de l'hôte les reçoit. */
export type Parametres = Readonly<Record<string, string | readonly string[] | undefined>>

const TEXTE: readonly Operation[] = ["contient", "vide", "rempli"]
const CHOIX: readonly Operation[] = ["egal", "vide", "rempli"]
const BORNES: readonly Operation[] = ["min", "max", "vide", "rempli"]

/** Les opérations de chaque type (AC6). */
const PAR_TYPE: Record<TableColumn["type"], readonly Operation[]> = {
  text: TEXTE,
  email: TEXTE,
  url: TEXTE,
  enum: CHOIX,
  bool: CHOIX,
  number: BORNES,
  date: BORNES,
  datetime: BORNES,
}

/** L'opérateur de H95 de chaque opération (AC6). */
const OPERATEURS: Record<Operation, string> = { contient: "contains", egal: "eq", min: "gte", max: "lte", vide: "empty", rempli: "not_empty" }

/** Les opérations d'une colonne (AC6) : celles que l'adresse accepte, et les champs de son repli « Filtrer ». */
export function operationsDe(colonne: TableColumn): readonly Operation[] {
  return PAR_TYPE[colonne.type]
}

const premier = (valeur: string | readonly string[] | undefined): string | undefined => (typeof valeur === "string" ? valeur : valeur?.[0])

const tous = (valeur: string | readonly string[] | undefined): readonly string[] => (valeur === undefined ? [] : typeof valeur === "string" ? [valeur] : valeur)

const HEURE_LOCALE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

const DECALAGE = /([+-])(\d{2}):?(\d{2})?/

/** Le décalage de Paris à un instant, en minutes (HN-E05S03-5 : fuseau fixe en V1). */
function decalageDeParis(instant: number): number {
  const nom = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" }).formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value ?? ""
  const lu = DECALAGE.exec(nom)
  return lu ? (lu[1] === "-" ? -1 : 1) * (Number(lu[2]) * 60 + Number(lu[3] ?? 0)) : 0
}

/** « +02:00 » : un décalage en minutes, écrit comme le service le lit (E07-S01). */
function decalageEcrit(minutes: number): string {
  const absolu = Math.abs(minutes)
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(absolu / 60)).padStart(2, "0")}:${String(absolu % 60).padStart(2, "0")}`
}

/** Une heure de Paris saisie (`AAAA-MM-JJTHH:MM`, champ `datetime-local`) en date et heure avec fuseau ; `null` sinon. */
function instantDeParis(valeur: string): string | null {
  const lu = HEURE_LOCALE.exec(valeur)
  if (!lu || !isValidDate(lu[1])) return null
  const [heure, minute, seconde] = [Number(lu[2]), Number(lu[3]), Number(lu[4] ?? 0)]
  if (heure > 23 || minute > 59 || seconde > 59) return null
  const [annee, mois, jour] = lu[1].split("-").map(Number)
  const lueEnUtc = Date.UTC(annee, mois - 1, jour, heure, minute, seconde)
  // Le décalage de l'heure lue comme en UTC, puis celui de l'instant qu'il donne : un jour de changement
  // d'heure, les deux diffèrent autour de la bascule, et seul le second est celui de l'heure saisie.
  const decalage = decalageDeParis(lueEnUtc - decalageDeParis(lueEnUtc) * 60_000)
  return `${lu[1]}T${lu[2]}:${lu[3]}:${String(seconde).padStart(2, "0")}${decalageEcrit(decalage)}`
}

/** Une borne d'une colonne nombre, date ou date et heure, telle que le service l'accepte ; `null` sinon. */
function borne(colonne: TableColumn, valeur: string): number | string | null {
  if (colonne.type === "number") {
    const nombre = valeur.trim() === "" ? Number.NaN : Number(valeur.trim().replace(",", "."))
    return Number.isFinite(nombre) ? nombre : null
  }
  if (colonne.type === "date") return isValidDate(valeur) ? valeur : null
  return instantDeParis(valeur)
}

/** La valeur de H95 d'une clause, contrôlée contre le type de la colonne (AC6) ; `null` : clause illisible. */
function valeurDeH95(colonne: TableColumn, clause: Clause): string | number | boolean | null {
  switch (clause.operation) {
    case "vide":
    case "rempli":
      return true
    case "contient":
      return clause.valeur.trim() === "" ? null : clause.valeur.trim()
    case "egal":
      if (colonne.type === "bool") return clause.valeur === "oui" ? true : clause.valeur === "non" ? false : null
      return (colonne.options ?? []).includes(clause.valeur) ? clause.valeur : null
    default:
      return borne(colonne, clause.valeur)
  }
}

/** Une entrée `f` lue : `<colonne>:<opération>:<valeur>`, la valeur pouvant porter `:` ; `null` si illisible. */
function clauseLue(entree: string, entete: TableHeader): Clause | null {
  const premiere = entree.indexOf(":")
  const seconde = premiere === -1 ? -1 : entree.indexOf(":", premiere + 1)
  const colonne = premiere === -1 ? entree : entree.slice(0, premiere)
  const operation = premiere === -1 ? "" : entree.slice(premiere + 1, seconde === -1 ? undefined : seconde)
  const valeur = seconde === -1 ? "" : entree.slice(seconde + 1)
  const declaree = entete.columns.find((candidate) => candidate.name === colonne)
  const permise = declaree ? operationsDe(declaree).find((candidate) => candidate === operation) : undefined
  if (!declaree || !permise) return null
  const clause = { colonne, operation: permise, valeur: permise === "vide" || permise === "rempli" ? "" : valeur }
  return valeurDeH95(declaree, clause) === null ? null : clause
}

/** Les clauses de `f` : 30 au plus (H95), une seule par colonne et opération ; le reste est écarté. */
function clausesLues(entrees: readonly string[], entete: TableHeader): { clauses: Clause[]; ignores: boolean } {
  const format = tableScreenParamsSchema.shape.f
  let ignores = entrees.length > MAX_FILTER_CLAUSES
  const clauses: Clause[] = []
  for (const entree of entrees.slice(0, MAX_FILTER_CLAUSES)) {
    const clause = format.safeParse([entree]).success ? clauseLue(entree, entete) : null
    const double = clause !== null && clauses.some((une) => une.colonne === clause.colonne && une.operation === clause.operation)
    if (clause === null || double) ignores = true
    else clauses.push(clause)
  }
  return { clauses, ignores }
}

function triLu(valeur: string | undefined, entete: TableHeader): { tri: Tri | null; ignores: boolean } {
  if (valeur === undefined || valeur === "") return { tri: null, ignores: false }
  const format = tableScreenParamsSchema.shape.tri.safeParse(valeur)
  const colonne = valeur.startsWith("-") ? valeur.slice(1) : valeur
  if (!format.success || !entete.columns.some((une) => une.name === colonne)) return { tri: null, ignores: true }
  return { tri: { colonne, sens: valeur.startsWith("-") ? "desc" : "asc" }, ignores: false }
}

/**
 * Les champs d'un formulaire « Filtrer » (`colonne`, puis `contient`, `egal`, `min`, `max` et `presence`
 * : `vide` ou `rempli`) en clauses de cette colonne ; un champ vide ne pose rien.
 */
function clausesDuFormulaire(parametres: Parametres, colonne: TableColumn): { clauses: Clause[]; ignores: boolean } {
  const presence = premier(parametres.presence) ?? ""
  const champs: [Operation, string][] = [
    ["contient", premier(parametres.contient) ?? ""],
    ["egal", premier(parametres.egal) ?? ""],
    ["min", premier(parametres.min) ?? ""],
    ["max", premier(parametres.max) ?? ""],
  ]
  const saisies: Clause[] = champs.flatMap(([operation, valeur]) => (valeur.trim() === "" ? [] : [{ colonne: colonne.name, operation, valeur: valeur.trim() }]))
  const presences: Clause[] = presence === "vide" || presence === "rempli" ? [{ colonne: colonne.name, operation: presence, valeur: "" }] : []
  const permises = operationsDe(colonne)
  const clauses = [...saisies, ...presences].filter((clause) => permises.includes(clause.operation) && valeurDeH95(colonne, clause) !== null)
  return { clauses, ignores: clauses.length < saisies.length + presences.length || (presence !== "" && presences.length === 0) }
}

/** Les clauses dans la grammaire de H95 : plusieurs opérations d'une colonne se cumulent (ET). */
function filtreDesClauses(clauses: readonly Clause[], entete: TableHeader): FiltreDeLaGrille | undefined {
  if (clauses.length === 0) return undefined
  const filtre: FiltreDeLaGrille = {}
  for (const clause of clauses) {
    const colonne = entete.columns.find((une) => une.name === clause.colonne)
    const valeur = colonne ? valeurDeH95(colonne, clause) : null
    if (colonne && valeur !== null) filtre[clause.colonne] = { ...filtre[clause.colonne], [OPERATEURS[clause.operation]]: valeur }
  }
  return filtre
}

/**
 * Les réglages de la grille lus dans l'adresse (AC4 à AC7) : `q` (100 caractères), `tri`, les clauses
 * de `f` et `n` (20 à 200) ; une colonne inconnue, une opération qu'un type ne prend pas, une valeur
 * mal typée ou une trente et unième clause sont écartées, et `ignores` le dit. Les champs d'un
 * formulaire « Filtrer » remplacent les clauses de leur colonne ; `aReecrire` demande la redirection.
 */
export function reglagesDepuisLAdresse(parametres: Parametres, entete: TableHeader): ReglagesLus {
  const brut = premier(parametres.q)
  const q = brut === undefined ? { success: true as const, data: undefined } : tableScreenParamsSchema.shape.q.safeParse(brut)
  const tri = triLu(premier(parametres.tri), entete)
  const lues = clausesLues(tous(parametres.f), entete)
  const n = tableScreenParamsSchema.shape.n.parse(premier(parametres.n))
  let clauses = lues.clauses
  let ignores = !q.success || tri.ignores || lues.ignores
  const nomDuFormulaire = premier(parametres.colonne)
  if (nomDuFormulaire !== undefined) {
    const colonne = entete.columns.find((une) => une.name === nomDuFormulaire)
    const formulaire = colonne ? clausesDuFormulaire(parametres, colonne) : { clauses: [], ignores: true }
    const reunies = [...clauses.filter((clause) => clause.colonne !== nomDuFormulaire), ...formulaire.clauses]
    clauses = reunies.slice(0, MAX_FILTER_CLAUSES)
    ignores ||= formulaire.ignores || reunies.length > MAX_FILTER_CLAUSES
  }
  const texte = q.success && q.data ? q.data : ""
  return { q: texte === "" ? null : texte, tri: tri.tri, clauses, n, filtre: filtreDesClauses(clauses, entete), ignores, aReecrire: nomDuFormulaire !== undefined }
}

/** Les réglages écrits dans l'adresse, sans `?` : `q`, `tri`, `f` répété, `n` hors défaut ; `""` sans réglage. */
export function adresseDesReglages(reglages: Reglages): string {
  const recherche = new URLSearchParams()
  if (reglages.q) recherche.set("q", reglages.q)
  if (reglages.tri) recherche.set("tri", `${reglages.tri.sens === "desc" ? "-" : ""}${reglages.tri.colonne}`)
  for (const clause of reglages.clauses) recherche.append("f", `${clause.colonne}:${clause.operation}:${clause.valeur}`)
  if (reglages.n !== GRID_PAGE_ROWS) recherche.set("n", String(reglages.n))
  return recherche.toString()
}

/**
 * Les réglages qu'un formulaire GET garde en champs cachés (AC5, AC6) : la recherche (sauf dans le
 * formulaire de recherche), le tri, les clauses des autres colonnes ; jamais `n`, qui repart à 20.
 */
export function champsGardes(reglages: Reglages, sauf: { recherche?: boolean; colonne?: string } = {}): [string, string][] {
  const clauses = reglages.clauses.filter((clause) => clause.colonne !== sauf.colonne)
  return [...new URLSearchParams(adresseDesReglages({ q: sauf.recherche ? null : reglages.q, tri: reglages.tri, clauses, n: GRID_PAGE_ROWS })).entries()]
}

/** Le tri suivant d'un en-tête (AC4) : croissant, puis décroissant sur la colonne déjà triée croissante. */
export function avecTri(reglages: Reglages, colonne: string): Reglages {
  const sens = reglages.tri?.colonne === colonne && reglages.tri.sens === "asc" ? "desc" : "asc"
  return { ...reglages, tri: { colonne, sens } }
}

/** « Charger plus » (AC7) : 20 lignes de plus, 200 au plus. */
export function avecPlus(reglages: Reglages): Reglages {
  return { ...reglages, n: Math.min(reglages.n + GRID_PAGE_ROWS, GRID_ROWS_MAX) }
}

/** « Retirer les filtres » (AC6) : `q` et le tri gardés, `f` retiré ; une colonne seule pour « Retirer » de son filtre. */
export function sansFiltres(reglages: Reglages, colonne?: string): Reglages {
  return { ...reglages, clauses: colonne === undefined ? [] : reglages.clauses.filter((clause) => clause.colonne !== colonne), n: GRID_PAGE_ROWS }
}

/** « Effacer la recherche » : `q` retiré, filtres et tri gardés. */
export function sansRecherche(reglages: Reglages): Reglages {
  return { ...reglages, q: null, n: GRID_PAGE_ROWS }
}

/** À 200 lignes, « Charger plus » laisse la place à « Affinez… » (AC7). */
export const auMaximum = (reglages: Reglages) => reglages.n >= GRID_ROWS_MAX

/** Une recherche soumise (AC5) : `q` remplacé, coupé à la borne du service, les filtres et le tri gardés ; `n` repart à 20. */
export function avecRecherche(reglages: Reglages, texte: string): Reglages {
  const q = texte.trim().slice(0, GRID_SEARCH_MAX)
  return { ...reglages, q: q === "" ? null : q, n: GRID_PAGE_ROWS }
}

/**
 * L'adresse du tableau pour des réglages, telle qu'un formulaire GET vers `adresse` la construit : les
 * îlots de la grille (E05-S09 partie c2) naviguent par l'hôte vers elle, sans recharger le document.
 */
export function adresseDuTableau(adresse: string, reglages: Reglages): string {
  const recherche = adresseDesReglages(reglages)
  return recherche ? `${adresse}?${recherche}` : adresse
}

/** Les champs d'un formulaire GET en paramètres, comme le navigateur les enverrait : un nom répété devient une liste. */
export function parametresDuFormulaire(donnees: FormData): Parametres {
  const parametres: Record<string, string | string[]> = {}
  for (const [nom, valeur] of donnees.entries()) {
    if (typeof valeur !== "string") continue
    const avant = parametres[nom]
    parametres[nom] = avant === undefined ? valeur : [...(typeof avant === "string" ? [avant] : avant), valeur]
  }
  return parametres
}
