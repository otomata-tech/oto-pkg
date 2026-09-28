# ADR-010 — Distribution du paquet : consommé en source dans son workspace, publié en public sur npmjs.com sous le scope `@otomata_tech` ; dépôt open source (MIT) `oto-pkg` dans l'organisation GitHub `otomata-tech`

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

ADR-001 fait de la plateforme un paquet npm installé dans une application Next. Deux sortes de
consommateurs : l'application de base du dépôt du paquet, qui le teste, et les applications
hôtes, dans d'autres dépôts : notre SaaS, les ERP des clients. Le dépôt est open source, comme
`oto-backend` et `connectors`, dans l'organisation GitHub `otomata-tech`.

## Décision

1. **Dans le workspace du paquet, le paquet est consommé en source** :
   `"@otomata_tech/oto_platform": "workspace:*"` dans le `package.json` de l'application de base,
   `exports` du paquet vers ses fichiers TypeScript, `transpilePackages` dans `next.config.ts`.
   Aucune étape de build du paquet ; il est aussi publié en sources TypeScript.
2. **Pour tout autre hôte, publication publique sur npmjs.com**, en version sémantique, sous le
   scope de l'organisation npm `otomata_tech` : le paquet s'appelle **`@otomata_tech/oto_platform`**.
   **Aucun registre privé, aucun jeton d'installation.** Publier : un tag `v<version>` poussé sur
   le dépôt du paquet déclenche `.github/workflows/publish.yml`, qui contrôle les secrets de
   l'arbre, les migrations, et l'accord du tag, de la version et du `CHANGELOG.md` du paquet, puis
   publie avec la provenance npm (secret `NPM_TOKEN` du dépôt). La provenance exige que
   `repository.url` du paquet nomme le dépôt qui publie.
3. **Deux dépôts dans `otomata-tech`** : **`oto-pkg`**, public, sous licence MIT, porte le paquet
   et l'application de base minimale qui le teste ; **`oto-saas`**, privé, porte notre SaaS, une
   application hôte qui dépend du paquet publié. Le titulaire de la licence est celui de
   `oto-backend`.
4. **Rien de privé dans un dépôt public** : ni nom de client ou de personne réels, ni secret, ni
   donnée de production, dans les fichiers comme dans l'historique. Les dépôts partent d'un arbre
   nettoyé, en un seul commit initial. `check:public` cherche les secrets à chaque vérification et
   à la publication, et les noms d'une liste de refus (`.public-denylist`, jamais commitée ; en CI,
   lue depuis un secret du dépôt) ; les deux fichiers `LICENSE` sont exemptés pour les noms, jamais
   pour les secrets. Les organisations citées dans les documents et les tests sont fictives (Acme
   Énergies, Delta Logistique, Valbrune).
5. Les mises à jour des hôtes suivent ADR-006 : une pull request Renovate par application et par
   version.

## Conséquences

### Positives
- Installation d'un ERP sans jeton ni configuration de registre ; Renovate lit npmjs.com sans rien.
- Un correctif du paquet profite à tout le monde ; la plateforme peut être lue et reprise.

### Négatives
- Tout ce qui entre dans `oto-pkg` est public : aucun nom de client réel, aucun secret, aucune
  donnée de production, même dans une fixture ou un commit.

### Neutres
- Ce qui reste propre à un client (contenu, procédures, comptes) est en base, jamais dans le
  dépôt : ADR-001 le garantit.

## Alternatives considérées

### Registre privé (GitHub Packages ou npmjs.com privé)
Scope lié au propriétaire du registre, jeton dans chaque ERP et dans Renovate. Rejetée : le dépôt
est public.

### Paquet non publié, copié dans chaque ERP
Copie qui diverge, plus de pull request Renovate, contredit ADR-006. Rejetée.

### Un seul dépôt pour le paquet et le SaaS
Le SaaS porte des réglages et un outillage propres à son hébergement, et sa CI des secrets de
déploiement : les garder hors du dépôt public simplifie ce qui peut y entrer. Rejetée.
