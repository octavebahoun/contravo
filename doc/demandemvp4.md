# Questions et Demandes pour l'Étape 4 (MVP4)

Pour mener à bien l'implémentation du stockage Cloudflare R2 et de la génération PDF, nous avons besoin de préciser les éléments suivants. Veuillez nous fournir vos retours directement ou ajuster les configurations.

---

## 1. Stockage Cloudflare R2 & Configuration
- **Bucket de test local** : Le fichier `.env` actuel contient `R2_BUCKET_NAME=renderx-videos`. Devons-nous utiliser ce bucket existant pour nos développements locaux, ou préférez-vous que nous créions un bucket nommé `excellence-dev-<pseudo>` ?
- **Accès R2** : Les clés R2 définies dans `.env` sont-elles actives et disposent-elles des permissions nécessaires pour créer et signer des URLs sur ce bucket ?

## 2. Service d'Antivirus (ClamAV)
- **Environnement local** : Y a-t-il un conteneur ClamAV en sidecar déjà actif dans votre infrastructure locale ? Si oui, à quelle adresse/port (ex. `localhost:3310`) ?
- **Stratégie de Fallback** : Si ClamAV n'est pas disponible localement, préférez-vous :
  1. Un mock complet dans `antivirus.ts` (qui marque tout comme `clean` sauf le fichier de test EICAR standard `eicar.com`).
  2. L'intégration d'une API tierce gratuite (ex. VirusTotal ou Cloudmersive).

## 3. Dépendances de Génération PDF (Puppeteer & React-PDF)
- **Installation** : Confirmez-vous que nous pouvons ajouter les dépendances `@react-pdf/renderer` (pour les devis/factures) et `puppeteer` / `@sparticuz/chromium` (pour les contrats) au projet via `pnpm add` ?
- **Contraintes Serveur (Serverless)** : Le déploiement de production s'effectue-t-il sur une plateforme serverless (comme Vercel, AWS Lambda, Cloudflare Workers) ? Si oui, Puppeteer nécessite généralement des configurations spécifiques avec `@sparticuz/chromium` pour contourner la limite de taille des fonctions. Est-ce le cas, ou est-ce un serveur virtuel/dédié standard (Node.js classique) ?

## 4. Polices de caractères (Fonts)
- **Polices embarquées** : Pour assurer le déterminisme des PDF (devis/factures), nous devons placer les fichiers de polices (ex. `Inter-Regular.ttf`, `Inter-Bold.ttf`) dans `/lib/pdf/fonts/`. Confirmez-vous l'utilisation d'Inter ou une autre police de marque ?

## 5. Migration des données existantes
- Les colonnes `*_r2_key` existantes (devis, contrats, factures, dépenses, livrables) doivent être migrées vers `pdf_file_id`, `signed_pdf_file_id`, `receipt_file_id`, `deliverable_file_id` (tables pointant vers la nouvelle table `files`).
- Confirmez-vous que nous devons créer une migration Drizzle qui effectue cette transformation et crée la table `files` ?

---

*Note : Nous allons commencer à structurer les répertoires de base et implémenter les schémas Drizzle correspondants en attendant vos consignes sur ces points.*
