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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
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

// Relational Mappings
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
  invitationsSent: many(invitations),
  auditLogs: many(auditLogs),
  apiKeys: many(apiKeys),
  publicTokens: many(publicTokens),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(invitations),
  auditLogs: many(auditLogs),
  apiKeys: many(apiKeys),
  publicTokens: many(publicTokens),
  webhookEndpoints: many(webhookEndpoints),
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
