import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { OIDC_LOGIN_PATH, oidcEnabled } from "@/lib/plateforme/oidc-client"
import { oidcMiddlewareSession } from "@/lib/plateforme/oidc-session"
import { loginPath, safeRedirect } from "@/lib/schemas/auth"

// `/api` est public : le canal MCP (E03) gère sa propre auth ; tout nouveau route handler naît
// public et doit implémenter la sienne. `/.well-known` porte la découverte OAuth (architecture §6).
const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  // Lien de l'email d'invitation ou de connexion : la personne n'a pas encore de session (E02-S01).
  "/auth/confirm",
  // Connexion, retour et déconnexion chez l'émetteur OIDC de l'hôte (E01-S11 b).
  "/auth/oidc",
  "/design-system",
  "/api",
  "/.well-known",
  // L'image de partage de l'organisation (E11-S21) : un robot d'aperçu n'a pas de session ; elle ne porte aucune page.
  "/opengraph-image",
]

// Correspondance par segment : un simple `startsWith("/api")` rendrait aussi publique une page
// `/api-keys` du groupe (dashboard).
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

// La page publique d'un lien de partage (E05-S10 partie d, ADR-013 § 4, § 5) : `/p/<jeton>` et ce qui est
// dessous, lus hors session par le jeton seul ; aucune session n'y est lue ni rafraîchie, et la réponse n'est
// jamais indexée. `/p` seul, `/pages`… restent derrière la connexion.
const PUBLIC_SHARE_PREFIX = "/p/"

function publicShare(): NextResponse {
  const response = NextResponse.next()
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
}

/** La session Supabase de la requête, rafraîchie par `getUser()` : ses cookies sont sur `response`. */
async function supabaseSession(request: NextRequest): Promise<{ response: NextResponse; signedIn: boolean }> {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { response: supabaseResponse, signedIn: Boolean(user) }
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(PUBLIC_SHARE_PREFIX)) return publicShare()
  // En mode OIDC (E01-S11 b), la session est le cookie chiffré de l'hôte, rafraîchi ici (AC-b3) ;
  // sinon, celle de Supabase Auth. Les règles qui suivent sont les mêmes dans les deux modes.
  const oidc = oidcEnabled()
  const { response, signedIn } = oidc ? await oidcMiddlewareSession(request) : await supabaseSession(request)

  // La session a pu être rafraîchie et ses cookies écrits sur `response`. Une réponse de redirection
  // neuve ne les porte pas : l'ancien jeton de rafraîchissement est déjà consommé et le nouveau serait
  // jeté, ce qui produit des déconnexions aléatoires. Recopier les cookies avant de retourner.
  // `destination` donne le chemin et la requête (HN-E02S02-16).
  function redirectTo(destination: string) {
    const url = request.nextUrl.clone()
    const cible = new URL(destination, request.url)
    url.pathname = cible.pathname
    url.search = cible.search
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  const { pathname, search } = request.nextUrl
  if (!signedIn && !isPublicRoute(pathname)) {
    // Une page ouverte sans session y revient après la connexion (consentement OAuth, E02-S02) ; en
    // mode OIDC, la connexion se fait chez l'émetteur (AC-b1).
    if (request.method === "GET" && pathname !== "/") return redirectTo(loginPath(`${pathname}${search}`, oidc ? OIDC_LOGIN_PATH : undefined))
    // La décision du consentement (POST de sa Server Action) passe : redirigée, elle serait rejouée
    // sur `/login`, qui rend `{}`, d'où la page d'erreur générique (banc E03). L'action revérifie la
    // session et ramène elle-même à la connexion, avec le retour (AC18, HN-E02S02-27). Le chemin est
    // `CONSENT_PATH` du paquet, écrit ici : le middleware tourne sur Edge, sans la face server du
    // paquet ; `tests/unit/middleware.test.ts` lie les deux.
    if (request.method === "POST" && pathname === "/oauth/consent") return response
    // Les autres, comme avant E02-S02 : `/login`, la requête de la demande gardée.
    return redirectTo(`/login${search}`)
  }
  // Déjà connectée (autre onglet, retour arrière) : droit à la page demandée, validée, sinon `/`.
  if (signedIn && pathname === "/login") return redirectTo(safeRedirect(request.nextUrl.searchParams.get("redirect")))

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
