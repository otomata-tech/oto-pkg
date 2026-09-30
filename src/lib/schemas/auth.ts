import { z } from "zod"
import { safeNextPath } from "@/lib/utils/safe-next-path"

// Source unique des règles d'auth : les formulaires (validation client, confort) et les
// Server Actions (validation serveur, sécurité) lisent les mêmes schémas.
// Politique de Supabase Auth par défaut (6 caractères, sans composition imposée) — décision JB, 2026-09-23 ; le dashboard du projet garde cette valeur.
const PASSWORD_MIN_LENGTH = 6
// bcrypt (Supabase Auth) ignore silencieusement tout au-delà de 72 octets.
const PASSWORD_MAX_LENGTH = 72
const REDIRECT_MAX_LENGTH = 2048

const emailField = z.string().email("Email invalide").max(255, "Email trop long")
const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  .max(PASSWORD_MAX_LENGTH, "Mot de passe trop long")

/**
 * Page d'où vient la personne (`?redirect=` de `/login`, champ caché du formulaire), relue par
 * `safeRedirect` avant toute redirection. Illisible ou trop longue : ignorée (retour à `/`), jamais
 * un refus de connexion (E02-S02).
 */
const redirectField = z.string().max(REDIRECT_MAX_LENGTH).optional().catch(undefined)

/**
 * Destination après la connexion : un chemin du site, sinon `/`. Refuse tout blanc (un navigateur
 * retire tabulations et sauts de ligne d'une URL : `/<tab>/hôte` deviendrait `//hôte`) et plus de
 * 2 048 caractères, puis laisse `safeNextPath` juger le chemin comme le lit un navigateur (`//hôte`,
 * `/\hôte`, adresse absolue : `/`).
 */
export function safeRedirect(path: string | null | undefined): string {
  if (!path || path.length > REDIRECT_MAX_LENGTH || /\s/.test(path)) return "/"
  return safeNextPath(path)
}

/**
 * Page de connexion qui ramène à `path` une fois la session posée (E02-S02) ; `entry` : une autre
 * entrée qui lit le même paramètre, la connexion chez l'émetteur OIDC de l'hôte (E01-S11 b).
 */
export function loginPath(path: string, entry = "/login"): string {
  return `${entry}?redirect=${encodeURIComponent(path)}`
}

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Mot de passe requis").max(PASSWORD_MAX_LENGTH, "Mot de passe trop long"),
  redirect: redirectField,
})

export const forgotPasswordSchema = z.object({
  email: emailField,
})

// Même champ que `forgotPasswordSchema`, schéma distinct : un schéma = un formulaire = une action.
// `redirect` : le lien de l'email ramène à la page demandée (E02-S02).
export const magicLinkSchema = z.object({
  email: emailField,
  redirect: redirectField,
})

// Champs cachés de la page `/auth/confirm` : le jeton du lien de l'email (`{{ .TokenHash }}`)
// n'est vérifié qu'au clic sur « Continuer » (fiche D11).
export const confirmerLienSchema = z.object({
  token_hash: z.string().min(1).max(512),
  type: z.literal("email"),
  next: z.string().max(2048).optional(),
})

export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  })

// Connexion par un fournisseur (E09-S03) : liste fermée ; Microsoft s'appelle `azure` chez Supabase Auth.
export const providerSchema = z.enum(["google", "azure"])

// Champ `fournisseur` des boutons de `/login`, lu par `connexionFournisseurAction` ; `redirect` :
// le retour du fournisseur ramène à la page demandée (E02-S02).
export const oauthSignInSchema = z.object({
  fournisseur: providerSchema,
  redirect: redirectField,
})

export type LoginData = z.infer<typeof loginSchema>
export type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>
export type OAuthProvider = z.infer<typeof providerSchema>
