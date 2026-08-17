import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  jsonb,
  inet,
  integer,
  boolean,
  index,
  bigint,
  date,
  numeric,
  smallint,
  customType,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Custom PG Types
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeProductId: text('stripe_product_id'),
  planName: text('plan_name'),
  subscriptionStatus: text('subscription_status'),
  plan: text('plan').default('free'),
  defaultCurrency: text('default_currency').notNull().default('XOF'),
  logoFileId: uuid('logo_file_id').references((): any => files.id, { onDelete: 'set null' }),
  brandColor: text('brand_color').default('#2B6CE5'),
  legalMentions: text('legal_mentions'),
  bankDetails: jsonb('bank_details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  customMaxMembers: integer('custom_max_members'),
  customMaxClients: integer('custom_max_clients'),
  customMaxProjects: integer('custom_max_projects'),
  customMaxStorageBytes: bigint('custom_max_storage_bytes', { mode: 'bigint' }),
  customMaxApiKeys: integer('custom_max_api_keys'),
  customMaxWebhookEndpoints: integer('custom_max_webhook_endpoints'),
});

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').unique().notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  sha256: text('sha256').notNull(),
  kind: text('kind').notNull(), // enum: 'quote_pdf'|'contract_pdf'|'contract_signed_pdf'|'invoice_pdf'|'deliverable'|'expense_receipt'|'signature_canvas'|'attachment'
  status: text('status').notNull(), // enum: 'uploading'|'scanning'|'clean'|'infected'|'ready'|'failed'
  scanResult: jsonb('scan_result'), // ClamAV result: {virus_name, scanned_at}
  linkedEntityType: text('linked_entity_type'), // quote|contract|invoice|deliverable|expense
  linkedEntityId: uuid('linked_entity_id'),
  uploadedByUserId: uuid('uploaded_by_user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  uploadedVia: text('uploaded_via').notNull(), // enum: 'server_generated'|'session'|'api_key'|'public_token'
  uploadedFromIp: inet('uploaded_from_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_files_org_kind').on(table.organizationId, table.kind, table.createdAt),
  index('idx_files_entity').on(table.linkedEntityType, table.linkedEntityId),
  unique('files_org_r2_key_unique').on(table.organizationId, table.r2Key),
]);

export const signatures = pgTable('signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(), // enum: 'contract'|'quote'
  entityId: uuid('entity_id').notNull(),
  signerName: text('signer_name').notNull(),
  signerEmail: text('signer_email').notNull(),
  signerIp: inet('signer_ip').notNull(),
  signerUserAgent: text('signer_user_agent').notNull(),
  publicTokenId: uuid('public_token_id')
    .notNull()
    .references(() => publicTokens.id, { onDelete: 'restrict' }),
  canvasFileId: uuid('canvas_file_id')
    .references(() => files.id, { onDelete: 'set null' }),
  signedPdfFileId: uuid('signed_pdf_file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  documentSha256: text('document_sha256').notNull(),
  signatureSha256: text('signature_sha256').notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
  otpVerified: boolean('otp_verified').default(false).notNull(),
}, (table) => [
  index('idx_signatures_entity').on(table.entityType, table.entityId),
]);

export const storageUsage = pgTable('storage_usage', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  totalBytes: bigint('total_bytes', { mode: 'bigint' }).notNull().default(sql`0`),
  fileCount: integer('file_count').notNull().default(0),
  lastComputedAt: timestamp('last_computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // owner, admin, member, viewer
  invitedBy: uuid('invited_by')
    .references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('memberships_user_org_idx').on(table.userId, table.organizationId),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Password reset tokens.
 *
 * Only the SHA-256 hash is stored: a database dump must not hand out working
 * reset links. Rows are single-use (`usedAt`) and short-lived (`expiresAt`).
 */
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  requestedIp: inet('requested_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_password_reset_tokens_user').on(table.userId),
  index('idx_password_reset_tokens_expires').on(table.expiresAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').default('{}'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').unique().notNull(),
  scopes: text('scopes').array().notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastUsedIp: inet('last_used_ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_apikeys_org').on(table.organizationId),
  index('idx_apikeys_prefix').on(table.prefix),
]);

