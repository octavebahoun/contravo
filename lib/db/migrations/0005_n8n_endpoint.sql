-- Étape 5 : support endpoint n8n global
-- Rend organization_id nullable pour permettre un endpoint n8n global (organization_id = NULL)
-- et ajoute la colonne kind pour distinguer les endpoints (ex: 'n8n_primary').

ALTER TABLE "webhook_endpoints" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "kind" text DEFAULT 'generic' NOT NULL;
