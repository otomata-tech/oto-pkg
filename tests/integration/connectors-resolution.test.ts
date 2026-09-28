// @vitest-environment node
// Équipe porteuse et compte d'un appel sur une vraie base (E04-S01, AC11 à AC14, AC23) : journal d'un
// `ctx`, procédures et tableaux de propriétaires différents, comptes et règles posés par la connexion
// d'administration ; tout se lit sous la session de la personne, sous RLS. Chaque test pose ses comptes ;
// ils partent après lui avec leurs règles. L'équipe nommée par l'appel (AC10) et les refus d'un compte
// nommé ou introuvable (AC15, AC16) sont des décisions pures, prouvées avec leurs textes à l'octet sans
// base (`tests/unit/connectors-resolution.test.ts`) : leurs cas sont retirés (M11b). Suite portable depuis
// E01-S10 f2 (chaque personne par `fx.as`, sans Supabase Auth ni PostgREST) : le job `bare-postgres` la joue.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  lastProcedure,
  resolveAccount,
  runningTeam,
  type FunctionTraits,
  type RunningTeam,
} from "../../packages/plateforme/server/connectors/resolution"
import { mailCreateDraft } from "../../packages/plateforme/server/connectors/simulated/mail"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { resolveIdentity, type Identity } from "../../packages/plateforme/server/identity"
import { hex, type ReferencePerson } from "../helpers/plateforme"
import { createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

// Projet partagé par les agents d'une vague : jusqu'à 30 s mesurées pour un test, le 2026-09-24.
const NETWORK_TIMEOUT = 120_000
const SETUP_TIMEOUT = 180_000

const TABLE_ROWS: FunctionTraits = { name: "table.rows", connector: "table", class: "read", origin: "paquet" }
const CREATE: FunctionTraits = mailCreateDraft

type Session = { db: PlatformDb; identity: Identity }

async function refusal(promise: Promise<unknown>): Promise<PlatformError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof PlatformError)) throw new Error(`expected a PlatformError, got ${String(error)}`)
  return error
}

