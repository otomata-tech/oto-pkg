# Epic E12 — Offres de l'hôte : inscription et capacités

| Champ | Valeur |
|-------|--------|
| **ID** | E12 |
| **Priorité** | P1 (le SaaS vend une offre gratuite et une offre payante, prix par organisation) |
| **Statut** | ✅ Livré pour la 1.2.0, non publié |
| **Parcours** | Inscription en libre-service (nouveau) ; Équipes et accès ; tableau de bord ; joindre un fichier |
| **PRD Refs** | FR-ADMIN-01 (amendé), FR-ADMIN-02 |
| **Référence UI** | Description dans chaque story |
| **Dépendances** | Aucune entre les deux stories ; le chantier connecteurs branche plus tard le contrôle des comptes |

## Objectif

Donner à un hôte qui vend le paquet ce qui revient au paquet, sans jamais lui apprendre une offre, un
prix ou un prestataire de paiement : une personne crée elle-même son organisation (ADR-023), et chaque
organisation porte des capacités que les services vérifient avant d'écrire et que les écrans grisent
(ADR-022). Sans option ni fonction enregistrée, un ERP voit le comportement d'avant.

## Stories

| ID | Titre | Estimation |
|----|-------|------------|
| E12-S01 | Inscription libre : une personne vérifiée crée son organisation | M |
| E12-S02 | Capacités par organisation : refus décidés par le paquet, valeurs fournies par l'hôte | M |