export const publicTokens = pgTable('public_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  resourceType: text('resource_type').notNull(), // enum: 'quote'|'contract'|'invoice'|'deliverable'|'review_request'
  resourceId: uuid('resource_id').notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  actions: text('actions').array().notNull(),
  recipientEmail: text('recipient_email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  firstUsedAt: timestamp('first_used_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastUsedIp: inet('last_used_ip'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ptokens_resource').on(table.resourceType, table.resourceId),
  index('idx_ptokens_org').on(table.organizationId),
]);

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('generic'), // enum: 'generic' | 'n8n_primary'
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: text('events').array().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_webhooks_org').on(table.organizationId),
]);

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id')
    .notNull()
    .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull(), // pending|success|failed|exhausted
  attempts: integer('attempts').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastResponseCode: integer('last_response_code'),
  lastResponseBody: text('last_response_body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, (table) => [
  index('idx_webhook_deliv_endpoint').on(table.endpointId),
]);

// --- Étape 3 Core Métier Tables ---

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // enum: 'individual' | 'company'
  displayName: text('display_name').notNull(),
  companyName: text('company_name'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: citext('email').notNull(),
  phone: text('phone'),
  vatNumber: text('vat_number'),
  billingAddress: jsonb('billing_address'),
  shippingAddress: jsonb('shipping_address'),
  notes: text('notes'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  isArchived: boolean('is_archived').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('clients_org_email_unique_idx')
    .on(table.organizationId, table.email)
    .where(sql`deleted_at IS NULL`),
  index('idx_clients_org_created').on(table.organizationId, table.createdAt),
  index('idx_clients_search').using('gin', sql`to_tsvector('simple', ${table.displayName} || ' ' || ${table.email})`),
]);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  code: text('code').notNull(), // ex: "PRJ-2026-001"
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull(), // enum: 'draft'|'active'|'on_hold'|'delivered'|'cancelled'|'archived'
  startDate: date('start_date'),
  dueDate: date('due_date'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  budgetCents: bigint('budget_cents', { mode: 'bigint' }),
  currency: text('currency').notNull().default('XOF'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  unique('projects_org_code_idx').on(table.organizationId, table.code),
  index('idx_projects_org_status').on(table.organizationId, table.status),
  index('idx_projects_client').on(table.clientId),
]);

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // enum: 'lead'|'contributor'|'observer'
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('project_members_proj_user_idx').on(table.projectId, table.userId),
]);

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  number: text('number').notNull(), // ex: "DEV-2026-0042"
  status: text('status').notNull(), // enum: 'draft'|'sent'|'viewed'|'accepted'|'rejected'|'expired'|'cancelled'
  currency: text('currency').notNull().default('XOF'),
  subtotalCents: bigint('subtotal_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  discountCents: bigint('discount_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  taxCents: bigint('tax_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  totalCents: bigint('total_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  validUntil: date('valid_until'),
  notes: text('notes'),
  terms: text('terms'),
  pdfFileId: uuid('pdf_file_id').references((): any => files.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedByName: text('accepted_by_name'),
  acceptedByEmail: text('accepted_by_email'),
  acceptedByIp: inet('accepted_by_ip'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  unique('quotes_org_number_idx').on(table.organizationId, table.number),
  index('idx_quotes_org_status').on(table.organizationId, table.status, table.createdAt),
  index('idx_quotes_project').on(table.projectId),
]);

export const quoteItems = pgTable('quote_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1.000'),
  unit: text('unit'),
  unitPriceCents: bigint('unit_price_cents', { mode: 'bigint' }).notNull(),
  discountBps: integer('discount_bps').notNull().default(0),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
}, (table) => [
  index('idx_quoteitems_quote').on(table.quoteId, table.position),
]);

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  quoteId: uuid('quote_id')
    .references(() => quotes.id, { onDelete: 'set null' }),
  number: text('number').notNull(), // ex: "CTR-2026-0018"
  title: text('title').notNull(),
  status: text('status').notNull(), // enum: 'draft'|'sent'|'signed'|'cancelled'|'expired'
  bodyMarkdown: text('body_markdown').notNull(),
  pdfFileId: uuid('pdf_file_id').references((): any => files.id, { onDelete: 'set null' }),
  signedPdfFileId: uuid('signed_pdf_file_id').references((): any => files.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signedByName: text('signed_by_name'),
  signedByEmail: text('signed_by_email'),
  signedByIp: inet('signed_by_ip'),
  signatureHash: text('signature_hash'),
  expiresAt: date('expires_at'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  unique('contracts_org_number_idx').on(table.organizationId, table.number),
  index('idx_contracts_org_status').on(table.organizationId, table.status),
  index('idx_contracts_project').on(table.projectId),
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'set null' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  contractId: uuid('contract_id')
    .references(() => contracts.id, { onDelete: 'set null' }),
  number: text('number').notNull(), // ex: "FAC-2026-0107"
  status: text('status').notNull(), // enum: 'draft'|'sent'|'partial'|'paid'|'overdue'|'cancelled'|'refunded'
  currency: text('currency').notNull().default('XOF'),
  subtotalCents: bigint('subtotal_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  discountCents: bigint('discount_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  taxCents: bigint('tax_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  totalCents: bigint('total_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  amountPaidCents: bigint('amount_paid_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  amountDueCents: bigint('amount_due_cents', { mode: 'bigint' })
    .generatedAlwaysAs(() => sql`total_cents - amount_paid_cents`),
  issueDate: date('issue_date').notNull(),
  dueDate: date('due_date').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  pdfFileId: uuid('pdf_file_id').references((): any => files.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  unique('invoices_org_number_idx').on(table.organizationId, table.number),
  index('idx_invoices_org_status').on(table.organizationId, table.status, table.dueDate),
  index('idx_invoices_client').on(table.clientId),
]);

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1.000'),
  unit: text('unit'),
  unitPriceCents: bigint('unit_price_cents', { mode: 'bigint' }).notNull(),
  discountBps: integer('discount_bps').notNull().default(0),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
}, (table) => [
  index('idx_invoiceitems_invoice').on(table.invoiceId, table.position),
]);

export const invoicePayments = pgTable('invoice_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'restrict' }),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  method: text('method').notNull(), // enum: 'bank_transfer'|'mobile_money'|'card'|'cash'|'check'|'other'
  source: text('source').notNull(), // enum: 'manual'|'geniuspay'
  paymentIntentId: uuid('payment_intent_id')
    .references(() => paymentIntents.id, { onDelete: 'set null' }),
  gatewayReference: text('gateway_reference'),
  gatewayFeesCents: bigint('gateway_fees_cents', { mode: 'bigint' }),
  netAmountCents: bigint('net_amount_cents', { mode: 'bigint' }),
  reference: text('reference'),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('invoice_payments_org_source_gateway_unique_idx')
    .on(table.organizationId, table.source, table.gatewayReference)
    .where(sql`gateway_reference IS NOT NULL`),
  index('idx_payments_invoice').on(table.invoiceId),
]);

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  category: text('category').notNull(), // enum: 'salary'|'subcontractor'|'software'|'hardware'|'travel'|'marketing'|'other'
  description: text('description').notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  incurredOn: date('incurred_on').notNull(),
  vendor: text('vendor'),
  receiptFileId: uuid('receipt_file_id').references((): any => files.id, { onDelete: 'set null' }),
  billable: boolean('billable').default(false).notNull(),
  reimbursed: boolean('reimbursed').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_expenses_project_date').on(table.projectId, table.incurredOn),
  index('idx_expenses_org_category').on(table.organizationId, table.category),
]);

