// Le modèle d'édition (E05-S02, AC10 à AC12) : opérations pures sur une suite de rangées, chacune
// tenant un bloc et sa clé de rendu, locale, jamais écrite dans un bloc. Un bloc servi garde ses
// champs (`id`, `ref`, `revision`, `key`, données inconnues comprises) ; un bloc neuf n'a jamais d'`id` :
// le serveur le fabrique (ADR-011 § 2). Sans lui, chaque geste du clavier recoderait sa
// transformation, sans test pur.
//
// Porté d'oto-frontend (`components/editor/use-editing-model.ts`). Repris : les opérations pures
// (`editText` et ses préfixes, `splitAt`, `exitList`, `mergeBackward`, `insertAfter`, `insertFirst`,
// `removeAt`, `reinsertAt`, `retype`, `moveBlock`), la clé de rendu distincte de l'`id`, l'étalement
// qui garde les champs inconnus. Retiré : `adopt` par rangs et `syncFrom` (→ `id` et révision rendus
// par chaque écriture), les préfixes sans niveau (ici `#`, `##`, `###`), `ordered` posé sur un
// paragraphe (→ `list` numérotée, E01-S06).
//
// M59 (fiche D104) : plus d'appel écrit à l'écran, sur une procédure comme ailleurs ; un bloc `call` déjà
// écrit se lit et s'écrit comme un Texte (`texteDUnAppel`) et reste tel quel en base tant qu'on ne le change
// pas (HN-M59-1).
//
// E05-S10 (AC-a2, AC-a5) : un seul niveau de titre, « Titre » (un titre de niveau 2 ou 3 déjà écrit se lit
// comme lui, sans migration) ; trois formes de plus sur des types existants (liste à cocher `checklist`,
// citation `callout`, code `code`) ; dupliquer un bloc ; cocher une case.
import type { BlockView } from "../../../schemas"
import { texteDUnAppel } from "../../procedure/libelles"
import { texteLu } from "../en-ligne"

/** Les formes qu'écrit l'écran (E05-S10, AC-a2), dans l'ordre du menu du bloc ; tout autre bloc se lit, se déplace, se duplique et se supprime. */
export const FORMES_ECRITES = ["texte", "titre", "puces", "numerotee", "cases", "citation", "code"] as const

export type Forme = (typeof FORMES_ECRITES)[number]

/** Un bloc du modèle : celui que le serveur a servi, ou un bloc neuf, sans `id`, `ref` ni révision. */
export type BlocEdite = {
  id?: string
  ref?: string
  revision?: number
  type: string
  text: string | null
  data: Record<string, unknown>
  key: string | null
}

export type Rangee = { cle: string; bloc: BlocEdite }

/**
 * Où poser le focus après une opération : le champ de la rangée, curseur à ce rang (`null` : la
 * sélection du champ reste la sienne), ou sa poignée (`rangee`, et pour un bloc sans champ : E05-S08, AC4).
 */
export type Focus = { cle: string; curseur: number | null; cible?: "champ" | "rangee" }

export type Suite = { modele: Rangee[]; focus?: Focus }

/** Une rangée retirée et ce qu'il faut pour la rétablir après son ancien voisin (AC12). */
export type Retiree = { rangee: Rangee; voisin: string | null; rang: number }

// Un compteur de rendu, pas un identifiant : il ne quitte jamais l'onglet et ne part sur aucun réseau.
// Il ne sert qu'aux blocs créés dans le navigateur : sur le serveur, il vivrait d'une requête à l'autre.
let compteur = 0
function nouvelleCle(): string {
  compteur += 1
  return `rangee-${compteur}`
}

/** Champs de `data` propres à une forme : un changement de forme les retire (E05-S02, § Schémas). */
const PROPRES_A_LA_FORME = new Set(["level", "items", "ordered", "start", "language", "tone"])

/** Les formes qui s'écrivent en lignes (un élément par ligne, ou du code) : Entrée y passe à la ligne. */
export const FORMES_EN_LIGNES: ReadonlySet<Forme> = new Set(["puces", "numerotee", "cases", "code"])

/** Le préfixe tapé au début d'un Texte et la forme qu'il donne (AC11) ; un seul niveau de titre (E05-S10, AC-a5). */
const PREFIXES: readonly (readonly [string, Forme])[] = [
  ["# ", "titre"],
  ["- ", "puces"],
  ["* ", "puces"],
  ["1. ", "numerotee"],
]

