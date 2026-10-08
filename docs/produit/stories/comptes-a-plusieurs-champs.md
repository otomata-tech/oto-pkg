# Story — Comptes à plusieurs champs et réglages : l'administrateur connecte un compte réel à l'écran

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Connecteurs et comptes (V2) |
| **Parcours** | 4.5 Administrer ; 4.2 Faire (exécution) |
| **Statut** | 🔵 In Progress |
| **Priorité** | Must (V2) |
| **Référence UI** | N/A (écran Connecteurs existant, étendu sur ses propres contrôles ; oto-frontend `formulaire-de-branchement.tsx` lu pour l'esprit, sans la pile de clés) |
| **Conventions** | database, supabase, security, api, forms, portage, a11y, registry, testing, deploy |
| **Estimation** | L |
| **Porteuse de migration** | oui (`20261008090000_platform_comptes_a_champs.sql`, additive) |
| **Dépend de** | moteur-des-connecteurs-decrits, prise-des-connecteurs (1.5.0 non publiée) |

## Contexte

La fabrique du dépôt `connectors` décrit désormais ce qu'est un compte : plusieurs champs de secret, des réglages non
secrets (région, sous-domaine, adresse), et les authentifications `basic`, `api_key` en en-tête ou en query,
`oauth2_client_credentials` (`connectors : docs/conception/format-de-description.md`, 2026-10-08). Le paquet ne savait
qu'un secret par compte, posé par l'outillage. Décision d'Alexis (07-08/10) : un compte garde tous ses champs ;
l'humain passe par son tableau de bord pour les saisir.

**Périmètre**
- Le type `ConnectorDefinition` compatible avec la sortie de la fabrique (réglages, `baseUrls`, gabarits, `in`,
  `basic`, `oauth2_client_credentials`) ; `oauth2_user` refusé nommément (lot suivant).
- Le coffre : un objet de champs chiffré (format v2 avec identifiant de clé, données associées compte et colonne),
  le v1 lisible ; réglages en clair ; jeton d'un échange chiffré à part.
- L'exécution : `basic`, `api_key` en en-tête ou en query (clé masquée), échange de jeton rangé en base, renouvelé à
  l'échéance et une fois après un 401 ; adresse résolue sur les réglages, gardée quand elle vient d'une saisie.
- La saisie : formulaire tiré de la déclaration dans l'écran Connecteurs, route `POST admin/accounts/<id>/secret`,
  service `setAccountSecret` à fusion ; `oto-platform accounts secret` en JSON et `--setting`.

**Hors périmètre** : le consentement d'une personne (`oauth2_user`), la santé d'un compte et l'effet d'un 401 sur son
état (`status_reason` est posée pour le lot suivant), la rotation de la clé du coffre (son format la permet).

**Refs :** `docs/conception/connecteurs-et-comptes.md` § Comptes à plusieurs champs et réglages.

## Critères d'acceptation

- [x] **AC1** **Given** une définition de la fabrique (`basic`, `api_key` en en-tête ou en query, échange de jeton,
  réglages, `baseUrls`, gabarit) **When** l'hôte la déclare **Then** elle est acceptée telle quelle ; `oauth2_user`,
  un champ non déclaré, un gabarit qui cite un réglage inconnu, un réglage `url` hors de tête, une liste par région
  incomplète, un motif non ancré sont refusés nommément.
- [x] **AC2** **Given** un administrateur sur l'écran Connecteurs **When** il crée un compte d'un connecteur réel
  déclaré **Then** le formulaire montre ses champs (masqués s'ils sont secrets) et ses réglages, le compte se crée en
  mode réel puis reçoit sa saisie.
- [x] **AC3** **Given** un compte réel **When** l'administrateur rouvre sa saisie **Then** aucun secret n'est relu :
  chaque champ dit « posé », la ligne « secret posé le … » ; un champ laissé vide est gardé, coché « Effacer » est
  effacé, un réglage vidé est effacé ; rien à envoyer, rien n'est envoyé.
- [x] **AC4** **Given** une saisie **When** un champ ou un réglage est inconnu ou invalide **Then** `invalid_arguments`
  le nomme et rien n'est écrit ; une saisie concurrente est refusée (`stale_revision`).
- [x] **AC5** **Given** la route `POST admin/accounts/<id>/secret` **Then** réservée à qui gère le compte (403
  sinon, aucune écriture), corps invalide 400, et la ligne de journal masque le secret entier.
- [x] **AC6** **Given** un appel **When** un réglage manque ou un champ qu'exige l'authentification manque **Then**
  `not_enabled` dit lequel et à qui demander, rien n'est envoyé.
- [x] **AC7** **Given** `api_key` en query **Then** la clé n'apparaît dans aucun log, erreur ni texte rendu.
- [x] **AC8** **Given** `oauth2_client_credentials` **Then** le jeton est échangé, rangé chiffré sur la ligne du compte
  (hors de portée d'un `select`), réutilisé, renouvelé à moins d'une minute de son échéance, rejoué une fois après un
  401, effacé par une nouvelle saisie.
- [x] **AC9** **Given** une adresse saisie (réglage `url` ou `text`) **Then** `https` seul, hôte jamais interne
  (contrôlé à la résolution de chaque connexion), aucune redirection suivie.
- [x] **AC10** **Given** `oto-platform accounts secret` **Then** un objet JSON sur l'entrée standard et
  `--setting nom=valeur` fusionnent avec ce qui est posé ; rien du secret n'est affiché.

## Rayon d'impact

1. **Appelants** (`rg -n "setAccountSecret|accountCiphertext|decryptSecret|encryptSecret|sealSecret|openSecret|DescribedCall|accountSecretSchema|requestJson|AccountView" packages src tests scripts`) :
   `calls.ts` (ouvre le compte par `liveCredential`), `declaration.ts`, `engine.ts`, `api/admin/accounts.ts`,
   `cli/account-secret.mjs`, `mcp/admin/tools/connector.ts` (texte servi), `server/admin/context.ts` (lit
   `AccountView`, inchangé), l'écran et sa page ; doublures : `tests/factories/described-connector.ts`, les suites
   `connectors-*`, `cli-account-secret`, `prise-des-connecteurs`, `admin-dashboard-*`, `ecran-connecteurs`.
2. **Doublons** (`component-registry.md`, `rg -n "Checkbox|Field|Select" packages/plateforme/ui/ds/react`) :
   contrôles du design system réutilisés ; `mergeCredential` sert aussi la fusion des réglages.
3. **Effet produit** : MCP admin (texte de `create_account`), journal de l'API (corps masqué sous `secret`),
   export d'une organisation (`org-transfer` : réglages exportés, secret et jeton jamais), hôtes qui montent l'écran
   (`formulaires` facultatif).
4. **Refacto** : `setAccountSecret` et `probeAccount` sortent de `accounts.ts` vers `account-secret.ts` (taille) ;
   aucun autre.

## Post-implémentation

- Fichiers : `server/connectors/{account-secret,auth,settings,address-guard}.ts` (nouveaux), `ui/admin/connecteurs/
  {champs-du-compte,saisie-du-compte}.tsx` (nouveaux), migration `20261008090000`.
- Hypothèses : voir § Écart avec le code et Historique du document de conception.
