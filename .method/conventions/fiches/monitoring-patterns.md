# Fiche — monitoring-patterns

Texte complet : `.method/conventions/monitoring-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Capturer les erreurs inattendues (blocs `catch`, error boundaries), avec leur contexte (action, identifiant) ; jamais une erreur de validation attendue. § Règles Error Tracking
- Aucune donnée personnelle dans une capture ni un log : ni mot de passe, ni jeton, ni donnée d'une personne. § Règles Error Tracking
- Un log est un objet JSON (`timestamp`, `level`, `message`, données) ; le niveau `debug` ne part pas en production. § Structure · § Niveaux de log
- `/api/health` fait une lecture minimale de la base et rend 200 `ok`, ou 503. § Health Check
- Cibles : LCP sous 2,5 s, INP sous 200 ms, CLS sous 0,1, TTFB sous 800 ms. § Web Vitals