/** La forme d'un bloc que l'écran écrit, `null` pour tout autre (il se modifie par l'assistant). */
export function formeDe(bloc: Pick<BlocEdite, "type" | "data">): Forme | null {
  // Un appel déjà écrit s'écrit comme un Texte (M59) : son texte est `texteDUnAppel`.
  if (bloc.type === "paragraph" || bloc.type === "call") return "texte"
  // Tout niveau de titre se lit « Titre » : un titre 2 ou 3 déjà écrit garde son niveau en base (E05-S10, AC-a5).
  if (bloc.type === "heading") return "titre"
  if (bloc.type === "list") return bloc.data.ordered === true ? "numerotee" : "puces"
  if (bloc.type === "checklist") return "cases"
  if (bloc.type === "callout") return "citation"
  if (bloc.type === "code") return "code"
  return null
}

/** Les éléments d'une liste à cocher, lus champ par champ : le texte, l'état, et le reste de l'objet, gardé. */
function casesDe(data: Record<string, unknown>): { text: string; checked: boolean; reste: Record<string, unknown> }[] {
  return (Array.isArray(data.items) ? data.items : []).map((item) => {
    const reste: Record<string, unknown> = typeof item === "object" && item !== null ? { ...item } : {}
    return { text: typeof reste.text === "string" ? reste.text : "", checked: reste.checked === true, reste }
  })
}

/** Le texte écrivable d'un bloc : une liste, ou une liste à cocher, s'écrit un élément par ligne. */
export function texteDe(bloc: Pick<BlocEdite, "type" | "text" | "data">): string {
  if (bloc.type === "call") return texteDUnAppel(bloc.data)
  if (bloc.type === "checklist") return casesDe(bloc.data).map((une) => une.text).join("\n")
  if (bloc.type !== "list") return bloc.text ?? ""
  return (Array.isArray(bloc.data.items) ? bloc.data.items : []).map((item) => (typeof item === "string" ? item : "")).join("\n")
}

/**
 * Un appel déjà écrit devenu Texte (M59) : son texte lisible, sans `function` ni `args` ; `id`, `ref`, clé
 * et révision restent, et il part en `replace_block` comme tout changement de forme.
 */
function enTexte(bloc: BlocEdite): BlocEdite {
  const data = Object.fromEntries(Object.entries(bloc.data).filter(([champ]) => champ !== "function" && champ !== "args"))
  return { ...bloc, type: "paragraph", text: texteDUnAppel(bloc.data), data }
}

/**
 * Le même texte, reposé dans le bloc par étalement, jamais par reconstruction ; une case garde son état par
 * rang. Un appel dont le texte ne change pas reste un appel : rien ne part pour lui (M59, HN-M59-1).
 */
export function avecTexte(bloc: BlocEdite, texte: string): BlocEdite {
  if (bloc.type === "call") return texte === texteDe(bloc) ? bloc : { ...enTexte(bloc), text: texte }
  if (bloc.type === "list") return { ...bloc, data: { ...bloc.data, items: texte.split("\n") } }
  if (bloc.type === "checklist") {
    const avant = casesDe(bloc.data)
    const items = texte.split("\n").map((ligne, rang) => ({ ...avant[rang]?.reste, text: ligne, checked: avant[rang]?.checked ?? false }))
    return { ...bloc, data: { ...bloc.data, items } }
  }
  return { ...bloc, text: texte }
}

/** L'état des cases d'une liste à cocher, par rang (E05-S10, AC-a2) ; vide hors d'une liste à cocher. */
export function casesCochees(bloc: Pick<BlocEdite, "type" | "data">): boolean[] {
  return bloc.type === "checklist" ? casesDe(bloc.data).map((une) => une.checked) : []
}

/**
 * Le bloc sous une autre forme : le texte suit, les champs propres à l'ancienne forme partent, le
 * reste (`id`, `ref`, `key`, révision, données inconnues) reste.
 */
