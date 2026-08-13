ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "subscription_status" text;