describe.skipIf(!sqlConfigured || privatePending)(
  privateFolderSuite(sqlConfigured ? "running team and account resolution on a real database" : `running team and account resolution (${SQL_SKIP_REASON})`, privatePending),
  { timeout: NETWORK_TIMEOUT },
  () => {
    let fx: SqlFixtures
    let o: SqlReferenceOrg
    let origin: string
    const sessions = new Map<ReferencePerson, Session>()
    const team = { ventes: { id: "", slug: "ventes", name: "Ventes" }, support: { id: "", slug: "support", name: "Support" } }

    function as(who: ReferencePerson): Session {
      const found = sessions.get(who)
      if (!found) throw new Error(`${who} has no session`)
      return found
    }

    const account = (label: string, owner: { team?: string; user?: string } = {}) =>
      fx.createAccount(o.org.id, {
        ownerKind: owner.team ? "team" : owner.user ? "user" : "org",
        ownerTeamId: owner.team,
        ownerUserId: owner.user,
        label,
      })

    // Retire une étape de la résolution, par la connexion d'administration.
    async function remove(id: string) {
      await fx.admin`delete from platform.accounts where id = ${id}`
    }

    /** Un compte d'équipe déjà désactivé, posé tel quel. */
    async function disabledAccount(label: string, teamId: string): Promise<string> {
      const [row] = await fx.admin<{ id: string }[]>`
        insert into platform.accounts (org_id, connector, owner_kind, owner_team_id, label, mode, status)
        values (${o.org.id}, 'mail', 'team', ${teamId}, ${label}, 'simule', 'disabled') returning id`
      return row.id
    }

    const running = (who: ReferencePerson, input: { fn?: FunctionTraits; team?: string; tablePath?: string; ctxCode?: string | null }) =>
      runningTeam(as(who).db, as(who).identity, { fn: input.fn ?? CREATE, team: input.team, tablePath: input.tablePath, ctxCode: input.ctxCode ?? null })

    const resolve = (who: ReferencePerson, runningAs: RunningTeam | null, named?: string) =>
      resolveAccount(as(who).db, as(who).identity, { fn: CREATE, team: runningAs, account: named, origin })

    beforeAll(async () => {
      fx = createSqlFixtures()
      o = await fx.buildReferenceOrg()
      origin = `https://${o.host}`
      team.ventes.id = o.teams.ventes
      team.support.id = o.teams.support
      // Claire : de Ventes (responsable) et de Support ; Marc : des deux aussi (E05-S13 : plus d'équipe par défaut).
      await fx.addTeamMember(o.teams.support, o.people.claire.id)
      await fx.addTeamMember(o.teams.ventes, o.people.marc.id)
      await fx.addTeamMember(o.teams.support, o.people.marc.id)
      // Ni Paul ni Ada ne servent ici.
      for (const person of ["claire", "lea", "marc"] as const) {
        const user = o.people[person]
        const db = fx.as(user)
        sessions.set(person, { db, identity: await resolveIdentity(db, o.host, { userId: user.id, email: user.email }) })
      }
    }, SETUP_TIMEOUT)

    afterEach(async () => {
      await fx.admin`delete from platform.accounts where org_id = ${o.org.id}`
    }, NETWORK_TIMEOUT)

    afterAll(async () => {
      await fx?.cleanup()
    }, SETUP_TIMEOUT)

    describe("running team (AC11 to AC13)", () => {
      it("should take the team owning a visible table, and let the next step decide otherwise (AC11)", async () => {
        const tag = hex(3)
        await fx.createNode(o.org.id, { parentId: o.nodes.support, path: `support/tickets_${tag}`, kind: "table", title: "Tickets" })
        await fx.createNode(o.org.id, { parentId: o.nodes.root, path: `tarifs_${tag}`, kind: "table", title: "Tarifs" })
        await fx.createNode(o.org.id, { parentId: o.spaces.claire, path: `private/claire/suivi_${tag}`, kind: "table", title: "Suivi" })
        const compta = await fx.createTeam(o.org.id, { slug: `compta_${tag}`, name: "Compta" })
        const folder = await fx.nodeId(o.org.id, compta.slug)
        await fx.createNode(o.org.id, { parentId: folder, path: `${compta.slug}/grille`, kind: "table", title: "Grille" })

        expect(await running("claire", { fn: TABLE_ROWS, tablePath: `support/tickets_${tag}` })).toEqual({ ...team.support, source: "table" })
        for (const path of [`tarifs_${tag}`, `private/claire/suivi_${tag}`, `${compta.slug}/grille`, "support/nowhere", "Pas un chemin"]) {
          expect(await running("claire", { fn: TABLE_ROWS, tablePath: path }), path).toBeNull()
        }
      })

      it("should take the team owning a visible table or procedure, even one the person is not in (N16)", async () => {
        const tag = hex(3)
        const p = o.org.prefix
        const compta = await fx.createTeam(o.org.id, { slug: `compta_v${tag}`, name: "Compta" })
        const folder = await fx.nodeId(o.org.id, compta.slug)
        const grille = await fx.createNode(o.org.id, { parentId: folder, path: `${compta.slug}/grille`, kind: "table", title: "Grille" })
        const cloture = await fx.createNode(o.org.id, { parentId: folder, path: `${compta.slug}/cloture`, kind: "procedure", title: "Clôture" })
        // Une règle nominative ouvre le tableau et la procédure à Claire, qui n'est pas de Compta.
        await fx.addRule({ orgId: o.org.id, nodeId: grille, userId: o.people.claire.id, level: "read" })
        await fx.addRule({ orgId: o.org.id, nodeId: cloture, userId: o.people.claire.id, level: "read" })
        const expected = { id: compta.id, slug: compta.slug, name: "Compta" }

        expect(await running("claire", { fn: TABLE_ROWS, tablePath: `${compta.slug}/grille` })).toEqual({ ...expected, source: "table" })
        const code = await fx.seedCtxJournal(o.org, o.people.claire, [{ tool: `${p}_read`, target: `${compta.slug}/cloture` }])
        expect(await running("claire", { ctxCode: code })).toEqual({ ...expected, source: "procedure" })
      })

      it("should take the team owning the last procedure served or read under the ctx (AC12)", async () => {
        const tag = hex(3)
        const p = o.org.prefix
        await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: `ventes/relance_${tag}`, kind: "procedure", title: "Relance" })
        await fx.createNode(o.org.id, { parentId: o.nodes.support, path: `support/reponse_${tag}`, kind: "procedure", title: "Réponse" })
        const compta = await fx.createTeam(o.org.id, { slug: `compta_p${tag}`, name: "Compta" })
        await fx.createNode(o.org.id, { parentId: await fx.nodeId(o.org.id, compta.slug), path: `${compta.slug}/cloture`, kind: "procedure", title: "Clôture" })
        const other = await fx.seedCtxJournal(o.org, o.people.claire, [])
        const code = await fx.seedCtxJournal(o.org, o.people.claire, [
          { tool: `${p}_read`, target: `ventes/relance_${tag}` },
          { tool: `${p}_context`, target: `support/reponse_${tag}` },
          { tool: `${p}_read`, target: `ventes/relance_${tag}`, error: true },
          { tool: `${p}_read`, target: "ventes/devis" },
          { tool: `${p}_context`, target: "Relance les devis en attente" },
          { tool: `${p}_read`, target: `${compta.slug}/cloture` },
          { tool: `${p}_read`, target: `ventes/relance_${tag}`, ctx: other },
        ])
        expect(await lastProcedure(as("claire").db, as("claire").identity, code)).toMatchObject({ path: `support/reponse_${tag}` })
        expect(await running("claire", { ctxCode: code })).toEqual({ ...team.support, source: "procedure" })
        // La ligne de l'autre `ctx`, la plus récente de toutes, ne vaut que pour lui.
        expect(await lastProcedure(as("claire").db, as("claire").identity, other)).toMatchObject({ path: `ventes/relance_${tag}` })
        const empty = await fx.seedCtxJournal(o.org, o.people.claire, [])
        expect(await running("claire", { ctxCode: empty })).toBeNull()
      })

      it("should take the only team that can, or refuse two (AC13 b, c ; E05-S13 : no default team)", async () => {
        const ventes = await account("Mail Ventes", { team: o.teams.ventes })
        await account("Mail Support", { team: o.teams.support })
        expect((await refusal(running("claire", {}))).code).toBe("ambiguous_team")
        const ambiguous = await refusal(running("marc", {}))
        expect(ambiguous.code).toBe("ambiguous_team")
        expect(ambiguous.message).toBe(
          'Several of your teams can run mail.create_draft: support (Support), ventes (Ventes). Show them to the user and ask which one to use; do not pick one yourself. Then call again with team: "<slug>".',
        )
        expect(ambiguous.details).toEqual({ teams: [{ slug: "support", name: "Support" }, { slug: "ventes", name: "Ventes" }] })
        await remove(ventes)
        await disabledAccount("Mail Ventes off", o.teams.ventes)
        expect(await running("claire", {})).toEqual({ ...team.support, source: "only_team" })
        expect(await running("marc", {})).toEqual({ ...team.support, source: "only_team" })
      })

      it("should give no team when no team can, and never be ambiguous without account (AC13 d, e)", async () => {
        expect(await running("claire", {})).toBeNull()
        expect(await running("marc", {})).toBeNull()
        await account("Mail Ventes", { team: o.teams.ventes })
        await account("Mail Support", { team: o.teams.support })
        expect(await running("marc", { fn: TABLE_ROWS })).toBeNull()
      })
    })

    describe("account resolution (AC14, AC23)", () => {
      it("should take the named account, then the running team's, then the organisation's (AC14, AC23)", async () => {
        const acme = await account("Mail Acme")
        await fx.addRule({ orgId: o.org.id, accountId: acme, userId: o.people.claire.id, level: "write" })
        const ventes = await account("Mail Ventes", { team: o.teams.ventes })
        const support = await account("Mail Support", { team: o.teams.support })
        const ventesTeam: RunningTeam = { ...team.ventes, source: "argument" }
        const named = await resolve("claire", ventesTeam, "mail support")
        expect(named).toMatchObject({ id: support, source: "named" })
        const byTeam = await resolve("claire", ventesTeam)
        expect(byTeam).toEqual({
          id: ventes,
          label: "Mail Ventes",
          connector: "mail",
          mode: "simule",
          owner: { kind: "team", teamId: o.teams.ventes, userId: null, description: "team Ventes" },
          level: "manage",
          source: "team",
        })
        expect(JSON.stringify([named, byTeam])).not.toContain("secret")
        await remove(ventes)
        await disabledAccount("Mail Ventes off", o.teams.ventes)
        expect(await resolve("claire", ventesTeam)).toMatchObject({ id: acme, source: "organisation", level: "write" })
      })

      it("should skip a team account where a rule leaves the person read only, for a write function (AC14)", async () => {
        const ventes = await account("Mail Ventes", { team: o.teams.ventes })
        const acme = await account("Mail Acme")
        await fx.addRule({ orgId: o.org.id, accountId: ventes, userId: o.people.lea.id, level: "read" })
        await fx.addRule({ orgId: o.org.id, accountId: acme, userId: o.people.lea.id, level: "write" })
        expect(await resolve("lea", { ...team.ventes, source: "argument" })).toMatchObject({ id: acme, source: "organisation" })
      })
    })
  },
)