export function avecForme(servi: BlocEdite, forme: Forme): BlocEdite {
  if (formeDe(servi) === forme) return servi
  const bloc = servi.type === "call" ? enTexte(servi) : servi
  const texte = texteDe(bloc)
  const data = Object.fromEntries(Object.entries(bloc.data).filter(([champ]) => !PROPRES_A_LA_FORME.has(champ)))
  if (forme === "texte") return { ...bloc, type: "paragraph", text: texte, data }
  if (forme === "puces") return { ...bloc, type: "list", text: null, data: { ...data, items: texte.split("\n") } }
  if (forme === "numerotee") return { ...bloc, type: "list", text: null, data: { ...data, items: texte.split("\n"), ordered: true } }
  if (forme === "cases") return { ...bloc, type: "checklist", text: null, data: { ...data, items: texte.split("\n").map((ligne) => ({ text: ligne, checked: false })) } }
  if (forme === "citation") return { ...bloc, type: "callout", text: texte, data }
  if (forme === "code") return { ...bloc, type: "code", text: texte, data }
  return { ...bloc, type: "heading", text: texte, data: { ...data, level: 1 } }
}

/** Les premiers mots d'un bloc, balisage retiré, pour nommer ses gestes (AC8, AC10). */
export function premiersMots(bloc: Pick<BlocEdite, "type" | "text" | "data">): string {
  const donnee = (champ: string) => (typeof bloc.data[champ] === "string" ? String(bloc.data[champ]) : "")
  const texte = bloc.type === "call" ? donnee("function") : bloc.type === "reference" ? donnee("path") : bloc.type === "image" ? donnee("alt") || (bloc.text ?? "") : texteDe(bloc)
  const mots = texteLu(texte).trim().split(/\s+/).filter(Boolean).slice(0, 4)
  return mots.length > 0 ? mots.join(" ") : "bloc vide"
}

/**
 * Les rangées des blocs servis ; une rangée déjà montée pour le même `id` garde sa clé de rendu. Un bloc
 * servi prend son `id` pour première clé : le rendu du serveur et l'hydratation s'accordent (`data-cle`).
 * La clé reste ensuite celle de la rangée, quel que soit l'`id` que le bloc prendra.
 */
export function rangeesDepuis(blocs: readonly BlockView[], precedentes: readonly Rangee[] = []): Rangee[] {
  const cles = new Map(precedentes.flatMap((rangee) => (rangee.bloc.id ? [[rangee.bloc.id, rangee.cle] as const] : [])))
  return blocs.map(({ id, ref, revision, type, text, data, key }) => ({ cle: cles.get(id) ?? id, bloc: { id, ref, revision, type, text, data, key } }))
}

function nouvelleRangee(forme: Forme, texte: string): Rangee {
  return { cle: nouvelleCle(), bloc: avecTexte(avecForme({ type: "paragraph", text: "", data: {}, key: null }, forme), texte) }
}

const rangDe = (modele: readonly Rangee[], cle: string) => modele.findIndex((rangee) => rangee.cle === cle)

function remplacer(modele: readonly Rangee[], rang: number, ...rangees: Rangee[]): Rangee[] {
  return [...modele.slice(0, rang), ...rangees, ...modele.slice(rang + 1)]
}

/**
 * Écrire le texte d'un bloc (AC11) : au début d'un Texte, un préfixe qui vient d'être tapé en change
 * la forme et disparaît ; un Texte servi qui commence déjà par « - » le reste (HN-E05S02-17).
 */
export function ecrireTexte(modele: readonly Rangee[], cle: string, texte: string): Suite {
  const rang = rangDe(modele, cle)
  const rangee = modele[rang]
  if (!rangee) return { modele: [...modele] }
  const avant = texteDe(rangee.bloc)
  const prefixe = rangee.bloc.type === "paragraph" ? PREFIXES.find(([marque]) => texte.startsWith(marque) && !avant.startsWith(marque)) : undefined
  if (!prefixe) return { modele: remplacer(modele, rang, { cle, bloc: avecTexte(rangee.bloc, texte) }) }
  const [marque, forme] = prefixe
  // Le bloc change d'élément (titre, liste) : son champ est remonté, le curseur se redemande.
  return { modele: remplacer(modele, rang, { cle, bloc: avecTexte(avecForme(rangee.bloc, forme), texte.slice(marque.length)) }), focus: { cle, curseur: 0 } }
}

/**
 * Scinder un Texte ou un titre au curseur (AC11) : ce qui suit ouvre un Texte neuf, juste après. En tête
 * d'un bloc non vide, le Texte neuf s'ouvre avant lui, et le bloc garde son `id`, sa forme et sa clé :
 * vidé, il partirait en `delete_block`, et un titre perdrait sa clé (HN-E05S02-25).
 */
