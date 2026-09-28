// Aperçu d'un déplacement (E05-S10, AC-b7 ; HN-E05S10e-7) : avant d'envoyer, qui gagne, perd ou change
// d'accès au nœud, et son espace et son propriétaire avant et après. Le niveau de chaque membre se calcule
// deux fois par `access.ts` (`moveLevels`, H66), sur le nœud à sa place et sous la destination ; le
// propriétaire se décrit comme le premier temps d'un transfert (`ownerDescription`, `describeTransfer`
// d'E08-S06). Rien ne s'écrit. Décidé par le service : le nœud et la destination doivent être lus. Sans
// lui, la confirmation du rail ne voit que l'espace du chemin (HN-E05S10b-9).
import { moveImpactQuerySchema, type AccessChange, type MoveImpact, type PlaceView } from "../../schemas"
import { ACCESS_LEVELS, moveLevels, type Owner } from "../access"
import { ownerDescription } from "../admin/nodes"
import type { PlatformDb } from "../db"
import { memberDirectory } from "../directory"
import { invalidInput, PlatformError } from "../errors"
import type { Identity } from "../identity"
import { findNode, parentPath, ROOT_PATH, unknownNode } from "./lookup"

/** Membres nommés au plus par liste ; le total dit le reste. */
const LISTED = 20

function spaceOf(owner: Owner | null): PlaceView["space"] {
  if (owner?.kind === "user") return "private"
  return owner?.kind === "team" ? "team" : "all"
}

/**
 * L'effet d'un déplacement (AC-b7) : `input` validé par `moveImpactQuerySchema` (les chemins de
 * `nodes/move`) ; le nœud et le parent de destination lus par `findNode` (inconnus ou invisibles :
 * `not_found`) ; puis, pour chaque membre, son niveau avant et après, et les propriétaires décrits.
 * `changes` : quelqu'un gagne, perd ou change d'accès, ou le propriétaire change.
 */
export async function moveImpact(db: PlatformDb, identity: Identity, input: unknown): Promise<MoveImpact> {
  const parsed = moveImpactQuerySchema.safeParse(input)
  if (!parsed.success) throw invalidInput(parsed.error)
  const { path, new_path: newPath } = parsed.data
  const found = await findNode(db, identity, path)
  if (!found) throw unknownNode(path, identity.org.prefix)
  const parentAt = parentPath(newPath) ?? ROOT_PATH
  const parent = await findNode(db, identity, parentAt)
  if (!parent) throw new PlatformError("not_found", `Cannot move ${path} to ${newPath}: ${parentAt} does not exist.`)
  const levels = await moveLevels(db, identity, { nodeId: found.node.id, parentId: parent.node.id, newPath })
  if (!levels) throw unknownNode(path, identity.org.prefix)
  const names = new Map((await memberDirectory(db, identity.org.id)).map((entry) => [entry.userId, entry.name]))
  const changes = levels.callers
    .map((caller): AccessChange => ({
      userId: caller.userId,
      name: names.get(caller.userId) ?? caller.userId,
      before: levels.before.get(caller.userId) ?? ACCESS_LEVELS.none,
      after: levels.after.get(caller.userId) ?? ACCESS_LEVELS.none,
    }))
    .filter((change) => change.before !== change.after)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  const gained = changes.filter((change) => change.before === ACCESS_LEVELS.none)
  const lost = changes.filter((change) => change.after === ACCESS_LEVELS.none)
  const changed = changes.filter((change) => change.before !== ACCESS_LEVELS.none && change.after !== ACCESS_LEVELS.none)
  const [ownerBefore, ownerAfter] = await Promise.all([ownerDescription(db, identity, levels.owners.before), ownerDescription(db, identity, levels.owners.after)])
  return {
    path: found.node.path,
    newPath,
    changes: changes.length > 0 || ownerBefore !== ownerAfter,
    before: { space: spaceOf(levels.owners.before), owner: ownerBefore },
    after: { space: spaceOf(levels.owners.after), owner: ownerAfter },
    gained: gained.slice(0, LISTED),
    lost: lost.slice(0, LISTED),
    changed: changed.slice(0, LISTED),
    totals: { gained: gained.length, lost: lost.length, changed: changed.length },
  }
}
