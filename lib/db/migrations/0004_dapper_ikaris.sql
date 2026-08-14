CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"scan_result" jsonb,
	"linked_entity_type" text,
	"linked_entity_id" uuid,
	"uploaded_by_user_id" uuid,
	"uploaded_via" text NOT NULL,
	"uploaded_from_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_r2_key_unique" UNIQUE("r2_key"),
	CONSTRAINT "files_org_r2_key_unique" UNIQUE("organization_id","r2_key")
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text NOT NULL,
	"signer_ip" "inet" NOT NULL,
	"signer_user_agent" text NOT NULL,
	"public_token_id" uuid NOT NULL,
	"canvas_file_id" uuid,
	"signed_pdf_file_id" uuid NOT NULL,
	"document_sha256" text NOT NULL,
	"signature_sha256" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"otp_verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_usage" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"last_computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "pdf_file_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "signed_pdf_file_id" uuid;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_file_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_file_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_color" text DEFAULT '#2B6CE5';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "legal_mentions" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bank_details" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "pdf_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_public_token_id_public_tokens_id_fk" FOREIGN KEY ("public_token_id") REFERENCES "public"."public_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_canvas_file_id_files_id_fk" FOREIGN KEY ("canvas_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signed_pdf_file_id_files_id_fk" FOREIGN KEY ("signed_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_files_org_kind" ON "files" USING btree ("organization_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_files_entity" ON "files" USING btree ("linked_entity_type","linked_entity_id");--> statement-breakpoint
CREATE INDEX "idx_signatures_entity" ON "signatures" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_signed_pdf_file_id_files_id_fk" FOREIGN KEY ("signed_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Migration of contracts.pdf_r2_key
INSERT INTO "files" ("id", "organization_id", "r2_key", "filename", "mime_type", "size_bytes", "sha256", "kind", "status", "uploaded_via", "created_at")
SELECT 
    gen_random_uuid(), 
    "organization_id", 
    "pdf_r2_key", 
    'contract_pdf_' || "number" || '.pdf', 
    'application/pdf', 
    0, 
    'legacy_migration_hash', 
    'contract_pdf', 
    'scanned', 
    'legacy_migration', 
    "created_at"
FROM "contracts"
WHERE "pdf_r2_key" IS NOT NULL
ON CONFLICT ("r2_key") DO NOTHING;
--> statement-breakpoint
UPDATE "contracts" c
SET "pdf_file_id" = f."id"
FROM "files" f
WHERE c."pdf_r2_key" = f."r2_key";
--> statement-breakpoint

-- Migration of contracts.signed_pdf_r2_key
INSERT INTO "files" ("id", "organization_id", "r2_key", "filename", "mime_type", "size_bytes", "sha256", "kind", "status", "uploaded_via", "created_at")
SELECT 
    gen_random_uuid(), 
    "organization_id", 
    "signed_pdf_r2_key", 
    'contract_signed_pdf_' || "number" || '.pdf', 
    'application/pdf', 
    0, 
    'legacy_migration_hash', 
    'contract_signed_pdf', 
    'scanned', 
    'legacy_migration', 
    "created_at"
FROM "contracts"
WHERE "signed_pdf_r2_key" IS NOT NULL
ON CONFLICT ("r2_key") DO NOTHING;
--> statement-breakpoint
UPDATE "contracts" c
SET "signed_pdf_file_id" = f."id"
FROM "files" f
WHERE c."signed_pdf_r2_key" = f."r2_key";
--> statement-breakpoint

-- Migration of deliverables.file_r2_key
INSERT INTO "files" ("id", "organization_id", "r2_key", "filename", "mime_type", "size_bytes", "sha256", "kind", "status", "uploaded_via", "created_at")
SELECT 
    gen_random_uuid(), 
    "organization_id", 
    "file_r2_key", 
    COALESCE("file_name", 'deliverable_' || "id" || '.bin'), 
    COALESCE("file_mime", 'application/octet-stream'), 
    COALESCE("file_size_bytes", 0), 
    'legacy_migration_hash', 
    'deliverable', 
    'scanned', 
    'legacy_migration', 
    "created_at"
FROM "deliverables"
WHERE "file_r2_key" IS NOT NULL
ON CONFLICT ("r2_key") DO NOTHING;
--> statement-breakpoint
UPDATE "deliverables" d
SET "file_id" = f."id"
FROM "files" f
WHERE d."file_r2_key" = f."r2_key";
--> statement-breakpoint

-- Migration of expenses.receipt_r2_key
INSERT INTO "files" ("id", "organization_id", "r2_key", "filename", "mime_type", "size_bytes", "sha256", "kind", "status", "uploaded_via", "created_at")
SELECT 
    gen_random_uuid(), 
    "organization_id", 
    "receipt_r2_key", 
    'receipt_' || "id" || '.jpg', 
    'image/jpeg', 
    0, 
    'legacy_migration_hash', 
    'expense_receipt', 
    'scanned', 
    'legacy_migration', 
    "created_at"
FROM "expenses"
WHERE "receipt_r2_key" IS NOT NULL
ON CONFLICT ("r2_key") DO NOTHING;
--> statement-breakpoint
UPDATE "expenses" e
SET "receipt_file_id" = f."id"
FROM "files" f
WHERE e."receipt_r2_key" = f."r2_key";
--> statement-breakpoint

-- Migration of invoices.pdf_r2_key
INSERT INTO "files" ("id", "organization_id", "r2_key", "filename", "mime_type", "size_bytes", "sha256", "kind", "status", "uploaded_via", "created_at")
SELECT 
    gen_random_uuid(), 
    "organization_id", 
    "pdf_r2_key", 
    'invoice_pdf_' || "number" || '.pdf', 
    'application/pdf', 
    0, 
    'legacy_migration_hash', 
    'invoice_pdf', 
    'scanned', 
    'legacy_migration', 
    "created_at"
FROM "invoices"
WHERE "pdf_r2_key" IS NOT NULL
ON CONFLICT ("r2_key") DO NOTHING;
--> statement-breakpoint
UPDATE "invoices" i
SET "pdf_file_id" = f."id"
FROM "files" f
WHERE i."pdf_r2_key" = f."r2_key";
--> statement-breakpoint

-- Migration of quotes.pdf_r2_key
INSERT INTO "files" ("id", "organization_id", "r2_key", "filename", "mime_type", "size_bytes", "sha256", "kind", "status", "uploaded_via", "created_at")
SELECT 
    gen_random_uuid(), 
    "organization_id", 
    "pdf_r2_key", 
    'quote_pdf_' || "number" || '.pdf', 
    'application/pdf', 
    0, 
    'legacy_migration_hash', 
    'quote_pdf', 
    'scanned', 
    'legacy_migration', 
    "created_at"
FROM "quotes"
WHERE "pdf_r2_key" IS NOT NULL
ON CONFLICT ("r2_key") DO NOTHING;
--> statement-breakpoint
UPDATE "quotes" q
SET "pdf_file_id" = f."id"
FROM "files" f
WHERE q."pdf_r2_key" = f."r2_key";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN "pdf_r2_key";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN "signed_pdf_r2_key";--> statement-breakpoint
ALTER TABLE "deliverables" DROP COLUMN "file_r2_key";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "receipt_r2_key";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "pdf_r2_key";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "pdf_r2_key";