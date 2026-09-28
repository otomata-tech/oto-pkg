// Opérations d'`admin_node` (E08-S06, AC1 à AC6) : chaque opération compose un service existant —
// déplacement d'E03-S07 (`moveNode`, alias écrits par la base), publication d'E03-S03 (`publishNode` :
// contrôle d'une procédure, liens, `publish_node`), règles d'un nœud d'E05-S03, propriétaire
// (`server/admin/nodes.ts`) — et met son résultat en texte. Aucun droit ne se décide ici (H123) et aucun
// bloc ne s'écrit (N17) : écrire le contenu reste à `write`.
import * as z from "zod/v4"
import { nodePathSchema, orgSlugSchema, setNodeRuleSchema } from "../../../schemas"
import { unknownPath } from "../../../server/access"
import { describeNodeOwner, describeTransfer, transferOwner, type TransferPlan } from "../../../server/admin/nodes"
import { boundedList, PlatformError } from "../../../server/errors"
import { findNode } from "../../../server/nodes/lookup"
import { moveNode } from "../../../server/nodes/move"
import { publishNode } from "../../../server/nodes/publish"
import { renamedLine } from "../../../server/nodes/rename"
import { listNodeRules, removeRule, setNodeRule } from "../../../server/rules"
import { nothingWas, plural, renderHelp, targetOf, type AdminOutput, type OpCall, type OpTable } from "../ops"
import { noRuleFor, readSubject, ruleOf, rulesOutput, ruleSetText } from "../rule-texts"

const AFTER_RULES = ["admin_node rules"]
const INHERITANCE = "Where no rule is set here, the closest rule above applies, then the owner's defaults."

async function move(call: OpCall): Promise<AdminOutput> {
  const { db } = call.deps
  const identity = targetOf(call)
  const path = String(call.input.path)
  const moved = await moveNode(db, identity, { path, new_path: String(call.input.new_path) })
  const to = moved.target
  const owner = await describeNodeOwner(db, identity, to)
  // Les déplacements sont triés par ancien chemin : le nœud, préfixe des autres, vient en premier.
  const from = moved.moves[0]?.from ?? path
  const descendants = moved.moves.length - 1
  const head =
    descendants > 0
      ? `${from} moved to ${to} with its ${plural(descendants, "descendant", "descendants")}; the old paths stay as aliases (tools called with them answer « moved to ${to} »).`
      : `${from} moved to ${to}; the old path stays as an alias (tools called with it answer « moved to ${to} »).`
  return { text: `${head} Owner now: ${owner}.`, data: { nodes: moved.moves, owner }, target: to, nextActions: AFTER_RULES }
}

async function publish(call: OpCall): Promise<AdminOutput> {
  const { db } = call.deps
  const identity = targetOf(call)
  const path = String(call.input.path)
  // Un nœud de niveau 0 (un espace personnel, H61, H66) est introuvable, comme un chemin inconnu (H68).
  const found = await findNode(db, identity, path)
  if (!found) throw new PlatformError("not_found", unknownPath(path))
  const { node } = found
  const published = await publishNode(db, identity, node, { baseRevision: node.revision })
  const lines = [`${node.path} published: revision ${published.revision} (was ${node.revision}).`]
  if (published.rulesChanged) {
    lines.push(`${node.path} is a context page: the open ctx codes of ${identity.org.slug} expire, and assistants call ${identity.org.prefix}_context again.`)
  }
  if (published.warnings.length > 0) lines.push("Warnings:", boundedList(published.warnings.map((warning) => `- ${warning}`), "\n"))
  // E05-S10, AC-b12 : l'adresse a suivi le titre publié.
  const { renamed } = published
  if (renamed) lines.push(renamedLine(renamed))
  const now = renamed?.to ?? node.path
  const data = {
    nodes: [{ path: now, revision: published.revision, previous_revision: node.revision, rules_changed: published.rulesChanged, ...(renamed ? { renamed_from: renamed.from } : {}) }],
  }
  return { text: lines.join("\n"), data, target: now, nextActions: ["admin_journal conversations"] }
}