export const deliverables = pgTable('deliverables', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(), // enum: 'draft'|'submitted'|'approved'|'rejected'|'revision_requested'
  fileId: uuid('file_id').references((): any => files.id, { onDelete: 'set null' }),
  fileName: text('file_name'),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'bigint' }),
  fileMime: text('file_mime'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedByName: text('reviewed_by_name'),
  reviewedByEmail: text('reviewed_by_email'),
  reviewedByIp: inet('reviewed_by_ip'),
  rejectionReason: text('rejection_reason'),
  version: integer('version').default(1).notNull(),
  parentId: uuid('parent_id')
    .references((): any => deliverables.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_deliverables_project').on(table.projectId, table.createdAt),
]);

export const reviewRequests = pgTable('review_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  status: text('status').notNull(), // enum: 'pending'|'submitted'|'expired'
  sentAt: timestamp('sent_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('review_requests_project_idx').on(table.projectId),
]);

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id')
    .notNull()
    .references(() => reviewRequests.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  rating: smallint('rating').notNull(), // 1 to 5
  comment: text('comment'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  submittedByName: text('submitted_by_name').notNull(),
  submittedByEmail: text('submitted_by_email').notNull(),
  submittedByIp: inet('submitted_by_ip'),
  isPublic: boolean('is_public').default(false).notNull(),
  moderationStatus: text('moderation_status').default('pending').notNull(), // enum: 'pending'|'approved'|'rejected'
}, (table) => [
  index('idx_reviews_org_rating').on(table.organizationId, table.rating),
]);

