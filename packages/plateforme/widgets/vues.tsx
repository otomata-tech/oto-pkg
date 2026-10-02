// Les vues du paquet dans le widget routeur (story widgets-dans-la-conversation, lot 1) : le résultat d'un outil
// (`structuredContent`) choisit sa vue par `view.kind` ; sans vue, ou d'un nom inconnu, rien n'est rendu, à
// hauteur nulle. Les composants sont ceux des écrans (ADR-008 § 5) : `Table` du design system, `RenduDUnBloc`.
// Aucune requête ne part : un lien vers un chemin de l'organisation se rend en texte, un lien `https:` comme à
// l'écran (`noopener`), que l'host ouvre si son bac à sable le permet.
import type { ReactNode } from "react"
import { OTO_THEMES, type Theme } from "../schemas/brand"
import { PACKAGE_VIEWS, type ViewKind } from "../schemas/views"
import { EmptyState } from "../ui/ds/react/empty-state"
import { Alert } from "../ui/ds/react/primitives"
import { Reader } from "../ui/ds/react/reader"
import { Skeleton } from "../ui/ds/react/skeleton"
import { Table, type Column } from "../ui/ds/react/table"
import { RenduDUnBloc } from "../ui/noeud/rendu-des-blocs"

const LIBELLES = {
  chargement: "Chargement du résultat…",
  delai: "Le rendu du résultat n'est pas arrivé.",
  delaiConseil: "Demandez à l'assistant de vous montrer le résultat en texte, ou relancez la demande.",
  vide: "Aucune ligne.",
  lignes: (total: number) => (total === 1 ? "1 ligne" : `${total} lignes`),
  oui: "Oui",
  non: "Non",
} as const

type Resultat = Record<string, unknown>

type Ligne = { key?: unknown; set?: Record<string, unknown> }

type Bloc = { type: string; text: string | null; data: Record<string, unknown> }

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)

/** La vue servie, si son nom et son thème sont connus du bundle ; sinon `null` : rien à rendre. */
function vueDe(resultat: Resultat | null): { kind: ViewKind; theme: Theme } | null {
  const vue = resultat?.view
  if (!estObjet(vue)) return null
  const kind = PACKAGE_VIEWS.find((one) => one === vue.kind)
  const theme = OTO_THEMES.find((one) => one === vue.theme)
  return kind && theme ? { kind, theme } : null
}

/** Une cellule lue par `table.rows` : texte, nombre, booléen, liste, ou vide. */
function texteDUneCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return ""
  if (typeof valeur === "boolean") return valeur ? LIBELLES.oui : LIBELLES.non
  if (Array.isArray(valeur)) return valeur.map(texteDUneCellule).join(", ")
  if (estObjet(valeur)) return JSON.stringify(valeur)
  return String(valeur)
}

/** Les lignes servies : `rows` de `table.rows`, `claimed` de `table.claim`. */
function lignesDe(donnees: Record<string, unknown>): Ligne[] {
  const lignes = Array.isArray(donnees.rows) ? donnees.rows : Array.isArray(donnees.claimed) ? donnees.claimed : []
  return lignes.filter(estObjet)
}

/** Les colonnes dans l'ordre où les lignes les nomment, la première ligne d'abord. */
function colonnesDe(lignes: readonly Ligne[]): string[] {
  const vues = new Set<string>()
  for (const ligne of lignes) for (const nom of Object.keys(estObjet(ligne.set) ? ligne.set : {})) vues.add(nom)
  return [...vues]
}

const celluleDe = (ligne: Ligne, colonne: string) => texteDUneCellule(estObjet(ligne.set) ? ligne.set[colonne] : undefined)

function VueTableau({ donnees }: { donnees: Record<string, unknown> }) {
  const lignes = lignesDe(donnees)
  const colonnes: Column<Ligne>[] = colonnesDe(lignes).map((nom) => ({ key: nom, header: nom, render: (ligne) => celluleDe(ligne, nom) }))
  const total = typeof donnees.total === "number" ? donnees.total : lignes.length
  const titre = typeof donnees.table === "string" ? donnees.table : ""
  return (
    <section aria-label={titre} className="flex flex-col gap-2">
      <p className="text-mute">
        {titre} · {LIBELLES.lignes(total)}
      </p>
      <Table
        columns={colonnes}
        rows={lignes}
        getRowId={(ligne, rang) => texteDUneCellule(ligne.key) || rang}
        responsive="scroll"
        empty={<EmptyState compact title={LIBELLES.vide} />}
      />
    </section>
  )
}

