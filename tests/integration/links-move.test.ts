// @vitest-environment node
// Déplacement d'un sous-arbre sur une vraie base (E03-S07, AC6), seul test de la story sur la vraie
// base : la base y est le sujet. `moveNode` envoie une mise à jour sous la session de Claire ; dans la
// même transaction, `nodes_path_cascade` (E01-S04, definer) réécrit le chemin des descendants, y compris
// celui qu'une règle `none` lui cache, et `nodes_aliases_on_move` (E01-S06) inscrit l'ancien chemin de
// chacun. Relus par la connexion d'administration. Les refus et la résolution des alias sont prouvés sur
// la base simulée (`tests/unit/nodes-move.test.ts`). Organisation de référence jetable (H120). Suite
// portable depuis E01-S10 f2 (Claire par `fx.as`, sans Supabase Auth) : le job `bare-postgres` la joue.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { moveNode, resolveIdentity, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import { createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
const SUITE = "moving a subtree on a real database"

describe.skipIf(!sqlConfigured || privatePending)(privateFolderSuite(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, privatePending), { timeout: NETWORK_TIMEOUT }, () => {
  let fx: SqlFixtures
  let o: SqlReferenceOrg
  let claire: { db: PlatformDb; identity: Identity }
  const ids = { a: "", x: "", y: "" }

  beforeAll(async () => {
    fx = createSqlFixtures()
    o = await fx.buildReferenceOrg()
    ids.a = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: "ventes/a", title: "A" })
    ids.x = await fx.createNode(o.org.id, { parentId: ids.a, path: "ventes/a/x", title: "X" })
    // Propriétaire explicite (H71) et règle `none` pour Claire : ce nœud lui est invisible.
    ids.y = await fx.createNode(o.org.id, { parentId: ids.x, path: "ventes/a/x/y", title: "Y", ownerKind: "team", ownerTeamId: o.teams.ventes })
    await fx.addRule({ orgId: o.org.id, nodeId: ids.y, userId: o.people.claire.id, level: "none" })
    const db = fx.as(o.people.claire)
    claire = { db, identity: await resolveIdentity(db, o.host, { userId: o.people.claire.id, email: o.people.claire.email }) }
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await fx?.cleanup()
  }, SETUP_TIMEOUT)

  it("should move ventes/a and its descendants by one update, alias every old path, and name only what Claire sees (AC6)", async () => {
    const moved = await moveNode(claire.db, claire.identity, { path: "ventes/a", new_path: "ventes/b" })
    expect(moved.text).toBe(
      [
        "Moved ventes/a to ventes/b with its descendants:",
        "- ventes/a → ventes/b",
        "- ventes/a/x → ventes/b/x",
        "The old paths stay valid: tools called with them are redirected.",
      ].join("\n"),
    )
    expect([moved.moves, moved.target, moved.teamId]).toEqual([
      [
        { from: "ventes/a", to: "ventes/b" },
        { from: "ventes/a/x", to: "ventes/b/x" },
      ],
      "ventes/b",
      o.teams.ventes,
    ])

    const nodes = await fx.admin<{ id: string; path: string }[]>`
      select id, path, owner_kind, owner_team_id from platform.nodes where id in ${fx.admin([ids.a, ids.x, ids.y])}`
    const byId = new Map(nodes.map((row) => [row.id, row]))
    expect([ids.a, ids.x, ids.y].map((id) => byId.get(id)?.path)).toEqual(["ventes/b", "ventes/b/x", "ventes/b/x/y"])
    // Le propriétaire explicite suit le nœud (H71).
    expect(byId.get(ids.y)).toMatchObject({ owner_kind: "team", owner_team_id: o.teams.ventes })

    const aliases = await fx.admin`select old_path, node_id, created_by from platform.node_aliases where org_id = ${o.org.id} order by old_path`
    expect(aliases).toEqual([
      { old_path: "ventes/a", node_id: ids.a, created_by: o.people.claire.id },
      { old_path: "ventes/a/x", node_id: ids.x, created_by: o.people.claire.id },
      { old_path: "ventes/a/x/y", node_id: ids.y, created_by: o.people.claire.id },
    ])
  })
})
