// Le rendu d'un bloc, un par type (E05-S02, AC4, AC5 ; ADR-011 § 2) : servi aux lecteurs par l'écran
// serveur (lien de l'hôte) et aux rangées de l'éditeur au repos (`"a"`). Ni directive ni état : il sert des
// deux côtés. Aucun `dangerouslySetInnerHTML` : le texte en ligne devient des éléments React
// (`security-patterns.md § XSS Prevention`). Chaque bloc porte l'ancre `id` = sa référence. Sans lui,
// lecture et édition rendraient un bloc de deux façons.
//
// Porté d'oto-frontend (`components/noeud/corps-du-noeud.tsx`, `ReadOnlyBlock`) : un rendu par type sur les
// primitives du lecteur (`ReaderHeading`, `ReaderParagraph`, `ReaderList`), les titres décalés sous le
// `<h1>` (HN-E05S02-4), le tableau markdown et le code en `oto-code`, le code en ligne en `oto-mono`, un
// contenu cité en encart (`EmbedCard`, rangé ailleurs), un type inconnu jamais effacé (E05-S09, partie c1).
// Retiré : la marque d'origine par `Symbol` (le texte d'un bloc est toujours lu en balisage, M15).
//
// E05-S10 : un seul niveau de titre, un `<h2>` quel que soit le niveau écrit (AC-a5) ; une adresse web est un
// lien, l'adresse entière au survol, ouvert dans un nouvel onglet (AC-a8).
//
// E05-S11 (retour 11, fiche D107) : une page citée se lit par son titre dans la phrase (`titreDuLien`) ; parmi
// les cibles que l'écran connaît (`cibles`), une page invisible ou à la corbeille se lit en texte, sans lien,
// et une page déplacée mène à sa nouvelle place. Un chemin inconnu (page publique) garde son lien.
//
// M64 : les liens sortants lus après la page (`lecture`) ne suspendent que le titre de chaque lien, jamais le
// texte autour : un repli qui recopiait le document le servait deux fois pendant le flux, ancres comprises.
import { Suspense, use, type ReactNode } from "react"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { LIEN } from "../components/classes"
import { EmbedCard } from "../ds/react/embed-card"
import { ReaderHeading, ReaderList, ReaderParagraph } from "../ds/react/reader"
import { texteDUnAppel } from "../procedure/libelles"
import { cibleDe, estUnTableau, segmentsEnLigne, titreDuLien, type CiblesDesLiens, type Segment } from "./en-ligne"
import { GlypheDeNature } from "./glyphes"
import { ECRAN } from "./libelles"
import { ciblesLues } from "./sous-pages"

/** Le lien d'un bloc : celui de l'hôte (écran serveur) ou `"a"` (éditeur, îlot client). */
type LienDUnBloc = LienDeLHote | "a"

/** Un bloc servi, ou un bloc de l'éditeur : sans référence tant qu'il n'est pas écrit. */
type BlocARendre = { type: string; text: string | null; data: Record<string, unknown>; ref?: string }

/**
 * Ce que lit le rendu d'un lien : le lien de l'hôte, l'adresse d'un chemin, les cibles connues (E05-S11, AC-26),
 * et les champs de `read` sur le nœud (ses liens sortants), lus par l'hôte après la page.
 */
type Liens = { Lien: LienDUnBloc; hrefDuChemin: (chemin: string) => string; cibles?: CiblesDesLiens; lecture?: Promise<Resultat<Record<string, unknown>>> }

type RenduProps = Liens & { bloc: BlocARendre }

type EnLigneProps = Liens & { texte: string }

/**
 * Un titre est un `<h2>`, quel que soit son niveau écrit (E05-S10, AC-a5 : un seul niveau, « Titre ») : le
 * titre du nœud est le seul `<h1>` (AC4, AC14).
 */
export const BALISE_DE_TITRE = "h2"

/** L'écart d'un bloc lu que le lecteur ne pose pas lui-même (code, image, cases), au rythme de ses paragraphes. */
const APRES = "mb-3.5"

/**
 * Une adresse web (AC-a8) : un lien vers un autre site, ouvert dans un nouvel onglet, sans l'adresse de la page
 * qui le porte (`noreferrer`) ; son libellé raccourci, qui le nomme, l'adresse entière au survol (`title`).
 */
export function AdresseWeb({ adresse, libelle, className = LIEN }: { adresse: string; libelle: string; className?: string }) {
  return (
    <a href={adresse} title={adresse} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {libelle}
    </a>
  )
}

type LienInterneProps = Liens & { lien: Extract<Segment, { genre: "lien" }> }

