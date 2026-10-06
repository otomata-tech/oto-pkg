// Connecteur `mail` simulé (H80, H85, architecture § 9) : `mail.create_draft` écrit un brouillon,
// `mail.send_draft` l'envoie en deux temps (récapitulatif, puis envoi), le tout dans `sim_outbox`,
// sur le compte résolu. Rien ne sort du serveur. Sans lui, la V1 n'a aucune fonction de connecteur
// à confirmer en deux temps, et le mode simulé ne se voit nulle part. Le niveau sur le compte se
// décide ici, avant la requête (E01-S07 AC23) : la RLS n'est qu'un garde-fou. Face SQL (E01-S10,
// lot d1) : chaque lecture ou écriture de `sim_outbox` dans une transaction `db.tx`, les décisions
// d'`access.ts` hors d'elle.
//
// Repris de la maquette (`mcp-test/src/proto/functions/simulated.ts` l. 95-147) : schémas stricts,
// `summarize` sans effet, garde contre le double envoi, texte « Not sent. ». Retiré : la table
// `mail_drafts` (→ `sim_outbox`), `sellsy`, `slack`, `probe` (hors V1).
import * as z from "zod/v4"
import { ACCESS_LEVELS, accountLevel, describeOwner } from "../../access"
import { defineFunction, type FunctionContext } from "../../catalog/define"
import type { Json } from "../../database"
import { fromDatabaseError, inTransaction, isUniqueViolation, PlatformError } from "../../errors"
import { cut } from "../../journal"
import { isJsonObject } from "../../json"
import { requireSimulated } from "../modes"
import type { ResolvedAccount } from "../resolution"

/** Identifiant d'une ligne de `sim_outbox` (architecture § 4) : `sim_` et 8 chiffres hexadécimaux. */
const DRAFT_ID_PATTERN = /^sim_[0-9a-f]{8}$/

/**
 * Place du corps dans le récapitulatif avant l'envoi (AC18, N14) : ses 300 premiers caractères puis
 * « … » ; un corps de 301 caractères y tient entier.
 */
const SUMMARY_BODY_ROOM = 301

/**
 * Un brouillon lu : `sent_at` par `to_json`, en texte ISO comme PostgREST le rendait ; `account_label`,
 * le libellé de son compte, sous RLS (`null` quand il ne se lit pas).
 */
type DraftRow = { account_id: string; payload: Json; status: string; sent_at: string | null; account_label: string | null }

type Draft = { id: string; to: string; subject: string; body: string }

/** Le compte du `call` (H83), simulé (H85) : `mail` n'écrit jamais depuis un compte réel. */
function mailAccount(context: FunctionContext): ResolvedAccount {
  const { account } = context
  if (!account || account.connector !== "mail") {
    console.error("[platform] mail: called without a resolved mail account")
    throw new PlatformError("internal", "Internal error.")
  }
  requireSimulated(account)
  return account
}

/**
 * Écrire dans `sim_outbox` exige l'écriture sur le compte résolu (H67 : niveau 2), décidé avant la
 * requête sur le niveau que la résolution a calculé dans la même requête (`access.ts`, HN-E01S07-3) ;
 * le refus dit à qui demander (H68), comme celui de la résolution pour la même condition.
 */
async function requireWriteAccess(context: FunctionContext, account: ResolvedAccount, action: string): Promise<void> {
  if (account.level !== "read") return
  const ask = await describeOwner(context.db, context.identity, account.owner)
  throw new PlatformError("forbidden", `Account « ${account.label} » cannot ${action} for you (write access needed). Ask ${ask} for access.`)
}

/** Un champ texte du brouillon, tel que `mail.create_draft` l'a écrit dans `payload`. */
function payloadText(payload: Json, key: keyof Omit<Draft, "id">): string {
  if (!isJsonObject(payload)) return ""
  const value = payload[key]
  return typeof value === "string" ? value : ""
}

