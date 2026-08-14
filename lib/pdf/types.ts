/**
 * Shared data shapes handed to PDF templates (MVP4 §6).
 *
 * Templates receive plain, already-resolved data: no DB access, no network, no
 * clock reads. Everything that appears in a rendered document must come through
 * these types so a re-render is byte-for-byte identical (MVP4 §6.3).
 */

export type PdfAddress = {
  line1?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

/** Organization branding + legal footer, from `organizations` (MVP4 §6.2). */
export type PdfOrg = {
  name: string;
  brandColor: string;
  legalMentions?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: PdfAddress | null;
  /** Logo as a data: URI, pre-fetched from R2 and embedded (never a remote URL). */
  logoDataUri?: string | null;
  /** Bank details, rendered on invoices only. */
  bankDetails?: Record<string, string> | null;
};

export type PdfClient = {
  displayName: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  address?: PdfAddress | null;
};

export type PdfLineItem = {
  position: number;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPriceCents: number;
  discountBps: number;
  amountCents: number;
};

/** Totals block shared by quotes and invoices. */
export type PdfTotals = {
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
};

export type QuotePdfData = {
  org: PdfOrg;
  client: PdfClient;
  number: string;
  /** Pre-formatted date strings — templates never call Date.now(). */
  issueDate: string;
  validUntil?: string | null;
  items: PdfLineItem[];
  totals: PdfTotals;
  notes?: string | null;
  terms?: string | null;
};

export type InvoicePdfData = {
  org: PdfOrg;
  client: PdfClient;
  number: string;
  issueDate: string;
  dueDate?: string | null;
  items: PdfLineItem[];
  totals: PdfTotals;
  notes?: string | null;
};

/** Signature block stamped onto a signed contract (MVP4 §7.2 step 5). */
export type PdfSignatureProof = {
  signerName: string;
  signerEmail: string;
  signerIp: string;
  /** ISO 8601 UTC, taken from the DB row — not generated at render time. */
  signedAt: string;
  documentSha256: string;
  signatureSha256: string;
  /** Canvas drawing as a data: URI. */
  signatureImageDataUri?: string | null;
};

export type ContractPdfData = {
  org: PdfOrg;
  client: PdfClient;
  number: string;
  title: string;
  issueDate: string;
  bodyMarkdown: string;
  contractId: string;
  /** Present only once signed; drives the certificate page. */
  signature?: PdfSignatureProof | null;
};
