// Le texte en ligne d'un bloc (E05-S02, AC5) : code, gras, italique, liens internes `[[…]]` et adresses web,
// rien d'autre ; une image ou du HTML restent du texte, que React échappe. Fonctions pures,
// sans dépendance. Sans elles, le texte humain d'un bloc s'afficherait avec son balisage.
//
// Porté d'oto-frontend (`src/lib/utils/inline-marks.ts`, `markdown-lines.ts`). Repris : l'expression
// `INLINE` et ses gardes (`[^\s*]` en bord, `_` hors d'un mot), aucune marque dans une marque,
// `isTableText`. Retiré : la marque d'origine par `Symbol` (tout texte humain d'un bloc est du markdown
// en ligne), `headingMark` et la liste numérotée reconnue au texte (→ types de blocs). Ajouté : le lien
// interne et le span de code, lus par `schemas/link-syntax.ts` comme la publication les lit (E03-S07
// AC1, M15), avant les marques, qui les contiennent entiers : un `[[…]]` est un lien à l'écran si et
// seulement si la publication l'extrait, gras ou italique compris (HN-E05S02-26).
//
// E05-S10 (AC-a8) : une adresse web collée (`http://`, `https://`) hors d'un lien et du code devient un lien,
// l'adresse entière gardée pour le survol.
//
// E05-S11 (retour 11, fiche D107) : un lien se lit en lien hypertexte dans la phrase. Une page citée montre
// son titre, jamais son chemin (`titreDuLien`) ; une adresse web montre le texte de son lien markdown
// (`[texte](https://…)`), sinon, nue, son domaine.
//
// E10-S04 (AC-c1) : `~~barré~~` ; une marque dans une marque d'un autre caractère, sur deux niveaux ; les
// échappements (`\*`, `\_`, `\|`, `` \` ``, `\[`, `\~`, `\<`, `\\`) hors du code en ligne ; `<br>` en saut de
// ligne ; `<https://…>` en adresse web. Tout autre HTML reste du texte, que React échappe.
import { chars } from "../../schemas/blocks"
import { codeSpans, escaped, linksIn, type CodeSpan } from "../../schemas/link-syntax"

export type Segment =
  | { genre: "texte" | "code"; texte: string }
  | { genre: "gras"; contenu: Segment[] }
  | { genre: "italique"; contenu: Segment[] }
  | { genre: "barre"; contenu: Segment[] }
  | { genre: "saut" }
  /** `libelle` : le libellé écrit (`[[chemin|libellé]]`), vide sans lui. */
  | { genre: "lien"; chemin: string; reference: string | null; libelle: string }
  | { genre: "web"; adresse: string; libelle: string }

/** Une page citée que la personne lit : son titre, et le chemin où elle se lit (sa nouvelle place, déplacée). */
export type Cible = { titre: string; chemin: string }

/**
 * Ce que l'écran sait des pages qu'un texte cite (E05-S11, AC-26, AC-27), par chemin écrit : sa cible, ou
 * `null` quand aucune page visible n'y répond (invisible, à la corbeille, inconnue) ; un chemin absent n'est
 * pas connu (écrit depuis la lecture de la page) : il garde son lien.
 */
export type CiblesDesLiens = Readonly<Record<string, Cible | null>>

/** La cible d'un chemin écrit, `undefined` s'il n'est pas connu : propriété propre seulement (un chemin `constructor` ne lit pas le prototype). */
export function cibleDe(cibles: CiblesDesLiens | undefined, chemin: string): Cible | null | undefined {
  return cibles && Object.hasOwn(cibles, chemin) ? cibles[chemin] : undefined
}

/**
 * Le titre d'une page citée (AC-27) : le libellé écrit (`|titre`, posé par « @ »), sinon le titre de la cible
 * que l'écran connaît, sinon le dernier segment du chemin. Jamais le chemin entier.
 */
export function titreDuLien(lien: { chemin: string; libelle: string }, cibles?: CiblesDesLiens): string {
  if (lien.libelle) return lien.libelle
  return cibleDe(cibles, lien.chemin)?.titre ?? dernierSegment(lien.chemin)
}