export const documentSequences = pgTable('document_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull(), // enum: 'quote'|'contract'|'invoice'|'project'
  year: integer('year').notNull(),
  lastNumber: integer('last_number').default(0).notNull(),
}, (table) => [
  unique('document_sequences_org_type_year_idx').on(table.organizationId, table.docType, table.year),
]);

export const paymentGatewayCredentials = pgTable('payment_gateway_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // enum: 'geniuspay'
  environment: text('environment').notNull(), // enum: 'sandbox' | 'live'
  apiKeyPublic: text('api_key_public').notNull(),
  apiSecretEncrypted: bytea('api_secret_encrypted').notNull(),
  apiSecretNonce: bytea('api_secret_nonce').notNull(),
  webhookSecretEncrypted: bytea('webhook_secret_encrypted').notNull(),
  webhookSecretNonce: bytea('webhook_secret_nonce').notNull(),
  merchantId: text('merchant_id'),
  businessName: text('business_name'),
  status: text('status').notNull(), // enum: 'active' | 'disabled' | 'invalid_credentials'
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('payment_gateway_creds_org_prov_env_idx').on(table.organizationId, table.provider, table.environment),
]);

export const paymentIntents = pgTable('payment_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'restrict' }),
  provider: text('provider').default('geniuspay').notNull(),
  environment: text('environment').notNull(), // sandbox | live
  gatewayReference: text('gateway_reference'),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull(),
  checkoutUrl: text('checkout_url'),
  status: text('status').notNull(), // enum: 'created'|'pending'|'processing'|'succeeded'|'failed'|'cancelled'|'expired'
  metadata: jsonb('metadata').default('{}').notNull(),
  gatewayStatus: text('gateway_status'),
  gatewayPaymentMethod: text('gateway_payment_method'),
  gatewayFeesCents: bigint('gateway_fees_cents', { mode: 'bigint' }),
  gatewayNetCents: bigint('gateway_net_cents', { mode: 'bigint' }),
  initiatedFromIp: inet('initiated_from_ip'),
  succeededAt: timestamp('succeeded_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('payment_intents_org_prov_gateway_unique_idx')
    .on(table.organizationId, table.provider, table.gatewayReference)
    .where(sql`gateway_reference IS NOT NULL`),
  index('idx_intents_invoice').on(table.invoiceId),
  index('idx_intents_status').on(table.organizationId, table.status),
]);

export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'set null' }),
  provider: text('provider').default('geniuspay').notNull(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  environment: text('environment').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  signatureValid: boolean('signature_valid').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processingError: text('processing_error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  receivedFromIp: inet('received_from_ip'),
}, (table) => [
  unique('payment_webhook_events_prov_event_idx').on(table.provider, table.eventId),
  index('idx_wh_events_org_type').on(table.organizationId, table.eventType, table.receivedAt),
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().default('free'),
  status: text('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_subscriptions_org').on(table.organizationId),
  index('idx_subscriptions_status').on(table.status),
]);

export const subscriptionCycles = pgTable('subscription_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  cycleNumber: integer('cycle_number').notNull(),
  planId: text('plan_id').notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  invoiceNumber: text('invoice_number').unique().notNull(),
  invoicePdfFileId: uuid('invoice_pdf_file_id').references((): any => files.id, { onDelete: 'set null' }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  failedReason: text('failed_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('sub_cycles_sub_cycle_idx').on(table.subscriptionId, table.cycleNumber),
  index('idx_cycles_org').on(table.organizationId, table.createdAt),
]);

export const subscriptionPaymentAttempts = pgTable('subscription_payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  cycleId: uuid('cycle_id')
    .notNull()
    .references(() => subscriptionCycles.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),
  gatewayReference: text('gateway_reference'),
  checkoutUrl: text('checkout_url'),
  status: text('status').notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sub_pay_attempts_gateway_ref_unique_idx')
    .on(table.gatewayReference)
    .where(sql`gateway_reference IS NOT NULL`),
  index('idx_sub_attempts_cycle').on(table.cycleId),
]);

