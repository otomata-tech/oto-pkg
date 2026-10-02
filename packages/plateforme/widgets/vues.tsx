// Les vues du widget routeur (story widgets-dans-la-conversation) : le résultat d'un outil (`structuredContent`)
// choisit sa vue par `view.kind`, une vue du paquet ou `erp:<nom>`, une vue de l'hôte ; sans vue, ou d'un nom
// inconnu du bundle, rien n'est rendu, à hauteur nulle. Les composants sont ceux des écrans (ADR-008 § 5) : `Table`
// du design system, `RenduDUnBloc`. Les actions (page suivante, appels d'une vue de l'ERP, suites) viennent du widget.
// Aucune requête ne part : un lien vers un chemin de l'organisation se rend en texte, un lien `https:` comme à
// l'écran (`noopener`), que l'host ouvre si son bac à sable le permet.
import { useState, type ReactNode } from "react"
import { OTO_THEMES, type Theme } from "../schemas/brand"
import { ERP_VIEW_PREFIX, PACKAGE_VIEWS, type ViewKind } from "../schemas/views"
import { EmptyState } from "../ui/ds/react/empty-state"
import { Alert, Button } from "../ui/ds/react/primitives"
import { Reader } from "../ui/ds/react/reader"
import { Skeleton } from "../ui/ds/react/skeleton"
import { Table, type Column } from "../ui/ds/react/table"
import { RenduDUnBloc } from "../ui/noeud/rendu-des-blocs"
import type { ErpView } from "./index"

export const LIBELLES = {
  chargement: "Chargement du résultat…",
  delai: "Le rendu du résultat n'est pas arrivé.",
  delaiConseil: "Demandez à l'assistant de vous montrer le résultat en texte, ou relancez la demande.",
  refus: "L'appel a été refusé.",
  messageRefuse: "Le message n'a pas pu être écrit dans la conversation.",
  messageConseil: "Demandez la suite à l'assistant vous-même.",
  lignesSuivantes: "Lignes suivantes",
  suites: "Suites proposées à l'assistant",
  vide: "Aucune ligne.",
  lignes: (total: number) => (total === 1 ? "1 ligne" : `${total} lignes`),
  oui: "Oui",
  non: "Non",
} as const

type Resultat = Record<string, unknown>

type Ligne = { key?: unknown; set?: Record<string, unknown> }

type Bloc = { type: string; text: string | null; data: Record<string, unknown> }

/** Ce que le widget sait faire pour la vue ; `null` : l'action n'est pas proposée (`ctx` ou arguments inconnus). */
export type ActionsDuWidget = {
  /** Appelle une fonction avec ses arguments, sans `confirm` ; la réponse remplace la vue. */
  appeler: ((fonction: string, args: Record<string, unknown>) => Promise<void>) | null
  /** La page suivante d'un tableau : même fonction, mêmes arguments, `cursor`. */
  lignesSuivantes: ((cursor: string) => Promise<void>) | null
  /** Une suite proposée, envoyée en message à l'assistant, qui en choisit les arguments. */
  suite: ((fonction: string) => Promise<void>) | null
}

const SANS_ACTION: ActionsDuWidget = { appeler: null, lignesSuivantes: null, suite: null }

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)

type VueConnue = { theme: Theme } & ({ kind: ViewKind } | { erp: ErpView })

