# ADR-018 — Un ticket d'envoi à usage unique peut écrire au nom d'une personne, sans session

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-28 |
| **Statut** | Accepté (principe : JB, 2026-09-28, fiches D117, D130 ; mise en œuvre : E10-S02 lot f, approuvée à sa revue ; § 8 : fiches D146, D147) |
| **Décideur(s)** | JB (le lien à usage unique) ; le pilote (la porte) |

## Contexte

Claude Code doit pouvoir déposer un fichier qu'il a déjà (un fichier à joindre à une page, un
`.md` à importer en page, un CSV à importer en tableau) sans le réécrire dans un appel MCP (fiches
D117, D137 ; E10-S02 lot f). La commande `curl` qu'il lance n'a ni session
ni jeton de l'émetteur.

Or toute porte du paquet vérifie aujourd'hui un jeton (ADR-012 ; `CLAUDE.md § Projet`, garde de
portabilité : « vérification du jeton injectée sur chaque porte »). La seule exception, les liens
publics (ADR-013), ne fait que lire, et seulement ce que l'auteur du lien lit à cet instant.

## Décision

1. **Une seule porte sans session écrit** : `POST /api/plateforme/uploads/<jeton>`. La preuve est
   un ticket créé par `upload.link` (derrière `call`), sous une session vérifiée, pendant une
   conversation (`ctx`).
2. **Le ticket** :
   - fait 32 octets aléatoires, dont seule l'empreinte SHA-256 est gardée ;
   - est lié à la personne, à l'organisation, au `ctx`, à la destination, au type et au mode ;
   - vaut 15 minutes et un seul envoi.
3. **Consommation** : une fonction `security definer` exécutée sous `anon`,
   `platform.consume_upload_ticket(p_org, p_hash, p_form)`. Elle est bornée à l'empreinte du jeton
   de la porte appelante (`p_form` : celle du formulaire, § 8, sinon celle de `curl`) et à
   l'organisation de l'adresse de la requête. Elle marque le ticket consommé dans sa propre
   transaction, **avant** l'écriture, et rend la personne, son e-mail lu dans `members` et la
   destination.
4. **Identité reconstruite, droits relus** : le serveur bâtit l'appelant `{ userId, email }` depuis
   le ticket, puis relit l'appartenance par `identityInOrg` sur l'organisation déjà lue à l'adresse,
   et les droits comme pour toute requête (`security-patterns.md § Droits dans le service`). Un membre retiré ou un droit perdu entre le
   lien et l'envoi fait échouer l'envoi.
   Un fichier à joindre est envoyé par le serveur au stockage d'ADR-016, par l'URL présignée du
   port, sous les contrôles d'une demande d'envoi (type, taille, quota).
5. **Refus avant consommation** : une requête qui porte un en-tête `Origin` (un navigateur, ou un
   fichier HTML vu dans la visionneuse qui connaîtrait le jeton), une forme de jeton invalide, un corps trop gros. Ces
   refus ne consomment pas le ticket.
6. **Canal qui reste ouvert** : quiconque voit le lien dans les 15 minutes (conversation partagée,
   journaux d'un outil ou d'un proxy) peut écrire une fois, à la destination prévue, au nom de la
   personne. Ce risque est accepté sous la brièveté, l'usage unique, la destination fixée et le
   journal. Le jeton n'est jamais journalisé.

Cet ADR amende ADR-012 § 3 et la garde de portabilité : la vérification du jeton de l'émetteur
vaut sur chaque porte, **sauf** cette route, où le ticket en tient lieu.
7. **Téléchargement d'une adresse fournie** (fiche D130) : pour un assistant sans shell,
   `upload.link` accepte une adresse `https` publique que le serveur télécharge. C'est la seule
   requête du paquet vers une adresse choisie par un appelant : schéma, port et adresse résolue sont
   contrôlés avant la requête et à chaque redirection (E10-S02 AC-f13), la taille et le délai bornés.
8. **Formulaire de dépôt** (fiches D130, D146, D147) : le ticket se consomme aussi depuis une page
   de la plateforme (`/upload/<token>`, page de l'hôte qui monte l'écran du paquet), sous la session
   web de la personne du ticket, par une route à session distincte de la porte sans session,
   `POST /api/plateforme/uploads/<jeton>/form`, sous le contrôle d'origine des mutations (§ 5 garde
   son refus des requêtes à `Origin`). Le formulaire a **son propre jeton** (32 octets, gardé en
   empreinte comme le premier) : la porte sans session n'accepte que le jeton de `curl`, la route du
   formulaire que le sien, et le ticket sert une fois, par l'un ou par l'autre ; un jeton de l'autre
   porte rend la même `not_found` qu'un ticket inconnu. Sans ce second jeton, qui voyait l'adresse du
   formulaire écrivait par `curl` sans session, et la session exigée ne protégeait rien.

## Conséquences

### Positives

- Un fichier de 1 Mo arrive sans passer par le modèle : aucun jeton de conversation, aucune
  coupure.
- Aucun outil MCP ni jeton de service (V2, fiche D6) n'est ajouté.

### Négatives

- Une porte d'écriture sans session : la revue la traite comme une surface de sécurité à part.
- Une table (`upload_tickets`) et une fonction `security definer` de plus.

### Neutres

- Les assistants sans shell (Claude ou ChatGPT dans le navigateur) passent par le téléchargement
  d'une adresse fournie ou par le formulaire de dépôt (§ 7, § 8).

## Alternatives considérées

### Commande CLI du paquet avec connexion OAuth de l'appareil

C'est une vraie session, sans porte nouvelle. Mais elle ajoute un outil à installer et un flux
d'authentification de plus. Écartée par JB (D117 B).

### Jetons de service personnels

C'est une preuve durable, pour un besoin ponctuel, et c'est un sujet V2 (fiche D6). Écartée.