export const quotaUsage = pgTable('quota_usage', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  membersCount: integer('members_count').notNull().default(0),
  clientsCount: integer('clients_count').notNull().default(0),
  projectsCount: integer('projects_count').notNull().default(0),
  apiKeysCount: integer('api_keys_count').notNull().default(0),
  webhookEndpointsCount: integer('webhook_endpoints_count').notNull().default(0),
  storageBytes: bigint('storage_bytes', { mode: 'bigint' }).notNull().default(sql`0`),
  lastRecomputedAt: timestamp('last_recomputed_at', { withTimezone: true }).defaultNow(),
});

export const quotaPeriodUsage = pgTable('quota_period_usage', {
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  apiCallsCount: bigint('api_calls_count', { mode: 'bigint' }).notNull().default(sql`0`),
  publicTokensCreated: integer('public_tokens_created').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.periodStart] }),
]);

// --- Relational Mappings ---

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
  invitationsSent: many(invitations),
  auditLogs: many(auditLogs),
  apiKeys: many(apiKeys),
  publicTokens: many(publicTokens),
  uploadedFiles: many(files),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  memberships: many(memberships),
  invitations: many(invitations),
  auditLogs: many(auditLogs),
  apiKeys: many(apiKeys),
  publicTokens: many(publicTokens),
  webhookEndpoints: many(webhookEndpoints),
  logoFile: one(files, {
    fields: [organizations.logoFileId],
    references: [files.id],
  }),
  files: many(files),
  signatures: many(signatures),
  storageUsage: one(storageUsage),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [memberships.invitedBy],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
}));

export const publicTokensRelations = relations(publicTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [publicTokens.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [publicTokens.createdBy],
    references: [users.id],
  }),
}));

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [webhookEndpoints.organizationId],
    references: [organizations.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  endpoint: one(webhookEndpoints, {
    fields: [webhookDeliveries.endpointId],
    references: [webhookEndpoints.id],
  }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.organizationId],
    references: [organizations.id],
  }),
  projects: many(projects),
  quotes: many(quotes),
  contracts: many(contracts),
  invoices: many(invoices),
  reviewRequests: many(reviewRequests),
  reviews: many(reviews),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  owner: one(users, {
    fields: [projects.ownerUserId],
    references: [users.id],
  }),
  members: many(projectMembers),
  quotes: many(quotes),
  contracts: many(contracts),
  invoices: many(invoices),
  expenses: many(expenses),
  deliverables: many(deliverables),
  reviewRequests: many(reviewRequests),
  reviews: many(reviews),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [quotes.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [quotes.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [quotes.clientId],
    references: [clients.id],
  }),
  pdfFile: one(files, {
    fields: [quotes.pdfFileId],
    references: [files.id],
  }),
  items: many(quoteItems),
  contracts: many(contracts),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteItems.quoteId],
    references: [quotes.id],
  }),
}));

