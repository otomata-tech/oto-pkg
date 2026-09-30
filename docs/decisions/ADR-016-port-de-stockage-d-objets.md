# ADR-016 — Les fichiers vivent derrière un port de stockage d'objets compatible S3

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-28 |
| **Statut** | Accepté (fiches D111, D118) |
| **Décideur(s)** | JB (le port plutôt que Postgres ou Supabase Storage) ; le pilote pour le détail |

## Contexte

Le bloc `image` existe depuis E01-S06 (ADR-011 § 2), mais il ne porte qu'une adresse `https`
externe (`src` ≤ 2 000 caractères, `packages/plateforme/schemas/blocks.ts`). Rien ne permet de
déposer une image, un PDF ou un tableur : le paquet n'a aucun stockage de fichiers.

Trois contraintes existantes encadrent le choix :

- **Garde de portabilité** (`CLAUDE.md § Projet`, ADR-012) : le couplage à Supabase ne grandit pas.
  Supabase Storage appelé par son client est donc exclu.
- **Hôte quelconque** (ADR-001, ADR-012) : le paquet se monte dans un ERP qui n'a peut-être ni
  Supabase ni Vercel. Tout ce que l'hôte doit fournir se déclare par des variables `PLATFORM_*`,
  comme l'émetteur OIDC (`server/issuer.ts`) et la base (`server/db.ts`).
- **Corps de requête borné** (`uploads-patterns.md § La limite de 1 Mo décide de l'architecture`) :
  Vercel coupe à 4,5 Mo. Un fichier plus gros ne peut pas transiter par une route du paquet.

JB a tranché le 2026-09-28 pour un port générique compatible S3 (fiche D111), contre des octets en
Postgres (`bytea`) et contre Supabase Storage.

## Décision

1. **Un troisième port**, après l'identité et la base (ADR-012) : `FileStore`, dans `server/`,
   avec cinq opérations :
   - URL présignée d'envoi ;
   - URL présignée de lecture ;
   - lecture des métadonnées (`HEAD`) ;
   - suppression ;
   - copie côté bucket (`copy`, pour la duplication d'une page, fiche D118).

   Un seul adaptateur est livré : le protocole S3 signé en SigV4. Il fonctionne avec AWS S3,
   l'Object Storage de Scaleway, MinIO, et Supabase Storage **par son point d'accès S3**, qui reste
   une configuration et non du code. Les tests utilisent un adaptateur en mémoire.
2. **Configuration par l'hôte**, cinq variables : `PLATFORM_STORAGE_ENDPOINT`,
   `PLATFORM_STORAGE_BUCKET`, `PLATFORM_STORAGE_REGION`, `PLATFORM_STORAGE_ACCESS_KEY_ID`,
   `PLATFORM_STORAGE_SECRET_ACCESS_KEY`. Ce sont des clés d'accès S3, jamais la clé `service_role`.
   **Sans elles, les fichiers sont désactivés** : les écrans ne proposent aucun dépôt, l'API refuse
   par `not_enabled` avec un message qui nomme les variables, et tout le reste fonctionne. Le
   bucket est privé ; ses règles CORS (envoi depuis l'origine de l'hôte) sont documentées dans le
   README du paquet.
3. **Les métadonnées vont en base, les octets jamais.** Une table `platform.files` : `id`,
   `org_id`, `node_id` (le nœud auquel le fichier est attaché), `name` (nom d'origine, métadonnée
   seulement), `mime`, `size`, `status` (`pending` · `ready`), `created_by`, `created_at`. Pas
   d'empreinte : le calculer demanderait de relire l'objet. La clé d'objet vaut `<org_id>/<id>`.
   Elle ne reprend jamais le nom d'origine (`uploads-patterns.md § Nommage du chemin`).
4. **Envoi en trois temps, décidé par le service** (`security-patterns.md § Droits dans le service`) :
   - la demande (nom, type, taille, nœud) vérifie l'écriture sur le nœud, le type admis, la taille
     et le quota de l'organisation, puis crée la ligne `pending` et rend une URL présignée d'envoi
     (5 minutes, taille et type fixés dans la signature) ;
   - le navigateur envoie directement au bucket ;
   - la confirmation lit l'objet (`HEAD`), vérifie sa taille et passe la ligne à `ready`.

   Le quota compte les lignes `pending` et `ready`, et se lit sous un verrou de l'organisation. Une
   ligne `pending` de plus d'une heure est purgée, objet compris, au début de chaque demande
   d'envoi de l'organisation et au passage de la corbeille.
5. **Lecture par une route du paquet** : `GET /api/platform/files/<id>`. Le service vérifie la
   lecture sur le nœud du fichier, puis redirige vers une URL présignée de 60 secondes. Le type et
   la disposition sont fixés **dans l'URL signée** (`response-content-type`,
   `response-content-disposition`), jamais lus de l'objet :
   - une image matricielle (`png`, `jpeg`, `gif`, `webp`) se sert `inline` ;
   - un PDF se sert `inline`, et un `txt` ou un `csv` `inline` en `text/plain; charset=utf-8`,
     seulement pour « Voir » ;
   - tout le reste se sert en `attachment`, `svg`, `html` et `md` compris.

   Un fichier `html` ne se voit que par la route isolée d'ADR-017, qui le lit par le serveur ; un
   `.md` par la visionneuse, qui le rend en blocs. Aucun autre fichier déposé n'est servi en
   `text/html` depuis l'origine de l'hôte (`uploads-patterns.md § Validation`).
