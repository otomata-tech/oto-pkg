# Auth Patterns — Supabase Auth

> Tag : `auth`
> Lire ce fichier pour toute story touchant à l'authentification, l'inscription, ou la gestion de session.

## Architecture Auth

```
Browser                    Next.js Server              Supabase
  │                            │                         │
  ├── Login form ──────────────┤                         │
  │                            ├── signInWithPassword ───┤
  │                            │◄── session + cookies ───┤
  │◄── Set cookies ────────────┤                         │
  │                            │                         │
  ├── Navigate /dashboard ─────┤                         │
  │                            ├── middleware: refresh ───┤
  │                            │◄── valid session ───────┤
  │◄── Page HTML ──────────────┤                         │
```

## Flows

### Signup (email/password)
```typescript
"use server"
export async function signupAction(formData: FormData): Promise<ActionResult<void>> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: "Données invalides" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    // Ne PAS révéler si l'email existe déjà
    return { error: "Impossible de créer le compte. Vérifiez vos informations." }
  }

  return { data: undefined } // Afficher "Vérifiez votre email"
}
```

### Login
```typescript
"use server"
export async function loginAction(formData: FormData): Promise<ActionResult<void>> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: "Données invalides" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { error: "Email ou mot de passe incorrect" }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}
```

### Password Reset
```typescript
// Étape 1 : demande de reset
"use server"
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult<void>> {
  const email = formData.get("email") as string
  const parsed = z.string().email().safeParse(email)
  if (!parsed.success) return { error: "Email invalide" }

  // L'origine de la requête, jamais `NEXT_PUBLIC_SITE_URL` : voir § OAuth.
  const origin = await getRequestOrigin() // src/lib/plateforme/session.ts
  if (!origin) return { data: undefined }
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  // Toujours retourner succès (ne pas révéler si l'email existe)
  return { data: undefined }
}

// Étape 2 : nouveau mot de passe (après clic sur le lien email)
"use server"
export async function updatePasswordAction(formData: FormData): Promise<ActionResult<void>> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: "Mot de passe invalide" }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) return { error: "Impossible de mettre à jour le mot de passe" }

  redirect("/login?message=password-updated")
}
```

### Logout
```typescript
"use server"
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
```

### Auth Callback (email confirmation / password reset)
```typescript
// app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/utils/safe-next-path"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // `next` vient de l'URL : seul un chemin du site est accepté (redirection ouverte).
  const next = safeNextPath(searchParams.get("next"))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth-failed`)
}
```

**Un `next` se valide par l'analyseur d'URL, jamais par `startsWith`.** Un navigateur retire
tabulations et retours à la ligne d'une URL et lit `\` comme `/` : `/\t/hôte` passe
`startsWith("/") && !startsWith("//")` puis devient `//hôte`, une autre adresse, dès que la
redirection est relative (`redirect(next)` d'une Server Action : pour un formulaire envoyé sans
JavaScript, Next pose `Location` tel quel). `safeNextPath` (`src/lib/utils/safe-next-path.ts`) lit
le chemin par `new URL(next, base)`, exige l'origine de la base, rend le chemin analysé et refuse
celui qui commence par `//` (`/.//hôte` une fois normalisé). **Vérifiable :** tout `next` lu d'une
URL ou d'un formulaire passe par `safeNextPath` avant `redirect()` ou `NextResponse.redirect()` ; un
contrôle maison par `startsWith` est un défaut HAUTE.

**Le rappel reçoit aussi les erreurs du serveur d'auth, de plusieurs parcours.** `error`,
`error_code` et `error_description` y arrivent du retour d'un fournisseur (refus du hook, annulation)
**et** d'un lien d'email passé par `/verify` (réinitialisation expirée : `error_code=otp_expired`).
Une branche écrite pour l'un capte l'autre. **Vérifiable :** toute branche d'erreur de
`/auth/callback` a un test par parcours qui la traverse, et aucune redirection ne recopie
`error_description`.

## Middleware

