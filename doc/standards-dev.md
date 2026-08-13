# Standards Dev — Obligatoire toutes étapes

À insérer en tête de chaque doc d'étape. Non négociable. La CI bloque le merge si un point n'est pas respecté.

---

## 1. Tests

- **Tests unitaires** sur toute fonction pure et tout helper (Vitest).
- **Tests d'intégration** sur toute route API (chaque code HTTP possible testé : 200, 400, 401, 403, 404, 409, 422, 429).
- **Coverage minimum : 80%** lignes + branches. CI échoue si en dessous.
- **Test d'isolation multi-tenant** rejoué à chaque étape (créer org A + org B, tenter cross-tenant → doit échouer).
- Pas de test qui hit la vraie DB de dev : utiliser une branche Neon éphémère par run CI (ou testcontainers Postgres en local).
- Nommage : `<fichier>.test.ts` collé au code, ou `/tests/integration/<feature>.test.ts` pour l'intégration.

## 2. Documentation

- **TSDoc** sur toute fonction/classe/type **exporté**. Description + `@param` + `@returns` + `@throws` + `@example` quand pertinent.
- **README.md** à la racine de chaque module (`/lib/<module>/README.md`) : rôle, API publique, exemple d'usage, choix techniques.
- **`docs/<module>.md`** à jour pour toute feature ajoutée (architecture, flow, décisions).
- **`docs/CHANGELOG.md`** : entrée par PR mergée (format Keep a Changelog).
- **`docs/CHANGELOG-API.md`** : entrée obligatoire dès qu'un endpoint est ajouté/modifié/déprécié.
- **ADR** (`docs/adr/NNNN-<titre>.md`) pour toute décision structurante (choix de lib, changement d'archi).

## 3. Qualité code

- **TypeScript strict** : `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **Zéro `any`** (sauf commentaire `// eslint-disable-next-line` justifié en revue).
- **`tsc --noEmit`** clean, zéro warning.
- **ESLint** clean (config partagée `@excellence/eslint-config`).
- **Prettier** appliqué (pre-commit hook via `lint-staged`).
- Pas de code mort, pas d'import inutilisé, pas de `console.log` en prod (logger structuré uniquement).

## 4. Git

- **Commits conventionnels** : `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`, `security:`.
- **Une PR = une feature**. Pas de PR fourre-tout.
- **Branche** : `feat/<étape>-<courte-desc>`, ex: `feat/step2-api-keys`.
- **Squash merge** obligatoire vers `main`.
- **Commit signé** (GPG ou SSH) recommandé.

## 5. Pull Request — template obligatoire

Toute PR doit remplir ce template. Sinon la review est refusée sans lecture.

```markdown
## Ce que fait cette PR
<description courte>

## Checklist
- [ ] Tests unitaires ajoutés/mis à jour
- [ ] Tests d'intégration ajoutés/mis à jour
- [ ] Coverage ≥ 80% vérifié localement
- [ ] Test d'isolation multi-tenant passe
- [ ] TSDoc à jour sur les exports
- [ ] README module à jour
- [ ] docs/<module>.md à jour
- [ ] CHANGELOG.md mis à jour
- [ ] CHANGELOG-API.md mis à jour (si endpoint touché)
- [ ] Lint + typecheck clean localement
- [ ] Pas de secret commité (vérif `.env` ignoré)
- [ ] Migration DB testée up + down (si applicable)
- [ ] Rate limits documentés (si nouvelle route)
- [ ] Événements d'audit ajoutés (si action sensible)

## Comment tester
<étapes reproductibles>

## Impact sécurité
<none | describe>
```

## 6. Sécurité continue

- **Pas de secret** dans le repo (pre-commit `git-secrets` + scan CI Gitleaks).
- **Dépendances** : `pnpm audit` en CI, PR bloquée si vulnérabilité `high` ou `critical`.
- **Renovate/Dependabot** actif pour les mises à jour.
- **Revue croisée** : toute PR touchant auth, RBAC, isolation ou crypto → **2 reviewers** obligatoires (dont toi Oktav).

## 7. CI/CD — pipeline minimum

```
1. install (pnpm install --frozen-lockfile)
2. lint (eslint)
3. typecheck (tsc --noEmit)
4. test:unit (vitest run)
5. test:integration (contre Neon branch éphémère)
6. test:tenant-isolation (bloquant)
7. build (next build)
8. openapi:validate (spectral lint)
9. security:secrets (gitleaks)
10. security:deps (pnpm audit)
```

Un seul échec = merge bloqué. Pas de bypass sauf hotfix critique validé par toi.

---

**Rappel :** ces standards ne sont pas des "nice to have". Un module non testé ou non documenté ne va pas en review. Le temps gagné à sauter ces étapes est du temps perdu × 10 en dette technique dans 2 semaines.
