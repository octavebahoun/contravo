-- Idempotente, comme 0008 : le snapshot drizzle a déjà divergé de la base en
-- production, et une migration qui échoue à mi-parcours laisse un état bâtard.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
-- Les organisations existantes ont déjà été configurées à la main : les envoyer
-- dans un formulaire de première configuration serait une régression.
UPDATE "organizations" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;
