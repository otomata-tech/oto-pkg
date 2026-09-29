# ADR-017 — Un fichier HTML se voit isolé, sur une origine opaque, sans accès à l'hôte

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-28, amendé le 2026-09-29 |
| **Statut** | Accepté (fiches D111, D112, D119, D137) |
| **Décideur(s)** | JB (forme du contenu) ; le pilote (isolation) |

## Contexte

JB veut déposer une page HTML, par exemple un rapport ou une petite application générés par
Claude Code, et la voir comme un artefact de Claude. Il a choisi le 2026-09-29 d'en faire **un
fichier joint à une page** (fiche D137), comme un PDF ou un `.md` : un bloc `file` (ADR-016), sans
rendu dans la page. La carte du fichier porte « Voir », qui ouvre le fichier dans un nouvel onglet.

Voir ce fichier, c'est **exécuter les scripts de son auteur dans le navigateur de chaque lecteur**,
sous le domaine de l'organisation. Sans isolation, trois risques :

- lecture de la session et appel de l'API au nom du lecteur ;
- faux formulaire de connexion sur un domaine de confiance (hameçonnage) ;
- envoi vers l'extérieur de ce que le lecteur saisit.

La règle existante interdit déjà de servir un dépôt en `text/html` depuis l'origine de
l'application (`uploads-patterns.md § Validation`), et le bucket sert un fichier `html` en
`attachment` (ADR-016 § 5).

## Décision

1. **Rendu dans un iframe de la visionneuse**, jamais dans le DOM d'un écran. « Voir » ouvre la
   visionneuse à l'adresse du contenu (`?view=<id>`) : un en-tête hors du contenu, la bannière
   (§ 5), puis un iframe qui occupe la hauteur de la fenêtre. L'iframe charge une route du paquet,
   `GET /api/plateforme/files/<id>/html`, servie par une branche avant la table de dispatch, qui lit
   le fichier dans le bucket par le serveur. Elle n'utilise pas `srcdoc`, qui hériterait de la
   politique et de l'origine de la page parente.
   - **Contrôles** : la route vérifie la lecture sur le nœud du fichier. Elle refuse par
     `not_found` une requête dont `Sec-Fetch-Dest` est présent et différent de `iframe` : le
     fichier ne s'ouvre jamais en onglet, sans bannière.
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
2. **Canaux de sortie : chacun est nommé et a son cas de test** (E10-S02 AC-c6).
   - **Fermés** (F1 à F16 de la story) : requêtes d'un script (`fetch`, XHR, WebSocket,
     EventSource, `sendBeacon`), cookies, stockage, document parent, ressources extérieures
     (images, CSS, polices), envoi de formulaire, cadres imbriqués, workers `blob:`, navigation de
     l'onglet, téléchargement, `<base>`, ouverture hors iframe, fenêtres ouvertes (le `sandbox` s'y
     hérite), messages à l'écran (il n'en écoute aucun), envoi vers la route de dépôt.
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

   Le risque qui reste est celui d'un auteur malveillant qui peut écrire dans la page. La bannière
   (§ 5) et le journal le traitent.
3. **Aucun message entre l'iframe et l'écran** : l'iframe a la hauteur de la fenêtre, l'écran
   n'écoute ni n'envoie de message.
4. **Publication** : la règle existante des contenus s'applique (fiche D135) ; un fichier joint
   n'est servi par un lien public que s'il est cité par un bloc publié (ADR-016 § 7).
5. **Partage public** (ADR-013), servi (JB, 2026-09-28, fiche D112) :
   - le fichier se lit par `GET /api/plateforme/public/<jeton>/files/<id>/html`, sans fichier de
     l'hôte, par la fonction `platform.public_file_by_token` exécutée sous `anon` : seulement un
     fichier cité par un bloc publié du périmètre partagé, avec les mêmes en-têtes, le même
     `sandbox`, la même règle `Sec-Fetch-Dest` et, en plus, `X-Robots-Tag: noindex, nofollow` ;
   - créer un lien exige déjà le niveau « Accès complet » sur le nœud (ADR-013 § 2) ;
   - au-dessus de l'iframe, en dehors d'elle et hors de la portée de ses scripts, une bannière :
     « Contenu interactif publié par <nom de l'organisation>. N'y saisissez jamais de mot de
     passe. » Elle s'affiche aussi à l'intérieur de l'organisation.
6. **Côté assistant** (ADR-002, ADR-009) :
   - `read` d'une page montre le fichier comme tout fichier joint (nom, taille, type, lien) ;
   - son texte se lit par le champ `file` de `read` (fiche D119), jamais dans la lecture d'une page
     entière (NFR-CONC-01) ;
   - `write` n'écrit pas de fichier : un assistant dépose par le lien à usage unique (ADR-018) ;
   - `find` trouve le fichier par son nom.

## Conséquences

### Positives

- Claude Code dépose un fichier HTML dans une page sans outil nouveau, par le lien à usage unique
  d'ADR-018 ; le contenu ne passe pas par le modèle.
- Droits, versions, partage et arbre sont acquis par la page qui porte le fichier ; la page garde
  son texte autour du fichier.
- Le code de l'auteur ne lit rien de l'hôte : ni session, ni stockage, ni API.

### Négatives

- Un fichier HTML qui appelle une API extérieure ne fonctionne pas (`connect-src 'none'`), et une
  image par adresse `https` non plus : c'est voulu.
- Six canaux de sortie restent ouverts (§ 2) : un fichier vu peut envoyer ce qu'on y saisit, en
  naviguant surtout. C'est accepté, sous la bannière.
- La plateforme valide une politique de sécurité à la main : la revue d'E10-S02 la vérifie ligne à
  ligne.
- Un fichier HTML ne suit pas le thème de l'organisation, et ne se voit jamais dans la page
  elle-même.
- La route lit le fichier par le serveur : un fichier HTML fait 4 Mo au plus (coupure des réponses
  à 4,5 Mo chez Vercel).

## Alternatives considérées

### Bloc `html` rendu dans la page

Une page « artefact » à un seul bloc `html`, source en base, écrite par `write`. Demandait un type
de bloc, une règle d'un seul bloc par page, une clôture propre dans `write` et un extrait dans
`read`, pour un usage que « Voir » couvre. Écarté par JB (fiche D137).

### Type de nœud `html`

Icône et filtre propres dans l'arbre et dans `find`, mais modifie ADR-011 § 1, `nodes_guard`, le
routage et les écrans du nœud, sans comportement que le fichier n'ait pas. Écarté par JB.

### Servir le fichier depuis le bucket

Aucune route, mais le bucket ne pose ni CSP ni `sandbox`, et son origine peut être celle du
fournisseur d'authentification (Supabase). Écarté : `html` y reste en `attachment`.

### `srcdoc` avec une politique en `<meta>`

Aucune route, mais le document hérite de la politique de la page parente, et une balise `<meta>`
ne porte ni `sandbox` ni `frame-ancestors`. Écarté.

### Origine séparée (sous-domaine dédié aux contenus)

C'est l'isolation la plus forte, celle des artefacts de Claude. Mais elle impose un domaine de plus
à chaque hôte, contraire à ADR-001 (une application, un domaine). L'origine opaque du `sandbox`
donne l'essentiel sans domaine de plus. À revoir si un besoin de `allow-same-origin` apparaît.
