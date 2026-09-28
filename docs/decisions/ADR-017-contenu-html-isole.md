# ADR-017 — Un bloc `html` s'exécute isolé, sur une origine opaque, sans accès à l'hôte

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-28 |
| **Statut** | Accepté (fiches D111, D112, D116, D119) |
| **Décideur(s)** | JB (forme du contenu) ; le pilote (isolation) |

## Contexte

JB veut déposer une page HTML, par exemple un rapport ou une petite application générés par
Claude Code, comme un artefact de Claude. Il a choisi le 2026-09-28 un **type de bloc `html`**, et
non un nouveau type de nœud (fiche D111). Un « artefact » est donc une page dont le seul bloc est
`html`. Une page ne mélange jamais un bloc `html` avec d'autres blocs (JB, 2026-09-28, fiche
D116), et le service le refuse. Ajouter un type de bloc est prévu par ADR-011 § 2 (liste étendue par migration additive).

Afficher ce bloc, c'est **exécuter les scripts de son auteur dans le navigateur de chaque lecteur**,
sous le domaine de l'organisation. Sans isolation, trois risques :

- lecture de la session et appel de l'API au nom du lecteur ;
- faux formulaire de connexion sur un domaine de confiance (hameçonnage) ;
- envoi vers l'extérieur de ce que le lecteur saisit.

La règle existante interdit déjà de servir un dépôt en `text/html` depuis l'origine de
l'application (`uploads-patterns.md § Validation`).

## Décision

