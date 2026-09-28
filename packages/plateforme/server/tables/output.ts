// Ce que les six fonctions `table.*` partagent autour de leur résultat et de leur décision (E07-S02 ;
// H84, N20, AC19, AC30) : la ligne « moved to » d'E03-S07 et `moved_from` quand le tableau est atteint
// par un ancien chemin, l'équipe propriétaire du tableau pour le journal, et l'exigence d'écrire. Sans
// lui, chaque fonction recomposerait la ligne d'un déplacement et l'équipe du journal, et `call`
// journaliserait l'équipe de l'ancien chemin, qu'il ne trouve pas.
import { ACCESS_LEVELS, requireNodeLevel } from "../access"
import type { FunctionContext, FunctionOutput } from "../catalog/define"
import type { PlatformDb } from "../db"
import { movedNotice } from "../nodes/lookup"
import { ownerOf, teamOf } from "../nodes/view"
import type { LoadedTable } from "./meta"

/** L'équipe propriétaire effective du tableau chargé, alias compris (`node_owner`), que `call` journalise (N20). */
export async function tableTeamId(db: PlatformDb, table: LoadedTable): Promise<string | null> {
  return teamOf(await ownerOf(db, table.node.id))
}

/**
 * Le résultat d'une fonction `table.*` (N20, AC30) : `teamId`, l'équipe du tableau (`tableTeamId`) ; par
 * un ancien chemin, la ligne « moved to » en tête du texte et `moved_from` dans les données. Une
 * écriture lit son équipe avant sa première écriture : une panne de cette lecture ne suit jamais l'effet.
 */
export function tableResult(table: LoadedTable, output: FunctionOutput, teamId: string | null): FunctionOutput {
  if (table.movedFrom === null || table.movedAt === null) return { ...output, teamId }
  return {
    ...output,
    text: `${movedNotice(table.movedFrom, table.node, table.movedAt)}\n${output.text}`,
    data: { ...output.data, moved_from: table.movedFrom },
    teamId,
  }
}

/** Le résultat d'une lecture (`table.schema`, `table.rows`, `table.aggregate`) : l'équipe lue après elle, aucun effet à suivre. */
export async function tableOutput(context: Pick<FunctionContext, "db">, table: LoadedTable, output: FunctionOutput): Promise<FunctionOutput> {
  return tableResult(table, output, await tableTeamId(context.db, table))
}

/**
 * L'écriture exigée sur le tableau (AC19, H68, H123), décidée avant toute lecture de lignes : le niveau
 * de `loadTable` est celui que `requireNodeLevel` calcule (même décision d'`access.ts`) ; sous
 * l'écriture, `requireNodeLevel` compose le refus « à qui demander », sans qu'aucune écriture parte.
 */
export async function requireWrite(context: Pick<FunctionContext, "db" | "identity">, table: LoadedTable): Promise<void> {
  if (table.level >= ACCESS_LEVELS.write) return
  await requireNodeLevel(context.db, context.identity, table.node, "write")
}

/** L'heure d'un bail servie (AC18, AC20) : « 14:35 UTC ». */
export function utcClock(instant: string): string {
  const parsed = Date.parse(instant)
  return `${Number.isNaN(parsed) ? instant.slice(11, 16) : new Date(parsed).toISOString().slice(11, 16)} UTC`
}
