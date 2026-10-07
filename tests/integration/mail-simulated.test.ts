// @vitest-environment node
// Connecteur `mail` simulé sur une vraie base (E04-S01, AC17, AC18, AC20) : la fonction reçoit le compte
// résolu comme `call` le lui passera (E03-S04), sous la session de la personne ; `sim_outbox` se relit par
// la connexion d'administration. Les textes servis au modèle se comparent mot pour mot (H04, P14). Suite
// portable depuis E01-S10 f2 (chaque personne par `fx.as`, sans Supabase Auth ni PostgREST) : le job
// `bare-postgres` la joue.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { checkArguments } from "../../packages/plateforme/server/catalog/arguments"
import type { CatalogFunction, FunctionContext } from "../../packages/plateforme/server/catalog/define"
import { resolveAccount, runningTeam } from "../../packages/plateforme/server/connectors/resolution"
import { mailCreateDraft, mailSendDraft } from "../../packages/plateforme/server/connectors/simulated/mail"
import { PlatformError } from "../../packages/plateforme/server/errors"
import { resolveIdentity } from "../../packages/plateforme/server/identity"
import { createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

// Projet partagé par les agents d'une vague : jusqu'à 30 s mesurées pour un test, le 2026-09-24.
const NETWORK_TIMEOUT = 120_000
const SETUP_TIMEOUT = 180_000
const TO = "sophie@valbrune.test"
const SUBJECT = "Votre rendez-vous"

type Who = "claire" | "lea" | "paul"

async function refusal(promise: Promise<unknown>): Promise<PlatformError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  if (!(error instanceof PlatformError)) throw new Error(`expected a PlatformError, got ${String(error)}`)
  return error
}

