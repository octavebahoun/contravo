import React, { type ReactElement } from 'react';
import { Document, Page, Text, View, type DocumentProps } from '@react-pdf/renderer';
import type { InvoicePdfData } from '../types';
import {
  ClientBlock,
  ItemsTable,
  OrgHeader,
  PageFooter,
  TotalsBlock,
  styles,
} from './shared';

/**
 * Invoice PDF, template version 1 (MVP4 §6.4).
 *
 * Same determinism contract as the quote template: pure function of `data`,
 * no clock/network/random. Differs from a quote by the due date and the bank
 * details block required for payment.
 */
export const INVOICE_TEMPLATE_VERSION = 'invoice-v1';

/** Human labels for the known `organizations.bank_details` keys. */
const BANK_LABELS: Record<string, string> = {
  iban: 'IBAN',
  bic: 'BIC',
  bankName: 'Banque',
  accountName: 'Titulaire',
  mobileMoney: 'Mobile Money',
};

export function InvoiceDocument({ data }: { data: InvoicePdfData }): ReactElement<DocumentProps> {
  const { org, client, totals } = data;
  const bankEntries = Object.entries(org.bankDetails ?? {}).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0
  );

  return (
    <Document
      title={`Facture ${data.number}`}
      author={org.name}
      subject={`Facture ${data.number}`}
      creator={org.name}
      producer={org.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <OrgHeader org={org} />
          <View>
            <Text style={[styles.docTitle, { color: org.brandColor }]}>FACTURE</Text>
            <Text style={styles.docNumber}>{data.number}</Text>
            <Text style={styles.metaLine}>Émise le {data.issueDate}</Text>
            {data.dueDate ? (
              <Text style={styles.metaLine}>Échéance : {data.dueDate}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <ClientBlock client={client} label="Facturé à" />
        </View>

        <ItemsTable items={data.items} currency={totals.currency} />
        <TotalsBlock totals={totals} />

        {bankEntries.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coordonnées de paiement</Text>
            {bankEntries.map(([key, value]) => (
              <Text key={key} style={styles.bodyText}>
                {BANK_LABELS[key] ?? key} : {value}
              </Text>
            ))}
          </View>
        ) : null}

        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.bodyText}>{data.notes}</Text>
          </View>
        ) : null}

        <PageFooter org={org} />
      </Page>
    </Document>
  );
}
