// `POST /api/platform/signup` (E12-S01, ADR-023) : l'inscription d'une organisation, servie sans organisation par
// l'adresse (comme `cell`), à session, sur la seule option `signup` de l'hôte ; sans elle, la route n'existe pas.
// Adaptateur mince : les refus se décident dans `server/admin/signup.ts`. La ligne de journal s'écrit dans la nouvelle
// organisation, par un second client de l'appelant (le premier a traduit son identité avant que `signup_org` la crée).
import { createPlatformDb } from "../server/db"
import { signUp, type SignupOptions, type SignupResult } from "../server/admin/signup"
import { PlatformError } from "../server/errors"
import { resolveIdentity } from "../server/identity"
import { loggedArgs, writeJournal } from "../server/journal"
import { errorResponse, type VerifiedSession } from "./session"

/** La route d'inscription : `POST signup`, un segment. */
export function isSignupRoute(segments: readonly string[], method: string): boolean {
  return method === "POST" && segments.length === 1 && segments[0] === "signup"
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text())
  } catch {
    throw new PlatformError("invalid_arguments", "Request body must be JSON.")
  }
}

type SignupCall = { session: VerifiedSession; request: Request; body: unknown; started: number }

/** La ligne `signup` du journal de la nouvelle organisation ; ne lève jamais (l'écrivain commun non plus). */
async function journalSignup({ session, request, body, started }: SignupCall, result: Extract<SignupResult, { created: true }>) {
  try {
    const db = createPlatformDb({ caller: session.caller })
    const identity = await resolveIdentity(db, result.hosts[0] ?? null, { email: session.email })
    await writeJournal(db, [
      {
        org_id: identity.org.id,
        user_id: identity.user.id,
        method: "api",
        tool: "POST signup",
        target: result.org.slug,
        args: loggedArgs(body),
        duration_ms: Date.now() - started,
        user_agent: request.headers.get("user-agent"),
      },
    ])
  } catch {
    console.error("[platform] signUp: journal line not written")
  }
}

/** L'inscription (AC-6, AC-7) : 200 et l'aperçu sans `confirm`, 201 et l'organisation créée avec. */
export async function signupResponse(
  request: Request,
  session: VerifiedSession,
  options: { signup: SignupOptions; defer?: (task: () => Promise<void>) => void },
  started: number,
): Promise<Response> {
  let body: unknown
  let result: SignupResult
  try {
    body = await readBody(request)
    result = await signUp(session.db, { email: session.email }, body, { signup: options.signup, request })
  } catch (error) {
    if (error instanceof PlatformError) return errorResponse(error)
    throw error
  }
  if (result.created) {
    const created = result
    const task = () => journalSignup({ session, request, body, started }, created)
    if (options.defer) options.defer(task)
    else void task()
  }
  return Response.json({ data: result }, { status: result.created ? 201 : 200 })
}
