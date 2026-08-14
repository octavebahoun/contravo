import React from 'react';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/lib/db/drizzle';
import {
  clients,
  contracts,
  files,
  invoiceItems,
  invoices,
  organizations,
  quoteItems,
  quotes,
} from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { r2Client, R2_BUCKET_NAME } from '@/lib/storage/r2-client';
import { formatDate } from './format';
import type {
  ContractPdfData,
  InvoicePdfData,
  PdfClient,
  PdfLineItem,
  PdfOrg,
  QuotePdfData,
} from './types';

/**
 * Loads and shapes database rows into the plain data structures PDF templates
 * consume (MVP4 §6).
 *
 * Templates must stay pure, so every side effect — DB reads, fetching the org
 * logo from R2, date formatting — happens here, ahead of rendering.
 */

/** Logos are embedded as data: URIs; anything larger is skipped (MVP4 §6.3). */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Downloads an org logo from R2 and returns it as a data: URI.
 *
 * Returns null on any failure: a missing or oversized logo must degrade to a
 * text-only header rather than fail document generation.
 */
async function loadLogoDataUri(logoFileId: string | null): Promise<string | null> {
  if (!logoFileId) return null;

  try {
    const [logo] = await db.select().from(files).where(eq(files.id, logoFileId)).limit(1);
    if (!logo || Number(logo.sizeBytes) > MAX_LOGO_BYTES) return null;

    const result = await r2Client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: logo.r2Key })
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;

    return `data:${logo.mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

async function loadOrg(organizationId: string): Promise<PdfOrg> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) throw new ApiError('NOT_FOUND', 'Organization not found', 404);

  // `organizations` carries no contact columns; MVP4 §6.2 keeps org contact
  // details inside `legal_mentions` (rendered in the footer) and `bank_details`.
  return {
    name: org.name,
    brandColor: org.brandColor || '#2B6CE5',
    legalMentions: org.legalMentions,
    email: null,
    phone: null,
    address: null,
    logoDataUri: await loadLogoDataUri(org.logoFileId),
    bankDetails: (org.bankDetails as Record<string, string> | null) ?? null,
  };
}

async function loadClient(clientId: string, organizationId: string): Promise<PdfClient> {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)))
    .limit(1);

  if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

  return {
    displayName: client.displayName,
    companyName: client.companyName,
    email: client.email,
    phone: client.phone,
    vatNumber: client.vatNumber,
    address: (client.billingAddress as PdfClient['address']) ?? null,
  };
}

function toLineItems(
  rows: Array<{
    position: number;
    description: string;
    quantity: string;
    unit: string | null;
    unitPriceCents: number | bigint;
    discountBps: number;
    amountCents: number | bigint;
  }>
): PdfLineItem[] {
  return rows.map((row) => ({
    position: row.position,
    description: row.description,
    quantity: String(row.quantity),
    unit: row.unit,
    unitPriceCents: Number(row.unitPriceCents),
    discountBps: row.discountBps,
    amountCents: Number(row.amountCents),
  }));
}

/**
 * Assembles the data for a quote PDF.
 *
 * @throws ApiError 404 when the quote does not exist in this organization.
 */
export async function loadQuotePdfData(
  quoteId: string,
  organizationId: string
): Promise<QuotePdfData> {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(
      and(
        eq(quotes.id, quoteId),
        eq(quotes.organizationId, organizationId),
        isNull(quotes.deletedAt)
      )
    )
    .limit(1);

  if (!quote) throw new ApiError('NOT_FOUND', 'Quote not found', 404);

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId))
    .orderBy(asc(quoteItems.position));

  return {
    org: await loadOrg(organizationId),
    client: await loadClient(quote.clientId, organizationId),
    number: quote.number,
    issueDate: formatDate(quote.createdAt),
    validUntil: formatDate(quote.validUntil),
    items: toLineItems(items as never),
    totals: {
      currency: quote.currency,
      subtotalCents: Number(quote.subtotalCents),
      discountCents: Number(quote.discountCents),
      taxRateBps: quote.taxRateBps,
      taxCents: Number(quote.taxCents),
      totalCents: Number(quote.totalCents),
    },
    notes: quote.notes,
    terms: quote.terms,
  };
}

/**
 * Assembles the data for an invoice PDF.
 *
 * @throws ApiError 404 when the invoice does not exist in this organization.
 */
export async function loadInvoicePdfData(
  invoiceId: string,
  organizationId: string
): Promise<InvoicePdfData> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt)
      )
    )
    .limit(1);

  if (!invoice) throw new ApiError('NOT_FOUND', 'Invoice not found', 404);

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.position));

  return {
    org: await loadOrg(organizationId),
    client: await loadClient(invoice.clientId, organizationId),
    number: invoice.number,
    issueDate: formatDate(invoice.issueDate ?? invoice.createdAt),
    dueDate: formatDate(invoice.dueDate),
    items: toLineItems(items as never),
    totals: {
      currency: invoice.currency,
      subtotalCents: Number(invoice.subtotalCents),
      discountCents: Number(invoice.discountCents),
      taxRateBps: invoice.taxRateBps,
      taxCents: Number(invoice.taxCents),
      totalCents: Number(invoice.totalCents),
    },
    notes: invoice.notes,
  };
}

/**
 * Assembles the data for a contract PDF.
 *
 * @param signature - Proof block to stamp; omit for the unsigned document.
 * @throws ApiError 404 when the contract does not exist in this organization.
 */
export async function loadContractPdfData(
  contractId: string,
  organizationId: string,
  signature?: ContractPdfData['signature']
): Promise<ContractPdfData> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.id, contractId),
        eq(contracts.organizationId, organizationId),
        isNull(contracts.deletedAt)
      )
    )
    .limit(1);

  if (!contract) throw new ApiError('NOT_FOUND', 'Contract not found', 404);

  return {
    org: await loadOrg(organizationId),
    client: await loadClient(contract.clientId, organizationId),
    number: contract.number,
    title: contract.title,
    issueDate: formatDate(contract.createdAt),
    bodyMarkdown: contract.bodyMarkdown,
    contractId: contract.id,
    signature: signature ?? null,
  };
}