/** Le premier temps (AC3, N2) : à qui le nœud passe, avec ses héritiers ; ce que la gestion devient. */
function transferSummary(plan: TransferPlan, org: string): string {
  const heirs = plan.inheritors > 0 ? ` and its ${plural(plan.inheritors, "descendant that inherits its owner", "descendants that inherit their owner")}` : ""
  const effect = plan.person
    ? `Only ${plan.person} will see these nodes: the administrators of ${org} and the platform team lose access (personal space).`
    : plan.parent
      ? `It will inherit its owner from ${plan.parent}: ${plan.after}.`
      : `Management now: ${plan.before}; after: ${plan.after}; administrators of ${org} keep it.`
  return [`About to give ${plan.path}${heirs} to ${plan.after}.`, effect, nothingWas("transferred")].join("\n")
}

async function transfer(call: OpCall): Promise<AdminOutput> {
  const { db } = call.deps
  const identity = targetOf(call)
  const input = { path: String(call.input.path), owner: call.input.owner }
  const summary = (plan: TransferPlan) => ({ path: plan.path, owner_before: plan.before, owner_after: plan.after, inheritors: plan.inheritors })
  const unchanged = (plan: TransferPlan): AdminOutput => ({
    text: `${plan.path} already belongs to ${plan.before}; nothing changed.`,
    data: { summary: summary(plan) },
    target: plan.path,
    nextActions: AFTER_RULES,
  })
  if (call.input.confirm !== true) {
    const plan = await describeTransfer(db, identity, input)
    if (plan.unchanged) return unchanged(plan)
    return { text: transferSummary(plan, identity.org.slug), data: { summary: summary(plan) }, target: plan.path, nextActions: [] }
  }
  const done = await transferOwner(db, identity, input)
  if (done.changed === 0) return unchanged(done)
  const text = `${done.path} now belongs to ${done.after} (${plural(done.changed, "node", "nodes")} changed owner).`
  return { text, data: { nodes: [{ path: done.path, owner: done.after, changed: done.changed }] }, target: done.path, nextActions: AFTER_RULES }
}

async function rules(call: OpCall): Promise<AdminOutput> {
  const { db } = call.deps
  const identity = targetOf(call)
  const view = await listNodeRules(db, identity, String(call.input.path))
  const owner = await describeNodeOwner(db, identity, view.path)
  const served = await rulesOutput(db, identity, { target: view.path, rules: view.rules, general: view.general, closing: `Owner: ${owner}. ${INHERITANCE}` })
  return { text: served.text, data: { path: view.path, owner, rules: served.rules }, target: view.path, nextActions: ["admin_node add_rule"] }
}

async function addRule(call: OpCall): Promise<AdminOutput> {
  const { db } = call.deps
  const identity = targetOf(call)
  const path = String(call.input.path)
  const subject = await readSubject(db, identity, call.input.subject)
  const previous = ruleOf((await listNodeRules(db, identity, path)).rules, subject.subject)?.level ?? null
  const set = await setNodeRule(db, identity, { path, subject: subject.subject, level: call.input.level })
  const { level } = set.data
  const text = ruleSetText(subject, { level, scope: `${set.data.path} and below, unless a closer rule says otherwise`, previous })
  return { text, data: { rules: [{ subject: subject.text, level, previous }] }, target: set.target, nextActions: AFTER_RULES }
}

async function removeRuleOp(call: OpCall): Promise<AdminOutput> {
  const { db } = call.deps
  const identity = targetOf(call)
  const subject = await readSubject(db, identity, call.input.subject)
  const view = await listNodeRules(db, identity, String(call.input.path))
  const rule = ruleOf(view.rules, subject.subject)
  if (!rule) throw noRuleFor(subject, view.path)
  const removed = await removeRule(db, identity, rule.id)
  const text = `${subject.text} no longer has a rule on ${view.path} (it was ${rule.level}). ${INHERITANCE}`
  return { text, data: { rules: [{ subject: subject.text, removed: rule.level }] }, target: removed.target, nextActions: AFTER_RULES }
}