function VueFiche({ donnees }: { donnees: Record<string, unknown> }) {
  const [ligne] = lignesDe(donnees)
  const titre = typeof donnees.table === "string" ? donnees.table : ""
  if (!ligne) return <EmptyState compact title={LIBELLES.vide} />
  const nomDeLaFiche = texteDUneCellule(ligne.key)
  return (
    <section aria-label={nomDeLaFiche || titre} className="flex flex-col gap-2">
      <p className="text-mute">{titre}</p>
      {nomDeLaFiche && <h1 className="text-ink">{nomDeLaFiche}</h1>}
      <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1">
        <ChampsDeLaFiche ligne={ligne} />
      </dl>
    </section>
  )
}

function ChampsDeLaFiche({ ligne }: { ligne: Ligne }) {
  return colonnesDe([ligne]).map((nom) => (
    <div key={nom} className="contents">
      <dt className="text-mute">{nom}</dt>
      <dd className="text-ink">{celluleDe(ligne, nom)}</dd>
    </div>
  ))
}

/** Un lien d'un bloc, rendu en texte : le widget n'ouvre aucune adresse au lot 1. */
function LienEnTexte({ className, children }: { href: string; className?: string; children: ReactNode }) {
  return <span className={className}>{children}</span>
}

const sansAdresse = () => "#"

function VuePage({ resultat }: { resultat: Resultat }) {
  const blocs = (Array.isArray(resultat.blocks) ? resultat.blocks : []).filter((bloc): bloc is Bloc => estObjet(bloc) && typeof bloc.type === "string" && estObjet(bloc.data))
  const titre = typeof resultat.title === "string" ? resultat.title : ""
  return (
    <article aria-label={titre}>
      {titre && <h1 className="text-ink">{titre}</h1>}
      <Reader>
        <BlocsDeLaPage blocs={blocs} />
      </Reader>
    </article>
  )
}

function BlocsDeLaPage({ blocs }: { blocs: readonly Bloc[] }) {
  // Un bloc servi n'a pas d'identité stable dans le résultat : son rang dans la page.
  return blocs.map((bloc, rang) => <RenduDUnBloc key={rang} bloc={{ type: bloc.type, text: typeof bloc.text === "string" ? bloc.text : null, data: bloc.data }} Lien={LienEnTexte} hrefDuChemin={sansAdresse} />)
}

/** La vue d'un résultat ; `null` sans vue connue : le widget se réduit à hauteur nulle. */
export function VueDuResultat({ resultat }: { resultat: Resultat | null }) {
  const vue = vueDe(resultat)
  if (!resultat || !vue) return null
  const donnees = estObjet(resultat.result) ? resultat.result : {}
  return (
    <div className="oto bg-island p-3 text-ink" data-oto-theme={vue.theme}>
      {vue.kind === "table" && <VueTableau donnees={donnees} />}
      {vue.kind === "record" && <VueFiche donnees={donnees} />}
      {vue.kind === "page" && <VuePage resultat={resultat} />}
    </div>
  )
}

/** En attente du résultat (jamais terminal : le widget bascule sur `VueDuDelai` après 12 s). */
export function VueDeChargement() {
  return (
    <div className="oto bg-island p-3" role="status" aria-busy="true" aria-label={LIBELLES.chargement}>
      <Skeleton width="60%" />
    </div>
  )
}

/**
 * La région du délai, montée vide dès le départ pour que son message soit dit à son arrivée
 * (`accessibility-patterns.md § Régions dynamiques`) ; `enRetard` : le résultat n'est pas arrivé, elle dit quoi
 * demander dans la conversation. Vide, elle n'a aucune hauteur.
 */
export function VueDuDelai({ enRetard }: { enRetard: boolean }) {
  return (
    <div role="alert">
      {enRetard && (
        <div className="oto bg-island p-3">
          <Alert tone="fail" role="none" title={LIBELLES.delai}>
            {LIBELLES.delaiConseil}
          </Alert>
        </div>
      )}
    </div>
  )
}