/** « 2026-09-23 14:02 UTC ». */
function sentOn(sentAt: string | null): string {
  return sentAt ? `${new Date(sentAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "an unknown date"
}

/**
 * Le brouillon à envoyer, depuis le compte résolu (N10) : inconnu, d'une autre organisation ou
 * invisible (niveau 0 sur son compte, décidé ici) → `not_found` ; déjà envoyé ou d'un autre compte →
 * `conflict`, avec l'appel correct.
 */
async function loadDraft(context: FunctionContext, account: ResolvedAccount, id: string): Promise<Draft> {
  const orgId = context.identity.org.id
  const [data] = await inTransaction(context.db, "mail.send_draft: sim_outbox", (sql) => sql<DraftRow[]>`
      select o.account_id, o.payload, o.status, to_json(o.sent_at) as sent_at, a.label as account_label
        from platform.sim_outbox o left join platform.accounts a on a.id = o.account_id
       where o.id = ${id} and o.org_id = ${orgId} and o.connector = 'mail'`)
  // Le compte résolu est visible (la résolution ne rend que ceux-là) ; celui d'un autre brouillon se
  // décide avant d'en dire l'état ou le libellé.
  const hidden =
    data !== undefined &&
    data.account_id !== account.id &&
    (await accountLevel(context.db, context.identity, data.account_id)) === ACCESS_LEVELS.none
  if (!data || hidden) throw new PlatformError("not_found", `Unknown draft ${id}. Create one with mail.create_draft.`)
  if (data.status === "sent") throw new PlatformError("conflict", `Draft ${id} was already sent on ${sentOn(data.sent_at)}.`)
  if (data.account_id !== account.id) {
    const owner = data.account_label ?? data.account_id
    throw new PlatformError(
      "conflict",
      `Draft ${id} belongs to account « ${owner} », not « ${account.label} ». Call again with account: "${owner}".`,
    )
  }
  return { id, to: payloadText(data.payload, "to"), subject: payloadText(data.payload, "subject"), body: payloadText(data.payload, "body") }
}

export const mailCreateDraft = defineFunction({
  name: "mail.create_draft",
  connector: "mail",
  class: "write",
  origin: "connecteur",
  description:
    "Saves an email draft on the mail account of the call and returns its id (sim_…); nothing is sent. Use it to prepare an email the user will review; send it with mail.send_draft once they approve. Mail accounts are simulated in this version: nothing leaves the server.",
  schema: z.strictObject({
    to: z.email().max(254).describe("Recipient email address, e.g. sophie@valbrune.test (one recipient)."),
    subject: z.string().min(1).max(200).describe("Subject line, 1 to 200 characters."),
    body: z.string().min(1).max(20_000).describe("Plain-text body, 1 to 20,000 characters."),
  }),
  examples: [{ to: "sophie@valbrune.test", subject: "Votre rendez-vous", body: "Bonjour Sophie, …" }],
  refusals: [
    "Invalid arguments: a missing field, an address that is not an email, or an unknown key such as cc or from, named in the refusal.",
    "No mail account you can use: the refusal says whom to ask, and gives the dashboard link.",
    "Several teams or accounts could run the call: ask the user which one, then call again with team or account.",
  ],
  next: ["mail.send_draft"],
  run: async (context, args) => {
    const account = mailAccount(context)
    await requireWriteAccess(context, account, "save a draft")
    // Une moitié de paire de substitution venue du host ferait refuser le JSON du brouillon par la base
    // (supabase-patterns.md § Error Handling) : elle devient U+FFFD.
    const payload = { to: args.to, subject: args.subject.toWellFormed(), body: args.body.toWellFormed() }
    const { identity } = context
    // 32 bits d'identifiant, fabriqués par la base : une collision refait une fois l'insertion, dans une
    // nouvelle transaction (celle de l'échec est annulée).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const created = await context.db
        .tx(
          (sql) => sql<{ id: string }[]>`
            insert into platform.sim_outbox (org_id, account_id, connector, function, payload, created_by)
            values (${identity.org.id}, ${account.id}, 'mail', 'mail.create_draft', ${sql.json(payload)}, ${identity.user.id})
            returning id`,
        )
        .then(
          ([row]) => row,
          (error) => {
            if (isUniqueViolation(error)) return null
            throw fromDatabaseError(error, "mail.create_draft: sim_outbox")
          },
        )
      if (created) {
        return {
          text: `Draft ${created.id} saved for ${args.to}: « ${payload.subject} ». Not sent.`,
          data: { draft_id: created.id, to: args.to, subject: payload.subject },
        }
      }
    }
    console.error("[platform] mail.create_draft: two draft id collisions in a row")
    throw new PlatformError("internal", "Internal error.")
  },
})

export const mailSendDraft = defineFunction({
  name: "mail.send_draft",
  connector: "mail",
  class: "sensitive",
  origin: "connecteur",
  description:
    "Sends an email draft saved by mail.create_draft, from the account it was saved on. Sensitive: without confirm it returns a summary (recipient, subject, body, account and its mode) and sends nothing; call again with confirm: true only after the user explicitly approved it. Mail accounts are simulated in this version: nothing leaves the server.",
  schema: z.strictObject({
    id: z
      .string()
      .trim()
      .regex(DRAFT_ID_PATTERN, "Draft id: sim_ followed by 8 hexadecimal digits, e.g. sim_1a2b3c4d")
      .describe("Draft id returned by mail.create_draft, e.g. sim_1a2b3c4d."),
  }),
  examples: [{ id: "sim_1a2b3c4d" }],
  refusals: [
    "Without confirm: nothing is sent, a summary is returned.",
    "Unknown draft: create one with mail.create_draft.",
    "Draft already sent: the refusal gives the date.",
    "Draft of another account: call again with the account it belongs to.",
  ],
  summarize: async (context, args) => {
    const account = mailAccount(context)
    const draft = await loadDraft(context, account, args.id)
    return {
      text: [
        `About to send draft ${draft.id}:`,
        `To: ${draft.to}`,
        `Subject: ${draft.subject}`,
        `Body: ${cut(draft.body, SUMMARY_BODY_ROOM)}`,
        `Account: « ${account.label} » (simulated: nothing will leave the server)`,
      ].join("\n"),
      data: { draft_id: draft.id, to: draft.to, subject: draft.subject, account: { label: account.label, mode: account.mode } },
    }
  },
  run: async (context, args) => {
    const account = mailAccount(context)
    const draft = await loadDraft(context, account, args.id)
    await requireWriteAccess(context, account, `send draft ${draft.id}`)
    // Gardée par `status = 'draft'` : deux envois simultanés n'en font qu'un (security-patterns.md § Idempotence).
    const sent = await inTransaction(context.db, "mail.send_draft: sim_outbox update", (sql) => sql`
        update platform.sim_outbox set status = 'sent', sent_by = ${context.identity.user.id}, sent_at = ${new Date()}
         where id = ${draft.id} and status = 'draft'
        returning id`)
    if (sent.length === 0) {
      // Aucune ligne après la décision : un autre envoi est passé entre la lecture et l'écriture (la
      // relecture dit sa date), sinon le brouillon a changé entre-temps (HN-E01S07-6).
      await loadDraft(context, account, draft.id)
      console.error(`[platform] mail.send_draft: no row written for draft ${draft.id}`)
      throw new PlatformError("conflict", `Draft ${draft.id} changed meanwhile. Retry the call.`)
    }
    return {
      text: `Draft ${draft.id} sent to ${draft.to} — simulated account: nothing left the server.`,
      data: { sent_ids: [draft.id], to: draft.to },
    }
  },
})