const onNode = { org: orgSlugSchema, path: nodePathSchema }
/** Une référence brute, lue par le service (`readRef`) : son refus est le message exact d'AC4 et d'AC6. */
const ref = z.string()

export const NODE_OPS: OpTable = {
  help: {
    schema: z.object({}),
    org: "none",
    twoStep: false,
    summary: "Gives the fields of each operation of admin_node.",
    example: {},
    refusals: [],
    run: async () => ({ text: renderHelp("admin_node", NODE_OPS), nextActions: [] }),
  },
  move: {
    schema: z.object({ ...onNode, new_path: nodePathSchema }),
    org: "target",
    twoStep: false,
    summary:
      "Moves a node and its descendants under an existing parent; their blocks, drafts, versions and links follow, and the old paths stay as aliases. A taken new_path gives the first free one (<segment>_2, _3…), said in the result.",
    example: { org: "acme", path: "ventes/tarifs", new_path: "conseil/tarifs" },
    refusals: [
      "not_found: Unknown path <path>, or the parent of new_path does not exist.",
      "invalid_arguments: <path> cannot move (root, personal spaces, a context page, a team folder), or under itself.",
      "conflict: Path <new_path> is not available: another write took it meanwhile, retry.",
      "forbidden: Moving <path> is reserved to <who>.",
    ],
    run: move,
  },
  publish: {
    schema: z.object(onNode),
    org: "target",
    twoStep: false,
    summary: "Publishes the pending draft of a node: its draft blocks become the published ones, the revision goes up by one, a context page renews the rules.",
    example: { org: "acme", path: "ventes/relance_devis" },
    refusals: [
      "invalid_arguments: Nothing to publish: <path> has no pending draft.",
      "invalid_arguments: a procedure whose call blocks are refused lists each problem (section, block, step, function).",
      "stale_revision: <path> changed while publishing. Read it again, then retry.",
      "not_found: Unknown path <path> (personal spaces are out of reach).",
    ],
    run: publish,
  },
  transfer_owner: {
    schema: z.object({ ...onNode, owner: ref, confirm: z.boolean().optional() }),
    org: "target",
    twoStep: true,
    summary: "Gives a node, and its descendants that inherit their owner, to team:<slug>, user:<email>, org, or back to its parent's owner (inherit).",
    example: { org: "acme", path: "support/faq", owner: "team:ventes" },
    refusals: [
      "invalid_arguments: owner must be team:<slug>, user:<email>, org or inherit.",
      "invalid_arguments: The root guide always belongs to the organisation.",
      "invalid_arguments: The owner of private, or of a personal space private/<handle>, cannot change.",
      "not_found: Unknown path <path>; unknown team or member.",
      "forbidden: Changing the owner of <path> is reserved to <who>. Ask them to change it.",
    ],
    run: transfer,
  },
  rules: {
    schema: z.object(onNode),
    org: "target",
    twoStep: false,
    summary: "Lists the access rules set on a node and names its owner.",
    example: { org: "acme", path: "ventes" },
    refusals: ["not_found: Unknown path <path>."],
    run: rules,
  },
  add_rule: {
    schema: z.object({ ...onNode, subject: ref, level: setNodeRuleSchema.shape.level }),
    org: "target",
    twoStep: false,
    summary: "Sets the access level of a team or a person on a node and below, replacing the rule of that subject if there is one.",
    example: { org: "acme", path: "ventes/tarifs", subject: "team:conseil", level: "read" },
    refusals: [
      "invalid_arguments: subject must be team:<slug> or user:<email>.",
      "forbidden: Sharing <path> is reserved to <who>; the manage level, to the administrators.",
    ],
    run: addRule,
  },
  remove_rule: {
    schema: z.object({ ...onNode, subject: ref }),
    org: "target",
    twoStep: false,
    summary: "Removes the rule of a team or a person on a node.",
    example: { org: "acme", path: "ventes/tarifs", subject: "user:claire@acme.example" },
    refusals: ["not_found: No rule for <subject> on <path>.", "invalid_arguments: subject must be team:<slug> or user:<email>."],
    run: removeRuleOp,
  },
}
