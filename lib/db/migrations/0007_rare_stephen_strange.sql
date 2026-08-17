CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_max_members" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_max_clients" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_max_projects" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_max_storage_bytes" bigint;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_max_api_keys" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_max_webhook_endpoints" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_expires" ON "password_reset_tokens" USING btree ("expires_at");