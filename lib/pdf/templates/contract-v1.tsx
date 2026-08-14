import React, { type ReactElement } from 'react';
import { Document, Page, Text, View, Image, StyleSheet, type DocumentProps } from '@react-pdf/renderer';
import type { ContractPdfData } from '../types';
import { parseMarkdown } from '../markdown';
import { formatAddress } from '../format';
import { OrgHeader, PageFooter, styles } from './shared';

/**
 * Contract PDF, template version 1 (MVP4 §6.4, §7.2).
 *
 * MVP4 §6.1 nominates Puppeteer for contracts, but a Chromium-rendered PDF is
 * not byte-stable (verified: two renders of identical HTML produce different
 * SHA-256 values), which would break the signature proof chain required by
 * §6.3/§7.3. Contracts are therefore rendered with React-PDF like the other
 * documents; `body_markdown` is converted by lib/pdf/markdown.ts.
 *
 * When `data.signature` is present the document gains a final certificate page
 * carrying the canvas image, signer identity and both hashes.
 */
export const CONTRACT_TEMPLATE_VERSION = 'contract-v1';

const contractStyles = StyleSheet.create({
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 5 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 11, marginBottom: 4 },
  h3: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 9, marginBottom: 3 },
  paragraph: { fontSize: 9.5, lineHeight: 1.55, marginBottom: 6, textAlign: 'justify' },
  listRow: { flexDirection: 'row', marginBottom: 3, paddingLeft: 8 },
  listMarker: { width: 16, fontSize: 9.5 },
  listText: { flex: 1, fontSize: 9.5, lineHeight: 1.55 },
  quote: {
    fontSize: 9.5,
    lineHeight: 1.55,
    marginVertical: 6,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#CBD2D9',
    color: '#3E4C59',
  },
  rule: { borderBottomWidth: 0.5, borderBottomColor: '#CBD2D9', marginVertical: 10 },

  partiesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  signatureSlot: { width: '46%' },
  slotLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#616E7C', marginBottom: 4 },
  slotBox: {
    height: 70,
    borderWidth: 0.5,
    borderColor: '#CBD2D9',
    borderStyle: 'dashed',
    marginBottom: 4,
    padding: 4,
    justifyContent: 'center',
  },
  slotHint: { fontSize: 7.5, color: '#9AA5B1', textAlign: 'center' },
  signatureImage: { height: 58, objectFit: 'contain' },

  certTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  certIntro: { fontSize: 9, color: '#616E7C', marginBottom: 14 },
  certRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E4E7EB',
  },
  certLabel: { width: '32%', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  certValue: { width: '68%', fontSize: 9 },
  hash: { fontFamily: 'Courier', fontSize: 7.5, lineHeight: 1.4 },
  legalNote: {
    marginTop: 16,
    padding: 8,
    backgroundColor: '#F5F7FA',
    fontSize: 7.5,
    lineHeight: 1.5,
    color: '#3E4C59',
  },
});

function MarkdownBody({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);

  return (
    <View>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const style =
              block.level === 1
                ? contractStyles.h1
                : block.level === 2
                  ? contractStyles.h2
                  : contractStyles.h3;
            return (
              <Text key={i} style={style}>
                {block.text}
              </Text>
            );
          }
          case 'listItem':
            return (
              <View key={i} style={contractStyles.listRow}>
                <Text style={contractStyles.listMarker}>
                  {block.ordered ? `${block.index}.` : '•'}
                </Text>
                <Text style={contractStyles.listText}>{block.text}</Text>
              </View>
            );
          case 'quote':
            return (
              <Text key={i} style={contractStyles.quote}>
                {block.text}
              </Text>
            );
          case 'rule':
            return <View key={i} style={contractStyles.rule} />;
          default:
            return (
              <Text key={i} style={contractStyles.paragraph}>
                {block.text}
              </Text>
            );
        }
      })}
    </View>
  );
}