6. **Un fichier vit aussi longtemps que son nœud.** Retirer le bloc qui le montre ne le supprime
   pas : un instantané de `node_versions` peut encore le citer. La purge de la corbeille (30 jours,
   E05-S10) supprime les objets des nœuds purgés, après le commit. **Dupliquer** une page copie ses
   objets (`copy`) sous des identifiants neufs, et réécrit les blocs de la copie : un fichier
   n'appartient jamais à deux nœuds (fiche D118).
7. **Partage public** (ADR-013) : `GET /api/platform/public/<jeton>/files/<id>`, par une fonction
   `security definer` exécutée sous `anon`, sans fichier de l'hôte. Elle ne sert qu'un fichier cité
   par un bloc **publié** d'un nœud couvert par le lien, sous la règle du contenu : ce que l'auteur
   du lien lit à cet instant.
8. **Transfert d'organisation** (E09-S04) : le JSON porte les métadonnées (carte `TABLES`), et les
   octets vont dans un dossier `<out>.files/` à côté de lui. Ils sont relus dans le bucket de la
   source, puis réécrits dans celui de la cible, sous les nouveaux identifiants. Les scripts de
   transfert, du `.mjs` qui n'importe pas le TypeScript du paquet, signent leurs requêtes S3 par
   `aws4fetch` directement (`scripts/lib/org-transfer-files.mjs`), sans reprendre l'adaptateur. Sans
   les cinq variables de stockage, l'export d'une organisation qui a des fichiers et l'import d'un
   document qui en porte échouent avant toute écriture, en nommant les variables ; sans fichier, le
   transfert passe sans elles.

## Conséquences

### Positives

- Tout hôte branche le stockage qu'il a déjà, sans code ; notre SaaS garde Supabase par
  configuration seule, sans nouvel appel à `supabase.*`.
- Pas de limite de taille imposée par la plateforme d'hébergement : les octets ne passent pas par
  nos routes.
- La base reste légère ; sauvegarde et `bare-postgres` ne changent pas.

### Négatives

- Un port de plus à configurer : un hôte sans bucket n'a pas de fichiers.
- Le bucket et ses clés sont un service extérieur : leur création est une action de JB
  (`.method/sprint/vagues.md § Pilote et agents`).
- Deux sources de vérité à garder cohérentes (ligne et objet) : purge des `pending`, purge à la
  corbeille, transfert.
- Une dépendance de signature SigV4 (légère, pas le SDK AWS complet : `tech-stack.md`).

### Neutres

- Le bloc `image` garde les adresses `https` externes : un assistant, qui n'envoie pas d'octets,
  continue de les utiliser.

## Alternatives considérées

### Octets en Postgres (`bytea`)

Aucun port, portable sur tout Postgres, droits et transfert gratuits. Écartée par JB : la base
grossit avec les fichiers, et le corps de requête reste borné à 4,5 Mo sur Vercel, ce qui oblige à
découper les gros fichiers.

### Supabase Storage par son client

Immédiat, avec des policies de Storage. Écarté : c'est une nouvelle dépendance au schéma
`storage` et au client Supabase, contraire à la garde de portabilité (ADR-012).
