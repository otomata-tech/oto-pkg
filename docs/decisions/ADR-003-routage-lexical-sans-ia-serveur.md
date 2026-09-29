# ADR-003 — Routage des intentions côté serveur, lexical, sans IA côté serveur, sans entité « projet »

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

L'utilisateur parle ; une phrase doit trouver seule la bonne procédure, sans qu'il connaisse les
outils. Le routage par l'host se dégrade avec le nombre d'outils. Le canal MCP est déjà une
conversation avec un modèle frontier que l'utilisateur paie (`mcp-patterns.md § 4 bis`) ; une
IA côté serveur coûterait une clé, une facture et une boîte noire non testable. Oto porte une
entité « projet » (`_project` sur chaque appel) que le banc a jugée coûteuse à retenir.

## Décision

1. **Le serveur route** : `context(phrase)` puis, pour la longue traîne, `find`. Le routage de
   `context` cherche parmi les procédures publiées que la personne lit, par **plein texte Postgres
   avec racines françaises et similarité de trigrammes** (`pg_trgm`, `unaccent`) sur leur titre et
   leur résumé — le résumé d'une procédure dit comment on la demande —, plus deux bonus : procédure
   d'une équipe de la personne, procédure qu'elle a utilisée dans les trente derniers jours. Score
   ramené entre 0 et 1. **Aucun embedding, aucun dictionnaire de vocabulaire** (ADR-011 § 7).
   `find` cherche aussi dans le contenu publié des nœuds (ADR-011 § 4) et, en dernier recours,
   corrige une faute de frappe par le lexique des mots de l'organisation. `context` corrige aussi
   une faute de frappe par le lexique.
2. **Seuil et écart** : les étapes complètes ne sont servies que si le meilleur candidat dépasse
   le seuil et distance nettement le deuxième (0,65 et 0,1 par défaut, les valeurs calibrées sur la
   maquette, 132 phrases) ; sinon les candidats avec score, et une consigne qui dépend de la
   demande : pour une action, demander laquelle exécuter ; pour une question de données, chercher
   avec `find`, `read` ou `table.rows` et répondre, puis proposer les candidats en choix ; pour une
   question « comment » ou une demande polie, proposer les candidats en choix et n'exécuter que
   celui que la personne choisit. Toujours tous les candidats montrés, jamais le premier seul
   (amendement E11-S04, validé par le responsable d'Oto : sans étapes servies, une question de
   données propose aussi les candidates). Jamais une devinette. Les candidats
   suivants restent visibles même quand une procédure est servie. **Seuil et écart se règlent par
   organisation** (`orgs.settings.routing`), sur le jeu de phrases de test, pour 95 % au moins de
   bonnes reconnaissances.
3. **Mesure continue sans host** : les données de test de chaque organisation portent des
   demandes qui doivent mener à chaque procédure et des demandes proches qui ne doivent pas y
   mener ; un test du serveur les rejoue à chaque changement. Le journal compare la procédure
   servie aux fonctions appelées ; un écart, une correction ou un `feedback` nourrissent le titre et
   le résumé. Aucune phrase voisine n'est stockée par procédure.
4. **Le serveur garde la main** : `call` vérifie fonction, droits et arguments ; une mauvaise
   reconnaissance ne déclenche jamais plus que ce que l'utilisateur confirme.
5. **Aucune IA côté serveur** : l'assistant de l'utilisateur exécute, les routines sont
   déterministes. Le jour où une routine devra raisonner seule, cet ADR est rouvert.
6. **Pas d'entité « projet »** : l'équipe est donnée par l'endroit dans l'arbre (`ventes/`
   s'exécute avec les comptes de Ventes) ; `ctx` seul porte le contexte d'appel.

## Conséquences

### Positives
- Testable sans host, à chaque commit ; explicable (score, composantes, bonus).
- Zéro coût d'inférence serveur, zéro clé, zéro dérive silencieuse.

### Négatives
- Le tri sémantique fin revient au modèle, qui lit les candidats : une phrase très éloignée du
  vocabulaire du titre et du résumé ne route pas ; le résumé se nourrit du journal.
- Deux procédures proches ne se distinguent que par leur titre et leur résumé.
- La calibration est un travail par organisation.

### Neutres
- Le résumé d'une procédure vient des consultants, puis des demandes réelles.

## Alternatives considérées

### Embeddings et recherche vectorielle
Dépendance à un fournisseur ou à un modèle local, coût, non reproductible entre cellules,
inutile sur quelques milliers de phrases courtes. Rejetée ; ce qui la ferait revenir : moins de
95 % de bonnes reconnaissances après calibration.

### Un LLM serveur qui choisit la procédure
Coût par appel, clé à gérer, récit non vérifiable, contredit le principe « aucune IA côté
serveur ». Rejetée.

### Laisser l'host choisir parmi des outils par procédure
Contredit par le banc : dégradation avec le nombre d'outils, geste par utilisateur à chaque
procédure publiée. Rejetée.
