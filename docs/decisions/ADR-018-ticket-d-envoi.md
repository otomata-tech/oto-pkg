# ADR-018 — Un ticket d'envoi à usage unique peut écrire au nom d'une personne, sans session

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-28 |
| **Statut** | Proposé (principe : JB, 2026-09-28, fiche D117 ; mise en œuvre : E10-S05, à valider à sa revue) |
| **Décideur(s)** | JB (le lien à usage unique) ; le pilote (la porte) |

## Contexte

Claude Code doit pouvoir déposer un fichier qu'il a déjà (un `.html`, un `.md`, un CSV) sans le
réécrire dans un appel MCP (fiche D117, E10-S05). La commande `curl` qu'il lance n'a ni session
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
   `platform.consume_upload_ticket(org, empreinte)`. Elle est bornée à l'empreinte et à
   l'organisation de l'adresse de la requête. Elle marque le ticket consommé dans sa propre
   transaction, **avant** l'écriture, et rend la personne et la destination.
4. **Identité reconstruite, droits relus** : le serveur bâtit l'appelant `{ userId }` depuis le
   ticket, puis relit l'appartenance et les droits comme pour toute requête
   (`security-patterns.md § Droits dans le service`). Un membre retiré ou un droit perdu entre le
   lien et l'envoi fait échouer l'envoi.
5. **Refus avant consommation** : une requête qui porte un en-tête `Origin` (un navigateur, ou un
   artefact HTML qui connaîtrait le jeton), une forme de jeton invalide, un corps trop gros. Ces
   refus ne consomment pas le ticket.
6. **Canal qui reste ouvert** : quiconque voit le lien dans les 15 minutes (conversation partagée,
   journaux d'un outil ou d'un proxy) peut écrire une fois, à la destination prévue, au nom de la
   personne. Ce risque est accepté sous la brièveté, l'usage unique, la destination fixée et le
   journal. Le jeton n'est jamais journalisé.

Cet ADR amende ADR-012 § 3 et la garde de portabilité : la vérification du jeton de l'émetteur
vaut sur chaque porte, **sauf** cette route, où le ticket en tient lieu.
7. **Téléchargement d'une adresse fournie** (fiche D130, proposé) : pour un assistant sans shell,
   `upload.link` accepte une adresse `https` publique que le serveur télécharge. C'est la seule
   requête du paquet vers une adresse choisie par un appelant : schéma, port et adresse résolue sont
   contrôlés avant la requête et à chaque redirection (E10-S05 W2), la taille et le délai bornés.
8. **Formulaire de dépôt** (fiche D130, proposé) : si le téléchargement échoue, le ticket se consomme
   depuis une page de la plateforme, sous la session web de la personne du ticket, par une route à
   session distincte de la porte sans session (§ 5 garde son refus des requêtes à `Origin`).

## Conséquences

### Positives

- Un fichier de 1 Mo arrive sans passer par le modèle : aucun jeton de conversation, aucune
  coupure.
- Aucun outil MCP ni jeton de service (V2, fiche D6) n'est ajouté.

### Négatives

- Une porte d'écriture sans session : la revue la traite comme une surface de sécurité à part.
- Une table (`upload_tickets`) et une fonction `security definer` de plus.

### Neutres

- Les assistants sans shell (Claude ou ChatGPT dans le navigateur) n'en profitent pas : le dépôt se
  fait à l'écran.

## Alternatives considérées

### Commande CLI du paquet avec connexion OAuth de l'appareil

C'est une vraie session, sans porte nouvelle. Mais elle ajoute un outil à installer et un flux
d'authentification de plus. Écartée par JB (D117 B).

### Jetons de service personnels

C'est une preuve durable, pour un besoin ponctuel, et c'est un sujet V2 (fiche D6). Écartée.
