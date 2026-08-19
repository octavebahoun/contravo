-- Idempotente, comme 0008 et 0009 : le snapshot drizzle a déjà divergé de la
-- base en production, et une migration qui échoue à mi-parcours laisse un état
-- bâtard.

-- Les relances J+0/J+7/J+14/J+30 partaient toutes seules, sans que le
-- prestataire puisse ni les déclencher ni les retenir. La balance revient de son
-- côté : le balayage automatique est désormais **désactivé par défaut** et c'est
-- lui qui relance, quand il le décide.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "auto_reminders_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- 'auto' = un palier du balayage ; 'manual' = un envoi déclenché à la main.
ALTER TABLE "invoice_reminders" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD COLUMN IF NOT EXISTS "sent_by_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_reminders"
    ADD CONSTRAINT "invoice_reminders_sent_by_user_id_users_id_fk"
    FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- L'unicité (facture, palier) est ce qui rend le balayage idempotent — mais elle
-- interdirait une deuxième relance manuelle sur la même facture. Elle ne couvre
-- donc plus que les envois automatiques.
DROP INDEX IF EXISTS "invoice_reminders_invoice_stage_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_reminders_invoice_stage_unique_idx"
  ON "invoice_reminders" ("invoice_id","stage") WHERE "kind" = 'auto';