/**
 * Une page citée (AC-26, AC-27) : son titre, lien vers sa place ; sans page visible qui y réponde, son titre en
 * texte ; un chemin que l'écran ne connaît pas garde son lien. Les liens sortants à venir (`lecture`) : le lien
 * lu dans l'arbre en attendant, puis celui qu'ils complètent (M64).
 */
function LienInterne({ lecture, ...props }: LienInterneProps) {
  if (!lecture) return <LienDesCibles {...props} />
  return (
    <Suspense fallback={<LienDesCibles {...props} />}>
      <LienLu {...props} lecture={lecture} />
    </Suspense>
  )
}

function LienLu({ lecture, ...props }: LienInterneProps & { lecture: Promise<Resultat<Record<string, unknown>>> }) {
  return <LienDesCibles {...props} cibles={ciblesLues(props.cibles, use(lecture))} />
}

function LienDesCibles({ lien, Lien, hrefDuChemin, cibles }: Omit<LienInterneProps, "lecture">) {
  const titre = titreDuLien(lien, cibles)
  const cible = cibleDe(cibles, lien.chemin)
  if (cible === null) return titre
  const chemin = cible?.chemin ?? lien.chemin
  const ancre = lien.reference === null ? "" : `#${encodeURIComponent(lien.reference)}`
  return (
    <Lien href={`${hrefDuChemin(chemin)}${ancre}`} className={LIEN}>
      {titre}
    </Lien>
  )
}

/** Des segments en éléments : un lien ou du code peuvent être en gras ou en italique. */
function rendre(segments: readonly Segment[], liens: Liens): ReactNode[] {
  return segments.map((segment, rang) => {
    // Un segment n'a pas d'identité : son rang dans un texte dont l'identité est ailleurs.
    if (segment.genre === "lien") return <LienInterne key={rang} lien={segment} {...liens} />
    if (segment.genre === "web") return <AdresseWeb key={rang} adresse={segment.adresse} libelle={segment.libelle} />
    // `oto-mono`, le rôle « mono en ligne » du design system ; `oto-code` est un bloc.
    if (segment.genre === "code") return <code key={rang} className="oto-mono">{segment.texte}</code>
    if (segment.genre === "gras") return <strong key={rang}>{rendre(segment.contenu, liens)}</strong>
    if (segment.genre === "italique") return <em key={rang}>{rendre(segment.contenu, liens)}</em>
    return segment.texte
  })
}

/**
 * Le texte en ligne d'un bloc (AC5) : `<code>`, `<strong>`, `<em>` et les liens, le reste en texte. L'éditeur
 * le rend aussi sur le champ d'un bloc au repos (E05-S11, AC-26).
 */
export function EnLigne({ texte, ...liens }: EnLigneProps): ReactNode {
  return rendre(segmentsEnLigne(texte), liens)
}

const chaine = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "")

function elements(data: Record<string, unknown>): unknown[] {
  return Array.isArray(data.items) ? data.items : []
}

function Liste({ bloc, ...liens }: RenduProps) {
  const numerotee = bloc.data.ordered === true
  const debut = numerotee && typeof bloc.data.start === "number" ? bloc.data.start : undefined
  return (
    <ReaderList as={numerotee ? "ol" : "ul"} id={bloc.ref} start={debut}>
      {elements(bloc.data)
        .map(chaine)
        .map((item, rang) => (
          <li key={rang}>
            <EnLigne texte={item} {...liens} />
          </li>
        ))}
    </ReaderList>
  )
}

