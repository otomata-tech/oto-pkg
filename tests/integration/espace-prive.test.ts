// @vitest-environment node
// Titre de l'espace personnel posé par la base (tâche M45, fiche D89 B ; HN-M38-1) sur une vraie base, la
// base étant le sujet : `members_tree_sync` titre « Privé » l'espace d'un membre nouveau. Le renommage des
// espaces restés « Perso », donnée d'une migration que la ligne de base V1 a repliée (E01-S12 partie d),
// n'a plus rien à renommer sur une installation neuve. Portable : connexion d'administration seule.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

const SETUP_TIMEOUT = 180_000
const NETWORK_TIMEOUT = 60_000
const SUITE = "title of the personal space set by the database (M45)"

describe.skipIf(!sqlConfigured || privatePending)(privateFolderSuite(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, privatePending), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let orgId: string

  beforeAll(async () => {
    seed = seedWithAdmin()
    orgId = (await seed.createOrg()).id
    // Ce que pose `create_org` et que lit le déclencheur : la racine, puis le dossier `private`.
    const [root] = await seed.admin<{ id: string }[]>`
      insert into platform.nodes (org_id, parent_id, path, title, summary, owner_kind)
      values (${orgId}, null, 'guide', 'Guide', 'Racine.', 'org') returning id`
    await seed.admin`
      insert into platform.nodes (org_id, parent_id, path, title, summary)
      values (${orgId}, ${root.id}, 'private', 'Espaces personnels', 'Un espace par personne.')`
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  /** Un membre au `handle` donné : `members_tree_sync` crée son espace et le Contexte de l'espace. */
  async function member(handle: string): Promise<string> {
    const person = seed.person()
    await seed.admin`insert into platform.members (org_id, user_id, role, email, profile)
                     values (${orgId}, ${person.id}, 'member', ${person.email}, ${seed.admin.json({ handle })})`
    return person.id
  }

  const titles = (prefix: string) =>
    seed.admin<{ path: string; title: string }[]>`
      select path, title from platform.nodes where org_id = ${orgId} and path like ${`${prefix}%`} order by path`

  it("should title « Privé » the personal space it creates for a new member, its Contexte unchanged", async () => {
    await member("ada")
    expect([...(await titles("private/ada"))]).toEqual([
      { path: "private/ada", title: "Privé" },
      { path: "private/ada/contexte", title: "Contexte" },
    ])
  })
})