export function scinder(modele: readonly Rangee[], cle: string, curseur: number): Suite {
  const rang = rangDe(modele, cle)
  const rangee = modele[rang]
  if (!rangee) return { modele: [...modele] }
  const texte = texteDe(rangee.bloc)
  if (curseur === 0 && texte !== "") {
    const avant = nouvelleRangee("texte", "")
    return { modele: [...modele.slice(0, rang), avant, ...modele.slice(rang)], focus: { cle: avant.cle, curseur: 0 } }
  }
  const suite = nouvelleRangee("texte", texte.slice(curseur))
  return { modele: remplacer(modele, rang, { cle, bloc: avecTexte(rangee.bloc, texte.slice(0, curseur)) }, suite), focus: { cle: suite.cle, curseur: 0 } }
}

/**
 * Sortir d'une liste (AC11) : la dernière ligne, vide, est retirée ; un Texte neuf s'ouvre après. Une
 * liste qui n'avait que cette ligne devient elle-même un Texte vide, son `id` gardé.
 */
export function sortirDeLaListe(modele: readonly Rangee[], cle: string): Suite {
  const rang = rangDe(modele, cle)
  const rangee = modele[rang]
  if (!rangee) return { modele: [...modele] }
  const restant = texteDe(rangee.bloc).replace(/\n$/, "")
  if (restant === "") return { modele: remplacer(modele, rang, { cle, bloc: avecTexte(avecForme(rangee.bloc, "texte"), "") }), focus: { cle, curseur: 0 } }
  const suite = nouvelleRangee("texte", "")
  return { modele: remplacer(modele, rang, { cle, bloc: avecTexte(rangee.bloc, restant) }, suite), focus: { cle: suite.cle, curseur: 0 } }
}

/**
 * Fondre un bloc dans le précédent (AC12) : les deux textes joints, le curseur à la jointure, `avec`
 * = la rangée qui reste. Si l'un des deux n'est pas écrivable, rien ne fusionne : le focus va à la
 * rangée qui ne l'est pas.
 */
export function fusionner(modele: readonly Rangee[], cle: string): Suite & { avec?: string } {
  const rang = rangDe(modele, cle)
  const precedente = modele[rang - 1]
  const courante = modele[rang]
  if (!courante || !precedente) return { modele: [...modele] }
  if (formeDe(precedente.bloc) === null) return { modele: [...modele], focus: { cle: precedente.cle, curseur: null, cible: "rangee" } }
  if (formeDe(courante.bloc) === null) return { modele: [...modele], focus: { cle: courante.cle, curseur: null, cible: "rangee" } }
  const jointure = texteDe(precedente.bloc)
  const fondue = { cle: precedente.cle, bloc: avecTexte(precedente.bloc, jointure + texteDe(courante.bloc)) }
  return { modele: [...modele.slice(0, rang - 1), fondue, ...modele.slice(rang + 1)], focus: { cle: precedente.cle, curseur: jointure.length }, avec: precedente.cle }
}

/** Un bloc neuf, sans `id`, juste après une rangée, le focus dedans (AC11). */
export function insererApres(modele: readonly Rangee[], cle: string, forme: Forme = "texte"): Suite {
  const rang = rangDe(modele, cle)
  if (rang < 0) return { modele: [...modele] }
  const neuve = nouvelleRangee(forme, "")
  return { modele: [...modele.slice(0, rang + 1), neuve, ...modele.slice(rang + 1)], focus: { cle: neuve.cle, curseur: 0 } }
}

/** Un bloc neuf en tête : le seul chemin d'une page sans bloc (AC11). */
export function insererEnTete(modele: readonly Rangee[], forme: Forme = "texte"): Suite {
  const neuve = nouvelleRangee(forme, "")
  return { modele: [neuve, ...modele], focus: { cle: neuve.cle, curseur: 0 } }
}

/**
 * Retirer une rangée (AC12) : le focus va au bloc précédent, au suivant s'il n'y en a pas, en fin de son
 * champ, ou sur sa poignée s'il n'en a pas (E05-S08, AC4 ; oto-frontend `removeAt`).
 */
export function retirer(modele: readonly Rangee[], cle: string): Suite & { retiree?: Retiree } {
  const rang = rangDe(modele, cle)
  if (rang < 0) return { modele: [...modele] }
  const suivant = modele.filter((rangee) => rangee.cle !== cle)
  const voisine = suivant[rang - 1] ?? suivant[rang]
  const retiree = { rangee: modele[rang], voisin: modele[rang - 1]?.cle ?? null, rang }
  return { modele: suivant, retiree, ...(voisine ? { focus: { cle: voisine.cle, curseur: Number.MAX_SAFE_INTEGER } } : {}) }
}

