# Étape 7 — Dashboard Super-Admin Platform (Back-Office SaaS & Control Center)

**Dev assigné :** Lead Developer / Founder  
**Prérequis :** Étape 6 (Billing SaaS & Quotas via GeniusPay)  
**Durée estimée :** 5-7 jours  
**Objectif :** Offrir à l'équipe fondatrice/développeur de Contravo un centre de contrôle unique (Super-Admin Back-Office) pour superviser l'ensemble de la plateforme SaaS, gérer les organisations clientes, suivre le MRR, surveiller les quotas et administrer les accès globaux.

---

## 1. Portée exacte

### 1.1 Inclus (In-Scope)
- **Super-Admin Auth & RBAC** : Isolation stricte de la route `/admin/*` réservée exclusivement aux utilisateurs ayant le rôle système `super_admin`.
- **Tableau de Bord Métriques SaaS (KPI Global)** :
  - **MRR (Monthly Recurring Revenue)** & ARR calculés en temps réel depuis les abonnements GeniusPay Excellence.
  - **Organisations Actives** : Compteur total d'organisations (Free, Pro, Business).
  - **Taux de Churn & Renouvellements** : Suivi des annulations et échecs de paiements.
- **Gestion des Organisations (Tenant Directory)** :
  - Recherche, filtrage et fiches détaillées de chaque agence/entreprise cliente.
  - Possibilité de surcharger un quota (ex: accorder +5 projets exceptionnellement).
  - Suspension / Réactivation d'une organisation (en cas d'impayé ou d'abus).
- **Historique & Audit du Billing SaaS** :
  - Visualisation de toutes les transactions d'abonnements perçues par le compte marchand **Excellence**.
  - Journal des webhooks GeniusPay de plateforme.
- **Logs Système & Santé de l'Infrastructure** :
  - Volume total de documents générés (devis, factures, contrats).
  - Monitoring des clés API émises et activité globale des webhooks.

### 1.2 Exclus (Out-of-Scope)
- Pas de prise en main à distance ("Impersonation") au MVP 7 — la gestion reste administrative.
- Pas de modification directe des données métiers d'une organisation (respect de l'isolation multi-tenant).

---

## 2. Architecture & Sécurité

### 2.1 Distinction des Routes & Accès

| Espace | Route | Utilisateurs | Rôle Requis |
|---|---|---|---|
| **Portail Client** | `/portal/[token]` | Clients finaux des agences | Token d'accès unique |
| **Dashboard Agence** | `/dashboard/*` | Membres & Admins des agences clientes | `owner`, `admin`, `member` (scopé par Org) |
| **Super-Admin Platform** | `/admin/*` | Fondateurs & Équipe SaaS Contravo | `super_admin` (Global) |

### 2.2 Vérification des Autorisations (Middleware & API)

Toute tentative d'accès à la route `/admin` ou aux API `/api/v1/admin/*` doit vérifier le flag `isSuperAdmin` ou le rôle `super_admin` dans le jeton d'authentification ou le profil utilisateur :

```ts
// Example Guard: lib/auth/admin-guard.ts
export async function requireSuperAdmin(ctx: ApiContext) {
  if (!ctx.isSuperAdmin) {
    throw new ForbiddenError("Accès réservé au Super-Admin Contravo.");
  }
}
```

---

## 3. Interfaces & Écrans Super-Admin

### 3.1 Vue d'Ensemble (`/admin`)
- **Header** : Indicateur de santé système (API Status, GeniusPay Status).
- **Cartes KPI** :
  - MRR Total (XOF)
  - Abonnements Pro / Business
  - Volume de factures traitées sur la plateforme
- **Graphiques d'Acquisition** : Évolution des nouvelles organisations inscrites sur 12 mois (`Chart` Shadcn).

### 3.2 Gestion des Organisations (`/admin/organizations`)
- **Table d'Administration** :
  - Nom de l'organisation
  - Plan souscrit (`Free`, `Pro`, `Business`)
  - Date de souscription & statut du paiement
  - Membres actifs
  - Actions : `Inspecter`, `Modifier Quotas`, `Suspendre`
- **Modal d'Ajustement de Quotas** : Permet au Super-Admin d'augmenter manuellement les limites d'une organisation.

### 3.3 Transcriptions & Finance SaaS (`/admin/finance`)
- Journal des transactions encaissées via le marchand **Excellence GeniusPay**.
- Suivi des relances et des échecs de prélèvement.

---

## 4. Livrables & Définition de Terminé (DoD)

1. **Isolation 100% Sécurisée** : Route `/admin` inaccessible aux utilisateurs standards.
2. **Back-Office Opérationnel** : Affichage exact du nombre d'organisations et du MRR.
3. **Contrôle Multi-Tenant** : Possibilité de suspendre/réactiver une organisation cliente.
4. **Documentation à jour** : Fichier `doc/MVP7.md` validé et référencé.


