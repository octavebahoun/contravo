import { db } from '@/lib/db/drizzle';
import { documentSequences } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export type DocType = 'project' | 'quote' | 'contract' | 'invoice';

const prefixMap: Record<DocType, string> = {
  project: 'PRJ',
  quote: 'DEV',
  contract: 'CTR',
  invoice: 'FAC',
};

export async function getNextSequenceNumber(
  tx: any,
  organizationId: string,
  docType: DocType,
  year: number
): Promise<string> {
  const currentTx = tx || db;

  const [sequence] = await currentTx
    .insert(documentSequences)
    .values({
      organizationId,
      docType,
      year,
      lastNumber: 1,
    })
    .onConflictDoUpdate({
      target: [documentSequences.organizationId, documentSequences.docType, documentSequences.year],
      set: {
        lastNumber: sql`${documentSequences.lastNumber} + 1`,
      },
    })
    .returning();

  const numStr = String(sequence.lastNumber);
  const padLength = docType === 'project' ? 3 : 4;
  const paddedNum = numStr.padStart(padLength, '0');
  const prefix = prefixMap[docType];

  return `${prefix}-${year}-${paddedNum}`;
}