describe.skipIf(!sqlConfigured || privatePending)(
  privateFolderSuite(sqlConfigured ? "simulated mail connector on a real database" : `simulated mail connector on a real database (${SQL_SKIP_REASON})`, privatePending),
  { timeout: NETWORK_TIMEOUT },
  () => {
    let fx: SqlFixtures
    let o: SqlReferenceOrg
    const accounts = { ventes: "", support: "" }
    const contexts = new Map<Who, FunctionContext>()

    // E05-S13 (fiche D128) : plus d'équipe par défaut ; les deux équipes de Claire ont un compte, elle nomme Ventes.
    function as(who: Who, team = who === "claire" ? "ventes" : undefined): Promise<FunctionContext> {
      const base = contexts.get(who)
      if (!base) throw new Error(`${who} has no session`)
      return withAccount(base, team)
    }

    /** Le contexte d'exécution que `call` bâtira (E03-S04) : équipe porteuse, puis compte résolu. */
    async function withAccount(base: FunctionContext, team?: string, host = o.host): Promise<FunctionContext> {
      const running = await runningTeam(base.db, base.identity, { fn: mailCreateDraft, team, ctxCode: null })
      const account = await resolveAccount(base.db, base.identity, { fn: mailCreateDraft, team: running, origin: `https://${host}` })
      return { ...base, account }
    }

    function call(fn: CatalogFunction, context: FunctionContext, args: Record<string, unknown>) {
      const parsed = checkArguments(fn.schema, args)
      if (!parsed.success) throw new Error(`invalid test arguments for ${fn.name}`)
      // Le type commun du catalogue efface les arguments en `never` ; ils ont passé le schéma.
      return fn.run(context, parsed.data as never)
    }

    function summary(context: FunctionContext, id: string) {
      if (!mailSendDraft.summarize) throw new Error("mail.send_draft has no summary")
      // Même raison que `call` : arguments validés par le schéma, effacés en `never`.
      return mailSendDraft.summarize(context, mailSendDraft.schema.parse({ id }) as never)
    }

    async function outbox(id: string) {
      const [row] = await fx.admin<{ account_id: string; status: string; payload: unknown; sent_at: Date | null }[]>`
        select id, org_id, account_id, connector, function, payload, status, created_by, sent_by, sent_at from platform.sim_outbox where id = ${id}`
      if (!row) throw new Error("sim_outbox read failed: no row")
      return row
    }

    async function draft(who: Who, team?: string, body = "Bonjour Sophie, …"): Promise<string> {
      const output = await call(mailCreateDraft, await as(who, team), { to: TO, subject: SUBJECT, body })
      const id = output.data?.draft_id
      if (typeof id !== "string") throw new Error("no draft id")
      return id
    }

    beforeAll(async () => {
      fx = createSqlFixtures()
      o = await fx.buildReferenceOrg()
      await fx.addActivation(o.org.id, "mail")
      await fx.addTeamMember(o.teams.support, o.people.claire.id)
      accounts.ventes = await fx.createAccount(o.org.id, { ownerKind: "team", ownerTeamId: o.teams.ventes, label: "Mail Ventes" })
      accounts.support = await fx.createAccount(o.org.id, { ownerKind: "team", ownerTeamId: o.teams.support, label: "Mail Support" })
      for (const who of ["claire", "lea", "paul"] as const) {
        const user = o.people[who]
        const db = fx.as(user)
        const identity = await resolveIdentity(db, o.host, { userId: user.id, email: user.email })
        contexts.set(who, { db, identity })
      }
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await fx?.cleanup()
    }, SETUP_TIMEOUT)

    it("should save a draft in sim_outbox on the resolved account, not sent (AC17)", async () => {
      const context = await as("claire")
      expect(context.account).toMatchObject({ label: "Mail Ventes", mode: "simule", source: "team" })
      const output = await call(mailCreateDraft, context, { to: TO, subject: SUBJECT, body: "Bonjour Sophie, …" })
      const id = String(output.data?.draft_id)
      expect(id).toMatch(/^sim_[0-9a-f]{8}$/)
      expect(output).toEqual({
        text: `Draft ${id} saved for ${TO}: « ${SUBJECT} ». Not sent.`,
        data: { draft_id: id, to: TO, subject: SUBJECT },
      })
      expect(await outbox(id)).toEqual({
        id,
        org_id: o.org.id,
        account_id: accounts.ventes,
        connector: "mail",
        function: "mail.create_draft",
        payload: { to: TO, subject: SUBJECT, body: "Bonjour Sophie, …" },
        status: "draft",
        created_by: o.people.claire.id,
        sent_by: null,
        sent_at: null,
      })
    })

    it("should summarize a draft without sending it, the body cut at 300 characters (AC18)", async () => {
      const body = `${"a".repeat(300)}bcd`
      const id = await draft("claire", undefined, body)
      const context = await as("claire")
      expect(await summary(context, id)).toEqual({
        text: [
          `About to send draft ${id}:`,
          `To: ${TO}`,
          `Subject: ${SUBJECT}`,
          `Body: ${"a".repeat(300)}…`,
          "Account: « Mail Ventes » (simulated: nothing will leave the server)",
        ].join("\n"),
        data: { draft_id: id, to: TO, subject: SUBJECT, account: { label: "Mail Ventes", mode: "simule" } },
      })
      expect((await outbox(id)).status).toBe("draft")
    })

    // supabase-patterns.md § Error Handling : une moitié de paire ferait refuser tout le corps.
    it("should keep a draft whose text holds half of a surrogate pair, and never cut the summary inside an emoji", async () => {
      const lone = await draft("claire", undefined, `Bonjour \ud83d Sophie`)
      expect((await outbox(lone)).payload).toMatchObject({ body: "Bonjour � Sophie" })
      const emoji = await draft("claire", undefined, `${"a".repeat(299)}😀bcd`)
      const { text } = await summary(await as("claire"), emoji)
      expect(text).toContain(`Body: ${"a".repeat(299)}…\n`)
    })

    it("should send a draft once, in the name of the caller, then refuse a second send (AC18)", async () => {
      const id = await draft("claire")
      const context = await as("claire")
      expect(await call(mailSendDraft, context, { id })).toEqual({
        text: `Draft ${id} sent to ${TO} — simulated account: nothing left the server.`,
        data: { sent_ids: [id], to: TO },
      })
      const sent = await outbox(id)
      expect(sent).toMatchObject({ status: "sent", sent_by: o.people.claire.id })
      const on = `${new Date(sent.sent_at ?? "").toISOString().slice(0, 16).replace("T", " ")} UTC`
      const again = await refusal(call(mailSendDraft, context, { id }))
      expect(again.code).toBe("conflict")
      expect(again.message).toBe(`Draft ${id} was already sent on ${on}.`)
      expect((await refusal(summary(context, id))).code).toBe("conflict")
    })

    it("should refuse an unknown draft, and a draft of another account with the right call (AC18)", async () => {
      const context = await as("claire")
      const unknown = await refusal(call(mailSendDraft, context, { id: "sim_00000000" }))
      expect(unknown.code).toBe("not_found")
      expect(unknown.message).toBe("Unknown draft sim_00000000. Create one with mail.create_draft.")
      const id = await draft("claire", "support")
      expect((await outbox(id)).account_id).toBe(accounts.support)
      const other = await refusal(call(mailSendDraft, context, { id }))
      expect(other.code).toBe("conflict")
      expect(other.message).toBe(`Draft ${id} belongs to account « Mail Support », not « Mail Ventes ». Call again with account: "Mail Support".`)
      expect((await outbox(id)).status).toBe("draft")
    })

    // Claire mène Ventes dans les deux organisations : la RLS lui montre le brouillon de l'autre, seul
    // le filtre sur l'organisation de l'adresse le cache (sans lui : `conflict` qui nomme le compte de B).
    it("should not find a draft of another organisation, for a member of both (AC18)", async () => {
      const b = await fx.buildReferenceOrg(o.people)
      await fx.addActivation(b.org.id, "mail")
      await fx.createAccount(b.org.id, { ownerKind: "team", ownerTeamId: b.teams.ventes, label: "Mail Ventes" })
      const claire = await as("claire")
      const identity = await resolveIdentity(claire.db, b.host, { userId: o.people.claire.id, email: o.people.claire.email })
      const inB = await withAccount({ db: claire.db, identity }, undefined, b.host)
      const id = String((await call(mailCreateDraft, inB, { to: TO, subject: SUBJECT, body: "Bonjour Sophie, …" })).data?.draft_id)
      expect(await outbox(id)).toMatchObject({ org_id: b.org.id, status: "draft" })
      // Un appel à la fois : un refus lancé d'avance serait une rejection non suivie.
      for (const attempt of [() => summary(claire, id), () => call(mailSendDraft, claire, { id })]) {
        const elsewhere = await refusal(attempt())
        expect(elsewhere.code).toBe("not_found")
        expect(elsewhere.message).toBe(`Unknown draft ${id}. Create one with mail.create_draft.`)
      }
      expect((await outbox(id)).status).toBe("draft")
    })

    it("should hide a draft of Mail Ventes from Support, and let a member of Ventes read and send it (AC20)", async () => {
      const id = await draft("claire")
      const paul = await as("paul")
      expect(paul.account?.label).toBe("Mail Support")
      // Un appel à la fois : un refus lancé d'avance serait une rejection non suivie.
      for (const attempt of [() => summary(paul, id), () => call(mailSendDraft, paul, { id })]) {
        const hidden = await refusal(attempt())
        expect(hidden.code).toBe("not_found")
        expect(hidden.message).toBe(`Unknown draft ${id}. Create one with mail.create_draft.`)
      }
      const lea = await as("lea")
      expect((await summary(lea, id)).data).toMatchObject({ draft_id: id, account: { label: "Mail Ventes" } })
      expect((await call(mailSendDraft, lea, { id })).data).toEqual({ sent_ids: [id], to: TO })
      expect(await outbox(id)).toMatchObject({ status: "sent", sent_by: o.people.lea.id })
    })
  },
)