export const contractsRelations = relations(contracts, ({ one }) => ({
  organization: one(organizations, {
    fields: [contracts.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [contracts.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [contracts.clientId],
    references: [clients.id],
  }),
  quote: one(quotes, {
    fields: [contracts.quoteId],
    references: [quotes.id],
  }),
  pdfFile: one(files, {
    fields: [contracts.pdfFileId],
    references: [files.id],
  }),
  signedPdfFile: one(files, {
    fields: [contracts.signedPdfFileId],
    references: [files.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [invoices.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  contract: one(contracts, {
    fields: [invoices.contractId],
    references: [contracts.id],
  }),
  pdfFile: one(files, {
    fields: [invoices.pdfFileId],
    references: [files.id],
  }),
  items: many(invoiceItems),
  payments: many(invoicePayments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const invoicePaymentsRelations = relations(invoicePayments, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoicePayments.organizationId],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [invoicePayments.invoiceId],
    references: [invoices.id],
  }),
  paymentIntent: one(paymentIntents, {
    fields: [invoicePayments.paymentIntentId],
    references: [paymentIntents.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  organization: one(organizations, {
    fields: [expenses.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [expenses.projectId],
    references: [projects.id],
  }),
  receiptFile: one(files, {
    fields: [expenses.receiptFileId],
    references: [files.id],
  }),
}));

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  organization: one(organizations, {
    fields: [deliverables.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [deliverables.projectId],
    references: [projects.id],
  }),
  parent: one(deliverables, {
    fields: [deliverables.parentId],
    references: [deliverables.id],
    relationName: 'revisionHistory',
  }),
  file: one(files, {
    fields: [deliverables.fileId],
    references: [files.id],
  }),
}));

export const reviewRequestsRelations = relations(reviewRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [reviewRequests.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [reviewRequests.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [reviewRequests.clientId],
    references: [clients.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  organization: one(organizations, {
    fields: [reviews.organizationId],
    references: [organizations.id],
  }),
  request: one(reviewRequests, {
    fields: [reviews.requestId],
    references: [reviewRequests.id],
  }),
  project: one(projects, {
    fields: [reviews.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [reviews.clientId],
    references: [clients.id],
  }),
}));

export const documentSequencesRelations = relations(documentSequences, ({ one }) => ({
  organization: one(organizations, {
    fields: [documentSequences.organizationId],
    references: [organizations.id],
  }),
}));

export const paymentGatewayCredentialsRelations = relations(paymentGatewayCredentials, ({ one }) => ({
  organization: one(organizations, {
    fields: [paymentGatewayCredentials.organizationId],
    references: [organizations.id],
  }),
}));

export const paymentIntentsRelations = relations(paymentIntents, ({ one }) => ({
  organization: one(organizations, {
    fields: [paymentIntents.organizationId],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [paymentIntents.invoiceId],
    references: [invoices.id],
  }),
}));

export const paymentWebhookEventsRelations = relations(paymentWebhookEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [paymentWebhookEvents.organizationId],
    references: [organizations.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  organization: one(organizations, {
    fields: [files.organizationId],
    references: [organizations.id],
  }),
  uploadedBy: one(users, {
    fields: [files.uploadedByUserId],
    references: [users.id],
  }),
}));

export const signaturesRelations = relations(signatures, ({ one }) => ({
  organization: one(organizations, {
    fields: [signatures.organizationId],
    references: [organizations.id],
  }),
  publicToken: one(publicTokens, {
    fields: [signatures.publicTokenId],
    references: [publicTokens.id],
  }),
  canvasFile: one(files, {
    fields: [signatures.canvasFileId],
    references: [files.id],
  }),
  signedPdfFile: one(files, {
    fields: [signatures.signedPdfFileId],
    references: [files.id],
  }),
}));

export const storageUsageRelations = relations(storageUsage, ({ one }) => ({
  organization: one(organizations, {
    fields: [storageUsage.organizationId],
    references: [organizations.id],
  }),
}));

// Type Definitions
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type PublicToken = typeof publicTokens.$inferSelect;
export type NewPublicToken = typeof publicTokens.$inferInsert;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type NewQuoteItem = typeof quoteItems.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type NewInvoicePayment = typeof invoicePayments.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Deliverable = typeof deliverables.$inferSelect;
export type NewDeliverable = typeof deliverables.$inferInsert;
export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type NewReviewRequest = typeof reviewRequests.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type DocumentSequence = typeof documentSequences.$inferSelect;
export type NewDocumentSequence = typeof documentSequences.$inferInsert;
export type PaymentGatewayCredential = typeof paymentGatewayCredentials.$inferSelect;
export type NewPaymentGatewayCredential = typeof paymentGatewayCredentials.$inferInsert;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type NewPaymentIntent = typeof paymentIntents.$inferInsert;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type NewPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;
export type StorageUsage = typeof storageUsage.$inferSelect;
export type NewStorageUsage = typeof storageUsage.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionCycle = typeof subscriptionCycles.$inferSelect;
export type NewSubscriptionCycle = typeof subscriptionCycles.$inferInsert;
export type SubscriptionPaymentAttempt = typeof subscriptionPaymentAttempts.$inferSelect;
export type NewSubscriptionPaymentAttempt = typeof subscriptionPaymentAttempts.$inferInsert;
export type QuotaUsage = typeof quotaUsage.$inferSelect;
export type NewQuotaUsage = typeof quotaUsage.$inferInsert;
export type QuotaPeriodUsage = typeof quotaPeriodUsage.$inferSelect;
export type NewQuotaPeriodUsage = typeof quotaPeriodUsage.$inferInsert;

