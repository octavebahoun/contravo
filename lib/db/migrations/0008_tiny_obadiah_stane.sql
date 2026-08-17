-- Rendue idempotente : le snapshot drizzle s'est déjà désynchronisé de la base
-- en production (voir 0007), et une migration qui échoue à mi-parcours laisse la
-- base dans un état intermédiaire.
CREATE TABLE IF NOT EXISTS "invoice_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"stage" integer NOT NULL,
	"days_overdue" integer NOT NULL,
	"amount_due_cents" bigint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_reminders_invoice_stage_unique_idx" ON "invoice_reminders" USING btree ("invoice_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_reminders_org" ON "invoice_reminders" USING btree ("organization_id","sent_at");