/** Le nom d'un chemin quand son titre n'est pas connu : son dernier segment. */
export function dernierSegment(chemin: string): string {
  return chemin.slice(chemin.lastIndexOf("/") + 1)
}

/** Les chemins que cite un texte, dans l'ordre, lus comme la publication les lit (hors du code en ligne). */
export function cheminsCitesDans(texte: string): string[] {
  return linksIn(texte).flatMap(({ link }) => (link ? [link.path] : []))
}

/**
 * Une adresse web : le schéma, puis tout ce qui n'est ni blanc, ni chevron, ni guillemet, ni crochet, ni
 * accent grave. Une seule classe répétée : le balayage reste linéaire (`security-patterns.md § Validation des inputs`).
 */
const ADRESSE_WEB = /https?:\/\/[^\s<>"'`[\]]+/giu

/** La ponctuation qui clôt une phrase après une adresse, et n'en fait pas partie. */
const PONCTUATION_FINALE = new Set([".", ",", ";", ":", "!", "?", ")", "»"])

/**
 * L'adresse sans la ponctuation qui la suit, retirée par une boucle depuis la fin, comme `btrim` de
 * `schemas/blocks.ts` : l'expression `[.,;:!?)»]+$` repartait de chaque point d'une longue suite qui ne finit
 * pas l'adresse, en temps quadratique (3,25 s pour 100 000 caractères, revue 1 d'E05-S10 ;
 * `security-patterns.md § Validation des inputs`).
 */
function sansPonctuationFinale(adresse: string): string {
  let fin = adresse.length
  while (fin > 0 && PONCTUATION_FINALE.has(adresse[fin - 1])) fin -= 1
  return adresse.slice(0, fin)
}

/**
 * Le libellé d'une adresse web nue (E05-S11, fiche D107) : son domaine, sans `www.`, jamais l'adresse entière
 * (le survol la montre). Une adresse que `URL` ne lit pas : ce qui suit le schéma, jusqu'au chemin.
 */
export function libelleDUneAdresse(adresse: string): string {
  const sansSchema = adresse.replace(/^https?:\/\//iu, "")
  let hote: string
  try {
    hote = new URL(adresse).hostname
  } catch {
    hote = sansSchema.split(/[/?#]/u)[0]
  }
  return hote.replace(/^www\./iu, "") || sansSchema
}

/** Une marque : son segment, le caractère qui l'écrit (`famille`), la longueur de son bord, son expression. */
type Forme = { genre: "gras" | "italique" | "barre"; famille: string; bord: number; motif: string }

/**
 * `**` avant `*`, et `~~` (E10-S04, AC-c1) ; le contenu d'une marque n'a pas son caractère, ce qui garde la
 * lecture linéaire, mais un lien, un span de code, un échappement ou un saut de ligne y entrent entiers (ils y
 * tiennent en un caractère, `ATOME`). Les gardes réparent des cas mesurés dans oto-frontend : « 2 * 3 * 4 »
 * n'est pas un italique, `{{first_name}}` traverse intact.
 */
const FORMES: readonly Forme[] = [
  { genre: "gras", famille: "*", bord: 2, motif: "\\*\\*([^\\s*](?:[^*]*[^\\s*])?)\\*\\*" },
  { genre: "italique", famille: "*", bord: 1, motif: "\\*([^\\s*](?:[^*]*[^\\s*])?)\\*" },
  { genre: "italique", famille: "_", bord: 1, motif: "(?<![\\p{L}\\p{N}_])_([^\\s_](?:[^_]*[^\\s_])?)_(?![\\p{L}\\p{N}_])" },
  { genre: "barre", famille: "~", bord: 2, motif: "~~([^\\s~](?:[^~]*[^\\s~])?)~~" },
]

type Lecteur = { expression: RegExp; formes: readonly Forme[] }

const lecteur = (formes: readonly Forme[]): Lecteur => ({ expression: new RegExp(formes.map((forme) => forme.motif).join("|"), "gu"), formes })

const MARQUES = lecteur(FORMES)

/**
 * Dans une marque, les marques d'un autre caractère (E10-S04, AC-c1 : `**gras _italique_**`,
 * `_italique **gras**_`, `~~barré **gras**~~`), sur deux niveaux : chaque caractère lu deux fois au plus.
 */
const DANS_UNE_MARQUE: Readonly<Record<string, Lecteur>> = Object.fromEntries(
  ["*", "_", "~"].map((famille) => [famille, lecteur(FORMES.filter((forme) => forme.famille !== famille))]),
)

/** La place d'un lien ou d'un span de code dans le texte que lisent les marques : ni blanc, ni marque, ni lettre. */
const ATOME = "\uE000"

/**
 * Longueur en caractères, comme la base les compte : une paire de substitution vaut un. C'est `chars` de
 * `schemas/blocks.ts`, que compte aussi la syntaxe des liens, sous le nom que lit l'éditeur.
 */
export const caracteres = chars

/** Un lien ou un span de code : une marque le contient entier ou ne le touche pas. */
type Atome = { debut: number; fin: number; segment: Segment }

/**
 * Les liens et les spans de code d'un texte, dans l'ordre, lus comme la publication les lit
 * (`schemas/link-syntax.ts`) : un `[[…]]` d'un span n'est pas un lien, un span dans un lien en fait
 * partie ; le libellé affiché est celui qui est écrit, le chemin à défaut.
 */
function atomesDe(texte: string): Atome[] {
  const spans = codeSpans(texte)
  const liens = linksIn(texte).flatMap(({ start, end, link }): Atome[] =>
    link ? [{ debut: start, fin: end, segment: { genre: "lien", chemin: link.path, reference: link.key, libelle: link.label.trim() } }] : [],
  )
  const atomes: Atome[] = []
  const code = (span: CodeSpan): Atome => ({ debut: span.start, fin: span.end, segment: { genre: "code", texte: span.content } })
  let rang = 0
  for (const un of liens) {
    for (; rang < spans.length && spans[rang].start < un.debut; rang += 1) atomes.push(code(spans[rang]))
    // Les spans d'un lien sont à lui.
    while (rang < spans.length && spans[rang].start < un.fin) rang += 1
    atomes.push(un)
  }
  for (; rang < spans.length; rang += 1) atomes.push(code(spans[rang]))
  return avecLesAdresses(texte, atomes)
}

/** Un lien d'un texte (E11-S06) : ses bornes dans le texte source, sa forme écrite, et ce qu'il lit. */
export type LienDuTexte = {
  debut: number
  fin: number
  /** `page` : `[[…]]` ; `web-libelle` : `[texte](https://…)` ; `web-nu` : une adresse nue ou `<https://…>`, sans balisage à retirer. */
  forme: "page" | "web-libelle" | "web-nu"
  lien: Extract<Segment, { genre: "lien" | "web" }>
}

/**
 * Les liens d'un texte, dans l'ordre, lus comme l'écran les rend (`atomesDe`) : le panneau « Lien » de l'éditeur
 * (E11-S06) les retrouve sous le curseur et relit ce qu'il écrit, et le rang d'un lien rendu (`data-lien`) y est son rang.
 */
export function liensDuTexte(texte: string): LienDuTexte[] {
  return atomesDe(texte).flatMap(({ debut, fin, segment }): LienDuTexte[] => {
    if (segment.genre === "lien") return [{ debut, fin, forme: "page", lien: segment }]
    if (segment.genre === "web") return [{ debut, fin, forme: texte[debut] === "[" ? "web-libelle" : "web-nu", lien: segment }]
    return []
  })
}

/**
 * Un lien markdown vers une adresse web (E05-S11, fiche D107) : `[texte](https://…)`. Chaque classe exclut le
 * caractère qui la ferme : le balayage reste linéaire (`security-patterns.md § Validation des inputs`).
 */
const LIEN_WEB = /\[([^[\]\n]+)\]\((https?:\/\/[^\s<>"'`()[\]]+)\)/giu

/**
 * Les candidats (triés, dans l'ordre du texte) qui ne touchent aucun atome (triés, disjoints), rangés parmi
 * eux : un seul parcours des deux listes, jamais un candidat comparé à chaque atome.
 */
function horsDesAtomes(atomes: Atome[], candidats: Atome[]): Atome[] {
  if (candidats.length === 0) return atomes
  const libres: Atome[] = []
  let rang = 0
  for (const candidat of candidats) {
    while (rang < atomes.length && atomes[rang].fin <= candidat.debut) rang += 1
    if (rang === atomes.length || atomes[rang].debut >= candidat.fin) libres.push(candidat)
  }
  const ranges: Atome[] = []
  let a = 0
  let b = 0
  while (a < atomes.length || b < libres.length) {
    if (b === libres.length || (a < atomes.length && atomes[a].debut < libres[b].debut)) ranges.push(atomes[a++])
    else ranges.push(libres[b++])
  }
  return ranges
}

/** Une adresse web entre chevrons (E10-S04, AC-c1) : `<https://…>`, sans blanc ni chevron dedans. */
const ADRESSE_EN_CHEVRONS = /<(https?:\/\/[^\s<>]+)>/giu

/** Un caractère échappé (E10-S04, AC-c1) : la barre oblique inverse ne s'affiche pas. */
const ECHAPPEMENT = /\\[*_|`[~<\\]/gu

/** Un saut de ligne écrit en HTML (E10-S04, AC-c1) : `<br>`, `<br/>`, `<br />`. */
const SAUT = /<br ?\/?>/giu

/** Les correspondances d'une expression, en atomes d'un segment. */
function candidats(texte: string, expression: RegExp, segment: (trouve: RegExpExecArray) => Segment): Atome[] {
  return [...texte.matchAll(expression)].map((trouve) => ({ debut: trouve.index, fin: trouve.index + trouve[0].length, segment: segment(trouve) }))
}

/**
 * Les adresses web d'un texte hors des liens et du code, rangées parmi eux dans l'ordre du texte : d'abord
 * les liens markdown (leur texte pour libellé), puis les adresses entre chevrons non échappés et les adresses
 * nues (leur domaine, AC-a8, D107) ; enfin les échappements, puis les sauts de ligne (E10-S04, AC-c1).
 */
function avecLesAdresses(texte: string, atomes: Atome[]): Atome[] {
  const markdown = candidats(texte, LIEN_WEB, (trouve) => ({ genre: "web", adresse: trouve[2], libelle: trouve[1].trim() || libelleDUneAdresse(trouve[2]) }))
  const chevrons = candidats(texte, ADRESSE_EN_CHEVRONS, (trouve) => ({ genre: "web", adresse: trouve[1], libelle: libelleDUneAdresse(trouve[1]) })).filter(
    (atome) => !escaped(texte, atome.debut),
  )
  const nues = [...texte.matchAll(ADRESSE_WEB)].map((trouve): Atome => {
    const adresse = sansPonctuationFinale(trouve[0])
    return { debut: trouve.index, fin: trouve.index + adresse.length, segment: { genre: "web", adresse, libelle: libelleDUneAdresse(adresse) } }
  })
  const echappements = candidats(texte, ECHAPPEMENT, (trouve) => ({ genre: "texte", texte: trouve[0][1] }))
  const sauts = candidats(texte, SAUT, () => ({ genre: "saut" }))
  return [markdown, chevrons, nues, echappements, sauts].reduce(horsDesAtomes, atomes)
}

/**
 * Le texte d'un bloc en segments, dans l'ordre : les liens et le code d'abord, puis le gras et l'italique
 * autour d'eux ; un segment vide n'est jamais produit.
 */
export function segmentsEnLigne(texte: string): Segment[] {
  const atomes = atomesDe(texte)
  // Le texte que lisent les marques : chaque atome y tient en un caractère, dont `places` garde le rang.
  const morceaux: string[] = []
  const places: number[] = []
  let lu = 0
  let longueur = 0
  for (const atome of atomes) {
    morceaux.push(texte.slice(lu, atome.debut), ATOME)
    longueur += atome.debut - lu
    places.push(longueur)
    longueur += 1
    lu = atome.fin
  }
  morceaux.push(texte.slice(lu))
  const surface = morceaux.join("")
  let suivant = 0
  /** Les segments de `surface` entre `debut` et `fin`, ajoutés à `dans` : le texte et les atomes qui y tiennent. */
  const lire = (debut: number, fin: number, dans: Segment[]) => {
    let curseur = debut
    for (; suivant < atomes.length && places[suivant] < fin; suivant += 1) {
      if (places[suivant] > curseur) dans.push({ genre: "texte", texte: surface.slice(curseur, places[suivant]) })
      dans.push(atomes[suivant].segment)
      curseur = places[suivant] + 1
    }
    if (fin > curseur) dans.push({ genre: "texte", texte: surface.slice(curseur, fin) })
  }
  /**
   * Les segments de `surface` entre `debut` et `fin`, ajoutés à `dans` : les marques que lit `par`, et dans
   * chacune, au premier niveau seulement, celles d'un autre caractère (`DANS_UNE_MARQUE`).
   */
  const marquer = (debut: number, fin: number, par: Lecteur, dans: Segment[]) => {
    let lu = debut
    for (const trouve of surface.slice(debut, fin).matchAll(par.expression)) {
      const index = debut + trouve.index
      lire(lu, index, dans)
      // Chaque forme a un seul groupe, jamais vide : le groupe posé dit la forme.
      const forme = par.formes[trouve.findIndex((groupe, rang) => rang > 0 && groupe !== undefined) - 1]
      const contenu: Segment[] = []
      const interieur = [index + forme.bord, index + trouve[0].length - forme.bord] as const
      if (par === MARQUES) marquer(interieur[0], interieur[1], DANS_UNE_MARQUE[forme.famille], contenu)
      else lire(interieur[0], interieur[1], contenu)
      dans.push({ genre: forme.genre, contenu })
      lu = index + trouve[0].length
    }
    lire(lu, fin, dans)
  }
  const segments: Segment[] = []
  marquer(0, surface.length, MARQUES, segments)
  return segments
}

const aDuContenu = (segment: Segment): segment is Extract<Segment, { contenu: Segment[] }> => "contenu" in segment

function porteUnLien(segments: readonly Segment[]): boolean {
  return segments.some((segment) => segment.genre === "lien" || segment.genre === "web" || (aDuContenu(segment) && porteUnLien(segment.contenu)))
}

/** Un texte porte un lien (une page citée, une adresse web) : l'éditeur le rend au repos, liens dans la phrase (E05-S11, AC-26). */
export function aDesLiens(texte: string): boolean {
  return porteUnLien(segmentsEnLigne(texte))
}

function texteDes(segments: readonly Segment[]): string {
  return segments
    .map((segment) => {
      if (segment.genre === "lien") return titreDuLien(segment)
      if (segment.genre === "web") return segment.libelle
      if (segment.genre === "saut") return " "
      return aDuContenu(segment) ? texteDes(segment.contenu) : segment.texte
    })
    .join("")
}

/**
 * Le texte tel qu'il se lit, balisage retiré (libellé d'un lien compris, échappements lus, un saut de ligne en
 * espace) : nom d'un titre ouvert dans l'éditeur, qui garde celui du titre rendu (AC14), et premiers mots d'un
 * bloc (AC8).
 */
export function texteLu(texte: string): string {
  return texteDes(segmentsEnLigne(texte))
}

/**
 * Un tableau en markdown (AC4) : deux lignes non blanches au moins, chacune commençant par `|`. Un
 * `<p>` replierait ses sauts de ligne en une phrase : il se rend en préformaté. Une seule ligne ne
 * suffit pas, elle peut être une phrase (oto-frontend, `isTableText`).
 */
export function estUnTableau(texte: string): boolean {
  const lignes = texte.split("\n").filter((ligne) => ligne.trim() !== "")
  return lignes.length >= 2 && lignes.every((ligne) => /^\s*\|/.test(ligne))
}
