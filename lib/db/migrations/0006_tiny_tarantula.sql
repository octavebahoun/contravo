CREATE TABLE "quota_period_usage" (
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"api_calls_count" bigint DEFAULT 0 NOT NULL,
	"public_tokens_created" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quota_period_usage_organization_id_period_start_pk" PRIMARY KEY("organization_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"members_count" integer DEFAULT 0 NOT NULL,
	"clients_count" integer DEFAULT 0 NOT NULL,
	"projects_count" integer DEFAULT 0 NOT NULL,
	"api_keys_count" integer DEFAULT 0 NOT NULL,
	"webhook_endpoints_count" integer DEFAULT 0 NOT NULL,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"last_recomputed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"plan_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_pdf_file_id" uuid,
	"paid_at" timestamp with time zone,
	"failed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_cycles_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "sub_cycles_sub_cycle_idx" UNIQUE("subscription_id","cycle_number")
);
--> statement-breakpoint
CREATE TABLE "subscription_payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"gateway_reference" text,
	"checkout_url" text,
	"status" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "quota_period_usage" ADD CONSTRAINT "quota_period_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_usage" ADD CONSTRAINT "quota_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_invoice_pdf_file_id_files_id_fk" FOREIGN KEY ("invoice_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_attempts" ADD CONSTRAINT "subscription_payment_attempts_cycle_id_subscription_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."subscription_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment_attempts" ADD CONSTRAINT "subscription_payment_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cycles_org" ON "subscription_cycles" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_pay_attempts_gateway_ref_unique_idx" ON "subscription_payment_attempts" USING btree ("gateway_reference") WHERE gateway_reference IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_sub_attempts_cycle" ON "subscription_payment_attempts" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_org" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint

-- Triggers to maintain quota_usage
CREATE OR REPLACE FUNCTION update_quota_usage_counts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'memberships' THEN
    IF (TG_OP = 'INSERT') THEN
      INSERT INTO quota_usage (organization_id, members_count) VALUES (NEW.organization_id, 1)
      ON CONFLICT (organization_id) DO UPDATE SET members_count = quota_usage.members_count + 1, last_recomputed_at = now();
    ELSIF (TG_OP = 'DELETE') THEN
      UPDATE quota_usage SET members_count = GREATEST(0, members_count - 1), last_recomputed_at = now() WHERE organization_id = OLD.organization_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'clients' THEN
    IF (TG_OP = 'INSERT') THEN
      INSERT INTO quota_usage (organization_id, clients_count) VALUES (NEW.organization_id, 1)
      ON CONFLICT (organization_id) DO UPDATE SET clients_count = quota_usage.clients_count + 1, last_recomputed_at = now();
    ELSIF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)) THEN
      UPDATE quota_usage SET clients_count = GREATEST(0, clients_count - 1), last_recomputed_at = now() WHERE organization_id = OLD.organization_id;
    ELSIF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL) THEN
      UPDATE quota_usage SET clients_count = quota_usage.clients_count + 1, last_recomputed_at = now() WHERE organization_id = NEW.organization_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    IF (TG_OP = 'INSERT') THEN
      INSERT INTO quota_usage (organization_id, projects_count) VALUES (NEW.organization_id, 1)
      ON CONFLICT (organization_id) DO UPDATE SET projects_count = quota_usage.projects_count + 1, last_recomputed_at = now();
    ELSIF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)) THEN
      UPDATE quota_usage SET projects_count = GREATEST(0, projects_count - 1), last_recomputed_at = now() WHERE organization_id = OLD.organization_id;
    ELSIF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL) THEN
      UPDATE quota_usage SET projects_count = quota_usage.projects_count + 1, last_recomputed_at = now() WHERE organization_id = NEW.organization_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'api_keys' THEN
    IF (TG_OP = 'INSERT') THEN
      INSERT INTO quota_usage (organization_id, api_keys_count) VALUES (NEW.organization_id, 1)
      ON CONFLICT (organization_id) DO UPDATE SET api_keys_count = quota_usage.api_keys_count + 1, last_recomputed_at = now();
    ELSIF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL)) THEN
      UPDATE quota_usage SET api_keys_count = GREATEST(0, api_keys_count - 1), last_recomputed_at = now() WHERE organization_id = OLD.organization_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'webhook_endpoints' THEN
    IF (TG_OP = 'INSERT' AND NEW.organization_id IS NOT NULL) THEN
      INSERT INTO quota_usage (organization_id, webhook_endpoints_count) VALUES (NEW.organization_id, 1)
      ON CONFLICT (organization_id) DO UPDATE SET webhook_endpoints_count = quota_usage.webhook_endpoints_count + 1, last_recomputed_at = now();
    ELSIF (TG_OP = 'DELETE' AND OLD.organization_id IS NOT NULL) THEN
      UPDATE quota_usage SET webhook_endpoints_count = GREATEST(0, webhook_endpoints_count - 1), last_recomputed_at = now() WHERE organization_id = OLD.organization_id;
    ELSIF (TG_OP = 'UPDATE' AND NEW.organization_id IS NOT NULL) THEN
      IF (OLD.active = true AND NEW.active = false) THEN
        UPDATE quota_usage SET webhook_endpoints_count = GREATEST(0, webhook_endpoints_count - 1), last_recomputed_at = now() WHERE organization_id = NEW.organization_id;
      ELSIF (OLD.active = false AND NEW.active = true) THEN
        UPDATE quota_usage SET webhook_endpoints_count = quota_usage.webhook_endpoints_count + 1, last_recomputed_at = now() WHERE organization_id = NEW.organization_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE TRIGGER trg_quota_usage_memberships
AFTER INSERT OR DELETE ON memberships
FOR EACH ROW EXECUTE FUNCTION update_quota_usage_counts();--> statement-breakpoint

CREATE OR REPLACE TRIGGER trg_quota_usage_clients
AFTER INSERT OR UPDATE OR DELETE ON clients
FOR EACH ROW EXECUTE FUNCTION update_quota_usage_counts();--> statement-breakpoint

CREATE OR REPLACE TRIGGER trg_quota_usage_projects
AFTER INSERT OR UPDATE OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION update_quota_usage_counts();--> statement-breakpoint

CREATE OR REPLACE TRIGGER trg_quota_usage_api_keys
AFTER INSERT OR UPDATE OR DELETE ON api_keys
FOR EACH ROW EXECUTE FUNCTION update_quota_usage_counts();--> statement-breakpoint

CREATE OR REPLACE TRIGGER trg_quota_usage_webhook_endpoints
AFTER INSERT OR UPDATE OR DELETE ON webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION update_quota_usage_counts();