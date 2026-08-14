import React, { type ReactElement } from 'react';
import { Document, Page, Text, View, type DocumentProps } from '@react-pdf/renderer';
import type { QuotePdfData } from '../types';
import {
  ClientBlock,
  ItemsTable,
  OrgHeader,
  PageFooter,
  TotalsBlock,
  styles,
} from './shared';

/**
 * Quote PDF, template version 1 (MVP4 §6.4).
 *
 * Rendering is a pure function of `data`: no clock reads, no network, no
 * randomness, so re-rendering the same quote yields the same bytes and the
 * same SHA-256 (MVP4 §6.3). Any layout change must ship as `quote-v2.tsx`
 * so already-issued quotes keep hashing to their original value.
 */
export const QUOTE_TEMPLATE_VERSION = 'quote-v1';

export function QuoteDocument({ data }: { data: QuotePdfData }): ReactElement<DocumentProps> {
  const { org, client, totals } = data;

  return (
    <Document
      title={`Devis ${data.number}`}
      author={org.name}
      subject={`Devis ${data.number}`}
      creator={org.name}
      producer={org.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <OrgHeader org={org} />
          <View>
            <Text style={[styles.docTitle, { color: org.brandColor }]}>DEVIS</Text>
            <Text style={styles.docNumber}>{data.number}</Text>
            <Text style={styles.metaLine}>Émis le {data.issueDate}</Text>
            {data.validUntil ? (
              <Text style={styles.metaLine}>Valable jusqu&apos;au {data.validUntil}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <ClientBlock client={client} label="Destinataire" />
        </View>

        <ItemsTable items={data.items} currency={totals.currency} />
        <TotalsBlock totals={totals} />

        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.bodyText}>{data.notes}</Text>
          </View>
        ) : null}

        {data.terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <Text style={styles.bodyText}>{data.terms}</Text>
          </View>
        ) : null}

        <PageFooter org={org} />
      </Page>
    </Document>
  );
}
