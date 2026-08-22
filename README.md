# Contravo

**Du devis au paiement, pour les freelances et petites agences d'Afrique de l'Ouest.**

Contravo couvre la chaîne complète d'une prestation : devis, contrat signé
électroniquement, livrables, facturation et encaissement en ligne — en francs CFA
(XOF), avec les moyens de paiement réellement utilisés dans la région.

🔗 **Démonstration : [contravo.excellenceteam.site](https://contravo.excellenceteam.site)**

---

## Le problème

Un freelance béninois signe par WhatsApp, facture sous Word, relance par message et
attend son paiement par Mobile Money sans trace exploitable. Quand le client conteste
ou tarde, il n'a ni contrat opposable, ni preuve de livraison, ni historique.

Les outils occidentaux (Stripe, HelloSign, QuickBooks) ne répondent pas : pas de XOF,
pas de Mobile Money, pas de cadre juridique local, et des tarifs mensuels en dollars.

## Ce que fait Contravo

|                    |                                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| **Devis**          | Création, envoi, acceptation en ligne par le client                        |
| **Contrats**       | Signature électronique, horodatée et archivée                              |
| **Livrables**      | Dépôt, validation ou demande de correction par le client                   |
| **Factures**       | Émission, relances (automatiques ou manuelles), suivi des échéances        |
| **Paiement**       | Encaissement en ligne via GeniusPay — Mobile Money et carte, en XOF        |
| **Avis**           | Témoignages clients vérifiés, rattachés à une prestation réellement livrée |
| **Portail client** | Accès sans compte, par lien signé à durée limitée                          |

Tout est multi-organisation, avec des rôles (propriétaire, membre) et un portail client
séparé du tableau de bord prestataire.

## La couche IA (en construction)

Le produit ci-dessus est le socle : il produit des données qui n'existent nulle part
ailleurs dans la région — contrats réellement signés, délais de paiement réellement
tenus, avis rattachés à une prestation vérifiée.

Deux briques s'appuient dessus :

1. **Pilotage en langage naturel** — décrire une facture plutôt que remplir un formulaire.
2. **Moteur de mise en relation** — recommander un prestataire à partir du travail livré
   et payé, non d'un profil auto-déclaré. Et relier les prestataires entre eux, pour que
   le travail circule dans le réseau.

## Contravo Connect (feuille de route)

Le cœur émet 41 événements de domaine consommés par un routeur de dispatch : brancher une
nouvelle destination revient à ajouter un consommateur, pas à toucher à la logique métier.

**Contravo Connect** est la couche suivante — un module optionnel, activé par organisation,
qui relie les comptes externes du prestataire. Premier canal : **WhatsApp Business**, connecté
via OAuth Meta (aucun copier-coller de jeton).

> demande sur WhatsApp → devis → facture PDF → relance → notification Telegram → archivage Drive

Un **filtre par mots-clés s'exécute avant tout appel au modèle** : un message contenant « prix »,
« devis » ou « combien » part directement vers la création de devis ; l'IA n'intervient qu'en
repli. Moins de latence, moins de coût, et surtout moins de données personnelles envoyées à un
modèle.

Telegram et Google Drive sont spécifiés ; exports comptables, synchronisation d'agenda et
nouveaux moyens de paiement suivent le même schéma.

## Architecture

- **Next.js 15** (App Router, React Server Components) · **TypeScript**
- **PostgreSQL** (Neon) via **Drizzle ORM** — 38 tables, migrations versionnées
- **Cloudflare R2** pour les fichiers, en URLs présignées (les octets ne transitent pas
  par le serveur applicatif)
- **GeniusPay** pour l'encaissement — webhooks signés, vérification côté serveur avant
  de créditer une facture
- **n8n** pour l'orchestration événementielle — 19 workflows, 15 modèles d'e-mail
- **Vitest** — 123 tests

Le cœur métier émet des événements de domaine ; n8n les consomme pour l'envoi d'e-mails
et les tâches planifiées (relances de factures, réémission des webhooks en échec).

## Documentation

- [`doc/`](doc/) — architecture, sécurité des identifiants de paiement, API
- API REST documentée en OpenAPI, exposée via Scalar sur `/api/v1/docs`

## Licence

Code source **propriétaire**, publié pour évaluation uniquement. Voir [LICENSE](LICENSE).

---

Développé au Bénin 🇧🇯 pour le marché ouest-africain par Excellence Team , Startup Etudiante.
