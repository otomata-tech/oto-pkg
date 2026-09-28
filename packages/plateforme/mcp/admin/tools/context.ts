// Opérations d'`admin_context` (E08-S02, AC6, AC12, AC13) : le code de la session en première ligne,
// qui appelle, où il agit, les outils admin et leurs opérations. Le code est émis par la porte et ancré
// après le rendu (`server.ts`, N5) ; ces opérations ne font que le citer.
import * as z from "zod/v4"
import { ADMIN_CTX_MS, ADMIN_SESSION_FAILED, staffDirectory, type StaffEntry } from "../../../server/admin/context"
import { listOrgOverviews, listOrgs, type AdminOrg } from "../../../server/admin/orgs"
import { ADMIN_OPS } from "../inputs"
import { day, listLines, MAX_LIST_LINES, plural, renderHelp, type AdminOutput, type OpCall, type OpTable } from "../ops"
import { ADMIN_TOOL_KEYS } from "../tools"

/** Organisations nommées par `op ctx` ; toutes sont dans `op orgs` (AC12). */
const CTX_ORGS_SHOWN = 20

export const NO_ORGANISATION =
  'You can act on no organisation yet. Create one with admin_org {"op": "create"}, or ask a colleague who has access to grant you one.'

const NEXT = ["admin_org get", "admin_team list"]

function ctxLine(code: string): string {
  return `ctx: ${code} (admin session, valid 24 hours)`
}

/** « platform access since … » ou « admin (member) » : comment l'appelant agit sur l'organisation. */
function reach(org: AdminOrg): string {
  return org.access === "member" ? `${org.role} (member)` : `platform access since ${day(org.since)}`
}

/** Les outils admin et leurs opérations, `help` retiré. */
function adminTools(): { name: string; ops: string[] }[] {
  return ADMIN_TOOL_KEYS.filter((key) => key !== "admin_context").map((key) => ({ name: key, ops: ADMIN_OPS[key].filter((op) => op !== "help") }))
}

/** Ce que portent toutes les opérations : le code, son échéance, qui appelle, les outils (AC6). */
function sessionData(call: OpCall, me: StaffEntry | undefined, orgs: AdminOrg[]) {
  return {
    ctx: call.ctx,
    expires_at: new Date(Date.now() + ADMIN_CTX_MS).toISOString(),
    user: { email: me?.email ?? call.deps.caller.email, staff_since: me?.addedAt ?? null },
    orgs: orgs.slice(0, MAX_LIST_LINES).map((org) => ({
      slug: org.slug,
      name: org.name,
      prefix: org.prefix,
      access: org.access,
      ...(org.role ? { role: org.role } : {}),
      since: org.since,
    })),
    tools: adminTools(),
  }
}

async function session(call: OpCall): Promise<{ me: StaffEntry | undefined; orgs: AdminOrg[] }> {
  const [staff, orgs] = await Promise.all([staffDirectory(call.deps.db), listOrgs(call.deps.db, call.deps.caller)])
  return { me: staff.find((entry) => entry.userId === call.deps.caller.userId), orgs }
}

async function openSession(call: OpCall): Promise<AdminOutput> {
  const { me, orgs } = await session(call)
  const signedIn = `Signed in as ${me?.email ?? call.deps.caller.email}${me ? `, in the platform team since ${day(me.addedAt)}` : ""}.`
  const where =
    orgs.length === 0
      ? [NO_ORGANISATION]
      : [
          `You can act on ${plural(orgs.length, "organisation", "organisations")}:`,
          ...listLines(orgs, (org) => `- ${org.slug} · ${org.name} · ${reach(org)}`, {
            max: CTX_ORGS_SHOWN,
            more: (count) => `… and ${count} more: admin_context {"op": "orgs"}`,
          }),
        ]
  const text = [
    ctxLine(call.ctx),
    signedIn,
    ...where,
    "Admin tools (pass ctx on every call, and org = the organisation slug):",
    ...adminTools().map((tool) => `- ${tool.name}: ${tool.ops.join(", ")}`),
    "Call any admin tool with op help for the fields of its operations.",
  ].join("\n")
  return { text, data: sessionData(call, me, orgs), nextActions: NEXT }
}

async function listReach(call: OpCall): Promise<AdminOutput> {
  const { db, caller } = call.deps
  const [staff, { orgs, overviews }] = await Promise.all([staffDirectory(db), listOrgOverviews(db, caller, MAX_LIST_LINES)])
  const me = staff.find((entry) => entry.userId === caller.userId)
  if (orgs.length === 0) return { text: `${ctxLine(call.ctx)}\n${NO_ORGANISATION}`, data: sessionData(call, me, orgs), nextActions: NEXT }
  const emails = new Map(staff.map((entry) => [entry.userId, entry.email]))
  const line = (org: AdminOrg) => {
    const addresses = plural(overviews.get(org.id)?.hosts.length ?? 0, "address", "addresses")
    const granter = org.grantedBy ? emails.get(org.grantedBy) : undefined
    const by = granter ? ` (granted by ${granter})` : ""
    return `- ${org.slug} · ${org.name} · prefix ${org.prefix} · ${addresses} · ${reach(org)}${org.access === "member" ? "" : by}`
  }
  const text = [ctxLine(call.ctx), `Organisations you can act on (${orgs.length}):`, ...listLines(orgs, line)].join("\n")
  return { text, data: sessionData(call, me, orgs), nextActions: NEXT }
}

async function help(call: OpCall): Promise<AdminOutput> {
  const { me, orgs } = await session(call)
  return { text: `${ctxLine(call.ctx)}\n${renderHelp("admin_context", CONTEXT_OPS)}`, data: sessionData(call, me, orgs), nextActions: [] }
}

const noField = z.object({})

export const CONTEXT_OPS: OpTable = {
  ctx: {
    schema: noField,
    org: "none",
    twoStep: false,
    summary: "Opens an admin session (the default): who you are, the organisations you can act on, the admin tools and their operations.",
    example: {},
    refusals: [`internal: ${ADMIN_SESSION_FAILED}`],
    run: openSession,
  },
  orgs: {
    schema: noField,
    org: "none",
    twoStep: false,
    summary: "Opens an admin session and lists all the organisations you can act on, with how you reach each one and since when.",
    example: {},
    refusals: [`internal: ${ADMIN_SESSION_FAILED}`],
    run: listReach,
  },
  help: {
    schema: noField,
    org: "none",
    twoStep: false,
    summary: "Opens an admin session and gives the fields of each operation of admin_context.",
    example: {},
    refusals: [],
    run: help,
  },
}
