// Service de `context` (ADR-002, H30) : émet le code `ctx` de la conversation, route la phrase
// (E03-S02 : procédure servie, ou candidats et consigne) et rend les blocs code et procédure, puis les
// Contextes de la personne et le contexte dynamique (E03-S08 : P39, nouveautés, procédures utiles,
// contenus récents), dans le budget. E04-S01 ajoute les connecteurs d'équipe. E05-S12 (D109) : les faits de
// la personne, de l'organisation et des équipes ouvrent la partie de leur Contexte, et le bloc code porte les
// règles de l'espace. `context` et son aperçu (E05-S04) dérivent du même assemblage : un seul rendu.
//
// Repris de la maquette (`mcp-test/src/proto/services/context.ts` l. 238-269) : phrase nettoyée,
// routage en parallèle de l'émission du code, cible du journal = procédure servie, sinon la phrase,
// borne des nouveautés lue avant l'émission du code. Repris d'Oto (`oto_mcp/instructions.py`
// l. 258-294) : une seule liste de blocs ordonnés dont dérivent le texte servi et la vue de
// transparence ; un contexte servi même quand une lecture échoue (« fail-open »). Retiré : lecture par
// clé de service, sujets (ADR-011 § 7), notice, readme d'organisation, projets récents (architecture § 10).
import { issueCtx, lastCtxAt } from "../ctx"
import type { PlatformDb } from "../db"
import type { Identity } from "../identity"
import { clip, lastHostSignature, MAX_TARGET_CHARS } from "../journal"
import {
  CANDIDATES_SHOWN,
  decide,
  isDataQuestion,
  loadRoutingSettings,
  rankCandidates,
  roundScore,
  type Candidate,
} from "../routing"
import type { ToolOutput } from "../tool-output"
import { codeBlock } from "./blocks/code"
import { contextBodies, contextParts } from "./blocks/contexts"
import { newsBlock, newsItems } from "./blocks/news"
import { orgFacts } from "./blocks/org"
import { personFacts } from "./blocks/person"
import { procedureBlock } from "./blocks/procedure"
import { proceduresBlock } from "./blocks/procedures"
import { recentBlock } from "./blocks/recent"
import { teamFacts } from "./blocks/team"
import { CONTEXT_BUDGET, daysAgo, renderContext, type BlockReport, type ContextBlock } from "./engine"

/** Ce que le routage a trouvé ; `candidates` nul : le routage n'a pas abouti (AC18, N30). */
type Routing = {
  candidates: Candidate[] | null
  served: Candidate | null
  dataQuestion: boolean | null
  procedure: { block: ContextBlock; revision: number } | null
}

const NO_REQUEST: Routing = { candidates: [], served: null, dataQuestion: null, procedure: null }

/** Sans conversation antérieure, les nouveautés remontent à 14 jours (H34). */
const NEWS_WINDOW_DAYS = 14

/** Première ligne de l'aperçu : la forme d'un code, pour que ses tailles égalent celles de `context` (N8). */
const PREVIEW_CODE = "XXXX-XXXX"

/**
 * Candidats de la phrase, décision au réglage de l'organisation et bloc de la procédure servie. Le
 * routage en panne ne refuse pas `context` (N17) : son `ctx` sert les autres outils, `feedback` compris.
 * Une procédure décidée mais illisible, ou disparue depuis le routage, le laisse de même sans issue :
 * ni étape ni candidat, la ligne de panne (N30), plutôt que des candidats entre lesquels faire choisir.
 */
async function routePhrase(db: PlatformDb, identity: Identity, phrase: string): Promise<Routing> {
  const [candidates, settings] = await Promise.all([
    rankCandidates(db, identity, { query: phrase, limit: CANDIDATES_SHOWN }).catch((error: unknown) => {
      console.error("[platform] context: routing failed", error)
      return null
    }),
    loadRoutingSettings(db, identity.org.id),
  ])
  const decided = candidates ? decide(candidates, settings) : null
  const procedure = decided
    ? await procedureBlock(db, decided, identity).catch((error: unknown) => {
        console.error("[platform] context: procedure read failed", error)
        return null
      })
    : null
  if (decided && !procedure) return { candidates: null, served: null, dataQuestion: isDataQuestion(phrase), procedure: null }
  return { candidates, served: decided, dataQuestion: isDataQuestion(phrase), procedure }
}

/** Données en champs (H26) : la procédure servie, les candidats montrés, scores à deux décimales. */
function routingData({ candidates, served, dataQuestion, procedure }: Routing) {
  const score = (candidate: Candidate) => roundScore(candidate.score)
  return {
    served: served && procedure ? { path: served.path, revision: procedure.revision, score: score(served) } : null,
    candidates: (candidates ?? []).map((candidate) => ({ path: candidate.path, title: candidate.title, kind: candidate.kind, score: score(candidate) })),
    data_question: dataQuestion,
  }
}

/** Émet le `ctx` avec la signature du dernier `initialize` de cette personne à ce même agent (N3). */
async function issueWithHost(db: PlatformDb, identity: Identity, userAgent: string | null) {
  const host = await lastHostSignature(db, identity, userAgent)
  const code = await issueCtx(db, identity, { host, userAgent })
  return { code, host }
}

/**
 * La borne des nouveautés (AC2, N1) : le dernier `ctx` de la personne dans l'organisation, sinon
 * maintenant − 14 jours ; lue avant l'émission du code suivant. `null` quand sa lecture échoue : les
 * nouveautés sont alors omises (AC13), `context` répond.
 */
