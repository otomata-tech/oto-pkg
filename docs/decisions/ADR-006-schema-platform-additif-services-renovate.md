# ADR-006 — Le SQL du paquet ne touche que le schéma `platform` et ne fait qu'ajouter ; personne n'écrit directement dans `platform` ; les mises à jour arrivent par une version du paquet et une pull request Renovate

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Le paquet s'installe dans la base de l'application hôte, à côté du schéma `public` de l'ERP. Une
cellule ou une routine peut avoir une version de retard. L'ERP voudra lire les tableaux de la
plateforme pour ses écrans et son reporting. Chaque application doit monter de version à son
rythme, sans que notre CI ait accès au projet du client.

## Décision

1. **Le SQL du paquet ne touche que le schéma `platform`.** `oto-platform migrations check`
   (`pnpm check:migrations` en CI) refuse toute migration qui en sort (FR-INST-04). Ce qu'un
   Postgres nu doit porter hors de `platform` (rôles, schéma `auth` réduit, extensions) est posé une
   fois par `oto-platform db prepare`, hors des migrations (ADR-012 § 1).
2. **Les migrations ne font qu'ajouter.** Retirer se fait en deux temps, sur deux versions :
   cesser d'utiliser, puis supprimer ; une contrainte n'est remplacée que par une plus large. Une
   version majeure peut replier la chaîne en une ligne de base, que la CI compare au schéma de la
   chaîne ; le paquet 1.0.0 livre une seule ligne de base, et toute migration suivante s'y ajoute.
3. **Personne n'écrit directement dans `platform`** : ni l'ERP, ni un script. Tout passe par les
   services de `server/`, qui tiennent révisions, provenance, journal et droits. L'ERP lit aussi par
   ces services (`@otomata_tech/oto_platform/server`), jamais par une requête à côté : les droits se
   décident dans le service et la RLS n'isole que les organisations (ADR-012 § 3). Seule exception, l'outillage, par la connexion d'administration
   (`PLATFORM_ADMIN_DATABASE_URL`), jamais déployé ni importé par le paquet : organisation Démo,
   équipe plateforme, export-import d'une organisation, oubli d'une personne, ménage OAuth, tests. Ses tests vérifient ce
   qu'il pose. La clé secrète de Supabase ne sert plus qu'à l'API d'administration des comptes.
4. **Les migrations du paquet sont copiées dans celles de l'application hôte**
   (`oto-platform migrations sync`, puis `check`) et appliquées par son propre workflow, dans
   l'ordre du paquet.
5. **Les mises à jour arrivent par une version du paquet** (numérotation sémantique, publiée en
   public sur npmjs.com, ADR-010) **et une pull request Renovate** par application (preset
   `renovate/preset.json` du dépôt du paquet). Seule une version corrective (`x.y.Z`) fusionne
   seule quand la CI est verte ; la PR d'une version mineure se relit à la main, sur les lignes
   `### Hosts` et `### Assistants` du `CHANGELOG.md` ; une majeure aussi. La configuration Renovate
   de l'hôte de référence et le README du paquet le disent.
   La CI de l'application applique les migrations et déploie. `admin_cell` dit la version et les
   migrations d'une cellule ; un registre central des versions est prévu en V2.
6. **Les six outils et l'API ne font qu'ajouter** (ADR-002) : une version du paquet ne demande
   rien à rafraîchir dans Claude ou ChatGPT.
7. Un changement de comportement passe derrière un **drapeau par organisation** (`orgs.flags`,
   écran Drapeaux), sauf les nouveautés de l'epic E10 (contenus riches), qui arrivent sans drapeau :
   la relecture de la version mineure (point 5) en tient lieu.

## Conséquences

### Positives
- Une cellule en retard d'une version continue de tourner.
- Notre CI n'entre jamais chez le client ; la sienne applique et déploie.
- Le journal, la provenance et les droits ne peuvent pas être contournés par une écriture directe.

### Négatives
- Deux versions pour retirer quoi que ce soit ; le schéma grossit avant de maigrir.
- L'ERP qui voudrait écrire dans `platform` doit passer par une fonction de service : un peu plus
  de code, jamais de raccourci.

### Neutres
- Publication publique sur npmjs.com sous le scope `@otomata_tech`, sans registre privé (ADR-010).

## Alternatives considérées

### Migrations appliquées par le paquet au démarrage de l'application
Un déploiement qui migre en silence, sans revue, sur la base du client. Rejetée.

### Un schéma partagé avec l'ERP (`public`)
Collisions de noms, migrations entremêlées, impossible de refuser une migration hors périmètre.
Rejetée.

### Écriture directe autorisée pour l'ERP avec des triggers de journal
Le journal ne saurait ni la personne, ni le `ctx`, ni la provenance ; les droits d'accès de
`access_rules` seraient contournables. Rejetée.
