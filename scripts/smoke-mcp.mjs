#!/usr/bin/env node
/**
 * smoke-mcp — le MCP de bout en bout, en HTTP réel (E03-S01, AC25 ; mcp-patterns.md § 10).
 *
 * Usage : `pnpm mcp:smoke [base_url]`. Sans `base_url`, lance `next start -p 3200` (après
 * `pnpm build`) et vise `http://localhost:3200`, donc l'organisation de `localhost` : la Démo
 * (`pnpm demo:seed`). Contrôle le 401 et son `WWW-Authenticate`, se connecte avec
 * `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` (clé publique, jamais la clé de service), puis enchaîne
 * `initialize`, `tools/list` (six outils au préfixe de l'organisation servie) et `<préfixe>_context`.
 *
 * Variables : l'environnement du processus, puis `.env.local` (`util.parseEnv`, comme
 * `vitest.config.ts`). N'imprime ni jeton ni mot de passe. Code 1 au premier écart.
 *
 * Serveur local, réponses JSON ou SSE.
 * Retiré : l'outil démo, le jeton passé en argument (il finirait dans l'historique du shell).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const PORT = 3200
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'E2E_USER_EMAIL', 'E2E_USER_PASSWORD']
const KEYS = ['context', 'find', 'read', 'call', 'write', 'feedback']
const PROTOCOL = '2025-06-18'

class SmokeFailure extends Error {}

function fail(message) {
  throw new SmokeFailure(message)
}

/** Environnement du processus d'abord, puis `.env.local` ; noms manquants seulement. */
function readEnv() {
  const file = join(process.cwd(), '.env.local')
  const local = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  const values = Object.fromEntries(REQUIRED.map((key) => [key, process.env[key] ?? local[key]]))
  const missing = REQUIRED.filter((key) => !values[key])
  if (missing.length) fail(`variables manquantes : ${missing.join(', ')} (.env.local)`)
  return values
}

async function waitReady(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {
      // Serveur pas encore à l'écoute : nouvel essai après la pause.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  fail(`serveur local muet après ${tries} s`)
}

/** Premier message JSON-RPC d'une réponse, JSON direct ou flux SSE (`data: …`). */
function parseMessage(text) {
  const data = text.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse(data ? data.slice(5) : text)
}

async function rpc({ base, token }, method, params, id) {
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const text = await response.text()
  return { status: response.status, message: text ? parseMessage(text) : null }
}

async function checkUnauthorized(base) {
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
  })
  const header = response.headers.get('www-authenticate') ?? ''
  const metadata = `${new URL(base).origin}/.well-known/oauth-protected-resource/api/mcp`
  if (response.status !== 401) fail(`sans jeton : HTTP ${response.status}, 401 attendu`)
  if (!header.includes('error="invalid_token"') || !header.includes(`resource_metadata="${metadata}"`)) {
    fail(`sans jeton : WWW-Authenticate inattendu (${header || 'absent'})`)
  }
  console.log(`401 sans jeton → WWW-Authenticate vers ${metadata}`)
}

async function signIn(env) {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email: env.E2E_USER_EMAIL, password: env.E2E_USER_PASSWORD })
  // Le message de Supabase ne contient ni le jeton ni le mot de passe ; seul son code est repris.
  if (error || !data.session) fail(`connexion du compte E2E refusée (${error?.code ?? error?.status ?? 'sans session'})`)
  console.log('compte E2E connecté')
  return data.session.access_token
}

async function checkMcp(session) {
  const init = await rpc(session, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'smoke', version: '1.0' } }, 1)
  if (init.status !== 200 || !init.message?.result) fail(`initialize : HTTP ${init.status} ${JSON.stringify(init.message?.error ?? null)}`)
  console.log(`initialize → HTTP 200, serverInfo ${JSON.stringify(init.message.result.serverInfo)}`)

  const list = await rpc(session, 'tools/list', {}, 2)
  const names = list.message?.result?.tools?.map((tool) => tool.name) ?? []
  const prefix = names[0]?.replace(/_context$/, '') ?? ''
  if (list.status !== 200 || JSON.stringify(names) !== JSON.stringify(KEYS.map((key) => `${prefix}_${key}`))) {
    fail(`tools/list : HTTP ${list.status}, outils ${names.join(', ') || 'aucun'}`)
  }
  console.log(`tools/list → ${names.join(', ')}`)

  const context = await rpc(session, 'tools/call', { name: `${prefix}_context`, arguments: { phrase: 'Smoke test' } }, 3)
  const text = context.message?.result?.content?.[0]?.text ?? ''
  if (context.status !== 200 || context.message?.result?.isError || !text.startsWith('ctx: ')) {
    fail(`${prefix}_context : HTTP ${context.status}, ${text.slice(0, 200) || JSON.stringify(context.message?.error ?? null)}`)
  }
  console.log(`${prefix}_context → ${text.split('\n')[0]}`)
}

async function main() {
  const remote = process.argv[2]
  const base = (remote ?? `http://localhost:${PORT}`).replace(/\/+$/, '')
  let server = null
  try {
    const env = readEnv()
    if (!remote) {
      const next = createRequire(import.meta.url).resolve('next/dist/bin/next')
      server = spawn(process.execPath, [next, 'start', '-p', String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] })
      await waitReady(`${base}/login`)
      console.log(`serveur local prêt sur ${base}`)
    }
    await checkUnauthorized(base)
    await checkMcp({ base, token: await signIn(env) })
    console.log('SMOKE MCP : OK')
  } catch (error) {
    console.error(`SMOKE MCP : ÉCHEC — ${error instanceof SmokeFailure ? error.message : error}`)
    process.exitCode = 1
  } finally {
    server?.kill()
  }
}

await main()