async function newsSince(db: PlatformDb, identity: Identity): Promise<string | null> {
  try {
    return (await lastCtxAt(db, identity)) ?? daysAgo(NEWS_WINDOW_DAYS)
  } catch (error) {
    console.error("[platform] context: previous ctx read failed", error)
    return null
  }
}

/** Un bloc dynamique dont la lecture échoue est omis (AC13, N13) : le `ctx` sert encore `read` et `feedback`. */
function orOmitted(read: () => Promise<ContextBlock | null>, what: string): Promise<ContextBlock | null> {
  return read().catch((error: unknown) => {
    console.error(`[platform] context: ${what} read failed`, error)
    return null
  })
}

type Assembly = {
  phrase?: string
  /** Le code de la conversation : émis en même temps que les lectures (`context`), ou la forme d'un code (aperçu). */
  code: string | Promise<string>
  /** Borne des nouveautés (`newsSince`) ; `null` : bloc omis. */
  since: string | null
  budget: number
}

type Assembled = { code: string; text: string; report: BlockReport[]; routing: Routing; phrase: string | undefined }

/**
 * L'assemblage commun de `context` et de l'aperçu (AC7, AC8, AC11) : en un seul `Promise.all`, le code,
 * le routage (puis le bloc de la procédure servie), les faits des équipes, les Contextes, les nouveautés,
 * les procédures utiles et les contenus récents, chaque branche enchaînant ses propres lectures ; puis les
 * blocs dans l'ordre de P39 — code (et ses règles), procédure, une partie par Contexte (Tout le monde,
 * Privé, équipes, chacune ouverte par sa ligne de faits, E05-S12 D109), nouveautés, procédures utiles,
 * contenus récents —, rendus dans le budget. Contextes illisibles : leurs parties et un pointeur ; bloc
 * dynamique illisible : omis (AC13).
 */
export async function assembleContext(db: PlatformDb, identity: Identity, assembly: Assembly): Promise<Assembled> {
  const phrase = assembly.phrase?.trim() || undefined
  const { since } = assembly
  const [code, routing, teams, bodies, news, procedures, recent] = await Promise.all([
    assembly.code,
    phrase === undefined ? NO_REQUEST : routePhrase(db, identity, phrase),
    teamFacts(db, identity),
    contextBodies(db, identity).catch((error: unknown) => {
      console.error("[platform] context: contexts read failed", error)
      return null
    }),
    since === null ? null : orOmitted(async () => newsBlock(await newsItems(db, identity, since), since), "news"),
    orOmitted(() => proceduresBlock(db, identity), "procedures"),
    orOmitted(() => recentBlock(db, identity), "recent content"),
  ])
  const { candidates, served, dataQuestion, procedure } = routing
  const facts = { everyone: orgFacts(identity.org), private: personFacts(identity), ...teams }
  const blocks = [
    codeBlock({ prefix: identity.org.prefix, code, phrase, candidates, served, dataQuestion }),
    ...(procedure ? [procedure.block] : []),
    ...contextParts(identity, facts, bodies),
    ...[news, procedures, recent].filter((block) => block !== null),
  ]
  return { code, routing, phrase, ...renderContext(blocks, assembly.budget, identity.org.prefix) }
}

export async function buildContext(
  db: PlatformDb,
  identity: Identity,
  input: { phrase?: string },
  request: { userAgent: string | null },
): Promise<ToolOutput> {
  // La conversation précédente borne les nouveautés : lue avant l'émission du nouveau code (AC2).
  const since = await newsSince(db, identity)
  const issued = issueWithHost(db, identity, request.userAgent)
  const { code, text, routing, phrase } = await assembleContext(db, identity, {
    phrase: input.phrase,
    code: issued.then((ctx) => ctx.code),
    since,
    budget: CONTEXT_BUDGET,
  })
  const { host } = await issued
  return {
    text,
    data: { ctx: code, ...routingData(routing) },
    // La procédure servie, sinon la phrase : ce que relisent l'usage (E08-S09) et le bonus d'usage.
    target: routing.served?.path ?? (phrase === undefined ? null : clip(phrase, MAX_TARGET_CHARS)),
    ctx: code,
    host,
  }
}

/** L'aperçu d'E05-S04 : le texte que `context` servirait, le rapport par bloc, et ce que le routage a trouvé. */
export type ContextPreview = {
  text: string
  blocks: BlockReport[]
  budget: number
} & Pick<ReturnType<typeof routingData>, "served" | "candidates">

/**
 * Ce que `context` servirait à la personne pour cette phrase, maintenant (AC8, N14) : le même
 * assemblage, première ligne « ctx: XXXX-XXXX », avec la taille et l'état de chaque bloc ; aucun
 * `ctx` émis, aucune ligne de journal, la même borne des nouveautés. Appelé par la page d'E05-S04
 * depuis son formulaire GET, sans route d'API (H03).
 */
export async function previewContext(db: PlatformDb, identity: Identity, input: { phrase?: string }): Promise<ContextPreview> {
  const since = await newsSince(db, identity)
  const { text, report, routing } = await assembleContext(db, identity, { phrase: input.phrase, code: PREVIEW_CODE, since, budget: CONTEXT_BUDGET })
  const { served, candidates } = routingData(routing)
  return { text, blocks: report, budget: CONTEXT_BUDGET, served, candidates }
}
