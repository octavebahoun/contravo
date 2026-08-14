import React from 'react';
import { db } from '@/lib/db/drizzle';
import { contracts, files, invoices, quotes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadServerFile } from '@/lib/storage/upload-service';
import { renderPdf, sha256 } from './render';
import {
  loadContractPdfData,
  loadInvoicePdfData,
  loadQuotePdfData,
} from './data-loader';
import { QuoteDocument, QUOTE_TEMPLATE_VERSION } from './templates/quote-v1';
import { InvoiceDocument, INVOICE_TEMPLATE_VERSION } from './templates/invoice-v1';
import { ContractDocument, CONTRACT_TEMPLATE_VERSION } from './templates/contract-v1';
import type { ContractPdfData } from './types';

/**
 * Generates entity PDFs and stores them in R2 (MVP4 §4.3, §6).
 *
 * Uploads go through `uploadServerFile`, which enforces the storage quota, runs
 * the antivirus scan, computes the SHA-256 and inserts the `files` row — so this
 * module only owns rendering and the entity back-reference.
 */

export type GeneratedPdf = {
  fileId: string;
  r2Key: string;
  sha256: string;
  sizeBytes: number;
  templateVersion: string;
};

/**
 * Renders a document and stores it, returning the resulting file row.
 *
 * @param buffer - Rendered PDF bytes.
 * @param filename - Human-facing name, also used for the download disposition.
 */
async function storePdf(
  organizationId: string,
  kind: 'quote_pdf' | 'invoice_pdf' | 'contract_pdf' | 'contract_signed_pdf',
  entityType: string,
  entityId: string,
  filename: string,
  buffer: Buffer,
  templateVersion: string,
  ipAddress?: string
): Promise<GeneratedPdf> {
  const file = await uploadServerFile(
    organizationId,
    null,
    kind,
    filename,
    'application/pdf',
    buffer,
    entityType,
    entityId,
    'server_generated',
    ipAddress
  );

  return {
    fileId: file.id,
    r2Key: file.r2Key,
    sha256: file.sha256 ?? sha256(buffer),
    sizeBytes: buffer.length,
    templateVersion,
  };
}

/**
 * Generates the PDF for a quote and links it via `quotes.pdf_file_id`.
 *
 * Regenerating replaces the link; the previous file row is kept so any hash
 * already communicated to a client stays resolvable.
 */
export async function generateQuotePdf(
  quoteId: string,
  organizationId: string,
  ipAddress?: string
): Promise<GeneratedPdf> {
  const data = await loadQuotePdfData(quoteId, organizationId);
  const buffer = await renderPdf(<QuoteDocument data={data} />);

  const generated = await storePdf(
    organizationId,
    'quote_pdf',
    'quote',
    quoteId,
    `${data.number}.pdf`,
    buffer,
    QUOTE_TEMPLATE_VERSION,
    ipAddress
  );

  await db
    .update(quotes)
    .set({ pdfFileId: generated.fileId, updatedAt: new Date() })
    .where(eq(quotes.id, quoteId));

  return generated;
}

/**
 * Generates the PDF for an invoice and links it via `invoices.pdf_file_id`.
 */
export async function generateInvoicePdf(
  invoiceId: string,
  organizationId: string,
  ipAddress?: string
): Promise<GeneratedPdf> {
  const data = await loadInvoicePdfData(invoiceId, organizationId);
  const buffer = await renderPdf(<InvoiceDocument data={data} />);

  const generated = await storePdf(
    organizationId,
    'invoice_pdf',
    'invoice',
    invoiceId,
    `${data.number}.pdf`,
    buffer,
    INVOICE_TEMPLATE_VERSION,
    ipAddress
  );

  await db
    .update(invoices)
    .set({ pdfFileId: generated.fileId, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  return generated;
}

/**
 * Generates the unsigned contract PDF and links it via `contracts.pdf_file_id`.
 */
export async function generateContractPdf(
  contractId: string,
  organizationId: string,
  ipAddress?: string
): Promise<GeneratedPdf> {
  const data = await loadContractPdfData(contractId, organizationId);
  const buffer = await renderPdf(<ContractDocument data={data} />);

  const generated = await storePdf(
    organizationId,
    'contract_pdf',
    'contract',
    contractId,
    `${data.number}.pdf`,
    buffer,
    CONTRACT_TEMPLATE_VERSION,
    ipAddress
  );

  await db
    .update(contracts)
    .set({ pdfFileId: generated.fileId, updatedAt: new Date() })
    .where(eq(contracts.id, contractId));

  return generated;
}

/**
 * Renders the signed contract PDF, stamped with the signature certificate page.
 *
 * Unlike the other helpers this one does **not** update the contract row: the
 * caller runs inside the signature transaction (MVP4 §7.2) and owns that write
 * so a later failure rolls everything back together.
 *
 * @param signature - Proof block: signer identity, timestamp and both hashes.
 */
export async function renderSignedContractPdf(
  contractId: string,
  organizationId: string,
  signature: NonNullable<ContractPdfData['signature']>,
  ipAddress?: string
): Promise<GeneratedPdf> {
  const data = await loadContractPdfData(contractId, organizationId, signature);
  const buffer = await renderPdf(<ContractDocument data={data} />);

  return storePdf(
    organizationId,
    'contract_signed_pdf',
    'contract',
    contractId,
    `${data.number}-signe.pdf`,
    buffer,
    CONTRACT_TEMPLATE_VERSION,
    ipAddress
  );
}

/**
 * Returns the stored PDF bytes for a file row, used to hash the original
 * document before signing (MVP4 §7.2 step 4).
 */
export async function getStoredPdfSha256(fileId: string): Promise<string | null> {
  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return row?.sha256 ?? null;
}
