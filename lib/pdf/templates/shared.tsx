import React from 'react';
import { Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { PdfClient, PdfLineItem, PdfOrg, PdfTotals } from '../types';
import { formatAddress, formatBps, formatMoney, formatQuantity } from '../format';

/**
 * Building blocks shared by the quote and invoice templates (MVP4 §6.4).
 *
 * Kept separate from the templates themselves so that fixing a layout detail
 * does not force a version bump on documents that don't use that block.
 */

export const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1F2933',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { width: 110, maxHeight: 48, objectFit: 'contain', marginBottom: 6 },
  orgName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  muted: { color: '#616E7C' },
  docTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docNumber: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  metaLine: { fontSize: 9, textAlign: 'right', marginTop: 2, color: '#616E7C' },

  partiesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  partyBlock: { width: '48%' },
  partyLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#616E7C',
    marginBottom: 4,
  },
  partyName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },

  table: { marginTop: 8 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD2D9',
    paddingBottom: 5,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E4E7EB',
  },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#3E4C59' },
  colDesc: { width: '46%' },
  colQty: { width: '12%', textAlign: 'right' },
  colUnit: { width: '14%', textAlign: 'right' },
  colDiscount: { width: '10%', textAlign: 'right' },
  colAmount: { width: '18%', textAlign: 'right' },

  totalsWrap: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: '46%' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalsGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1F2933',
  },
  totalsGrandText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },

  section: { marginTop: 18 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  bodyText: { fontSize: 9, lineHeight: 1.5 },

  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#CBD2D9',
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: '#616E7C', textAlign: 'center' },
  pageNumber: { fontSize: 7.5, color: '#616E7C', textAlign: 'center', marginTop: 2 },
});

export function OrgHeader({ org }: { org: PdfOrg }) {
  const lines = formatAddress(org.address);
  return (
    <View>
      {org.logoDataUri ? <Image style={styles.logo} src={org.logoDataUri} /> : null}
      <Text style={styles.orgName}>{org.name}</Text>
      {lines.map((line, i) => (
        <Text key={i} style={[styles.bodyText, styles.muted]}>
          {line}
        </Text>
      ))}
      {org.email ? <Text style={[styles.bodyText, styles.muted]}>{org.email}</Text> : null}
      {org.phone ? <Text style={[styles.bodyText, styles.muted]}>{org.phone}</Text> : null}
    </View>
  );
}

export function ClientBlock({ client, label }: { client: PdfClient; label: string }) {
  const lines = formatAddress(client.address);
  return (
    <View style={styles.partyBlock}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{client.displayName}</Text>
      {client.companyName && client.companyName !== client.displayName ? (
        <Text style={styles.bodyText}>{client.companyName}</Text>
      ) : null}
      {lines.map((line, i) => (
        <Text key={i} style={styles.bodyText}>
          {line}
        </Text>
      ))}
      {client.email ? <Text style={styles.bodyText}>{client.email}</Text> : null}
      {client.vatNumber ? (
        <Text style={[styles.bodyText, styles.muted]}>TVA : {client.vatNumber}</Text>
      ) : null}
    </View>
  );
}

export function ItemsTable({
  items,
  currency,
}: {
  items: PdfLineItem[];
  currency: string;
}) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colDesc]}>Description</Text>
        <Text style={[styles.th, styles.colQty]}>Qté</Text>
        <Text style={[styles.th, styles.colUnit]}>P.U.</Text>
        <Text style={[styles.th, styles.colDiscount]}>Remise</Text>
        <Text style={[styles.th, styles.colAmount]}>Montant</Text>
      </View>

      {items.map((item) => (
        <View key={item.position} style={styles.tableRow} wrap={false}>
          <Text style={styles.colDesc}>{item.description}</Text>
          <Text style={styles.colQty}>
            {formatQuantity(item.quantity)}
            {item.unit ? ` ${item.unit}` : ''}
          </Text>
          <Text style={styles.colUnit}>{formatMoney(item.unitPriceCents, currency)}</Text>
          <Text style={styles.colDiscount}>
            {item.discountBps > 0 ? formatBps(item.discountBps) : '—'}
          </Text>
          <Text style={styles.colAmount}>{formatMoney(item.amountCents, currency)}</Text>
        </View>
      ))}
    </View>
  );
}

export function TotalsBlock({ totals }: { totals: PdfTotals }) {
  const { currency } = totals;
  return (
    <View style={styles.totalsWrap}>
      <View style={styles.totalsBox}>
        <View style={styles.totalsRow}>
          <Text style={styles.muted}>Sous-total</Text>
          <Text>{formatMoney(totals.subtotalCents, currency)}</Text>
        </View>

        {totals.discountCents > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Remise</Text>
            <Text>-{formatMoney(totals.discountCents, currency)}</Text>
          </View>
        ) : null}

        <View style={styles.totalsRow}>
          <Text style={styles.muted}>TVA ({formatBps(totals.taxRateBps)})</Text>
          <Text>{formatMoney(totals.taxCents, currency)}</Text>
        </View>

        <View style={styles.totalsGrand}>
          <Text style={styles.totalsGrandText}>Total</Text>
          <Text style={styles.totalsGrandText}>{formatMoney(totals.totalCents, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

export function PageFooter({ org }: { org: PdfOrg }) {
  return (
    <View style={styles.footer} fixed>
      {org.legalMentions ? <Text style={styles.footerText}>{org.legalMentions}</Text> : null}
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        fixed
      />
    </View>
  );
}