/** La vue servie, si son nom et son thème sont connus du bundle ; sinon `null` : rien à rendre. */
function vueDe(resultat: Resultat | null, vuesErp: Readonly<Record<string, ErpView>>): VueConnue | null {
  const vue = resultat?.view
  if (!estObjet(vue)) return null
  const theme = OTO_THEMES.find((one) => one === vue.theme)
  if (!theme || typeof vue.kind !== "string") return null
  const kind = PACKAGE_VIEWS.find((one) => one === vue.kind)
  if (kind) return { kind, theme }
  const nom = vue.kind.startsWith(ERP_VIEW_PREFIX) ? vue.kind.slice(ERP_VIEW_PREFIX.length) : ""
  return Object.hasOwn(vuesErp, nom) ? { erp: vuesErp[nom], theme } : null
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

/** Un bouton qui lance une action asynchrone, occupé jusqu'à sa réponse. */
function BoutonDAction({ libelle, action }: { libelle: string; action: () => Promise<void> }) {
  const [enCours, setEnCours] = useState(false)
  const lancer = () => {
    setEnCours(true)
    void action().finally(() => setEnCours(false))
  }
  return (
    <Button size="sm" loading={enCours} aria-busy={enCours} onClick={lancer}>
      {libelle}
    </Button>
  )
}

function VueTableau({ donnees, lignesSuivantes }: { donnees: Record<string, unknown>; lignesSuivantes: ActionsDuWidget["lignesSuivantes"] }) {
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
      {typeof donnees.next_cursor === "string" && lignesSuivantes && (
        <div>
          <BoutonDAction libelle={LIBELLES.lignesSuivantes} action={() => lignesSuivantes(String(donnees.next_cursor))} />
        </div>
      )}
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

/** Un lien vers un chemin de l'organisation, rendu en texte : le widget n'ouvre aucune adresse de l'hôte. */
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

/** Les suites d'un `call` (`next_actions`, déjà sans fonction sensible), chacune envoyée à l'assistant. */
function Suites({ resultat, suite }: { resultat: Resultat; suite: ActionsDuWidget["suite"] }) {
  const noms = (Array.isArray(resultat.next_actions) ? resultat.next_actions : []).filter((nom): nom is string => typeof nom === "string")
  // `read` propose des outils, `call` des fonctions : seules les fonctions d'un `call` sont des suites.
  if (!suite || typeof resultat.function !== "string" || noms.length === 0) return null
  return (
    <nav aria-label={LIBELLES.suites} className="flex flex-wrap gap-2">
      {noms.map((nom) => (
        <BoutonDAction key={nom} libelle={nom} action={() => suite(nom)} />
      ))}
    </nav>
  )
}

type VueDuResultatProps = { resultat: Resultat | null; vuesErp?: Readonly<Record<string, ErpView>>; actions?: ActionsDuWidget }

/** La vue d'un résultat ; `null` sans vue connue : le widget se réduit à hauteur nulle. */
export function VueDuResultat({ resultat, vuesErp = {}, actions = SANS_ACTION }: VueDuResultatProps) {
  const vue = vueDe(resultat, vuesErp)
  if (!resultat || !vue) return null
  const donnees = estObjet(resultat.result) ? resultat.result : {}
  return (
    <div className="oto flex flex-col gap-3 bg-island p-3 text-ink" data-oto-theme={vue.theme}>
      {"erp" in vue ? <vue.erp result={donnees} theme={vue.theme} call={actions.appeler} /> : <VueDuPaquet kind={vue.kind} resultat={resultat} donnees={donnees} actions={actions} />}
      <Suites resultat={resultat} suite={actions.suite} />
    </div>
  )
}

function VueDuPaquet({ kind, resultat, donnees, actions }: { kind: ViewKind; resultat: Resultat; donnees: Record<string, unknown>; actions: ActionsDuWidget }) {
  if (kind === "table") return <VueTableau donnees={donnees} lignesSuivantes={actions.lignesSuivantes} />
  if (kind === "record") return <VueFiche donnees={donnees} />
  return <VuePage resultat={resultat} />
}

/** En attente du résultat (jamais terminal : le widget dit le délai dans `RegionDAlerte` après 12 s). */
export function VueDeChargement() {
  return (
    <div className="oto bg-island p-3" role="status" aria-busy="true" aria-label={LIBELLES.chargement}>
      <Skeleton width="60%" />
    </div>
  )
}

/**
 * La région d'alerte du widget, montée vide dès le départ pour que son message soit dit à son arrivée
 * (`accessibility-patterns.md § Régions dynamiques`) : le délai passé sans résultat (quoi demander dans la
 * conversation), ou le refus d'un appel du widget. Vide, elle n'a aucune hauteur.
 */
export function RegionDAlerte({ message }: { message: { titre: string; texte: string } | null }) {
  return (
    <div role="alert">
      {message && (
        <div className="oto bg-island p-3">
          <Alert tone="fail" role="none" title={message.titre}>
            {message.texte}
          </Alert>
        </div>
      )}
    </div>
  )
}
