# Fiche — auth-patterns

Texte complet : `.method/conventions/auth-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Une inscription refusée rend un message générique, qui ne dit pas si l'email existe. § Signup (email/password)
- Une connexion refusée dit « Email ou mot de passe incorrect » ; réussie, elle fait `revalidatePath("/", "layout")` puis `redirect`. § Login
- Une demande de réinitialisation rend toujours un succès ; son `redirectTo` part de `getRequestOrigin()`, jamais de `NEXT_PUBLIC_SITE_URL`. § Password Reset
- Tout `next` lu d'une URL ou d'un formulaire passe par `safeNextPath` avant `redirect()` ou `NextResponse.redirect()` ; un contrôle maison par `startsWith` est un défaut HAUTE. § Auth Callback (email confirmation / password reset)
- Toute branche d'erreur de `/auth/callback` a un test par parcours qui la traverse (retour d'un fournisseur, lien d'email), et aucune redirection ne recopie `error_description`. § Auth Callback (email confirmation / password reset)
- Une redirection du middleware recopie les cookies de sa réponse : `getUser()` a pu rafraîchir la session. § Middleware
- Le middleware renvoie un GET sans session à `/login?redirect=<chemin et requête>`, les autres méthodes à `/login` ; seul le POST de `/oauth/consent` passe. § Middleware
- Une Server Action dont un critère dit « sans session, retour à la connexion » a un test du middleware sur son POST sans session (`tests/unit/middleware.test.ts`), pas seulement un test de l'action. § Middleware
- Mot de passe : `PASSWORD_MIN_LENGTH` reflète la politique de Supabase Auth (6) sans la doubler, `.max(72)` (bcrypt) ; email `.max(255)` ; confirmation par `refine` sur `confirmPassword`. § Schemas de validation Auth
- Messages génériques, 5 tentatives de connexion par minute et par IP, cookies `httpOnly`, `secure`, `sameSite=lax`, auth revérifiée dans chaque Server Action. § Sécurité Auth
- Un garde qui repose sur un réglage du projet Supabase (confirmation d'email, URLs de redirection, hook) : la story nomme ce réglage dans ses actions réservées, et `supabase/config.toml` porte la même valeur. § Sécurité Auth
- Tout `redirectTo` de `signInWithOAuth` et de `resetPasswordForEmail` part de `getRequestOrigin()`. § OAuth (si applicable)