/** Chaque case dit « fait » ou « à faire » en toutes lettres ; le glyphe ne sert qu'à l'œil. */
function Cases({ bloc, ...liens }: RenduProps) {
  return (
    <ul id={bloc.ref} className={`${APRES} space-y-1.5 text-sm text-ink`}>
      {elements(bloc.data).map((item, rang) => {
        const fait = typeof item === "object" && item !== null && "checked" in item && item.checked === true
        const texte = typeof item === "object" && item !== null && "text" in item ? chaine(item.text) : ""
        return (
          <li key={rang} className="flex gap-2">
            <span aria-hidden="true">{fait ? "☑" : "☐"}</span>
            <span>
              <EnLigne texte={texte} {...liens} />
              <span className="ml-1 text-mute">{fait ? "(fait)" : "(à faire)"}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Un bloc à légende (code, diagramme) : l'en-tête du bloc de code du design system, puis le texte préformaté. */
function Preformate({ id, legende, texte }: { id?: string; legende: string; texte: string }) {
  return (
    <figure id={id} className={`oto-code ${APRES}`}>
      <figcaption className="oto-code-head">{legende}</figcaption>
      <pre>
        <code>{texte}</code>
      </pre>
    </figure>
  )
}

function ImageDuBloc({ bloc, ...liens }: RenduProps) {
  const source = chaine(bloc.data.src)
  const alternatif = chaine(bloc.data.alt)
  return (
    <figure id={bloc.ref} className={`${APRES} space-y-1`}>
      {/^https:/i.test(source) ? (
        // Hôte quelconque : il ne reçoit pas l'adresse de la page qui l'affiche (`no-referrer`), et une
        // image sous le pli ne part que lorsqu'on l'approche.
        // eslint-disable-next-line @next/next/no-img-element -- source quelconque écrite dans un bloc : next/image exigerait de déclarer chaque hôte, et ui/ n'importe pas Next
        <img src={source} alt={alternatif} referrerPolicy="no-referrer" loading="lazy" className="max-w-full rounded-md" />
      ) : (
        <p className="text-sm text-ink">{`Image non affichée : adresse non sûre. ${alternatif}`.trim()}</p>
      )}
      {bloc.text ? (
        <figcaption className="oto-caption">
          <EnLigne texte={bloc.text} {...liens} />
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * Le rendu par défaut d'un bloc `reference` (H56, P18) : le chemin cité en encart, rangé ailleurs, son nom
 * portant le lien. E07-S03 le remplace par une vue ou une carte quand la référence est résolue, et le garde
 * sinon.
 */
export function ReferenceEnLien({ bloc, Lien, hrefDuChemin }: RenduProps) {
  const chemin = chaine(bloc.data.path)
  return <EmbedCard id={bloc.ref} as={Lien} href={hrefDuChemin(chemin)} icon={<GlypheDeNature nature="page" taille="sm" />} name={chemin} where={ECRAN.rangeAilleurs} whereKind="elsewhere" />
}

function Paragraphe({ bloc, ...liens }: RenduProps) {
  const texte = bloc.text ?? ""
  if (estUnTableau(texte)) {
    return (
      <pre id={bloc.ref} className={`oto-code ${APRES} overflow-x-auto p-3`}>
        {texte}
      </pre>
    )
  }
  return (
    <ReaderParagraph id={bloc.ref} className="whitespace-pre-line">
      <EnLigne texte={texte} {...liens} />
    </ReaderParagraph>
  )
}

/**
 * Un bloc rendu par son type (AC4) ; un type inconnu affiche son texte, sinon le dit, jamais rien.
 * `rendu` : un bloc `reference` rendu en place par la page serveur (vue, carte ou avis, E07-S03),
 * sous l'ancre du bloc ; sans lui, `ReferenceEnLien`.
 * `baliseDeTitre` : la balise d'un titre rendu sous un titre de même niveau que le sien, un Contexte montré
 * dans un îlot de réglages (E05-S11, AC-24) ; sans elle, `BALISE_DE_TITRE`.
 */
export function RenduDUnBloc(props: RenduProps & { rendu?: ReactNode; baliseDeTitre?: "h3" }): ReactNode {
  const { bloc, rendu, baliseDeTitre, ...liens } = props
  switch (bloc.type) {
    case "heading":
      return (
        <ReaderHeading as={baliseDeTitre ?? BALISE_DE_TITRE} id={bloc.ref}>
          <EnLigne texte={bloc.text ?? ""} {...liens} />
        </ReaderHeading>
      )
    case "paragraph":
      return <Paragraphe {...props} />
    case "list":
      return <Liste {...props} />
    case "checklist":
      return <Cases {...props} />
    case "code": {
      const langage = chaine(bloc.data.language)
      return <Preformate id={bloc.ref} legende={langage ? `Code · ${langage}` : "Code"} texte={bloc.text ?? ""} />
    }
    // Un appel déjà écrit se lit comme un texte (M59, HN-M59-1), jamais exécuté par l'écran ; son texte n'est
    // pas lu en balisage : les arguments se montrent tels qu'ils sont.
    case "call":
      return (
        <ReaderParagraph id={bloc.ref} className="whitespace-pre-line">
          {texteDUnAppel(bloc.data)}
        </ReaderParagraph>
      )
    case "mermaid":
      return <Preformate id={bloc.ref} legende="Diagramme (texte)" texte={bloc.text ?? ""} />
    case "image":
      return <ImageDuBloc {...props} />
    case "callout":
      return (
        <div id={bloc.ref} role="note" className={`oto-alert ${APRES}`}>
          <EnLigne texte={bloc.text ?? ""} {...liens} />
        </div>
      )
    case "reference":
      return rendu === undefined ? <ReferenceEnLien {...props} /> : <div id={bloc.ref}>{rendu}</div>
    default:
      return bloc.text ? (
        <ReaderParagraph id={bloc.ref} className="whitespace-pre-line">
          {bloc.text}
        </ReaderParagraph>
      ) : (
        <p id={bloc.ref} className="oto-caption">{`Bloc de type « ${bloc.type} » non affiché ici.`}</p>
      )
  }
}