/**
 * Rétablir une rangée retirée (AC12, HN-E05S02-13) : le même bloc (forme, texte, données, clé), sans
 * `id`, `ref` ni révision, après son ancien voisin, en tête s'il n'en avait pas ; le focus va à son champ,
 * ou à sa poignée s'il n'en a pas (E05-S08, AC4 ; oto-frontend `reinsertAt`).
 */
export function retablir(modele: readonly Rangee[], retiree: Retiree): Suite {
  const { type, text, data, key } = retiree.rangee.bloc
  const neuve = { cle: nouvelleCle(), bloc: { type, text, data, key } }
  const apres = retiree.voisin === null ? 0 : rangDe(modele, retiree.voisin) + 1
  const rang = apres > 0 ? apres : retiree.voisin === null ? 0 : Math.min(retiree.rang, modele.length)
  return { modele: [...modele.slice(0, rang), neuve, ...modele.slice(rang)], focus: { cle: neuve.cle, curseur: 0 } }
}

/** Changer la forme d'un bloc (AC11) : le texte suit, le focus revient au champ, en fin de texte. */
export function changerDeForme(modele: readonly Rangee[], cle: string, forme: Forme): Suite {
  const rang = rangDe(modele, cle)
  const rangee = modele[rang]
  if (!rangee) return { modele: [...modele] }
  return { modele: remplacer(modele, rang, { cle, bloc: avecForme(rangee.bloc, forme) }), focus: { cle, curseur: Number.MAX_SAFE_INTEGER } }
}

/** Déplacer d'un rang (AC12) ; rien aux bornes. Le focus reste dans le bloc déplacé. */
export function deplacer(modele: readonly Rangee[], cle: string, pas: -1 | 1): Suite {
  const rang = rangDe(modele, cle)
  const cible = rang + pas
  if (rang < 0 || cible < 0 || cible >= modele.length) return { modele: [...modele] }
  const suivant = [...modele]
  ;[suivant[rang], suivant[cible]] = [suivant[cible], suivant[rang]]
  return { modele: suivant, focus: { cle, curseur: null } }
}

/**
 * « Dupliquer » (E05-S10, AC-a2) : le même bloc juste après, sans `id`, `ref`, révision ni clé (une clé est
 * unique dans un nœud) ; le focus va à son champ, en fin de texte, ou à sa poignée s'il n'en a pas.
 */
export function dupliquer(modele: readonly Rangee[], cle: string): Suite {
  const rang = rangDe(modele, cle)
  const rangee = modele[rang]
  if (!rangee) return { modele: [...modele] }
  const { type, text, data } = rangee.bloc
  const copie: Rangee = { cle: nouvelleCle(), bloc: { type, text, data, key: null } }
  return { modele: [...modele.slice(0, rang + 1), copie, ...modele.slice(rang + 1)], focus: { cle: copie.cle, curseur: Number.MAX_SAFE_INTEGER } }
}

/** Cocher ou décocher la case d'un rang d'une liste à cocher (E05-S10, AC-a2) ; rien hors d'une liste à cocher. */
export function basculerLaCase(modele: readonly Rangee[], cle: string, ligne: number): Rangee[] {
  const rang = rangDe(modele, cle)
  const rangee = modele[rang]
  if (!rangee || rangee.bloc.type !== "checklist") return [...modele]
  const items = casesDe(rangee.bloc.data).map((une, index) => ({ ...une.reste, text: une.text, checked: index === ligne ? !une.checked : une.checked }))
  return remplacer(modele, rang, { cle, bloc: { ...rangee.bloc, data: { ...rangee.bloc.data, items } } })
}

/** L'identité qu'une écriture rend pour un bloc (`data.touched[].blocks`) : `id`, référence, révision. */
export function adopter(modele: readonly Rangee[], cle: string, identite: { id: string; ref: string; revision: number }): Rangee[] {
  return modele.map((rangee) => (rangee.cle === cle ? { cle, bloc: { ...rangee.bloc, ...identite } } : rangee))
}

/** Le numéro du premier élément d'une liste numérotée : son `start`, sinon 1. */
export const debutDe = (bloc: Pick<BlocEdite, "data">): number => (typeof bloc.data.start === "number" ? bloc.data.start : 1)