```typescript
// src/middleware.ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password", "/auth/callback"]

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { /* getAll, setAll sur response */ } }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  )

  // `getUser()` peut rafraîchir la session et écrire de nouveaux cookies sur `response`.
  // Un `NextResponse.redirect()` neuf ne les porte pas : l'ancien refresh token est déjà
  // consommé côté Supabase, le nouveau est jeté → déconnexion aléatoire et boucle de
  // redirection. C'est le footgun n°1 de @supabase/ssr.
  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user && !isPublicRoute) return redirectTo("/login")
  if (user && request.nextUrl.pathname === "/login") return redirectTo("/dashboard")

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

**Un POST sans session que le middleware redirige n'atteint jamais sa Server Action.** Le client
de Next suit la redirection et rejoue le POST sur `/login`, qui transmet l'action à la page
d'origine ; la requête transmise est redirigée à son tour, Next rend `{}` et la personne voit la
page d'erreur générique, sans retour (Next 15.5.12). Le middleware de l'hôte redirige une requête GET sans session vers
`/login?redirect=<chemin et requête>` (`/` : `/login` seul), les autres méthodes vers `/login` ;
seul le POST de `/oauth/consent` passe, sa Server Action ramenant elle-même à la connexion. **Vérifiable :** une Server Action dont un critère dit « sans
session, retour à la connexion » a un test du middleware sur son POST sans session (aucun
`Location`, `tests/unit/middleware.test.ts`) ; un test qui appelle l'action seule ne le prouve pas.

## Schemas de validation Auth

```typescript
// lib/schemas/auth.ts
import { z } from "zod"

// Politique de mot de passe : celle de Supabase Auth par défaut — 6 caractères minimum, aucune
// composition imposée. Le dashboard du projet garde ces valeurs ; si
// elles changent là-bas, la constante change ici : le schéma reflète la politique, il ne la
// double pas. `.max(72)` : bcrypt (Supabase Auth) ignore tout au-delà de 72 octets.
const PASSWORD_MIN_LENGTH = 6

export const loginSchema = z.object({
  email: z.string().email("Email invalide").max(255),
  password: z.string().min(1, "Mot de passe requis").max(72),
})

export const signupSchema = z.object({
  fullName: z.string().min(2, "Nom trop court").max(100),
  email: z.string().email("Email invalide").max(255),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Minimum ${PASSWORD_MIN_LENGTH} caractères`).max(72),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
})

export const updatePasswordSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(72),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
})

export type LoginData = z.infer<typeof loginSchema>
export type SignupData = z.infer<typeof signupSchema>
```

## Sécurité Auth

- **Messages génériques :** "Email ou mot de passe incorrect" (jamais "Email non trouvé")
- **Rate limiting :** 5 tentatives de login / minute / IP
- **Tokens de reset :** expirent après 1h (géré par Supabase)
- **Sessions :** cookie `httpOnly`, `secure`, `sameSite=lax`
- **Vérifier l'auth dans CHAQUE Server Action** — le middleware ne suffit pas
- **Un garde qui repose sur un réglage du projet Supabase** (« Confirm email » pour « seul un email
  vérifié entre », URLs de redirection, hook) : la story nomme ce réglage dans ses actions JB, avec
  la consigne de le garder, et `supabase/config.toml` porte la même valeur pour la pile locale.
  **Vérifiable :** chaque réglage dont dépend une hypothèse de sécurité de la story figure dans ses
  actions JB et dans `config.toml`.

## OAuth (si applicable)

```typescript
"use server"
export async function signInWithGoogleAction() {
  const origin = await getRequestOrigin() // src/lib/plateforme/session.ts
  if (!origin) return { error: "Échec de la connexion Google" }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) return { error: "Échec de la connexion Google" }
  redirect(data.url)
}
```

**Le retour d'un fournisseur se fait sur l'hôte d'où part la personne.** Le client Supabase pose
le vérificateur PKCE en cookie sur l'hôte courant : un `redirectTo` bâti sur `NEXT_PUBLIC_SITE_URL`
ramène sur un autre hôte dès qu'il y a plusieurs adresses, et l'échange du code y échoue.
**Vérifiable :** tout `redirectTo` de `signInWithOAuth` et de `resetPasswordForEmail` part de
`getRequestOrigin()` (`connexionFournisseurAction`, `forgotPasswordAction`).