export function ContractDocument({ data }: { data: ContractPdfData }): ReactElement<DocumentProps> {
  const { org, client, signature } = data;
  const orgLines = formatAddress(org.address);
  const clientLines = formatAddress(client.address);

  return (
    <Document
      title={`${data.title} (${data.number})`}
      author={org.name}
      subject={data.title}
      creator={org.name}
      producer={org.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <OrgHeader org={org} />
          <View>
            <Text style={[styles.docTitle, { color: org.brandColor }]}>CONTRAT</Text>
            <Text style={styles.docNumber}>{data.number}</Text>
            <Text style={styles.metaLine}>Établi le {data.issueDate}</Text>
          </View>
        </View>

        <Text style={contractStyles.title}>{data.title}</Text>
        <View style={contractStyles.rule} />

        <MarkdownBody markdown={data.bodyMarkdown} />

        <View style={contractStyles.partiesRow} wrap={false}>
          <View style={contractStyles.signatureSlot}>
            <Text style={contractStyles.slotLabel}>POUR {org.name.toUpperCase()}</Text>
            <View style={contractStyles.slotBox}>
              <Text style={contractStyles.slotHint}>Signature</Text>
            </View>
            <Text style={styles.bodyText}>{org.name}</Text>
            {orgLines.slice(0, 1).map((line, i) => (
              <Text key={i} style={[styles.bodyText, styles.muted]}>
                {line}
              </Text>
            ))}
          </View>

          <View style={contractStyles.signatureSlot}>
            <Text style={contractStyles.slotLabel}>POUR LE CLIENT</Text>
            <View style={contractStyles.slotBox}>
              {signature?.signatureImageDataUri ? (
                <Image
                  style={contractStyles.signatureImage}
                  src={signature.signatureImageDataUri}
                />
              ) : (
                <Text style={contractStyles.slotHint}>Signature</Text>
              )}
            </View>
            <Text style={styles.bodyText}>{signature?.signerName ?? client.displayName}</Text>
            {signature ? (
              <Text style={[styles.bodyText, styles.muted]}>Signé le {signature.signedAt}</Text>
            ) : (
              clientLines.slice(0, 1).map((line, i) => (
                <Text key={i} style={[styles.bodyText, styles.muted]}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </View>

        <PageFooter org={org} />
      </Page>

      {signature ? (
        <Page size="A4" style={styles.page}>
          <Text style={contractStyles.certTitle}>Certificat de signature électronique</Text>
          <Text style={contractStyles.certIntro}>
            Contrat {data.number} — {data.title}
          </Text>

          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Signataire</Text>
            <Text style={contractStyles.certValue}>{signature.signerName}</Text>
          </View>
          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Email</Text>
            <Text style={contractStyles.certValue}>{signature.signerEmail}</Text>
          </View>
          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Date (UTC)</Text>
            <Text style={contractStyles.certValue}>{signature.signedAt}</Text>
          </View>
          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Adresse IP</Text>
            <Text style={contractStyles.certValue}>{signature.signerIp}</Text>
          </View>
          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Identifiant contrat</Text>
            <Text style={[contractStyles.certValue, contractStyles.hash]}>{data.contractId}</Text>
          </View>
          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Empreinte du document</Text>
            <Text style={[contractStyles.certValue, contractStyles.hash]}>
              {signature.documentSha256}
            </Text>
          </View>
          <View style={contractStyles.certRow}>
            <Text style={contractStyles.certLabel}>Empreinte de signature</Text>
            <Text style={[contractStyles.certValue, contractStyles.hash]}>
              {signature.signatureSha256}
            </Text>
          </View>

          {signature.signatureImageDataUri ? (
            <View style={{ marginTop: 16 }}>
              <Text style={contractStyles.slotLabel}>SIGNATURE MANUSCRITE</Text>
              <View style={contractStyles.slotBox}>
                <Image
                  style={contractStyles.signatureImage}
                  src={signature.signatureImageDataUri}
                />
              </View>
            </View>
          ) : null}

          <Text style={contractStyles.legalNote}>
            Signature électronique simple au sens du règlement eIDAS (UE) n° 910/2014. L&apos;
            empreinte de signature est calculée par SHA-256 sur la concaténation de l&apos;email du
            signataire, de l&apos;horodatage UTC et de l&apos;empreinte du document original. Toute
            modification ultérieure du document invalide ces empreintes. Vérification :
            /api/v1/verify/signature/&lt;id&gt;.
          </Text>

          <PageFooter org={org} />
        </Page>
      ) : null}
    </Document>
  );
}