1. **Rendu dans un iframe**, jamais dans le DOM de l'écran. L'iframe charge une route du paquet,
   `GET /api/plateforme/blocks/<id>/html`, servie par une branche avant la table de dispatch. Elle
   n'utilise pas `srcdoc`, qui hériterait de la politique et de l'origine de la page parente.
   - **Contrôles** : la route vérifie la lecture sur le nœud (le brouillon exige l'écriture). Elle
     refuse par `not_found` une requête dont `Sec-Fetch-Dest` est présent et différent de
     `iframe` : la source ne s'ouvre jamais en onglet, sans bannière.
   - **Réponse** :
     - `Content-Type: text/html; charset=utf-8` ;
     - `Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms; default-src 'none';
       script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
       style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
       img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none';
       frame-ancestors 'self'` (les CDN admis sont ceux que Claude emploie pour ses artefacts) ;
     - `X-Content-Type-Options: nosniff` ;
     - `Referrer-Policy: no-referrer` ;
     - `Cache-Control: private, no-store`.
   - **Iframe** : elle porte `sandbox="allow-scripts allow-popups allow-forms"`, **sans
     `allow-same-origin`**, et `referrerpolicy="no-referrer"`. L'origine est opaque : aucun accès
     aux cookies, au stockage ni à l'API de l'hôte. `allow-forms` laisse tourner un `onsubmit` ;
     l'envoi réel reste bloqué par `form-action 'none'`.
   - **Hôte** : il exclut de ses propres en-têtes globaux (`X-Frame-Options`, `Referrer-Policy`)
     les deux routes HTML. Le README du paquet le dit (`next.config.ts` de l'hôte de référence).
2. **Canaux de sortie : chacun est nommé et a son cas de test** (E10-S03 AC10).
   - **Fermés** (F1 à F16 de la story) : requêtes d'un script (`fetch`, XHR, WebSocket,
     EventSource, `sendBeacon`), cookies, stockage, document parent, ressources extérieures
     (images, CSS, polices), envoi de formulaire, cadres imbriqués, workers `blob:`, navigation de
     la page parente, téléchargement, `<base>`, ouverture hors iframe, fenêtres ouvertes (le
     `sandbox` s'y hérite), messages de hauteur mal formés ou démesurés.
   - **Ouverts, acceptés** (O1 à O6 de la story) :
     - navigation de l'iframe elle-même (`location`, `meta refresh`) : l'écran la voit, par un
       second chargement, et remplace le contenu par « Ce contenu a tenté de quitter la page »,
       mais la requête est déjà partie ;
     - navigation vers une adresse qui répond 204 : l'écran ne voit rien ;
     - fenêtre ouverte sur un clic (`allow-popups`, gardé pour que les liens d'un rapport
       s'ouvrent) ;
     - résolution DNS par `dns-prefetch` et `preconnect` ;
     - WebRTC (serveurs STUN) ;
     - les trois CDN admis, qui reçoivent l'adresse IP du lecteur.

   Le risque qui reste est celui d'un auteur malveillant dont un gestionnaire a publié le contenu
   (§ 4). La bannière (§ 5) et le journal le traitent.
3. **Hauteur** : un script injecté par la route envoie `{type: "oto-html-height", height}` par
   `postMessage`. L'écran n'applique un message que si `event.source` est cette iframe et que sa
   forme est exacte. `event.origin`, qui vaut `"null"`, n'est jamais lu. La hauteur est bornée
   entre 120 et 10 000 px, et l'écran n'envoie jamais de message à l'iframe.
4. **Publication** : la règle existante suffit. Un rédacteur écrit le brouillon, seul un
   gestionnaire publie (`publish_node`). Aucun script n'atteint les lecteurs sans l'accord d'un
   gestionnaire.
5. **Partage public** (ADR-013), servi (JB, 2026-09-28, fiche D112 B) :
   - la source se lit par `GET /api/plateforme/public/<jeton>/blocks/<id>/html?path=<chemin>`, sans
     fichier de l'hôte, par la fonction `platform.public_html_block_by_token` exécutée sous `anon` :
     seulement un bloc publié du périmètre partagé, avec les mêmes en-têtes, le même `sandbox`, la
     même règle `Sec-Fetch-Dest` et, en plus, `X-Robots-Tag: noindex, nofollow` ;
   - créer un lien exige déjà le niveau « Accès complet » sur le nœud (ADR-013 § 2) ;
   - au-dessus de l'iframe, en dehors d'elle et hors de la portée de ses scripts, une bannière :
     « Contenu interactif publié par <nom de l'organisation>. N'y saisissez jamais de mot de
     passe. » Elle s'affiche aussi à l'intérieur de l'organisation.
6. **Côté assistant** (ADR-002, ADR-009) :
   - le bloc s'écrit et se relit dans une clôture ` ```html-artifact ` (` ```html ` reste le bloc
     `code`) ;
   - `find` indexe le texte visible, sans balises, scripts ni styles (`block_search_text`) ;
   - `read` d'une page n'en sert qu'un extrait, en clôture ` ```html-artifact-excerpt ` (texte
     visible, taille de la source), que `write` refuse ; la source complète se lit par le champ
     `block` de `read` (fiche D119), jamais dans la lecture d'une page entière (NFR-CONC-01).

## Conséquences

### Positives

- Claude Code dépose un artefact dans l'arbre de l'organisation sans outil nouveau : par `write`
  pour un petit artefact, par le lien à usage unique d'ADR-018 pour un fichier qu'il a déjà.
- Droits, brouillon, versions, résumé routable et arbre sont acquis par le nœud qui porte le bloc.
- Le code de l'auteur ne lit rien de l'hôte : ni session, ni stockage, ni API.

### Négatives

- Un artefact qui appelle une API extérieure ne fonctionne pas (`connect-src 'none'`), et une
  image par adresse `https` non plus : c'est voulu.
- Six canaux de sortie restent ouverts (§ 2) : une page publiée peut envoyer ce qu'on y saisit,
  en naviguant surtout. C'est accepté, sous la publication par un gestionnaire et la bannière.
- La plateforme valide une politique de sécurité à la main : la revue d'E10-S03 la vérifie ligne à
  ligne.
- Un artefact ne suit pas le thème de l'organisation.

### Neutres

- Le plafond d'une opération de `write` (`OP_TEXT_MAX`, 40 000 caractères) ne suffit pas à un
  artefact courant (50 à 150 ko). Le bloc `html` a son propre plafond, que E10-S03 fixe.

## Alternatives considérées

### Type de nœud `html`

Icône et filtre propres dans l'arbre et dans `find`, mais modifie ADR-011 § 1, `nodes_guard`, le
routage et les écrans du nœud, sans comportement que le bloc n'ait pas. Écarté par JB.

### `srcdoc` avec une politique en `<meta>`

Aucune route, mais le document hérite de la politique de la page parente, et une balise `<meta>`
ne porte ni `sandbox` ni `frame-ancestors`. Écarté.

### Origine séparée (sous-domaine dédié aux contenus)

C'est l'isolation la plus forte, celle des artefacts de Claude. Mais elle impose un domaine de plus
à chaque hôte, contraire à ADR-001 (une application, un domaine). L'origine opaque du `sandbox`
donne l'essentiel sans domaine de plus. À revoir si un besoin de `allow-same-origin` apparaît.
