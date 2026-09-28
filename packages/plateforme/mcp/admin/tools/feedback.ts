// Opérations d'`admin_feedback` (E08-S06, AC17, AC18 ; N8) : la liste et l'état des tickets par les
// services d'E08-S09 (`listFeedback`, `setFeedbackState`, réservés à l'équipe plateforme qui administre
// l'organisation, décidé par eux) ; un ticket se nomme par son numéro dans l'organisation (`FB-0012`, E01-S06), jamais
// par son identifiant global. Rien n'est décidé ici (H123).
import * as z from "zod/v4"
import { feedbackStateSchema, feedbackTypeSchema, orgSlugSchema, type FeedbackCounts, type FeedbackTicketView } from "../../../schemas"
import { journalPeriodSchema } from "../../../schemas/journal"
import { listFeedback, setFeedbackState } from "../../../server/feedback"
import { cut } from "../../../server/journal"
import { day, oneLine, renderHelp, targetOf, type AdminOutput, type OpCall, type OpTable } from "../ops"

/** Texte d'un ticket et sa résolution, montrés au plus (AC17) ; sa cible, au plus : une page de 50 tickets tient sous le plafond. */
const TEXT_SHOWN = 200
const TARGET_SHOWN = 80

function countsText(counts: FeedbackCounts): string {
  return `${counts.open} open, ${counts.acknowledged} acknowledged, ${counts.resolved} resolved, ${counts.declined} declined`
}

/** « - FB-0012 · <date> · <personne> · <type> · target <cible> · <état> · « <texte> » · ctx <code> » (+ la résolution). */
function ticketLine(ticket: FeedbackTicketView): string {
  const target = ticket.target ? `target ${cut(oneLine(ticket.target), TARGET_SHOWN)}` : "no target"
  const parts = [
    `- ${ticket.ticket}`,
    day(ticket.createdAt),
    ticket.person ?? "removed person",
    ticket.type,
    target,
    ticket.state,
    `« ${cut(oneLine(ticket.text), TEXT_SHOWN)} »`,
    ticket.ctx ? `ctx ${ticket.ctx}` : "no ctx",
    ...(ticket.resolution ? [`resolution: ${cut(oneLine(ticket.resolution), TEXT_SHOWN)}`] : []),
  ]
  return parts.join(" · ")
}

/** Les champs d'un ticket, sans ses textes longs : ils sont dans la ligne, coupés (AC22). */
function ticketData(ticket: FeedbackTicketView): Record<string, unknown> {
  const { number, createdAt, person, type, state, handledBy, handledAt, ctx } = ticket
  return { ticket: ticket.ticket, number, created_at: createdAt, person, type, state, handled_by: handledBy, handled_at: handledAt, ctx }
}

async function list(call: OpCall): Promise<AdminOutput> {
  const identity = targetOf(call)
  const days = journalPeriodSchema.safeParse(call.input.days).data ?? 30
  const state = feedbackStateSchema.safeParse(call.input.state).data
  const type = feedbackTypeSchema.safeParse(call.input.type).data
  const cursor = typeof call.input.cursor === "string" ? call.input.cursor : undefined
  const result = await listFeedback(call.deps.db, identity, { state, type, days, cursor })
  const nextActions = ["admin_feedback set_state", "admin_journal conversation"]
  const data = { counts: result.counts, tickets: result.tickets.map(ticketData), next_cursor: result.nextCursor }
  if (result.tickets.length === 0) {
    const filters = [state ? `, state ${state}` : "", type ? `, type ${type}` : ""].join("")
    return { text: [countsText(result.counts), `No ticket in ${identity.org.slug} over the last ${days} days${filters}.`].join("\n"), data, nextActions }
  }
  const lines = [countsText(result.counts), ...result.tickets.map(ticketLine), ...(result.nextCursor ? [`next_cursor: ${result.nextCursor}`] : [])]
  return { text: lines.join("\n"), data, nextActions }
}

async function setState(call: OpCall): Promise<AdminOutput> {
  const identity = targetOf(call)
  const { changed, ticket } = await setFeedbackState(call.deps.db, identity, { ticket: call.input.ticket, state: call.input.state, resolution: call.input.resolution })
  const text = !changed
    ? `${ticket.ticket} is already ${ticket.state}; nothing changed.`
    : ticket.state === "open"
      ? `${ticket.ticket} is open again: its previous decision was cleared.`
      : `${ticket.ticket} is now ${ticket.state} (by you, ${day(ticket.handledAt ?? new Date().toISOString())}).`
  return { text, data: { tickets: [{ ...ticketData(ticket), resolution: ticket.resolution }] }, target: ticket.ticket, nextActions: ["admin_feedback list"] }
}

export const FEEDBACK_OPS: OpTable = {
  help: {
    schema: z.object({}),
    org: "none",
    twoStep: false,
    summary: "Gives the fields of each operation of admin_feedback.",
    example: {},
    refusals: [],
    run: async () => ({ text: renderHelp("admin_feedback", FEEDBACK_OPS), nextActions: [] }),
  },
  list: {
    schema: z.object({
      org: orgSlugSchema,
      state: feedbackStateSchema.optional(),
      type: feedbackTypeSchema.optional(),
      days: journalPeriodSchema.optional(),
      cursor: z.string().max(200).optional(),
    }),
    org: "target",
    twoStep: false,
    summary: "Lists the tickets of the organisation, most recent first, with the count of each state (all states and 30 days by default).",
    example: { org: "acme", state: "open" },
    refusals: ["forbidden: Handling the feedback of <org> is reserved to the platform team that administers it."],
    run: list,
  },
  set_state: {
    schema: z.object({ org: orgSlugSchema, ticket: z.string().max(40), state: feedbackStateSchema, resolution: z.string().max(2000).optional() }),
    org: "target",
    twoStep: false,
    summary: "Sets the state of a ticket (open, acknowledged, resolved, declined); declined needs a resolution the reporter will read; back to open clears the decision.",
    example: { org: "acme", ticket: "FB-0012", state: "declined", resolution: "Out of scope for this version." },
    refusals: [
      "invalid_arguments: ticket must look like FB-0012.",
      "invalid_arguments: A declined ticket needs a resolution: pass resolution = why it will not be handled, which the reporter will read.",
      "not_found: Unknown ticket <ticket> in <org>.",
    ],
    run: setState,
  },
}
