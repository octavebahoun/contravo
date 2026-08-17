# Audit de Sécurité & Conformité — [Nom du SaaS]

**Date de l'audit :** [à compléter]
**Effectué par :** Claude Code
**Périmètre :** Devis, factures, données clients, authentification, API

---

## 📊 Résumé exécutif

| Criticité | Nombre de failles |
|-----------|-------------------|
| 🔴 Critique | 0 |
| 🟠 Élevé | 0 |
| 🟡 Moyen | 0 |
| 🟢 Faible | 0 |

**Verdict global :** [à compléter — ex : "Non prêt pour production" / "Corrections mineures avant mise en ligne" / "OK"]

---

## 🔴 CRITIQUE

> Failles exploitables immédiatement, risque de fuite de données sensibles ou compromission totale.

### [FAILLE-001] Titre de la faille
- **Fichier / ligne :** `chemin/vers/fichier.js:42`
- **Catégorie :** Auth / Injection / Secrets / IDOR / RGPD / Autre
- **Description :** Explication claire du problème.
- **Preuve de concept :** Exemple d'exploitation (requête, payload, scénario).
- **Impact :** Ce qu'un attaquant peut faire concrètement (accès facture d'un autre client, vol de données bancaires, etc.).
- **Correction proposée :**
```
// extrait de code corrigé
```
- **Statut :** ⬜ Non corrigé / 🟨 En cours / ✅ Corrigé

---

## 🟠 ÉLEVÉ

### [FAILLE-00X] Titre
*(même structure que ci-dessus)*

---

## 🟡 MOYEN

### [FAILLE-00X] Titre
*(même structure)*

---

## 🟢 FAIBLE

### [FAILLE-00X] Titre
*(même structure)*

---

## 🧩 Cartographie des zones sensibles

| Zone | Fichiers concernés | Niveau de risque | Vérifié |
|------|--------------------|--------------------|---------|
| Authentification | | | ⬜ |
| Gestion des factures | | | ⬜ |
| Gestion des devis | | | ⬜ |
| Paiements | | | ⬜ |
| Endpoints API publics | | | ⬜ |
| Stockage données clients | | | ⬜ |
| Logs applicatifs | | | ⬜ |

---

## 🔐 Secrets & configuration

- [ ] Aucun secret en dur dans le code (clés API, mots de passe, tokens)
- [ ] `.env` absent de l'historique git
- [ ] Variables sensibles chiffrées en base (IBAN, données bancaires)
- [ ] Rotation des secrets possible sans redéploiement complet

## 🧬 Dépendances

- [ ] Scan `npm audit` / `pip-audit` (ou équivalent) exécuté
- **CVE critiques trouvées :** [liste]
- **CVE élevées trouvées :** [liste]

## ⚖️ Conformité RGPD (analyse technique)

- [ ] Données personnelles identifiées et localisées
- [ ] Durée de conservation définie et appliquée (ex : archivage légal factures 10 ans)
- [ ] Mécanisme de suppression / anonymisation existant
- [ ] Transferts vers tiers (emailing, analytics, paiement) recensés
- [ ] Logs ne contiennent pas de données sensibles en clair
- ⚠️ **Rappel :** cette section est une analyse technique, pas un avis juridique. À faire valider par un juriste/DPO.

---

## ✅ Plan d'action priorisé

1. [ ] Corriger toutes les failles 🔴 Critique avant toute mise en production
2. [ ] Planifier la correction des failles 🟠 Élevé sous [X jours]
3. [ ] Revue juridique du volet RGPD par un professionnel
4. [ ] Re-scan complet après corrections pour validation

---

*Rapport généré et complété automatiquement par Claude Code. À conserver comme preuve de diligence en cas de contrôle ou d'incident.*
